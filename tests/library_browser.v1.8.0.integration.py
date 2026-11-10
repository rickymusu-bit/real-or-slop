"""v1.8.0, 2026-11-10T22:11:48Z: no budget; Settings «Modelli» with the text and image model selectors (a model missing from
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
from pathlib import Path
from PIL import Image
from playwright.sync_api import expect, sync_playwright

base = os.environ['ROS_TEST_BASE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
folder = Path('artifacts/library-browser'); folder.mkdir(parents=True, exist_ok=True)

def picture(name, color, size):
    color = tuple((c + (37 if name.startswith('mobile') else 0)) % 256 for c in color)  # distinct files per viewport
    image = Image.new('RGB', size, color)
    for x in range(0, size[0], 7): image.putpixel((x, size[1] // 2), (255, 255, 255))
    out = io.BytesIO(); image.save(out, 'JPEG', quality=92)
    return {'name': name, 'mimeType': 'image/jpeg', 'buffer': out.getvalue()}

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
            dialog.accept() if dialog.message.startswith(('Analizzare 2 immagini', 'Ripristinare questa versione', 'Spostare')) else dialog.dismiss()
        page.on('dialog', answer)
        page.goto(base + '/admin')
        page.get_by_role('button', name='Database immagini').click()
        expect(page.get_by_role('heading', name='Database immagini')).to_be_visible()
        # Upload: two REAL photos, then one SLOP.
        page.locator('#library-files').set_input_files([picture(f'{name}-rivoli.jpg', (180, 40, 30), (320, 200)),
                                                         picture(f'{name}-spare.jpg', (30, 160, 40), (200, 320))])
        expect(page.locator('#library-message')).to_contain_text('2 di 2 analizzate', timeout=30000)
        assert 'chiamate a pagamento' in confirms[0] and '$' not in confirms[0], confirms
        expect(page.locator('.library-card', has_text=f'{name}-rivoli')).to_contain_text('crowd · street')
        page.locator('#library-upload-origin').select_option('SLOP')
        page.locator('#library-files').set_input_files([picture(f'{name}-street.jpg', (40, 40, 190), (300, 300))])
        expect(page.locator('#library-message')).to_contain_text('1 di 1 aggiunte', timeout=30000)
        for _ in range(50):  # the confirmation follows the upload message
            if len(confirms) == 2: break
            page.wait_for_timeout(200)
        assert len(confirms) == 2 and confirms[1].startswith('Analizzare 1 immagine'), confirms
        expect(page.locator('.library-card', has_text=f'{name}-rivoli')).to_be_visible()
        expect(page.locator('.badge-warn')).to_have_count(0)  # every image has its game copy
        page.screenshot(path=str(folder / f'{name}-grid.png'))
        # Settings: model selectors, no budget.
        page.get_by_role('button', name='Impostazioni').click()
        expect(page.locator('#library-budget')).to_have_count(0)
        page.locator('#library-models summary').click()
        text_select, image_select = page.locator('#library-models-form [name=text_model]'), page.locator('#library-models-form [name=image_model]')
        expect(text_select).to_have_value('gpt-6.1-terra')
        expect(image_select).to_have_value('gpt-image-2')
        expect(image_select.locator('option[value="gpt-image-2.6-flare"]')).to_have_attribute('disabled', '')
        image_select.select_option('gpt-image-2.5-flare')
        expect(page.locator('#library-settings-message')).to_have_text('Modello di immagini: gpt-image-2.5-flare.')
        image_select.select_option('gpt-image-2')
        expect(page.locator('#library-settings-message')).to_have_text('Modello di immagini: gpt-image-2.')
        expect(page.locator('#library-calls')).to_contain_text('Chiamate a pagamento negli ultimi 30 giorni')
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

        def edit_and_publish(title, caption, tags, real):
            page.get_by_role('button', name=f'Apri {title}').click()
            dialog = page.locator('#library-detail')
            expect(dialog).to_contain_text('copia di gioco WebP')
            if real: expect(dialog.locator('.library-analysis')).to_contain_text('Analizzata')
            field = dialog.locator('[data-field=caption]')
            field.fill(caption); field.blur()
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
        # Multi-selection: the spare photo goes to the trash, then is deleted for good.
        page.get_by_role('checkbox', name=f'Seleziona {name}-spare').check()
        page.locator('[data-bulk=trash]').click()
        expect(page.locator('#library-message')).to_contain_text('1 aggiornate')
        page.locator('[data-view=trash]').click()
        expect(page.locator('.library-card')).to_have_count(1)
        page.get_by_role('checkbox', name=f'Seleziona {name}-spare').check()
        page.locator('[data-bulk=delete]').click()
        expect(page.locator('#library-message')).to_contain_text('1 eliminate definitivamente')
        expect(page.locator('.library-empty')).to_contain_text('cestino è vuoto')
        # Play: the caption is shown under the image, with the «RS» mark.
        page.goto(base + '/allenamento')
        page.locator('#settings button[type=submit]').click()
        expect(page.locator('.play-image')).to_be_visible(timeout=20000)
        expect(page.locator('.play-caption')).to_contain_text('Parigi')
        expect(page.locator('.rs-mark')).to_be_visible()
        page.screenshot(path=str(folder / f'{name}-round.png'))
        # Withdraw both, so the next viewport plays with its own images.
        page.goto(base + '/admin')
        page.get_by_role('button', name='Database immagini').click()
        page.locator('[data-view=published]').click()
        for title in (f'{name}-rivoli', f'{name}-street'): page.get_by_role('checkbox', name=f'Seleziona {title}').check()
        page.locator('[data-bulk=withdraw]').click()
        expect(page.locator('#library-message')).to_contain_text('2 aggiornate')
        expect(page.locator('.library-card', has_text=f'{name}-rivoli')).to_have_count(0)
        assert not errors, errors
        context.close()
        print('Library browser E2E passed:', name)
    browser.close()
