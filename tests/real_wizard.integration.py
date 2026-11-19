"""REAL wizard in the browser, desktop and mobile: Commons search (clear box, pages, columns, a tap adds at once, selection
kept across searches, press-and-hold preview), tags with categories, paid generation and restore, description, «Togli dal
caricamento», crop step, summary and publication."""
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

def image_file(name, seed):
    picture = Image.new('RGB', (420, 280), (60 + seed, 100, 180))
    for x in range(0, 420, 5):
        picture.putpixel((x, x % 280), (255, seed, x % 200))
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
        # The owner writes first; the generation will replace this on the chosen image only.
        # «Tower» has a wrong form: converted to «tower» and saved, without a notice.
        expect(page.locator('[data-rw-caption]')).to_have_count(0)
        # The description, read by the players after the game, is edited here and saved on leaving the field.
        description = a.locator('[data-rw-description]')
        expect(description).to_have_value('')
        description.fill('Un ponte di pietra sul fiume, anni Sessanta')
        description.press('Tab')
        expect(page.locator('.rw-message')).to_have_text('Descrizione salvata.')
        saved = page.request.get(base + '/api/admin/library/' + first['id']).json()
        assert saved['description'] == 'Un ponte di pietra sul fiume, anni Sessanta', saved['description']
        expect(a.locator('[data-rw=crop]')).to_have_count(0)  # the crop is a step of its own
        for card, tag in ((a, 'bridge'), (b, 'Tower')):
            card.locator('[data-rw-new-tag]').fill(tag)
            if not card.locator('[data-rw-tag-category]').input_value():
                card.locator('[data-rw-new-tag]').press('Enter')
                expect(page.locator('.rw-message')).to_have_text('Scegli la categoria del tag.')
                card.locator('[data-rw-tag-category]').select_option('object')
                card.locator('[data-rw-new-tag]').fill(tag)
            card.locator('[data-rw-new-tag]').press('Enter')
            expect(card.locator('.rw-pill', has_text=tag.lower())).to_have_count(1)
            expect(page.locator('.rw-message')).to_have_text('Tag salvato.')
            expect(card.locator('[data-rw-new-tag]')).to_be_focused()

        expect(a.locator('.rw-pill.tag-cat-object', has_text='bridge')).to_have_count(1)
        expect(a.locator('[data-rw-no-time]')).to_be_visible()
        expect(page.locator('.tag-legend')).to_have_count(1)
        expect(page.get_by_role('button', name='Genera tag e descrizione con IA')).to_have_count(1)
        expect(page.locator('[data-rw="choose-tags"], [data-rw="choose-caption"]')).to_have_count(0)
        expect(page.locator('[data-rw=choose-reset]')).to_have_count(0)
        page.get_by_role('button', name='Genera tag e descrizione con IA').click()
        expect(page.locator('#rw-generation-dialog')).to_be_visible()
        expect(page.locator('[data-rw-gen="%s"]' % first['id'])).to_be_checked()
        page.locator('[data-rw-gen="%s"]' % second['id']).uncheck()
        page.locator('#rw-generation-dialog button[data-rw=run-gen]').click()
        expect(page.locator('.rw-message')).to_contain_text('1 immagine elaborata', timeout=30000)
        asked = [text for text in confirmations if text.startswith('Confermi ') and 'per generare i tag?' in text]
        assert len(asked) == 1 and 'saranno sostituiti' in asked[0] and 'a pagamento' in asked[0] and '$' not in asked[0], confirmations
        # Chosen image: owner's texts replaced. The other: untouched.
        expect(a.locator('.rw-pill', has_text='crowd')).to_have_count(1)
        expect(a.locator('.rw-pill', has_text='bridge')).to_have_count(0)
        expect(a.locator('[data-editorial=visible]')).not_to_have_value('')
        private = a.locator('[data-editorial=visible]')
        private.fill('Owner corrected the visible street scene.'); private.blur()
        expect(a.locator('[data-editorial=visible]')).to_have_value('Owner corrected the visible street scene.')
        expect(a.locator('.rw-pill', has_text='crowd')).to_have_count(1)

        expect(b.locator('.rw-pill', has_text='tower')).to_have_count(1)
        expect(b.locator('.rw-pill', has_text='crowd')).to_have_count(0)
        # Once per image: the generated one cannot be chosen again.
        page.get_by_role('button', name='Genera tag e descrizione con IA').click()
        expect(page.locator('[data-rw-gen="%s"]' % first['id'])).to_be_disabled()
        expect(page.locator('.rw-gen-list').first).to_contain_text('già generata')
        expect(page.locator('[data-rw-gen="%s"]' % second['id'])).to_be_checked()
        page.locator('#rw-generation-dialog button[data-rw=close-gen]').click()
        retry = page.request.post(base + '/api/admin/library/%s/analyze' % first['id'], data={'confirm': True}, headers={'Origin': base})
        assert retry.status == 409 and 'già generati' in retry.json()['error'], retry.text()
        # Owner edits, then restores the chosen image only, at no cost.
        a.locator('[data-rw=remove-tag][data-tag=crowd]').click()
        expect(a.locator('.rw-pill', has_text='crowd')).to_have_count(0)
        page.locator('[data-rw=choose-reset]').click()
        expect(page.locator('[data-rw-restore]')).to_have_count(1)
        page.locator('#rw-reset-all').check()
        page.locator('#rw-reset-dialog button[data-rw=run-reset]').click()
        expect(page.locator('.rw-message')).to_contain_text('1 immagine riportata')
        expect(a.locator('.rw-pill', has_text='crowd')).to_have_count(1)
        expect(b.locator('.rw-pill', has_text='tower')).to_have_count(1)
        page.screenshot(path=str(folder / (name + '-step2.png')), full_page=True)

        # Step 3, «Inquadratura»: each copy with its format; the owner reviews the fixed 4:5 frame.
        page.get_by_role('button', name='Avanti: inquadratura').click()
        expect(page.locator('.rw-message')).to_contain_text('2 immagini non hanno un tag di Tempo')
        expect(page.locator('#real-wizard .rw-steps li[aria-current=step]')).to_contain_text('Inquadratura')
        crop_a = page.locator('[data-rw-crop-image="%s"]' % first['id'])
        expect(page.locator('.rw-crop')).to_have_count(2)
        expect(crop_a).to_contain_text('4:5 verticale')
        crop_a.get_by_role('button', name='Cambia inquadratura').click()
        editor = page.locator('dialog.crop-dialog')
        expect(editor.locator('.crop-frame')).to_be_visible()
        expect(editor.locator('.crop-format select')).to_have_value('4:5')
        editor.locator('[data-crop=ok]').click()
        expect(page.locator('.rw-message')).to_have_text('Inquadratura salvata.')
        expect(crop_a).to_contain_text('4:5 verticale')
        saved = page.request.get(base + '/api/admin/library/' + first['id']).json()['copy']
        assert saved['crop']['format'] == '4:5' and saved['width'] == round(saved['height']*0.8), saved
        page.screenshot(path=str(folder / (name + '-step3-crop.png')), full_page=True)
        page.get_by_role('button', name='Indietro: tag').click()
        expect(page.locator('.rw-editor')).to_have_count(2)
        page.get_by_role('button', name='Avanti: inquadratura').click()
        # Step 4: the summary.
        page.get_by_role('button', name='Avanti: riepilogo').click()
        expect(page.locator('#real-wizard .rw-steps li[aria-current=step]')).to_contain_text('Riepilogo')
        expect(page.locator('.rw-final img[data-game-media]')).to_have_count(2)
        expect(page.locator('.rw-final img[data-game-media]').first).to_be_visible()
        expect(page.locator('.rw-final .rs-mark').first).to_be_visible()
        expect(page.locator('.rw-final .play-caption')).to_have_count(0)
        expect(page.locator('.rw-final-description')).to_have_text(['Un ponte di pietra sul fiume, anni Sessanta'])
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
        acquired=[]
        def mock_acquisition(route):
            data=route.request.post_data_json
            assert data['gallery_id']==gallery_id and 'File:Bridge1.jpg' in data['url'], data
            photo=image_file('commons-'+name, seed+60)
            response=page.request.post(base+'/api/admin/library/upload?'+urllib.parse.urlencode({
                'origin':'REAL','title':'Commons '+name,'gallery_id':data['gallery_id']}),
                data=photo['buffer'],headers={'Content-Type':photo['mimeType']})
            assert response.ok,response.text()
            acquired.append(response.json()['id'])
            route.fulfill(status=response.status,content_type='application/json',body=response.text())
        page.route('**/api/admin/library/commons', mock_acquisition)
        page.get_by_role('button', name='Inizia un nuovo caricamento').click()
        page.locator('#rw-search [name=q]').fill('bridge')
        page.locator('#rw-search').get_by_role('button', name='Cerca', exact=True).click()
        page.locator('.rw-hit img').click()
        page.get_by_role('button', name='Avanti: tag').click()
        expect(page.locator('.rw-editor')).to_have_count(1)
        stored=page.request.get(base+'/api/admin/library/'+acquired[0]).json()
        assert stored['gallery_id']==gallery_id and stored['status']=='new' and stored['copy']
        page.locator('[data-rw=discard]').click()
        expect(page.locator('.rw-message')).to_contain_text('Foto tolta dal caricamento')
        discarded=page.request.get(base+'/api/admin/library/'+acquired[0]).json()
        assert discarded['gallery_id']==gallery_id and discarded['status']=='trash', discarded
        assert not errors, errors
        context.close()
        print('REAL wizard browser E2E 1.15.0 passed (search clear box, tap adds at once, selection kept across searches, press-and-hold preview, description edited and summarised, four steps, crop step, search clear button, no captions, photos trashed elsewhere leave the wizard):', name)
    browser.close()
