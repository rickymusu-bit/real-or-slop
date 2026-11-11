"""v1.0.0, 2026-11-11T09:30:00Z: Database section in a real browser, desktop and mobile (docs/database-immagini.v1.0.0.md), with the
fake OpenAI: filter by several tags (all or any) and by origin, cards with every tag and the statistics, «Modifica» of a published
photo (confirmation, out of publication, still approved, caption edited), regeneration of a SLOP from its edited prompt (one
confirmation for image and analysis, statistics back to zero), «Elimina» to the trash, the «Distribuzione» tab (overview, stacked
bars, legend, category filter, tooltip, table view). Seeds rows in the LOCAL D1 through the API and SQL, then removes them."""
import io
import json
import os
import shutil
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image
from playwright.sync_api import expect, sync_playwright

base, state = os.environ['ROS_TEST_BASE'], os.environ['ROS_TEST_STATE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
API = base + '/api/admin/library'
folder = Path('artifacts/database-browser'); folder.mkdir(parents=True, exist_ok=True)

def call(url, data=None, method=None, raw=None, mime='application/json'):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request(url, data=body, method=method or ('POST' if body is not None else 'GET'),
                                 headers={'Content-Type': mime, 'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(req) as r: return json.loads(r.read())
def sql(command):
    subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command],
                   capture_output=True, text=True, check=True)
def png(seed, size):
    image = Image.new('RGB', size); image.putdata([((seed * 41) % 256, (x * 5 + seed) % 256, (y * 9) % 256) for y in range(size[1]) for x in range(size[0])])
    out = io.BytesIO(); image.save(out, 'PNG'); return out.getvalue()
def webp(source):
    out = io.BytesIO(); Image.open(io.BytesIO(source)).convert('RGB').save(out, 'WEBP', quality=85); return out.getvalue()
CATEGORIES = {'dbb-riot': 'event', 'dbb-paris': 'place', 'dbb-beach': 'setting', '1960s': 'time'}
def seed(prefix, origin, title, number, tags, publish, prompt=''):
    source = png(number, (60, 40))
    item = call(f'{API}/upload?' + urllib.parse.urlencode({'origin': origin, 'title': f'{prefix}-{title}', 'prompt': prompt}), raw=source, mime='image/png')
    item = call(f'{API}/{item["id"]}/copy', raw=webp(source), mime='image/webp')
    item = call(f'{API}/{item["id"]}', {'revision': item['revision'], 'tags': tags, 'caption': f'Didascalia {title}.',
                                        'tag_categories': {t: CATEGORIES[t] for t in tags}}, method='PATCH')
    item = call(f'{API}/{item["id"]}/approve', {'rights_confirmed': True})
    if publish: item = call(f'{API}/{item["id"]}/publish', {})
    return item

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
    for index, (name, options) in enumerate((('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('mobile', {**p.devices['Pixel 7']}))):
        prefix = 'dbb' + name[0]
        real = seed(prefix, 'REAL', 'barricate', 10 + index * 10, ['dbb-riot', 'dbb-paris', '1960s'], True)
        slop = seed(prefix, 'SLOP', 'scontri', 11 + index * 10, ['dbb-riot'], True, prompt='A riot in a square, 1960s')
        beach = seed(prefix, 'SLOP', 'spiaggia', 12 + index * 10, ['dbb-beach'], False, prompt='A beach, 1960s')
        # Statistics: three rounds of the REAL (two right), one of the SLOP (wrong), played on the current copies.
        session = f'{prefix}-session'
        sql(f"INSERT INTO game_sessions(id,mode,created_at,owner_hash,phase,completed) VALUES('{session}','training',0,'x','completed',1); " +
            "; ".join(f"INSERT INTO game_rounds(id,session_id,image_id,position,presented_at,caption,copy_key) SELECT '{prefix}-r{i}','{session}',id,{i},1,caption,copy_key FROM images WHERE id='{image}'"
                      for i, image in enumerate((real['id'], slop['id']))) + "; " +
            f"INSERT INTO answers(round_id,choice,correct,answered_at,elapsed_ms) VALUES('{prefix}-r0','REAL',1,1,10),('{prefix}-r1','REAL',0,1,10)")
        context = browser.new_context(**options, http_credentials={'username': 'owner', 'password': token})
        page = context.new_page(); errors, confirms = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def answer(dialog):
            confirms.append(dialog.message); dialog.accept()
        page.on('dialog', answer)
        page.goto(base + '/admin')
        page.get_by_role('button', name='Database immagini').click()
        # Filters: one tag, then two (all of them), then any of them, then the origin.
        tag_input = page.locator('#library-tag')
        tag_input.fill('dbb-riot'); tag_input.press('Enter')
        expect(page.locator('#library-tag-pills .rw-pill')).to_have_count(1)
        cards = page.locator('.library-card', has_text=prefix)
        expect(cards).to_have_count(2)
        tag_input.fill('DBB Paris'); tag_input.press('Enter')  # converted like a typed tag
        expect(page.locator('#library-tag-pills .rw-pill', has_text='dbb-paris')).to_have_count(1)
        expect(cards).to_have_count(1)
        card = page.locator('.library-card', has_text=f'{prefix}-barricate')
        expect(card.locator('.db-tag')).to_have_text(['1960s', 'dbb-paris', 'dbb-riot'])  # in category order
        expect(card.locator('[data-stats]')).to_have_text('Vista 1 volta · classificata correttamente 1 (100%)')
        page.locator('[data-filter-remove="dbb-riot"]').click()
        tag_input.fill('dbb-beach'); tag_input.press('Enter')
        expect(cards).to_have_count(0)
        page.locator('#library-tag-match').select_option('any')
        expect(cards).to_have_count(2)
        page.locator('#library-origin').select_option('SLOP')
        expect(cards).to_have_count(1)
        expect(cards).to_contain_text(f'{prefix}-spiaggia')
        page.screenshot(path=str(folder / f'{name}-images.png'), full_page=True)
        page.locator('#library-origin').select_option('all')
        page.locator('[data-filter-remove="dbb-paris"]').click(); page.locator('[data-filter-remove="dbb-beach"]').click()
        tag_input.fill('dbb-riot'); tag_input.press('Enter')
        expect(cards).to_have_count(2)

        # Edit a published SLOP: confirmation, out of publication, approved; then the prompt and a regeneration.
        page.get_by_role('button', name=f'Apri {prefix}-scontri').click()
        dialog = page.locator('#library-detail')
        expect(dialog.locator('.db-edit-note')).to_be_visible()
        expect(dialog.locator('[data-field=caption]')).to_have_attribute('readonly', '')
        expect(dialog.locator('[data-stats]')).to_have_text('Vista 1 volta · classificata correttamente 0 (0%)')
        dialog.locator('[data-action=edit]').click()
        expect(dialog.locator('#library-detail-message')).to_have_text('Modifica avviata: la foto non è più pubblicata.')
        assert 'Esce subito dalla pubblicazione' in confirms[-1], confirms
        expect(dialog).to_contain_text('SLOP · approvata')
        caption = dialog.locator('[data-field=caption]')
        caption.fill('Milano, 1968. Scontri in piazza.'); caption.blur()
        expect(dialog.locator('#library-detail-message')).to_have_text('Salvato.')
        expect(dialog).to_contain_text('SLOP · approvata')
        prompt = dialog.locator('[data-field=prompt]')
        prompt.fill('A riot in a square at dusk, 1968'); prompt.blur()
        expect(dialog.locator('#library-detail-message')).to_have_text('Salvato.')
        expect(dialog.locator('#library-regen-quality')).to_have_value('medium')
        dialog.screenshot(path=str(folder / f'{name}-edit.png'))
        dialog.locator('#library-regenerate').click()
        expect(dialog).to_contain_text('SLOP · nuova', timeout=30000)
        expect(dialog.locator('.library-analysis')).to_contain_text('Analizzata', timeout=30000)
        assert 'due chiamate a pagamento' in confirms[-1] and 'statistiche ripartono da zero' in confirms[-1] and '$' not in confirms[-1], confirms
        expect(dialog.locator('[data-stats]')).to_have_text('Vista 0 volte · classificata correttamente 0')
        expect(dialog.locator('[data-field=prompt]')).to_have_value('A riot in a square at dusk, 1968')
        dialog.locator('[data-action=approve]').click()
        expect(dialog).to_contain_text('SLOP · approvata')
        dialog.locator('.library-detail-close button').click()

        # Delete a published photo: confirmation, out of publication, into the trash.
        page.get_by_role('button', name=f'Apri {prefix}-barricate').click()
        dialog.locator('[data-action=remove]').click()
        expect(dialog).to_contain_text('REAL · nel cestino')
        assert 'va nel cestino' in confirms[-1], confirms
        dialog.locator('.library-detail-close button').click()

        # Distribution tab.
        page.locator('[data-db-tab=distribution]').click()
        chart = page.locator('#db-distribution')
        expect(chart.locator('.dist-overview')).to_be_visible()
        expect(chart.locator('.dist-legend')).to_contain_text('REAL pubblicate')
        page.locator('[data-dist-search]').fill('dbb-')
        rows = chart.locator('.dist-chart .dist-row')
        expect(rows.filter(has_text='dbb-beach')).to_have_count(1)
        beach_row = rows.filter(has_text='dbb-beach')
        expect(beach_row.locator('.dist-left .dist-slop.dist-approved')).to_have_count(1)
        expect(beach_row.locator('.dist-value')).to_have_text('-1')
        beach_row.hover()
        expect(chart.locator('.dist-tip')).to_contain_text('SLOP 1 (pubblicate 0, approvate 1)')
        chart.locator('[data-dist-cat=setting]').click()
        expect(rows.filter(has_text='dbb-beach')).to_have_count(0)
        chart.locator('[data-dist-cat=all]').click()
        page.screenshot(path=str(folder / f'{name}-distribution.png'), full_page=True)
        chart.locator('[data-dist=table]').click()
        expect(chart.locator('.dist-table tbody tr', has_text='dbb-beach')).to_have_count(1)
        assert not errors, errors
        context.close()
        # Clean up: the rows of this viewport go to the trash and away (the game rows go with them).
        for item in (real, slop, beach):
            try: call(f'{API}/{item["id"]}/withdraw', {})
            except Exception: pass
            try: call(f'{API}/{item["id"]}/trash', {})
            except Exception: pass
        call(f'{API}/bulk', {'action': 'delete', 'ids': [real['id'], slop['id'], beach['id']]})
        sql(f"DELETE FROM game_sessions WHERE id='{session}'")
        print('Database browser E2E passed:', name)
    browser.close()
