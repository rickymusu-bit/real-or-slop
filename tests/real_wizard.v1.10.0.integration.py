"""REAL ingestion wizard E2E v1.10.0, 2026-11-13T07:40:00Z: thumbnails link to the Commons page in a new tab, ticked
only by their checkbox; no «select the whole page»; pasted links collapsed under the search.
v1.9.0, 2026-11-13T06:00:00Z: column picker of the Commons results (automatic or 1-6),
kept across pages and new searches. v1.8.0 (press-and-hold preview) withdrawn.
v1.7.0, 2026-11-13T04:40:00Z: Commons results without titles, related categories
collapsed, two pages behind the arrows (the first is shown again without a request), selection kept across pages.
v1.6.0, 2026-11-10T22:11:48Z: confirmation without amounts, confirm: true.
v1.4.0, 2026-11-10T16:16:00Z.
v1.4.0: tag categories: picker for new tags, coloured pills, no Time tag warning, legend.
v1.3.0, 2026-11-10T06:23:49Z.
v1.3.0: caption counter, soft limit 160 (warning, publication allowed), ceiling 256; typed tags converted.
v1.2.0: generation replaces the texts of the chosen images only, once per image; restoring touches the chosen
images only; focus survives re-rendering.
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

        calls = []

        def hit(n):
            return ('{"title":"File:Bridge%d.jpg","page_url":"https://commons.wikimedia.org/wiki/File:Bridge%d.jpg",'
                    '"thumb_url":"https://upload.wikimedia.org/wikipedia/commons/a/aa/Bridge%d.jpg","width":640,"height":480}') % (n, n, n)

        def mock_search(route):
            calls.append(route.request.url)
            if 'offset=30' in route.request.url:
                body = '{"files":[' + hit(2) + '],"next":null}'
            else:
                body = '{"files":[' + hit(1) + '],"categories":["Category:Bridges","Category:Bridges in Paris"],"next":"30"}'
            route.fulfill(status=200, content_type='application/json', body=body)
        page.route('**/api/admin/library/commons/search?*', mock_search)
        search = page.locator('#rw-search')
        search.locator('[name=q]').fill('bridge')
        search.locator('[name=sort]').select_option('recent')
        search.get_by_role('button', name='Cerca').click()
        expect(page.locator('.rw-hit')).to_have_count(1)
        expect(page.locator('.rw-hit span')).to_have_count(0)
        expect(page.locator('.rw-categories')).not_to_have_attribute('open', '')
        expect(page.locator('.rw-categories summary')).to_have_text('Categorie correlate (2)')
        expect(page.locator('.rw-pager')).to_contain_text('Pagina 1')
        expect(page.get_by_role('button', name='Pagina precedente')).to_be_disabled()
        link = page.locator('.rw-hit a')
        expect(link).to_have_attribute('href', 'https://commons.wikimedia.org/wiki/File:Bridge1.jpg')
        expect(link).to_have_attribute('target', '_blank')
        expect(page.get_by_text('Seleziona tutta la pagina')).to_have_count(0)
        links = page.locator('#rw-links-section')
        expect(links).not_to_have_attribute('open', '')
        expect(page.locator('#rw-links')).to_be_hidden()
        assert page.evaluate("document.querySelector('.rw-panel').compareDocumentPosition(document.querySelector('#rw-links-section')) & 4")  # after the search
        links.locator('summary').click()
        expect(page.locator('#rw-links')).to_be_visible()
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
        page.get_by_role('button', name='Aggiungi le selezionate (2)').click()
        expect(page.locator('.rw-pick')).to_have_count(2)
        page.screenshot(path=str(folder / (name + '-step1.png')), full_page=True)
        page.get_by_role('button', name='Inizia un nuovo caricamento').click()

        # Upload through the original database path: copy is WebP; bypass external Commons requests.
        page.get_by_role('button', name='Database immagini').click()
        title = 'wizard-' + name
        seed = 18 if name == 'desktop' else 28
        page.locator('#library-files').set_input_files([image_file(title + '-a', seed), image_file(title + '-b', seed + 40)])
        expect(page.locator('#library-message')).to_contain_text('2 di 2 aggiunte', timeout=30000)
        response = page.request.get(base + '/api/admin/library?status=new&origin=REAL&q=' + title)
        assert response.ok, response.text()
        found = {i['title']: i for i in response.json()['items']}
        first, second = found[title + '-a'], found[title + '-b']
        assert first['copy'] and second['copy'] and first['analysis']['status'] == 'none', first
        page.evaluate("""ids => sessionStorage.setItem('ros-real-wizard-v1.0.0',
            JSON.stringify({ids, stage:2}))""", [first['id'], second['id']])
        page.reload()
        expect(page.locator('.rw-editor')).to_have_count(2)
        a = page.locator('[data-rw-image="%s"]' % first['id'])
        b = page.locator('[data-rw-image="%s"]' % second['id'])
        a.locator('.rw-metadata summary').click()
        expect(a.locator('.rw-metadata')).to_contain_text(title + '-a')
        # The owner writes first; the generation will replace this on the chosen image only.
        # «Tower» has a wrong form: converted to «tower» and saved, without a notice.
        for card, tag, caption in ((a, 'bridge', 'Didascalia mia A.'), (b, 'Tower', 'Didascalia mia B.')):
            card.locator('[data-rw-caption]').fill(caption)
            card.locator('[data-rw-caption]').blur()
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
        expect(page.get_by_role('button', name='Genera tag e didascalie con IA')).to_have_count(1)
        expect(page.locator('[data-rw="choose-tags"], [data-rw="choose-caption"]')).to_have_count(0)
        expect(page.locator('[data-rw=choose-reset]')).to_have_count(0)
        page.get_by_role('button', name='Genera tag e didascalie con IA').click()
        expect(page.locator('#rw-generation-dialog')).to_be_visible()
        expect(page.locator('[data-rw-gen="%s"]' % first['id'])).to_be_checked()
        page.locator('[data-rw-gen="%s"]' % second['id']).uncheck()
        page.locator('#rw-generation-dialog button[data-rw=run-gen]').click()
        expect(page.locator('.rw-message')).to_contain_text('1 immagine elaborata', timeout=30000)
        asked = [text for text in confirmations if text.startswith('Confermi ') and 'tag e didascalie insieme' in text]
        assert len(asked) == 1 and 'saranno sostituiti' in asked[0] and 'a pagamento' in asked[0] and '$' not in asked[0], confirmations
        # Chosen image: owner's texts replaced. The other: untouched.
        expect(a.locator('.rw-pill', has_text='crowd')).to_have_count(1)
        expect(a.locator('.rw-pill', has_text='bridge')).to_have_count(0)
        expect(a.locator('[data-rw-caption]')).to_have_value('Una strada affollata.')
        expect(b.locator('.rw-pill', has_text='tower')).to_have_count(1)
        expect(b.locator('.rw-pill', has_text='crowd')).to_have_count(0)
        expect(b.locator('[data-rw-caption]')).to_have_value('Didascalia mia B.')
        # Once per image: the generated one cannot be chosen again.
        page.get_by_role('button', name='Genera tag e didascalie con IA').click()
        expect(page.locator('[data-rw-gen="%s"]' % first['id'])).to_be_disabled()
        expect(page.locator('.rw-gen-list').first).to_contain_text('già generata')
        expect(page.locator('[data-rw-gen="%s"]' % second['id'])).to_be_checked()
        page.locator('#rw-generation-dialog button[data-rw=close-gen]').click()
        retry = page.request.post(base + '/api/admin/library/%s/analyze' % first['id'], data={'confirm': True}, headers={'Origin': base})
        assert retry.status == 409 and 'già generati' in retry.json()['error'], retry.text()
        # Owner edits, then restores the chosen image only, at no cost.
        a.locator('[data-rw-caption]').fill('Didascalia rivista manualmente.')
        a.locator('[data-rw-caption]').blur()
        a.locator('[data-rw=remove-tag][data-tag=crowd]').click()
        expect(a.locator('.rw-pill', has_text='crowd')).to_have_count(0)
        b.locator('[data-rw-caption]').fill('Didascalia mia B, rivista.')
        b.locator('[data-rw-caption]').blur()
        page.locator('[data-rw=choose-reset]').click()
        expect(page.locator('[data-rw-restore]')).to_have_count(1)
        page.locator('#rw-reset-all').check()
        page.locator('#rw-reset-dialog button[data-rw=run-reset]').click()
        expect(page.locator('.rw-message')).to_contain_text('1 immagine riportata')
        expect(a.locator('.rw-pill', has_text='crowd')).to_have_count(1)
        expect(a.locator('[data-rw-caption]')).to_have_value('Una strada affollata.')
        expect(b.locator('[data-rw-caption]')).to_have_value('Didascalia mia B, rivista.')
        expect(b.locator('.rw-pill', has_text='tower')).to_have_count(1)
        # Soft limit: over 160 characters a warning, never a cut; the field stops at 256.
        expect(a.locator('[data-caption-count]')).to_have_text('21/160')
        long_caption = 'Torino, 1970. ' + 'Operai escono dalla fabbrica a fine turno. ' * 4
        b.locator('[data-rw-caption]').fill(long_caption)
        expect(b.locator('[data-caption-count]')).to_have_text('%d/160, oltre il limite consigliato' % len(long_caption))
        b.locator('[data-rw-caption]').blur()
        assert b.locator('[data-rw-caption]').get_attribute('maxlength') == '256'
        page.screenshot(path=str(folder / (name + '-step2.png')), full_page=True)

        page.get_by_role('button', name='Avanti: riepilogo').click()
        expect(page.locator('.rw-message')).to_contain_text('supera i 160 caratteri consigliati')
        expect(page.locator('.rw-message')).to_contain_text('2 immagini non hanno un tag di Tempo')
        expect(page.locator('.rw-final .caption-over')).to_have_count(1)
        expect(page.locator('.rw-final img[data-game-media]')).to_have_count(2)
        expect(page.locator('.rw-final img[data-game-media]').first).to_be_visible()
        expect(page.locator('.rw-final .rs-mark').first).to_be_visible()
        expect(page.locator('.rw-final .play-caption').first).not_to_be_empty()
        page.screenshot(path=str(folder / (name + '-step3.png')), full_page=True)
        page.get_by_role('button', name='Conferma e pubblica').click()
        expect(page.locator('.rw-message')).to_contain_text('Devi confermare')
        page.locator('#rw-rights').check()
        page.get_by_role('button', name='Conferma e pubblica').click()
        expect(page.locator('.rw-message')).to_contain_text('2 immagini pubblicate', timeout=30000)
        published = page.request.get(base + '/api/admin/library?status=published&origin=REAL&q=' + title)
        assert published.ok and {first['id'], second['id']} <= {i['id'] for i in published.json()['items']}
        assert not errors, errors
        context.close()
        print('REAL wizard browser E2E passed:', name)
    browser.close()
