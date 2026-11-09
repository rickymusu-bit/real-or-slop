"""v1.3.0, 2026-11-09T20:48:00Z: the library dashboard in a real browser, desktop and mobile
(docs/libreria-immagini.v1.3.0.md): upload, game copy made by the browser, analysis by the (fake) model after an explicit
cost confirmation, in-place editing, tags, approval, publication, multi-selection, trash, delete for good, and the caption
under the image in a round."""
import io
import os
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
            dialog.accept() if dialog.message.startswith('Analizzare 2 immagini') else dialog.dismiss()
        page.on('dialog', answer)
        page.goto(base + '/admin')
        page.get_by_role('button', name='Database immagini').click()
        expect(page.get_by_role('heading', name='Database immagini')).to_be_visible()
        # Upload: two REAL photos, then one SLOP.
        page.locator('#library-files').set_input_files([picture(f'{name}-rivoli.jpg', (180, 40, 30), (320, 200)),
                                                         picture(f'{name}-spare.jpg', (30, 160, 40), (200, 320))])
        expect(page.locator('#library-message')).to_contain_text('2 di 2 analizzate', timeout=30000)
        assert 'Costo massimo 0.036 $' in confirms[0], confirms
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
        # One budget for every paid call, now under Settings.
        page.get_by_role('button', name='Impostazioni').click()
        page.locator('#library-budget summary').click()
        page.locator('#library-budget-form input[name=cap]').fill('4')
        page.get_by_role('button', name='Salva il tetto').click()
        expect(page.locator('#library-message')).to_contain_text('Tetto salvato')
        expect(page.locator('#library-budget-state')).to_contain_text('su 4 $')
        page.get_by_role('button', name='Database immagini').click()

        def edit_and_publish(title, caption, tags, real):
            page.get_by_role('button', name=f'Apri {title}').click()
            dialog = page.locator('#library-detail')
            expect(dialog).to_contain_text('copia di gioco WebP')
            if real: expect(dialog.locator('.library-analysis')).to_contain_text('Analizzata')
            field = dialog.locator('[data-field=caption]')
            field.fill(caption); field.blur()
            expect(dialog.locator('#library-detail-message')).to_contain_text('Salvato')
            for tag in tags:
                dialog.locator('#library-tag-input').fill(tag); dialog.locator('#library-tag-input').press('Enter')
                expect(dialog.locator('.library-tags')).to_contain_text(tag)
            dialog.locator('#library-tag-input').fill('São Paulo'); dialog.locator('#library-tag-input').press('Enter')
            expect(dialog.locator('#library-tag-hint')).to_contain_text('sao-paulo')
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
