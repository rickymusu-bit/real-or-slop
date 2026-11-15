"""Database section in the browser, desktop and mobile: filters, cards, press-and-hold preview, detail with tags and
statistics, edit of a published photo, crop, regeneration of a SLOP, trash, «Distribuzione» tab. Seeds rows in the local D1."""
import io
import json
import os
import shutil
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image
from game_copy import game_copy
from playwright.sync_api import expect, sync_playwright
from long_press import long_press

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
def openai(queue):
    req = urllib.request.Request(os.environ['ROS_TEST_FAKE_OPENAI'] + '/control', data=json.dumps({'queue': queue}).encode(), headers={'Content-Type': 'application/json'})
    urllib.request.urlopen(req).read()
def png(seed, size):
    image = Image.new('RGB', size); image.putdata([((seed * 41) % 256, (x * 5 + seed) % 256, (y * 9) % 256) for y in range(size[1]) for x in range(size[0])])
    out = io.BytesIO(); image.save(out, 'PNG'); return out.getvalue()
def webp(source): return game_copy(source)
CATEGORIES = {'dbb-riot': 'event', 'dbb-paris': 'place', 'dbb-beach': 'setting', '1960s': 'time'}
def seed(prefix, origin, title, number, tags, publish, prompt='', description=''):
    source = png(number, (60, 40))
    item = call(f'{API}/upload?' + urllib.parse.urlencode({'origin': origin, 'title': f'{prefix}-{title}', 'prompt': prompt, 'description': description}), raw=source, mime='image/png')
    item = call(f'{API}/{item["id"]}/copy', raw=webp(source), mime='image/webp')
    item = call(f'{API}/{item["id"]}', {'revision': item['revision'], 'tags': tags,
                                        'tag_categories': {t: CATEGORIES[t] for t in tags}}, method='PATCH')
    item = call(f'{API}/{item["id"]}/approve', {'rights_confirmed': True})
    if publish: item = call(f'{API}/{item["id"]}/publish', {})
    return item

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
    for index, (name, options) in enumerate((('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('mobile', {**p.devices['Pixel 7']}))):
        prefix = 'dbb' + name[0]
        real = seed(prefix, 'REAL', 'barricate', 10 + index * 10, ['dbb-riot', 'dbb-paris', '1960s'], True, description='Barricate in una strada di Parigi')
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
        cards = page.locator(f'.library-card:has([aria-label^="Apri {prefix}"])')
        expect(cards).to_have_count(2)
        tag_input.fill('DBB Paris'); tag_input.press('Enter')  # converted like a typed tag
        expect(page.locator('#library-tag-pills .rw-pill', has_text='dbb-paris')).to_have_count(1)
        expect(cards).to_have_count(1)
        card = page.locator(f'.library-card:has([aria-label="Apri {prefix}-barricate"])')
        # The card: thumbnail, origin and state only; tags (in category order) and views in the detail.
        expect(card.locator('.badge')).to_have_text(['REAL', 'pubblicata'])
        for hidden in ('.db-tag', '.library-card-title', '[data-stats]'): expect(card.locator(hidden)).to_have_count(0)
        card.locator('.library-open').click()
        expect(page.locator('#library-detail .library-tags li.tag-cat')).to_have_count(3)
        for i, tag in enumerate(['1960s', 'dbb-paris', 'dbb-riot']): expect(page.locator('#library-detail .library-tags li.tag-cat').nth(i)).to_contain_text(tag)
        expect(page.locator('#library-detail [data-stats]')).to_have_text('Vista 1 volta · classificata correttamente 1 (100%)')
        page.locator('#library-detail .library-detail-close button').click()
        # Press and hold: the large preview, not the detail; it stays open until its ×.
        long_press(page, card.locator('.library-open'))
        preview = page.locator('dialog.image-preview')
        expect(preview).to_be_visible()
        expect(page.locator('#library-detail')).to_be_hidden()
        expect(preview.locator('h3')).to_have_text(f'{prefix}-barricate')
        expect(preview).to_contain_text('Barricate in una strada di Parigi')
        expect(preview.locator('[data-start-tags]')).to_have_count(0)
        page.wait_for_timeout(400)
        expect(preview).to_be_visible()
        page.screenshot(path=str(folder / f'{name}-preview.png'))
        preview.get_by_role('button', name="Chiudi l'anteprima").click()
        expect(preview).to_be_hidden()
        expect(page.locator('#library-detail')).to_be_hidden()
        page.locator('[data-filter-remove="dbb-riot"]').click()
        tag_input.fill('dbb-beach'); tag_input.press('Enter')
        expect(cards).to_have_count(0)
        page.locator('#library-tag-match').select_option('any')
        expect(cards).to_have_count(2)
        page.locator('#library-origin').select_option('SLOP')
        expect(cards).to_have_count(1)
        expect(cards.locator('.library-open')).to_have_attribute('aria-label', f'Apri {prefix}-spiaggia')
        long_press(page, cards.locator('.library-open'))
        expect(page.locator('dialog.image-preview')).to_contain_text('A beach, 1960s')
        page.locator('dialog.image-preview').get_by_role('button', name="Chiudi l'anteprima").click()
        page.screenshot(path=str(folder / f'{name}-images.png'), full_page=True)
        page.locator('#library-origin').select_option('all')
        page.locator('[data-filter-remove="dbb-paris"]').click(); page.locator('[data-filter-remove="dbb-beach"]').click()
        tag_input.fill('dbb-riot'); tag_input.press('Enter')
        expect(cards).to_have_count(2)
        # REAL without the private description: filter, then the combined analysis of the selection, with the exact maximum.
        page.locator('#library-undescribed').check()
        expect(cards).to_have_count(1)
        page.get_by_role('checkbox', name=f'Seleziona {prefix}-barricate').check()
        openai([{'tags': ['dbb-riot', 'dbb-paris', '1960s']}])
        page.locator('[data-bulk=describe]').click()
        expect(page.locator('#library-message')).to_contain_text('1 di 1 analizzate', timeout=30000)
        assert 'al massimo 1 chiamata' in confirms[-1] and "sull'originale intero" in confirms[-1], confirms[-1]
        described = call(f'{API}/{real["id"]}')
        assert described['real_description']['visible'] and described['status'] == 'published', described
        expect(cards).to_have_count(0)
        page.locator('#library-undescribed').uncheck()
        expect(cards).to_have_count(2)

        # Edit a published SLOP: confirmation, out of publication, approved; then the prompt and a regeneration.
        page.get_by_role('button', name=f'Apri {prefix}-scontri').click()
        dialog = page.locator('#library-detail')
        expect(dialog.locator('.db-edit-note')).to_be_visible()
        expect(dialog.locator('[data-field=caption]')).to_have_count(0)
        expect(dialog.locator('[data-field=description]')).to_have_attribute('readonly', '')
        expect(dialog.locator('[data-stats]')).to_have_text('Vista 1 volta · classificata correttamente 0 (0%)')
        dialog.locator('[data-action=edit]').click()
        expect(dialog.locator('#library-detail-message')).to_have_text('Modifica avviata: la foto non è più pubblicata.')
        assert 'Esce subito dalla pubblicazione' in confirms[-1], confirms
        expect(dialog).to_contain_text('SLOP · approvata')
        description = dialog.locator('[data-field=description]')
        description.fill('Scontri in piazza, 1968.'); description.blur()
        expect(dialog.locator('#library-detail-message')).to_have_text('Salvato.')
        expect(dialog).to_contain_text('SLOP · approvata')
        prompt = dialog.locator('[data-field=prompt]')
        prompt.fill('A riot in a square at dusk, 1968'); prompt.blur()
        expect(dialog.locator('#library-detail-message')).to_have_text('Salvato.')
        expect(dialog.locator('#library-regenerate')).to_have_count(0)
        expect(dialog).to_contain_text('nuovo processo nello studio')
        dialog.screenshot(path=str(folder / f'{name}-edit.png'))
        dialog.locator('.library-detail-close button').click()

        # Delete a published photo: confirmation, out of publication, into the trash.
        page.get_by_role('button', name=f'Apri {prefix}-barricate').click()
        dialog.locator('[data-action=remove]').click()
        expect(dialog).to_contain_text('REAL · nel cestino')
        assert 'va nel cestino' in confirms[-1], confirms
        dialog.locator('.library-detail-close button').click()

        # Crop: the 60×40 SLOP is 3:2, whole; as 1:1 the crop is 40×40 centred, three steps left. One frame only, no view.
        page.locator('#library-tag-match').select_option('any')
        tag_input.fill('dbb-beach'); tag_input.press('Enter')
        page.get_by_role('button', name=f'Apri {prefix}-spiaggia').click()
        expect(dialog).to_contain_text('copia di gioco WebP 32×40, 4:5 verticale')
        dialog.locator('#library-crop').click()
        editor = page.locator('dialog.crop-dialog')
        crop_frame = editor.locator('.crop-frame')
        expect(crop_frame).to_have_count(1)
        expect(crop_frame).to_be_visible()
        expect(crop_frame).to_have_attribute('aria-valuetext', 'x 14, y 0, altezza 40 px')
        expect(editor.locator('.crop-format select')).to_have_value('4:5')
        expect(crop_frame).to_have_attribute('aria-valuetext', 'x 14, y 0, altezza 40 px')
        for _ in range(3): crop_frame.press('ArrowLeft')
        expect(crop_frame).to_have_attribute('aria-valuetext', 'x 11, y 0, altezza 40 px')
        editor.screenshot(path=str(folder / f'{name}-crop.png'))
        editor.locator('[data-crop=ok]').click()
        expect(page.locator('dialog.crop-dialog')).to_have_count(0)
        expect(dialog.locator('#library-detail-message')).to_have_text('Inquadratura salvata.')
        saved = call(f'{API}/{beach["id"]}')['copy']
        assert saved['crop'] == {'x': 11, 'y': 0, 'width': 32, 'height': 40, 'format': '4:5'} and 'view' not in saved, saved
        # The same crop: nothing sent, same copy file.
        kept = saved['sha256']
        dialog.locator('#library-crop').click()
        expect(editor.locator('.crop-frame')).to_have_attribute('aria-valuetext', 'x 11, y 0, altezza 40 px')
        editor.locator('[data-crop=ok]').click()
        expect(dialog.locator('#library-detail-message')).to_have_text('Inquadratura salvata.')
        saved = call(f'{API}/{beach["id"]}')['copy']; assert saved['sha256'] == kept, saved
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
        print('Database browser E2E 1.7.0 passed (press-and-hold preview, no captions, cards without tags and title; format and crop, no view):', name)
    browser.close()
