"""REAL wizard in the browser, desktop and mobile: Commons search (clear box, pages, columns, a tap adds at once, selection
kept across searches, press-and-hold preview), blocking acquisition progress, editorial description with paid generation once per photo (no tags),
description, «Togli dal caricamento», crop step, summary and publication."""
import io
import os
import re
import shutil
import urllib.parse
from pathlib import Path

from PIL import Image
from playwright.sync_api import expect, sync_playwright
from game_copy import game_copy
from long_press import long_press
from catalog import open_gallery

base = os.environ['ROS_TEST_BASE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
folder = Path('artifacts/wizard-browser')
folder.mkdir(parents=True, exist_ok=True)

def image_file(name, seed, size=(420, 280)):
    picture = Image.new('RGB', size, (60 + seed, 100, 180))
    for x in range(0, size[0], 5):
        picture.putpixel((x, x % size[1]), (255, seed, x % 200))
    buffer = io.BytesIO()
    picture.save(buffer, format='JPEG', quality=89)
    return {'name': name + '.jpg', 'mimeType': 'image/jpeg', 'buffer': buffer.getvalue()}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
    for name, options in (('desktop', {'viewport': {'width': 1280, 'height': 900}}),
                          ('mobile', {**p.devices['Pixel 7']})):
        context = browser.new_context(**options, http_credentials={'username': 'owner', 'password': token})
        page = context.new_page()
        errors = []
        confirmations = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def handle(dialog):
            confirmations.append(dialog.message)
            if dialog.message.startswith('Analizzare '):
                dialog.dismiss()  # Do not analyse when uploading from the old file input
            else:
                dialog.accept()
        page.on('dialog', handle)
        created_gallery = page.request.post(base + '/api/admin/library/galleries', data={'title':'Ponti '+name})
        assert created_gallery.ok, created_gallery.text()
        gallery_id = created_gallery.json()['id']
        alternate = page.request.post(base + '/api/admin/library/galleries', data={'title':'Altri ponti '+name})
        assert alternate.ok,alternate.text()
        alternate_id=alternate.json()['id']
        page.goto(base + '/admin')
        expect(page.locator('#admin-galleries')).to_be_visible()
        open_gallery(page, gallery_id)
        page.get_by_role('link', name='Carica REAL').click()
        expect(page.get_by_role('heading', name='Caricamento REAL')).to_be_visible()

        calls = []

        def hit(n):
            return ('{"title":"File:Bridge%d.jpg","page_url":"https://commons.wikimedia.org/wiki/File:Bridge%d.jpg",'
                    '"thumb_url":"https://upload.wikimedia.org/wikipedia/commons/a/aa/Bridge%d.jpg",'
                    '"preview_url":"https://upload.wikimedia.org/wikipedia/commons/a/aa/Bridge%d.jpg","width":640,"height":480,'
                    '"description":"A stone bridge number %d over the river"}') % (n, n, n, n, n)

        def mock_search(route):
            calls.append(route.request.url)
            if 'q=tower' in route.request.url:
                body = '{"files":[' + hit(3) + '],"next":null}'
            elif 'offset=30' in route.request.url:
                body = '{"files":[' + hit(2) + '],"next":null}'
            else:
                body = '{"files":[' + hit(1) + '],"categories":["Category:Bridges","Category:Bridges in Paris"],"next":"30"}'
            route.fulfill(status=200, content_type='application/json', body=body)
        page.route('**/api/admin/library/commons/search?*', mock_search)
        search = page.locator('#rw-search')
        expect(page.locator('#real-wizard .rw-steps li')).to_have_count(4)
        clear = search.locator('[data-rw-clear-search]')
        expect(clear).to_be_visible()
        expect(clear).to_be_disabled()
        search.locator('[name=q]').fill('bridge')
        expect(clear).to_be_enabled()
        # A box of its own after the field: it never covers the text.
        field, button = search.locator('[name=q]').bounding_box(), clear.bounding_box()
        assert button['x'] >= field['x'] + field['width'] - 1 and abs(button['height'] - field['height']) <= 2, (field, button)
        clear.click()
        expect(search.locator('[name=q]')).to_have_value('')
        expect(search.locator('[name=q]')).to_be_focused()
        expect(clear).to_be_disabled()
        search.locator('[name=q]').fill('bridge')
        search.locator('[name=sort]').select_option('recent')
        search.get_by_role('button', name='Cerca', exact=True).click()
        expect(page.locator('.rw-hit')).to_have_count(1)
        expect(page.locator('.rw-hit span')).to_have_count(0)
        expect(page.locator('.rw-categories')).not_to_have_attribute('open', '')
        expect(page.locator('.rw-categories summary')).to_have_text('Categorie correlate (2)')
        expect(page.locator('.rw-pager')).to_contain_text('Pagina 1')
        expect(page.get_by_role('button', name='Pagina precedente')).to_be_disabled()
        expect(page.locator('.rw-hit a')).to_have_count(0)  # no link in the results: a tap ticks the photo
        expect(page.get_by_role('button', name=re.compile('Aggiungi le selezionate'))).to_have_count(0)
        # A tap ticks the photo and puts it among the chosen ones at once; a second tap takes it out.
        page.locator('.rw-hit img').click()
        expect(page.locator('[data-rw-hit]')).to_be_checked()
        expect(page.locator('.rw-pick')).to_have_count(1)
        expect(page.locator('.rw-selected h3')).to_have_text('Immagini selezionate (1)')
        page.locator('.rw-hit img').click()
        expect(page.locator('[data-rw-hit]')).not_to_be_checked()
        expect(page.locator('.rw-pick')).to_have_count(0)
        # Press and hold: a large preview with title, description and the Commons link; it stays open and the photo is not ticked.
        long_press(page, page.locator('.rw-hit img'))
        preview = page.locator('dialog.image-preview')
        expect(preview).to_be_visible()
        expect(preview.locator('h3')).to_have_text('Bridge1.jpg')
        expect(preview).to_contain_text('A stone bridge number 1 over the river')
        expect(preview.get_by_role('link', name='Apri la pagina su Commons')).to_have_attribute('href', 'https://commons.wikimedia.org/wiki/File:Bridge1.jpg')
        expect(preview.locator('img')).to_have_attribute('src', 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Bridge1.jpg')
        page.wait_for_timeout(400)
        expect(preview).to_be_visible()
        expect(page.locator('[data-rw-hit]')).not_to_be_checked()
        expect(page.locator('.rw-pick')).to_have_count(0)
        page.screenshot(path=str(folder / (name + '-preview.png')))
        preview.get_by_role('button', name="Chiudi l'anteprima").click()
        expect(preview).to_be_hidden()
        expect(page.get_by_text('Seleziona tutta la pagina')).to_have_count(0)
        expect(page.locator('#rw-links-section, #rw-links')).to_have_count(0)
        expect(page.get_by_text('Aggiungi link di Wikimedia Commons')).to_have_count(0)
        tracks = "() => getComputedStyle(document.querySelector('.rw-results')).gridTemplateColumns.split(' ').length"
        page.locator('#rw-columns').select_option('3')
        assert page.evaluate(tracks) == 3, page.evaluate(tracks)
        page.locator('#rw-columns').select_option('1')
        assert page.evaluate(tracks) == 1, page.evaluate(tracks)
        page.locator('[data-rw-hit]').check()
        page.get_by_role('button', name='Pagina successiva').click()
        assert page.evaluate(tracks) == 1, page.evaluate(tracks)  # kept on the next page
        expect(page.locator('#rw-columns')).to_have_value('1')
        expect(page.locator('.rw-pager')).to_contain_text('Pagina 2')
        expect(page.get_by_role('button', name='Pagina successiva')).to_be_disabled()
        expect(page.locator('.rw-hit img')).to_have_attribute('alt', 'Bridge2.jpg')
        page.locator('[data-rw-hit]').check()
        page.get_by_role('button', name='Pagina precedente').click()
        expect(page.locator('.rw-pager')).to_contain_text('Pagina 1')
        expect(page.locator('[data-rw-hit]')).to_be_checked()
        assert len(calls) == 2, calls
        page.locator('#rw-columns').select_option('0')
        expect(page.locator('.rw-pick')).to_have_count(2)
        # A new search keeps the chosen photos.
        search.locator('[name=q]').fill('tower')
        search.get_by_role('button', name='Cerca', exact=True).click()
        expect(page.locator('.rw-hit img')).to_have_attribute('alt', 'Bridge3.jpg')
        expect(page.locator('[data-rw-hit]')).not_to_be_checked()
        expect(page.locator('.rw-pick')).to_have_count(2)
        page.locator('.rw-hit img').click()
        expect(page.locator('.rw-pick')).to_have_count(3)
        page.locator('.rw-pick button[aria-label^="Rimuovi Bridge3"]').click()
        expect(page.locator('.rw-pick')).to_have_count(2)
        expect(page.locator('[data-rw-hit]')).not_to_be_checked()
        # Chosen photos: thumbnails without title, linked to their Commons page in a new tab.
        pick = page.locator('.rw-pick a').first
        expect(pick).to_have_attribute('href', 'https://commons.wikimedia.org/wiki/File:Bridge1.jpg')
        expect(pick).to_have_attribute('target', '_blank')
        expect(page.locator('.rw-pick img')).to_have_count(2)
        expect(page.locator('.rw-picks')).not_to_contain_text('Bridge')
        page.screenshot(path=str(folder / (name + '-step1.png')), full_page=True)
        page.locator('[data-gallery-return]').click()
        page.get_by_role('link', name='Carica REAL').click()
        expect(page.locator('.rw-pick')).to_have_count(2)
        page.get_by_role('button', name='Inizia un nuovo caricamento').click()

        # Two REAL photos added through the API with their WebP copies (no external Commons requests).
        title = 'wizard-' + name
        seed = 18 if name == 'desktop' else 28
        for f in (image_file(title + '-a', seed), image_file(title + '-b', seed + 40), image_file(title + '-c', seed + 80), image_file(title + '-d', seed + 120)):
            r = page.request.post(base + '/api/admin/library/upload?' + urllib.parse.urlencode({'gallery_id': gallery_id, 'origin': 'REAL', 'title': f['name'].rsplit('.', 1)[0]}),
                                  data=f['buffer'], headers={'Content-Type': f['mimeType']}); assert r.ok, r.text()
            r = page.request.post(base + f"/api/admin/library/{r.json()['id']}/copy", data=game_copy(f['buffer']), headers={'Content-Type': 'image/webp'}); assert r.ok, r.text()
        response = page.request.get(base + '/api/admin/library?status=new&origin=REAL&q=' + title)
        assert response.ok, response.text()
        found = {i['title']: i for i in response.json()['items']}
        first, second, third, fourth = (found[title + suffix] for suffix in ('-a', '-b', '-c', '-d'))
        assert first['copy'] and second['copy'] and first['analysis']['status'] == 'none', first
        page.evaluate("""([gallery, ids]) => sessionStorage.setItem('ros-real-wizard-v2:' + gallery,
            JSON.stringify({ids, stage:2}))""", [gallery_id, [first['id'], second['id'], third['id'], fourth['id']]])
        page.reload()
        expect(page.locator('.rw-editor')).to_have_count(4)
        page.goto(f'{base}/admin/gallerie/{alternate_id}/real')
        expect(page.locator('#rw-search')).to_be_visible()
        expect(page.locator('.rw-editor')).to_have_count(0)
        page.locator('[data-gallery-return]').click()
        page.locator('[data-gallery-close]').click()
        open_gallery(page, gallery_id)
        page.get_by_role('link', name='Carica REAL').click()
        expect(page.locator('.rw-editor')).to_have_count(4)
        # A photo trashed elsewhere (the Database section) leaves the wizard when the owner comes back to it.
        r = page.request.post(base + f"/api/admin/library/{third['id']}/trash", data='{}', headers={'Content-Type': 'application/json'}); assert r.ok, r.text()
        page.locator('[data-gallery-return]').click()
        page.get_by_role('link', name='Carica REAL').click()
        expect(page.locator('.rw-editor')).to_have_count(3)
        expect(page.locator('.rw-message')).to_contain_text('Una foto è stata tolta dal caricamento')
        # «Togli dal caricamento» moves a photo of step 2 to the trash.
        page.locator('[data-rw-image="%s"] [data-rw=discard]' % fourth['id']).click()
        expect(page.locator('.rw-editor')).to_have_count(2)
        expect(page.locator('.rw-message')).to_have_text('Foto tolta dal caricamento e spostata nel cestino.')
        assert any(m.startswith('Togliere «') for m in confirmations), confirmations
        r = page.request.get(base + f"/api/admin/library/{fourth['id']}"); assert r.ok and r.json()['status'] == 'trash', r.text()
        a = page.locator('[data-rw-image="%s"]' % first['id'])
        b = page.locator('[data-rw-image="%s"]' % second['id'])
        a.locator('.rw-metadata summary').click()
        expect(a.locator('.rw-metadata')).to_contain_text(title + '-a')
        # Step 2 is «Descrizione»: no tags, no categories, no legend (owner decision of 2026-11-20).
        expect(page.locator('#real-wizard .rw-steps li[aria-current=step]')).to_contain_text('Descrizione')
        expect(page.locator('[data-rw-new-tag], [data-rw-tag-category], .tag-legend, .rw-pill, [data-rw=choose-reset]')).to_have_count(0)
        expect(page.locator('[data-rw-caption]')).to_have_count(0)
        # The source description stays in the catalogue and is saved on leaving the field.
        description = a.locator('[data-rw-description]')
        expect(description).to_have_value('')
        description.fill('Un ponte di pietra sul fiume, anni Sessanta')
        description.press('Tab')
        expect(page.locator('.rw-message')).to_have_text('Descrizione salvata.')
        saved = page.request.get(base + '/api/admin/library/' + first['id']).json()
        assert saved['description'] == 'Un ponte di pietra sul fiume, anni Sessanta', saved['description']
        expect(a.locator('[data-rw=crop]')).to_have_count(0)  # the crop is a step of its own
        expect(page.get_by_role('button', name='Genera la descrizione con IA')).to_have_count(1)
        expect(page.locator('[data-rw="choose-tags"], [data-rw="choose-caption"]')).to_have_count(0)
        page.get_by_role('button', name='Genera la descrizione con IA').click()
        expect(page.locator('#rw-generation-dialog')).to_be_visible()
        expect(page.locator('[data-rw-gen="%s"]' % first['id'])).to_be_checked()
        page.locator('[data-rw-gen="%s"]' % second['id']).uncheck()
        page.locator('#rw-generation-dialog button[data-rw=run-gen]').click()
        expect(page.locator('.rw-message')).to_contain_text('1 immagine elaborata', timeout=30000)
        asked = [text for text in confirmations if text.startswith('Confermi ') and 'per generare la descrizione editoriale?' in text]
        assert len(asked) == 1 and 'sarà sostituita' in asked[0] and 'a pagamento' in asked[0] and '$' not in asked[0], confirmations
        # Chosen image: described. The other: untouched.
        expect(a.locator('[data-editorial=visible]')).not_to_have_value('')
        expect(b.locator('[data-editorial=visible]')).to_have_value('')
        visible = a.locator('[data-editorial=visible]')
        visible.fill('Owner corrected the visible street scene.'); visible.blur()
        context_field = a.locator('[data-editorial=documented_context]')
        context_field.fill('Documented context for the players.'); context_field.blur()
        notes = a.locator('[data-editorial=uncertainties]')
        notes.fill('Internal notes for the editor.'); notes.blur()
        expect(a.locator('[data-editorial=visible]')).to_have_value('Owner corrected the visible street scene.')
        # Once per image: the generated one cannot be chosen again.
        page.get_by_role('button', name='Genera la descrizione con IA').click()
        expect(page.locator('[data-rw-gen="%s"]' % first['id'])).to_be_disabled()
        expect(page.locator('.rw-gen-list').first).to_contain_text('già generata')
        expect(page.locator('[data-rw-gen="%s"]' % second['id'])).to_be_checked()
        page.locator('#rw-generation-dialog button[data-rw=close-gen]').click()
        retry = page.request.post(base + '/api/admin/library/%s/analyze' % first['id'], data={'confirm': True}, headers={'Origin': base})
        assert retry.status == 409 and 'già generata' in retry.json()['error'], retry.text()
        page.screenshot(path=str(folder / (name + '-step2.png')), full_page=True)

        # Step 3, «Inquadratura»: each copy with its format; the owner reviews the fixed 4:5 frame.
        page.get_by_role('button', name='Avanti: inquadratura').click()
        # Not blocking: the photo without a description is named in a notice.
        expect(page.locator('.rw-message')).to_contain_text('1 foto non ha la descrizione editoriale')
        expect(page.locator('#real-wizard .rw-steps li[aria-current=step]')).to_contain_text('Inquadratura')
        crop_a = page.locator('[data-rw-crop-image="%s"]' % first['id'])
        expect(page.locator('.rw-crop')).to_have_count(2)
        expect(crop_a).to_contain_text('4:5 verticale')
        crop_a.get_by_role('button', name='Cambia inquadratura').click()
        editor = page.locator('dialog.crop-dialog')
        frame = editor.locator('.crop-frame')
        expect(frame).to_be_visible()  # The existing saved crop reopens directly.
        expect(editor.get_by_role('heading', name='Inquadratura 4:5')).to_be_visible()
        expect(editor.locator('select, input[type=range]')).to_have_count(0)
        expect(editor.get_by_alt_text('Foto originale adattata al 4:5')).to_be_visible()
        expect(editor.get_by_role('button', name='Foto intera')).to_have_count(0)
        expect(editor.get_by_role('button', name='Ritaglia')).to_have_count(0)
        expect(frame).to_have_attribute('aria-valuetext', 'x 98, y 122, altezza 280 px')
        if name == 'mobile':
            stage = editor.locator('.crop-stage')
            stage.scroll_into_view_if_needed()
            area = stage.bounding_box()
            x, y = round(area['x'] + area['width'] / 2), round(area['y'] + area['height'] / 2)
            touch = context.new_cdp_session(page)

            def pinch(event, spread):
                points = [{'x': x - spread, 'y': y, 'id': 1}, {'x': x + spread, 'y': y, 'id': 2}] if spread else []
                touch.send('Input.dispatchTouchEvent', {'type': event, 'touchPoints': points})

            pinch('touchStart', 60)
            pinch('touchMove', 30)
            expect(frame).to_have_attribute('aria-valuenow', '140')
            pinch('touchMove', 45)
            expect(frame).to_have_attribute('aria-valuenow', '210')  # Spread fingers to grow the frame.
            pinch('touchMove', 30)
            expect(frame).to_have_attribute('aria-valuenow', '140')  # Bring fingers together to shrink it.
            pinch('touchEnd', 0)
        handle = editor.locator('[data-crop-corner=se]').bounding_box()
        x, y = round(handle['x'] + handle['width'] / 2 - 7), round(handle['y'] + handle['height'] / 2 - 7)
        before = int(frame.get_attribute('aria-valuenow'))
        if name == 'mobile':
            for event, offset in (('touchStart', 0), ('touchMove', -28), ('touchEnd', None)):
                point = [{'x': x + offset, 'y': y + offset, 'id': 1}] if offset is not None else []
                touch.send('Input.dispatchTouchEvent', {'type': event, 'touchPoints': point})
            touch.detach()
        else:
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x - 28, y - 28, steps=4)
            page.mouse.up()
        assert int(frame.get_attribute('aria-valuenow')) < before
        shape = frame.bounding_box()
        assert abs(shape['width'] / shape['height'] - 0.8) < 0.02, shape
        def box_position():
            return tuple(map(int, re.findall(r'\d+', frame.get_attribute('aria-valuetext'))))

        # A crop that fits can still move on both axes, and stops at the photo edge.
        for _ in range(35): frame.press('Shift+ArrowUp')
        x, y, height = box_position()
        assert y == 122 and height < 280, (x, y, height)
        frame.press('ArrowDown')
        assert box_position()[1] > y
        # A taller crop centres itself over the photograph. Only horizontal movement remains free.
        for _ in range(90):
            if box_position()[2] >= 320: break
            frame.press('+')
        x, y, height = box_position()
        assert 320 <= height < 525 and y == 122 - (height - 280) // 2, (x, y, height)
        frame.press('Shift+ArrowUp')
        frame.press('Shift+ArrowDown')
        assert box_position() == (x, y, height)
        frame.press('ArrowLeft' if x else 'ArrowRight')
        assert box_position()[0] != x and box_position()[1:] == (y, height)
        crop_position = frame.get_attribute('aria-valuetext')
        if name == 'mobile':
            viewport = page.viewport_size
            page.set_viewport_size({'width': 340, 'height': 400})
            expect(editor.get_by_role('button', name='Salva')).to_be_in_viewport(ratio=1)
            page.set_viewport_size(viewport)
        copy_route = '**/api/admin/library/' + first['id'] + '/copy?*'
        uploads = []
        page.route(copy_route, lambda route: uploads.append(route))
        with page.expect_request(copy_route):
            editor.locator('[data-crop=ok]').click()
        processing = page.get_by_role('dialog', name='Elaborazione foto')
        expect(processing).to_contain_text('Salvo l’inquadratura')
        expect(editor).to_have_attribute('open', '')
        assert processing.evaluate('el => el.matches(":modal") && Math.abs(el.getBoundingClientRect().top + el.offsetHeight / 2 - innerHeight / 2) < 2')
        page.keyboard.press('Escape')
        page.mouse.click(2, 2)
        expect(processing).to_be_visible()
        uploads.pop(0).fulfill(status=503, json={'error': 'Copia temporaneamente non disponibile'})
        expect(processing).to_be_hidden()
        expect(editor.locator('.crop-error')).to_have_text('Copia temporaneamente non disponibile')
        page.unroute(copy_route)
        editor.locator('[data-crop=ok]').click()
        expect(page.locator('.rw-message')).to_have_text('Inquadratura salvata.')
        expect(crop_a).to_contain_text('4:5 verticale')
        saved = page.request.get(base + '/api/admin/library/' + first['id']).json()
        copy = saved['copy']
        assert (copy['width'], copy['height']) == (round(height * 0.8), height), copy
        assert copy['crop']['mode'] == 'padded' and copy['crop']['y'] == y, copy
        top_band, bottom_band = 122 - y, y + height - 402
        assert top_band > 0 and abs(top_band - bottom_band) <= 1
        picture = Image.open(io.BytesIO(page.request.get(base + saved['file']).body())).convert('RGB')
        middle = copy['width'] // 2
        assert max(picture.getpixel((middle, 2))) < 8 and max(picture.getpixel((middle, height - 3))) < 8
        assert picture.getpixel((middle, height // 2))[2] > 150
        crop_a.get_by_role('button', name='Cambia inquadratura').click()
        expect(frame).to_have_attribute('aria-valuetext', crop_position)
        editor.locator('[data-crop=cancel]').click()
        page.screenshot(path=str(folder / (name + '-step3-crop.png')), full_page=True)
        page.get_by_role('button', name='Indietro: descrizione').click()
        expect(page.locator('.rw-editor')).to_have_count(2)
        page.get_by_role('button', name='Avanti: inquadratura').click()
        # Step 4: the summary.
        page.get_by_role('button', name='Avanti: riepilogo').click()
        expect(page.locator('#real-wizard .rw-steps li[aria-current=step]')).to_contain_text('Riepilogo')
        expect(page.locator('.rw-final img[data-game-media]')).to_have_count(2)
        expect(page.locator('.rw-final img[data-game-media]').first).to_be_visible()
        expect(page.locator('.rw-final .rs-mark').first).to_be_visible()
        expect(page.locator('.rw-final .play-caption')).to_have_count(0)
        expect(page.locator('.rw-final-description')).to_have_count(1)
        expect(page.locator('.rw-final-description')).to_contain_text('Owner corrected the visible street scene.')
        expect(page.locator('.rw-final-description')).to_contain_text('Documented context for the players.')
        expect(page.locator('.rw-preview-grid')).not_to_contain_text('Un ponte di pietra sul fiume, anni Sessanta')
        expect(page.locator('.rw-preview-grid')).not_to_contain_text('Internal notes for the editor.')
        page.screenshot(path=str(folder / (name + '-step4.png')), full_page=True)
        page.get_by_role('button', name='Conferma e pubblica').click()
        expect(page.locator('.rw-message')).to_contain_text('Devi confermare')
        page.locator('#rw-rights').check()
        page.get_by_role('button', name='Conferma e pubblica').click()
        expect(page.locator('.rw-message')).to_contain_text('2 immagini pubblicate', timeout=30000)
        published = page.request.get(base + '/api/admin/library?status=published&origin=REAL&q=' + title)
        assert published.ok and {first['id'], second['id']} <= {i['id'] for i in published.json()['items']}
        # Commons is simulated at the browser boundary. The wizard passes the selected gallery,
        # and the real upload API stores that membership while the instructions are empty.
        commons_api = '**/api/admin/library/commons'
        requests = []
        page.route(commons_api, lambda route: requests.append(route))

        def finish_acquisition(number):
            route = requests.pop(0)
            data = route.request.post_data_json
            assert data['gallery_id'] == gallery_id and f'File:Bridge{number}.jpg' in data['url'], data
            photo = image_file('commons-' + name, seed + 60 + number, (280, 420) if number == 3 else (420, 280))
            response = page.request.post(base + '/api/admin/library/upload?' + urllib.parse.urlencode({
                'origin': 'REAL', 'title': f'Commons {name} {number}', 'gallery_id': gallery_id}),
                data=photo['buffer'], headers={'Content-Type': photo['mimeType']})
            assert response.ok, response.text()
            route.fulfill(response=response)
            return response.json()['id']

        page.get_by_role('button', name='Inizia un nuovo caricamento').click()
        search.locator('[name=q]').fill('bridge')
        search.get_by_role('button', name='Cerca', exact=True).click()
        page.locator('.rw-hit img').click()
        page.get_by_role('button', name='Pagina successiva').click()
        page.locator('.rw-hit img').click()
        search.locator('[name=q]').fill('tower')
        search.get_by_role('button', name='Cerca', exact=True).click()
        page.locator('.rw-hit img').click()
        expect(page.locator('.rw-pick')).to_have_count(3)
        with page.expect_request(commons_api):
            page.get_by_role('button', name='Avanti: descrizione').click()
        acquisition = page.get_by_role('dialog', name='Acquisizione privata')
        count = acquisition.get_by_role('status')
        progress = acquisition.get_by_role('progressbar', name='Progresso acquisizione foto REAL')
        expect(count).to_have_text('Foto acquisite: 0 di 3')
        expect(progress).to_have_attribute('max', '3')
        expect(progress).to_have_attribute('value', '0')
        assert acquisition.evaluate('el => el.matches(":modal")')
        assert page.evaluate('getComputedStyle(document.documentElement).overflow') == 'hidden'
        unload = 'window.dispatchEvent(new Event("beforeunload", { cancelable: true }))'
        assert not page.evaluate(unload)
        page.keyboard.press('Escape')
        page.mouse.click(2, 2)
        expect(acquisition).to_be_visible()
        for outside in (page.locator('[data-gallery-return]'), search.locator('[name=q]')):
            outside.evaluate('el => el.focus()')
            expect(outside).not_to_be_focused()
        page.screenshot(path=str(folder / (name + '-acquisition.png')))

        with page.expect_request(commons_api):
            first_acquired = finish_acquisition(1)
        expect(count).to_have_text('Foto acquisite: 1 di 3')
        expect(progress).to_have_attribute('value', '1')
        with page.expect_request(commons_api):
            failed = requests.pop(0)
            assert 'File:Bridge2.jpg' in failed.request.post_data_json['url']
            failed.fulfill(status=409, json={'error': 'Foto già presente'})
        expect(count).to_have_text('Foto acquisite: 1 di 3')

        copy_api = '**/api/admin/library/*/copy?*'
        copy_requests = []
        page.route(copy_api, lambda route: copy_requests.append(route))
        with page.expect_request(copy_api):
            last_acquired = finish_acquisition(3)
        expect(count).to_have_text('Foto acquisite: 2 di 3')
        expect(progress).to_have_attribute('value', '2')
        expect(acquisition.locator('.hint')).to_have_text('Preparazione della copia di gioco…')
        copy_requests.pop(0).continue_()
        expect(acquisition).to_be_hidden()
        assert page.evaluate(unload)
        expect(page.locator('.rw-message')).to_contain_text('Foto acquisite: 2 di 3. Errori:')
        expect(page.locator('.rw-editor')).to_have_count(2)
        for photo_id in (first_acquired, last_acquired):
            stored = page.request.get(base + '/api/admin/library/' + photo_id).json()
            assert stored['gallery_id'] == gallery_id and stored['status'] == 'new' and stored['copy']
            assert stored['copy']['crop']['mode'] == 'fit', stored
            picture = Image.open(io.BytesIO(page.request.get(base + stored['file']).body())).convert('RGB')
            if photo_id == last_acquired:
                assert picture.size == (336, 420) and max(picture.getpixel((10, 210))) < 8 and max(picture.getpixel((325, 210))) < 8
                assert picture.getpixel((170, 15))[2] > 150 and picture.getpixel((170, 405))[2] > 150
            else:
                assert picture.size == (420, 525) and max(picture.getpixel((210, 20))) < 8 and max(picture.getpixel((210, 504))) < 8
        page.locator(f'[data-rw-image="{first_acquired}"] [data-rw=discard]').click()
        expect(page.locator('.rw-message')).to_contain_text('Foto tolta dal caricamento')
        discarded = page.request.get(base + '/api/admin/library/' + first_acquired).json()
        assert discarded['gallery_id'] == gallery_id and discarded['status'] == 'trash', discarded
        # A portrait keeps balanced side bands only while the frame is wider than the photograph.
        page.unroute(copy_api)
        page.get_by_role('button', name='Avanti: inquadratura').click()
        page.locator(f'[data-rw-crop-image="{last_acquired}"] [data-rw=crop]').click()
        expect(frame).to_have_attribute('aria-valuetext', 'x 0, y 0, altezza 420 px')
        for _ in range(3): frame.press('-')
        x, y, height = box_position()
        width = round(height * 0.8)
        assert 280 < width < 336 and x == 28 - (width - 280) // 2, (x, y, height)
        frame.press('Shift+ArrowLeft')
        frame.press('Shift+ArrowRight')
        assert box_position() == (x, y, height)
        frame.press('ArrowUp')
        assert box_position() == (x, y - max(1, int(height / 50 + 0.5)), height)
        editor.get_by_role('button', name='Salva').click()
        expect(page.locator('.rw-message')).to_have_text('Inquadratura salvata.')
        portrait = page.request.get(base + '/api/admin/library/' + last_acquired).json()
        assert portrait['copy']['crop']['x'] == x and portrait['copy']['crop']['mode'] == 'padded', portrait['copy']
        assert abs((28 - x) - (x + width - 308)) <= 1
        picture = Image.open(io.BytesIO(page.request.get(base + portrait['file']).body())).convert('RGB')
        assert max(picture.getpixel((2, 30))) < 8 and max(picture.getpixel((width - 3, 30))) < 8
        assert picture.getpixel((width // 2, 30))[2] > 150
        page.locator(f'[data-rw-crop-image="{last_acquired}"] [data-rw=crop]').click()
        for _ in range(12): frame.press('-')
        for _ in range(8): frame.press('Shift+ArrowLeft')
        assert box_position()[0] == 28
        frame.press('ArrowRight')
        assert box_position()[0] > 28
        editor.get_by_role('button', name='Annulla').click()
        page.get_by_role('button', name='Indietro: descrizione').click()
        page.get_by_role('button', name='Indietro', exact=True).click()
        expect(page.locator('.rw-picks img')).to_have_attribute('alt', 'Bridge2.jpg')
        assert not errors, errors
        context.close()
        print('REAL wizard browser E2E 1.15.0 passed (search clear box, tap adds at once, selection kept across searches, press-and-hold preview, description edited and summarised, four steps, crop step, search clear button, no captions, photos trashed elsewhere leave the wizard):', name)
    browser.close()
