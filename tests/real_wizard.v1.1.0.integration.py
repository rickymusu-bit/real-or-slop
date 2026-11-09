"""REAL ingestion wizard E2E v1.1.0, 2026-11-09T21:31:53.985Z.
Browser exercises Commons search UI, combined paid generation, tag editing, no-cost reset,
WebP preview, rights confirmation and publication, using the fake OpenAI server."""
import io
import os
import shutil
from pathlib import Path

from PIL import Image
from playwright.sync_api import expect, sync_playwright

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
        page.goto(base + '/admin')
        expect(page.get_by_role('heading', name='Caricamento REAL')).to_be_visible()
        expect(page.get_by_role('button', name='Generazione SLOP')).to_be_visible()
        expect(page.get_by_role('button', name='Impostazioni')).to_be_visible()

        def mock_search(route):
            route.fulfill(status=200, content_type='application/json', body=(
                '{"files":[{"title":"File:Bridge.jpg","page_url":"https://commons.wikimedia.org/wiki/File:Bridge.jpg",'
                '"thumb_url":"https://upload.wikimedia.org/wikipedia/commons/a/aa/Bridge.jpg","width":640,"height":480}],'
                '"categories":[],"next":null}'))
        page.route('**/api/admin/library/commons/search?*', mock_search)
        search = page.locator('#rw-search')
        search.locator('[name=q]').fill('bridge')
        search.locator('[name=sort]').select_option('recent')
        search.get_by_role('button', name='Cerca').click()
        expect(page.locator('.rw-hit')).to_have_count(1)
        page.locator('[data-rw-hit]').check()
        page.get_by_role('button', name='Aggiungi le selezionate').click()
        expect(page.locator('.rw-pick')).to_have_count(1)
        page.screenshot(path=str(folder / (name + '-step1.png')), full_page=True)
        page.get_by_role('button', name='Inizia un nuovo caricamento').click()

        # Upload through the original database path: copy is WebP; bypass external Commons requests.
        page.get_by_role('button', name='Database immagini').click()
        title = 'wizard-' + name
        page.locator('#library-files').set_input_files(image_file(title, 18 if name == 'desktop' else 28))
        expect(page.locator('#library-message')).to_contain_text('1 di 1 aggiunte', timeout=30000)
        response = page.request.get(base + '/api/admin/library?status=new&origin=REAL&q=' + title)
        assert response.ok, response.text()
        candidates = response.json()['items']
        item = next(i for i in candidates if i['title'] == title)
        assert item['copy'] and item['copy']['width'] > 0 and item['status'] == 'new'

        page.evaluate("""id => sessionStorage.setItem('ros-real-wizard-v1.0.0',
            JSON.stringify({ids:[id],stage:2}))""", item['id'])
        page.reload()
        expect(page.locator('.rw-editor')).to_have_count(1)
        expect(page.locator('.rw-editor .rw-metadata')).to_have_count(1)
        page.locator('.rw-metadata summary').click()
        expect(page.locator('.rw-metadata')).to_contain_text(title)
        expect(page.locator('[data-rw-caption]')).to_have_value('')
        page.locator('[data-rw-new-tag]').fill('bridge')
        page.get_by_role('button', name='Aggiungi', exact=True).click()
        expect(page.locator('.rw-pill', has_text='bridge')).to_have_count(1)

        expect(page.get_by_role('button', name='Genera tag e didascalie con IA')).to_have_count(1)
        expect(page.locator('[data-rw="choose-tags"], [data-rw="choose-caption"]')).to_have_count(0)
        page.get_by_role('button', name='Genera tag e didascalie con IA').click()
        expect(page.locator('#rw-generation-dialog')).to_be_visible()
        page.locator('#rw-generation-dialog button[data-rw=run-gen]').click()
        expect(page.locator('.rw-message')).to_contain_text('1 immagine elaborata', timeout=30000)
        assert len([text for text in confirmations if text.startswith('Confermi ') and 'tag e didascalie insieme' in text]) == 1, confirmations
        expect(page.locator('.rw-pill', has_text='crowd')).to_have_count(1)
        expect(page.locator('[data-rw-caption]')).to_have_value('Una strada affollata.')
        page.locator('[data-rw-caption]').fill('Didascalia rivista manualmente.')
        page.locator('[data-rw-caption]').blur()
        page.locator('[data-rw=remove-tag][data-tag=crowd]').click()
        expect(page.locator('.rw-pill', has_text='crowd')).to_have_count(0)
        page.get_by_role('button', name='Ripristina i testi generati').click()
        expect(page.locator('.rw-pill', has_text='crowd')).to_have_count(1)
        expect(page.locator('[data-rw-caption]')).to_have_value('Una strada affollata.')
        page.screenshot(path=str(folder / (name + '-step2.png')), full_page=True)

        page.get_by_role('button', name='Avanti: riepilogo').click()
        expect(page.locator('.rw-final img[data-game-media]')).to_be_visible()
        expect(page.locator('.rw-final .rs-mark')).to_be_visible()
        expect(page.locator('.rw-final .play-caption')).not_to_be_empty()
        page.screenshot(path=str(folder / (name + '-step3.png')), full_page=True)
        page.get_by_role('button', name='Conferma e pubblica').click()
        expect(page.locator('.rw-message')).to_contain_text('Devi confermare')
        page.locator('#rw-rights').check()
        page.get_by_role('button', name='Conferma e pubblica').click()
        expect(page.locator('.rw-message')).to_contain_text('1 immagine pubblicata', timeout=30000)
        published = page.request.get(base + '/api/admin/library?status=published&origin=REAL&q=' + title)
        assert published.ok and any(i['id'] == item['id'] for i in published.json()['items'])
        assert not errors, errors
        context.close()
        print('REAL wizard browser E2E passed:', name)
    browser.close()
