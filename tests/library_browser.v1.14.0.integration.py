"""v1.14.0, 2026-11-13T22:00:00Z: the dashboard says it is loading, then the indicator goes; no caption field in the detail (the edit
changes the description); the analysis calls are «Tag» in the statistics (docs/didascalie-wizard.v1.0.0.md).
v1.13.0, 2026-11-13T17:30:00Z: cards with only thumbnail, origin and state (tags and views in the detail); the Database section
without upload, title search, copy filter and «Da Commons» (photos added through the API); sorting by date added, views and accuracy,
ascending or descending, remembered.
v1.12.0, 2026-11-13T12:00:00Z: bulk trash with a published photo (out of the game at once, after a confirmation), restore as approved.
v1.11.0, 2026-11-12T11:00:00Z: Settings with commands only (quality beside the models, thresholds of the SLOP studio, hours of an open
game) and the section «Statistiche» (games, paid calls, balance) (docs/statistiche-impostazioni.v1.0.0.md).
v1.10.0, 2026-11-12T09:00:00Z: the round of the old training mode is gone (the level game has its own browser check,
tests/game_browser.v1.0.0.integration.py).
v1.9.0, 2026-11-11T09:30:00Z: cards of the Database section: every tag as a coloured pill, views and correct classifications.
v1.8.0, 2026-11-10T22:11:48Z: no budget; Settings «Modelli» with the text and image model selectors (a model missing from
the OpenAI project is disabled) and the count of paid calls.
v1.6.0, 2026-11-10T16:16:00Z: tag categories: picker in the detail, coloured tags, change of category in the vocabulary.
v1.5.0, 2026-11-10T09:39:49Z: Settings «Contesto dei modelli» (save a version, restore); Settings messages in Settings.
v1.4.0, 2026-11-10T07:10:00Z: typed tags with a wrong form are converted and saved silently; origin words refused.
v1.3.0, 2026-11-09T20:48:00Z: the library dashboard in a real browser, desktop and mobile
(docs/libreria-immagini.v1.3.0.md): upload, game copy made by the browser, analysis by the (fake) model after an explicit
cost confirmation, in-place editing, tags, approval, publication, multi-selection, trash, delete for good, and the caption
under the image in a round."""
import io
import os
import re
import shutil
import urllib.parse
from pathlib import Path
from PIL import Image
from playwright.sync_api import expect, sync_playwright
from game_copy_v3_0_0 import game_copy

