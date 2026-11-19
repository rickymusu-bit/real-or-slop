"""Database section in the browser, desktop and mobile: filters, cards, press-and-hold preview, detail with tags and
statistics, edit of a published photo, crop, regeneration of a SLOP, trash, «Distribuzione» tab. Seeds rows in the local D1."""
from local_db import sql
import io
import json
import re
import os
import shutil
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image
from catalog import make_gallery, open_gallery
from game_copy import game_copy
from playwright.sync_api import expect, sync_playwright
from long_press import long_press

base, state = os.environ['ROS_TEST_BASE'], os.environ['ROS_TEST_STATE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
gallery_id = make_gallery(base + '/api/admin/library', token, 'Test database_browser')
API = base + '/api/admin/library'
folder = Path('artifacts/database-browser'); folder.mkdir(parents=True, exist_ok=True)

def call(url, data=None, method=None, raw=None, mime='application/json'):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request(url, data=body, method=method or ('POST' if body is not None else 'GET'),
                                 headers={'Content-Type': mime, 'Authorization': 'Bearer ' + token})
    with urllib.request.urlopen(req) as r: return json.loads(r.read())
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
    item = call(f'{API}/upload?' + urllib.parse.urlencode({'gallery_id': gallery_id, 'origin': origin, 'title': f'{prefix}-{title}', 'prompt': prompt, 'description': description}), raw=source, mime='image/png')
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
            "; ".join(f"INSERT INTO game_rounds(id,session_id,image_id,position,presented_at,copy_key) SELECT '{prefix}-r{i}','{session}',id,{i},1,copy_key FROM images WHERE id='{image}'"
                      for i, image in enumerate((real['id'], slop['id']))) + "; " +
            f"INSERT INTO answers(round_id,choice,correct,answered_at,elapsed_ms) VALUES('{prefix}-r0','REAL',1,1,10),('{prefix}-r1','REAL',0,1,10)")
        context = browser.new_context(**options, http_credentials={'username': 'owner', 'password': token})
        page = context.new_page(); errors, confirms = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def answer(dialog):
            confirms.append(dialog.message); dialog.accept()
        page.on('dialog', answer)
        page.goto(base + '/admin')
        open_gallery(page, gallery_id)
        page.locator('.db-filter-panel summary').click()
        # Filters: one tag, then two (all of them), then any of them, then the origin.
        tag_input = page.locator('#library-tag')
        tag_input.fill('dbb-riot'); tag_input.press('Enter')
        expect(page.locator('#library-tag-pills .rw-pill')).to_have_count(1)
        cards = page.locator(f'.library-card:has([aria-label^="Apri {prefix}"]),.library-card[data-id="{slop["id"]}"],.library-card[data-id="{beach["id"]}"]')
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
        expect(page.locator('#library-detail [data-stats]')).to_have_text('Vista 1 volta / classificata correttamente 1 (100%)')
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
        expect(cards.locator('.library-open')).to_have_attribute('aria-label', 'Apri SLOP '+beach['id'][:8])
        long_press(page, cards.locator('.library-open'))
        expect(page.locator('dialog.image-preview')).to_contain_text('A beach, 1960s')
        page.locator('dialog.image-preview').get_by_role('button', name="Chiudi l'anteprima").click()
        page.screenshot(path=str(folder / f'{name}-images.png'), full_page=True)
        page.locator('#library-origin').select_option('all')
        page.locator('[data-filter-remove="dbb-paris"]').click(); page.locator('[data-filter-remove="dbb-beach"]').click()
        tag_input.fill('dbb-riot'); tag_input.press('Enter')
        expect(cards).to_have_count(2)
        # Select REAL through the origin filter, then explicitly analyse the selection with the exact maximum.
        page.locator('#library-origin').select_option('REAL')
        expect(cards).to_have_count(1)
        # «Seleziona tutte» takes exactly the photos the filters show.
        expect(page.locator('#library-select-all')).to_have_text(re.compile(r'^Seleziona tutte \(\d+\)$'))
        page.locator('#library-select-all').click()
        expect(page.locator('#library-select-all')).to_be_hidden()
        expect(page.get_by_role('checkbox', name=f'Seleziona {prefix}-barricate')).to_be_checked()
        shown = page.locator('#library-grid [data-select]').count()
        expect(page.locator('#library-selection strong')).to_have_text(f'{shown} selezionate')
        page.locator('[data-bulk=none]').click(); expect(page.locator('#library-select-all')).to_be_visible()
        page.get_by_role('checkbox', name=f'Seleziona {prefix}-barricate').check()
        openai([{'tags': ['dbb-riot', 'dbb-paris', '1960s']}])
        page.locator('[data-bulk=describe]').click()
        expect(page.locator('#library-message')).to_contain_text('1 di 1 analizzate', timeout=30000)
        assert 'al massimo 1 chiamata' in confirms[-1] and "sull'originale intero" in confirms[-1], confirms[-1]
        described = call(f'{API}/{real["id"]}')
        assert described['real_description']['visible'] and described['status'] == 'published', described
        expect(cards).to_have_count(1)
        page.locator('#library-origin').select_option('all')
        expect(cards).to_have_count(2)
        # An analysis left «running» by a request that died (more than ten minutes ago) is repeated from the card, with the warning.
        stuck = seed(prefix, 'REAL', 'interrotta', 30 + index, ['dbb-riot'], False)
        sql(f"UPDATE images SET analysis_status='running',updated_at='2000-01-01T00:00:00.000Z' WHERE id='{stuck['id']}'")
        page.locator('#library-search').fill(f'{prefix}-interrotta')
        expect(cards).to_have_count(1)
        page.get_by_role('button', name=f'Apri {prefix}-interrotta').click()
        expect(page.locator('#library-detail [data-analysis-unsure]')).to_contain_text('interrotta')
        openai([{'tags': ['dbb-riot']}])
        page.locator('#library-description-analysis').click()
        expect(page.locator('#library-detail [data-analysis-unsure]')).to_have_count(0, timeout=30000)
        assert 'esito incerto' in confirms[-1], confirms[-1]
        assert call(f'{API}/{stuck["id"]}')['real_description']['visible']
        page.locator('#library-detail .library-detail-close button').click()
        # The same case in the group action: included, named in the confirmation, repeated explicitly. One still running is left alone.
        again = seed(prefix, 'REAL', 'interrotta-gruppo', 40 + index, ['dbb-riot'], False)
        fresh = seed(prefix, 'REAL', 'in-corso', 50 + index, ['dbb-riot'], False)
        sql(f"UPDATE images SET analysis_status='running',updated_at='2000-01-01T00:00:00.000Z' WHERE id='{again['id']}'")
        sql(f"UPDATE images SET analysis_status='running',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='{fresh['id']}'")
        page.locator('#library-search').fill('')
        expect(cards).to_have_count(5)
        page.get_by_role('checkbox', name=f'Seleziona {prefix}-interrotta-gruppo',exact=True).check()
        page.get_by_role('checkbox', name=f'Seleziona {prefix}-in-corso',exact=True).check()
        openai([{'tags': ['dbb-riot']}])
        with page.expect_response(f'{API}/{again["id"]}/analyze') as analysis:
            page.locator('[data-bulk=describe]').click()
        assert analysis.value.ok
        expect(cards).to_have_count(5, timeout=30000)  # analysis no longer hides images from the catalogue
        expect(page.locator('#library-message')).to_contain_text('1 di 1 analizzate')
        assert "un'analisi precedente interrotta o con esito incerto" in confirms[-1] and 'al massimo 1 chiamata' in confirms[-1], confirms[-1]
        assert call(f'{API}/{again["id"]}')['real_description']['visible'] and call(f'{API}/{fresh["id"]}')['real_description'] is None
        ids = [stuck['id'], again['id'], fresh['id']]
        call(f'{API}/bulk', {'action': 'trash', 'ids': ids}); call(f'{API}/bulk', {'action': 'delete', 'ids': ids})
        page.locator('[data-view=library]').click()
        expect(cards).to_have_count(2)

        # Edit a published SLOP: confirmation, out of publication, approved; then the prompt and a regeneration.
        page.locator(f'.library-card[data-id="{slop["id"]}"] .library-open').click()
        dialog = page.locator('#library-detail')
        expect(dialog.locator('.db-edit-note')).to_be_visible()
        expect(dialog.locator('[data-field=caption]')).to_have_count(0)
        expect(dialog.locator('[data-field=description]')).to_have_attribute('readonly', '')
        expect(dialog.locator('[data-stats]')).to_have_text('Vista 1 volta / classificata correttamente 0 (0%)')
        dialog.locator('[data-action=edit]').click()
        expect(dialog.locator('#library-detail-message')).to_have_text('Modifica avviata: la foto non è più pubblicata.')
        assert 'Esce subito dalla pubblicazione' in confirms[-1], confirms
        expect(dialog).to_contain_text('SLOP / approvata')
        description = dialog.locator('[data-field=description]')
        description.fill('Scontri in piazza, 1968.'); description.blur()
        expect(dialog.locator('#library-detail-message')).to_have_text('Salvato.')
        expect(dialog).to_contain_text('SLOP / approvata')
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
        expect(dialog).to_contain_text('REAL / nel cestino')
        assert 'va nel cestino' in confirms[-1], confirms
        dialog.locator('.library-detail-close button').click()

        # Crop: the 60×40 SLOP is 3:2, whole; as 1:1 the crop is 40×40 centred, three steps left. One frame only, no view.
        page.locator('#library-tag-match').select_option('any')
        tag_input.fill('dbb-beach'); tag_input.press('Enter')
        page.locator(f'.library-card[data-id="{beach["id"]}"] .library-open').click()
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

        # Treatment with sliders: the SLOP gets the REAL (measured) as its source; the sliders start on the proposal, a change
        # redraws the preview in the page, saving makes the copy here with the owner's settings and uploads it.
        metrics = json.dumps({'long': 40, 'noise': 3.0, 'sharpness': 6.0, 'contrast': 120, 'saturation': 0.2, 'cast': [2, 0, -2], 'tint': [0, 0, 0], 'v': 3})
        sql(f"UPDATE images SET generation_batch='test-treatment',generation_slot=json_object('target_metrics',json('{metrics}')) WHERE id='{beach['id']}'")
        page.locator(f'.library-card[data-id="{beach["id"]}"] .library-open').click()
        dialog.locator('#library-treatment-on').click()
        expect(dialog.locator('#library-detail-message')).to_have_text('Copia trattata.')
        dialog.locator('#library-treatment-edit').click()
        sliders = page.locator('dialog.treatment-dialog')
        expect(sliders.locator('[data-status]')).to_have_text('Trattamento proposto.')
        expect(sliders.locator('input[type=range]')).to_have_count(10)
        sliders.locator('[data-key=grain]').fill('8')
        expect(sliders.locator('[data-out=grain]')).to_have_text('8.0')
        expect(sliders.locator('[data-status]')).to_have_text('Trattamento modificato, non ancora salvato.')
        expect(sliders.locator('[data-caption=preview]')).to_contain_text('scarto dalla REAL')
        # «Seppia» starts from a sepia tint, «Bianco e nero» from none: the two never look alike by accident.
        sliders.locator('[data-key=monochrome]').select_option('sepia')
        expect(sliders.locator('[data-out=cast0]')).to_have_text('15.0');expect(sliders.locator('[data-out=cast2]')).to_have_text('-24.0')
        sliders.locator('[data-key=monochrome]').select_option('black-and-white')
        expect(sliders.locator('[data-out=cast0]')).to_have_text('0.0')
        sliders.locator('[data-key=monochrome]').select_option('sepia')
        sliders.screenshot(path=str(folder / f'{name}-treatment.png'))
        sliders.locator('[data-treatment=ok]').click()
        expect(page.locator('dialog.treatment-dialog')).to_have_count(0)
        expect(dialog.locator('#library-detail-message')).to_have_text('Trattamento regolato salvato.')
        treatment = call(f'{API}/{beach["id"]}')['treatment']
        assert treatment['settings']['grain'] == 8 and treatment['applied']['grain'] == 8, treatment
        assert treatment['settings']['monochrome'] == 'sepia' and treatment['settings']['cast'] == [15, -1, -24] and treatment['version'] == 5, treatment
        expect(dialog).to_contain_text("regolato dall'owner")
        dialog.locator('.library-detail-close button').click()

        if name == 'desktop':
            # A long gallery can be scrolled in pages, without pulling in other galleries.
            page.locator('[data-gallery-close]').click()
            paged = make_gallery(API, token, 'Test pagination')
            sql(f"""WITH RECURSIVE photos(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM photos WHERE n<73)
                INSERT INTO images(id, gallery_id, origin, title, original_key, original_sha256, original_mime, width, height, created_at, updated_at)
                SELECT printf('gallery-page-%02d',n), '{paged}', 'REAL', printf('Pagina %02d',n), printf('test/page-%02d',n),
                    printf('%064x',n), 'image/png', 60, 40, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z' FROM photos""")
            page.reload()
            open_gallery(page, paged)
            expect(page.locator('#library-counts')).to_contain_text('73 nuove')
            expect(page.locator('#library-grid .library-card')).to_have_count(72)
            page.get_by_role('button', name='Carica altre foto').click()
            expect(page.locator('#library-grid .library-card')).to_have_count(73)
            expect(page.locator('[data-open="gallery-page-73"]')).to_be_visible()
            expect(page.get_by_role('button', name='Carica altre foto')).to_be_hidden()
            sql(f"DELETE FROM images WHERE gallery_id='{paged}'")

        # Distribution is available in Statistics.
        page.locator('[data-gallery-close]').click()
        page.locator('[data-admin-tab=stats]').click()
        page.locator('#stats-distribution summary').click()
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