base = os.environ['ROS_TEST_BASE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
folder = Path('artifacts/library-browser'); folder.mkdir(parents=True, exist_ok=True)

def picture(name, color, size):
    color = tuple((c + (37 if name.startswith('mobile') else 0)) % 256 for c in color)  # distinct files per viewport
    image = Image.new('RGB', size, color)
    for x in range(0, size[0], 7): image.putpixel((x, size[1] // 2), (255, 255, 255))
    out = io.BytesIO(); image.save(out, 'JPEG', quality=92)
    return {'name': name, 'mimeType': 'image/jpeg', 'buffer': out.getvalue()}

def add(page, picture_file, origin):
    """Adds a photo through the API, as the REAL wizard and the SLOP studio do (the Database section no longer uploads, owner decision
    of 2026-11-13), with its game copy made by the stand-in encoder."""
    title = picture_file['name'].rsplit('.', 1)[0]
    response = page.request.post(base + '/api/admin/library/upload?' + urllib.parse.urlencode({'origin': origin, 'title': title}),
                                 data=picture_file['buffer'], headers={'Content-Type': picture_file['mimeType']})
    assert response.ok, response.text()
    item = response.json()
    response = page.request.post(base + f'/api/admin/library/{item["id"]}/copy', data=game_copy(picture_file['buffer']), headers={'Content-Type': 'image/webp'})
    assert response.ok, response.text()
    return response.json()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
    for name, options in (('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('mobile', {**p.devices['Pixel 7']})):
        context = browser.new_context(**options, http_credentials={'username': 'owner', 'password': token})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        # Cost confirmations: the two REAL photos are analysed (fake model), the SLOP is not.
        confirms = []
        def answer(dialog):
            confirms.append(dialog.message)
            dialog.accept() if dialog.message.startswith(('Analizzare 2 immagini', 'Ripristinare questa versione', 'Spostare', '1 immagine è pubblicata')) else dialog.dismiss()
        page.on('dialog', answer)
        page.goto(base + '/admin')
        expect(page.locator('#dashboard-loading')).to_have_count(0, timeout=15000)  # the loading line goes once all sections are in
        expect(page.locator('#real-wizard .admin-loading')).to_have_count(0)
        expect(page.locator('#real-wizard .rw-steps li')).to_have_count(4)
        page.get_by_role('button', name='Database immagini').click()
        expect(page.get_by_role('heading', name='Database immagini')).to_be_visible()
        # No upload, title search, copy filter, «Da Commons» or drop zone in the Database section any more.
        for gone in ('#library-files', '#library-search', '#library-copy-filter', '#library-commons-toggle', '#library-drop'):
            expect(page.locator(gone)).to_have_count(0)
        # Two REAL photos added through the API, then analysed together from the selection; then one SLOP.
        for picture_file in (picture(f'{name}-rivoli.jpg', (180, 40, 30), (320, 200)), picture(f'{name}-spare.jpg', (30, 160, 40), (200, 320))):
            add(page, picture_file, 'REAL')
        page.locator('[data-view=new]').click()
        for title in (f'{name}-rivoli', f'{name}-spare'): page.get_by_role('checkbox', name=f'Seleziona {title}').check()
        page.locator('[data-bulk=analyze]').click()
        expect(page.locator('#library-message')).to_contain_text('2 di 2 analizzate', timeout=30000)
        page.locator('[data-view=library]').click()
        assert 'chiamate a pagamento' in confirms[0] and '$' not in confirms[0], confirms
        rivoli_card = page.locator(f'.library-card:has([aria-label="Apri {name}-rivoli"])')
        # A card shows only thumbnail, origin and state; tags and views are in the detail.
        expect(rivoli_card.locator('.badge')).to_have_text(['REAL', 'nuova'])
        for hidden in ('.db-tag', '.library-card-title', '[data-stats]'): expect(rivoli_card.locator(hidden)).to_have_count(0)
        rivoli_card.locator('.library-open').click()
        detail = page.locator('#library-detail')
        # Tags in category order: on mobile «street» is already in Ambiente (moved during the desktop run), so it comes first.
        expect(detail.locator('.library-tags li.tag-cat').first).to_contain_text('crowd' if name == 'desktop' else 'street')
        expect(detail.locator('.library-tags li.tag-cat')).to_have_count(2)
        expect(detail.locator('[data-stats]')).to_have_text('Vista 0 volte · classificata correttamente 0')
        detail.locator('.library-detail-close button').click()
        add(page, picture(f'{name}-street.jpg', (40, 40, 190), (300, 300)), 'SLOP')
        page.locator('[data-view=library]').click()  # reload the list
        expect(page.locator(f'.library-open[aria-label^="Apri {name}-"]')).to_have_count(3)
        # Sorting: date added, newest first by default; ascending puts the oldest first; views all 0 keep the newest first.
        titles = lambda: [l[5:] for l in page.locator('.library-open').evaluate_all("bs => bs.map(b => b.getAttribute('aria-label'))") if l.startswith(f'Apri {name}-')]
        expect(page.locator('#library-sort')).to_have_value('added'); expect(page.locator('#library-order')).to_have_value('desc')
        assert titles()[:3] == [f'{name}-street', f'{name}-spare', f'{name}-rivoli'], titles()
        page.locator('#library-order').select_option('asc')
        mine = titles(); assert mine.index(f'{name}-rivoli') < mine.index(f'{name}-spare') < mine.index(f'{name}-street'), mine
        page.locator('#library-sort').select_option('views')
        mine = titles(); assert mine.index(f'{name}-street') < mine.index(f'{name}-spare') < mine.index(f'{name}-rivoli'), mine  # ties: newest first
        page.reload(); page.get_by_role('button', name='Database immagini').click()
        expect(page.locator('#library-sort')).to_have_value('views'); expect(page.locator('#library-order')).to_have_value('asc')  # remembered
        page.locator('#library-sort').select_option('added'); page.locator('#library-order').select_option('desc')
        expect(page.locator('.badge-warn')).to_have_count(0)  # every image has its game copy
        page.screenshot(path=str(folder / f'{name}-grid.png'))
        # Settings: model selectors, no budget.
        page.get_by_role('button', name='Impostazioni').click()
        expect(page.locator('#library-budget')).to_have_count(0)
        page.locator('#library-models summary').click()
        text_select, image_select = page.locator('#library-models-form [name=text_model]'), page.locator('#library-models-form [name=image_model]')
        expect(text_select).to_have_value('gpt-6.1-terra')
        expect(image_select).to_have_value('gpt-image-2.5-flare')
        expect(image_select.locator('option[value="gpt-image-2"]')).to_contain_text('dismesso da OpenAI il 10/02/2027')
        expect(image_select.locator('option[value="gpt-image-2.6-flare"]')).to_have_attribute('disabled', '')
        image_select.select_option('gpt-image-2')
        expect(page.locator('#library-settings-message')).to_have_text('Modello di immagini: gpt-image-2.')
        image_select.select_option('gpt-image-2.5-flare')
        expect(page.locator('#library-settings-message')).to_have_text('Modello di immagini: gpt-image-2.5-flare.')
        expect(page.locator('#library-calls')).to_have_count(0)  # figures moved to «Statistiche»
        quality = page.locator('#library-models-form [name=image_quality]')
        expect(quality).to_have_value('medium')
        quality.select_option('high')
        expect(page.locator('#library-settings-message')).to_have_text('Qualità delle immagini: high.')
        quality.select_option('medium')
        expect(page.locator('#library-settings-message')).to_have_text('Qualità delle immagini: medium.')
        page.locator('#library-thresholds summary').click()
        expect(page.locator('[name=slop_section_min_real]')).to_have_value('50')
        page.locator('[name=slop_section_min_real]').fill('40'); page.locator('#library-thresholds-form button').click()
        expect(page.locator('#library-settings-message')).to_have_text('Soglie dello studio SLOP salvate.')
        page.locator('[name=slop_section_min_real]').fill('50'); page.locator('#library-thresholds-form button').click()
        page.locator('#library-games summary').click()
        expect(page.locator('[name=open_game_hours]')).to_have_value('24')
        page.locator('[name=open_game_hours]').fill('0'); page.locator('#library-games-form button').click()
        expect(page.locator('[name=open_game_hours]')).to_have_value('0')  # the browser stops it: minimum 1
        page.locator('[name=open_game_hours]').fill('24')
        # «Statistiche»: the analyses of this run are among the paid calls.
        page.get_by_role('button', name='Statistiche').click()
        stats = page.locator('#stats-body')
        expect(stats.locator('.stat-tile', has_text='partite in corso adesso')).to_be_visible()
        expect(stats.locator('.stats-calls tbody tr', has_text='Tag').first).to_be_visible()
        stats.locator('[data-stats-kind]').select_option('images')
        expect(stats.locator('.stats-calls tbody tr', has_text='Tag')).to_have_count(0)
        stats.locator('[data-stats-period]').select_option('7')
        expect(stats.locator('[data-stats-period]')).to_have_value('7')
        expect(stats.locator('.stats-levels li')).to_have_count(4)
        page.screenshot(path=str(folder / f'{name}-stats.png'), full_page=True)
        page.get_by_role('button', name='Impostazioni').click()
        # Model context: edit the base, save a version, then restore the approved one.
        page.locator('#library-contexts summary').first.click()
        base_field = page.locator('[data-context=base]')
        expect(base_field).to_have_value(re.compile('^Lavori per un archivio fotografico italiano'))
        expect(page.locator('[data-context]')).to_have_count(3)
        approved = base_field.input_value()
        base_field.fill(approved + '\nProva dalla dashboard.')
        expect(page.locator('[data-context-part=base] [data-context-count]')).to_have_text('%d/4000' % (len(approved) + 23))
        page.locator('[data-context-save=base]').click()
        expect(page.locator('#library-settings-message')).to_have_text('Base comune: versione salvata.')
        expect(page.locator('[data-context-part=base] .library-context-history > summary')).to_have_text(re.compile(r'Versioni \(\d+\)'))
        before = int(re.search(r'\d+', page.locator('[data-context-part=base] .library-context-history > summary').inner_text()).group())
        page.locator('[data-context-part=base] .library-context-history > summary').click()
        page.locator('[data-context-part=base] [data-context-restore]').nth(0).click()
        expect(page.locator('#library-settings-message')).to_have_text('Versione ripristinata.')
        expect(page.locator('[data-context=base]')).to_have_value(approved)
        expect(page.locator('[data-context-part=base] .library-context-history > summary')).to_have_text('Versioni (%d)' % (before + 1))
        page.screenshot(path=str(folder / f'{name}-settings.png'), full_page=True)
        # Vocabulary by category: «street», created by the (fake) model as «other», moves to Ambiente.
        page.locator('#library-vocabulary summary').click()
        expect(page.locator('#library-vocabulary-list .tag-category-group').first).to_be_visible()
        page.locator('[data-tag-category=street]').select_option('setting')
        expect(page.locator('#library-settings-message')).to_have_text('«street»: categoria Ambiente.')
        expect(page.locator('#library-vocabulary-list li.tag-cat-setting', has_text='street')).to_have_count(1)
        page.get_by_role('button', name='Database immagini').click()

        def edit_and_publish(title, description, tags, real):
            page.get_by_role('button', name=f'Apri {title}').click()
            dialog = page.locator('#library-detail')
            expect(dialog).to_contain_text('copia di gioco WebP')
            if real: expect(dialog.locator('.library-analysis')).to_contain_text('Analizzata')
            expect(dialog.locator('[data-field=caption]')).to_have_count(0)
            field = dialog.locator('[data-field=description]')
            field.fill(description); field.blur()
            expect(dialog.locator('#library-detail-message')).to_contain_text('Salvato')
            categories = {'riot': 'event', 'paris': 'place', 'street': 'setting'}
            for tag in tags:
                dialog.locator('#library-tag-input').fill(tag)
                # An existing tag sets the picker by itself; a new one needs a category.
                if not dialog.locator('#library-tag-category').input_value():
                    dialog.locator('#library-tag-input').press('Enter')
                    expect(dialog.locator('#library-tag-hint')).to_have_text('Scegli la categoria del tag.')
                    dialog.locator('#library-tag-category').select_option(categories[tag])
                dialog.locator('#library-tag-input').press('Enter')
                expect(dialog.locator('.library-tags li.tag-cat', has_text=tag)).to_have_count(1)
            # A wrong form is converted and saved, without a notice; an origin word is refused.
            dialog.locator('#library-tag-input').fill('São Paulo'); dialog.locator('#library-tag-category').select_option('place')
            dialog.locator('#library-tag-input').press('Enter')
            expect(dialog.locator('[data-tag-remove=sao-paulo]')).to_have_count(1)
            expect(dialog.locator('#library-detail-message')).not_to_contain_text('sao-paulo')
            dialog.locator('[data-tag-remove=sao-paulo]').click()
            expect(dialog.locator('[data-tag-remove=sao-paulo]')).to_have_count(0)
            dialog.locator('#library-tag-input').fill('AI'); dialog.locator('#library-tag-input').press('Enter')
            expect(dialog.locator('#library-tag-hint')).to_contain_text('origine')
            expect(dialog.locator('[data-tag-remove=ai]')).to_have_count(0)
            if real: dialog.locator('#library-rights').check()
            dialog.locator('[data-action=approve]').click()
            expect(dialog.locator('[data-action=publish]')).to_be_visible()
            if title.endswith('rivoli'): dialog.screenshot(path=str(folder / f'{name}-detail.png'))
            dialog.locator('[data-action=publish]').click()
            expect(dialog.locator('[data-action=withdraw]')).to_be_visible()
            dialog.locator('.library-detail-close button').click()
        edit_and_publish(f'{name}-rivoli', 'Parigi, maggio 1968. Barricate in rue de Rivoli.', ['riot', 'paris'], True)
        edit_and_publish(f'{name}-street', 'Parigi, 1968. Una strada bloccata.', ['riot', 'street'], False)
        # Multi-selection: the spare photo and a published one go to the trash together (the published one leaves the game at once,
        # after a confirmation), then the spare is deleted for good and the published one comes back approved.
        page.get_by_role('checkbox', name=f'Seleziona {name}-spare').check()
        page.get_by_role('checkbox', name=f'Seleziona {name}-street').check()
        confirms.clear()
        page.locator('[data-bulk=trash]').click()
        expect(page.locator('#library-message')).to_contain_text('2 aggiornate')
        assert any('pubblicata' in c for c in confirms), confirms
        page.locator('[data-view=trash]').click()
        expect(page.locator('.library-card')).to_have_count(2)
        page.get_by_role('checkbox', name=f'Seleziona {name}-street').check()
        page.locator('[data-bulk=restore]').click()
        expect(page.locator('#library-message')).to_contain_text('1 aggiornate')
        page.get_by_role('checkbox', name=f'Seleziona {name}-spare').check()
        page.locator('[data-bulk=delete]').click()
        expect(page.locator('#library-message')).to_contain_text('1 eliminate definitivamente')
        expect(page.locator('.library-empty')).to_contain_text('cestino è vuoto')
        page.locator('[data-view=approved]').click()
        expect(page.locator(f'.library-card:has([aria-label="Apri {name}-street"])')).to_have_count(1)
        page.get_by_role('checkbox', name=f'Seleziona {name}-street').check()
        page.locator('[data-bulk=publish]').click()
        expect(page.locator('#library-message')).to_contain_text('1 aggiornate')
        # Withdraw both, so that the next viewport works with its own images.
        page.locator('[data-view=published]').click()
        for title in (f'{name}-rivoli', f'{name}-street'): page.get_by_role('checkbox', name=f'Seleziona {title}').check()
        page.locator('[data-bulk=withdraw]').click()
        expect(page.locator('#library-message')).to_contain_text('2 aggiornate')
        expect(page.locator(f'.library-card:has([aria-label="Apri {name}-rivoli"])')).to_have_count(0)
        assert not errors, errors
        context.close()
        print('Library browser E2E 1.14.0 passed (loading indicator, no captions, no upload in the Database, sorting, trash of a published photo):', name)
    browser.close()
