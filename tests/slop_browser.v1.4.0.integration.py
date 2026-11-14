"""v1.4.0, 2026-11-14T09:00:00Z (docs/anteprima-descrizione.v1.0.0.md): pressing and holding an image of the review opens the large
preview with the prompt, the starting tags (theme marked) and the tags of the analysis, closed with ×.
v1.3.0, 2026-11-13T22:00:00Z: no captions in the review of the generated SLOP (docs/didascalie-wizard.v1.0.0.md).
v1.2.0, 2026-11-12T11:00:00Z: the quality comes from Settings (read-only in the studio).
v1.1.0, 2026-11-11T05:40:53Z: the whole studio with the fake OpenAI: prompts (confirmed, edited, rewritten), images generated and
analysed after one confirmation, review with expected tags not found, approve, publish, trash, regenerate.
v1.0.0, 2026-11-10T22:11:48Z: SLOP studio in a real browser, desktop and mobile (docs/wizard-slop.v1.4.0.md, sections 2–4): spread chart
(filters, compact and expanded view, search, tooltip, click to add to the theme), live count of the theme, number of
images, slots table (edit a cell, redraw a slot, back). Seeds approved REAL and SLOP rows in the LOCAL D1, then removes them."""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from long_press_v1_0_0 import long_press
from playwright.sync_api import expect, sync_playwright

base, state = os.environ['ROS_TEST_BASE'], os.environ['ROS_TEST_STATE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
folder = Path('artifacts/slop-browser'); folder.mkdir(parents=True, exist_ok=True)
def sql(command):
    subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command],
                   capture_output=True, text=True, check=True)

tags = {'sb-riot': 'event', '1930s': 'time', 'sb-color': 'format', 'sb-roma': 'place', 'sb-napoli': 'place', 'sb-street': 'setting',
        'sb-workers': 'people', 'sb-tram': 'object', 'sb-flag': 'object', 'sb-filler': 'other', 'sb-beach': 'setting'}
statements = ['INSERT OR IGNORE INTO tags(id,label,category,created_at) VALUES ' + ','.join(f"('sb-tag-{l}','{l}','{c}','x')" for l, c in tags.items())]
def add(i, origin, labels):
    h = format(10_000 + i, '064x')
    statements.append(f"INSERT INTO images(id,origin,status,title,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,created_at,updated_at) "
                      f"VALUES('slopb-{i}','{origin}','approved','b{i}','slopb/{i}','{h}','image/jpeg',10,10,'slopb/c{i}','{h}','x','x')")
    statements.append('INSERT INTO image_tags(image_id,tag_id) VALUES ' + ','.join(f"('slopb-{i}','sb-tag-{l}')" for l in labels))
for i in range(55):
    if i < 14: add(i, 'REAL', ['sb-riot', '1930s', 'sb-color', ['sb-roma', 'sb-napoli'][i % 2], 'sb-street', 'sb-workers', ['sb-tram', 'sb-flag'][i % 2]])
    else: add(i, 'REAL', ['sb-filler', 'sb-beach'])
for i in range(100, 106): add(i, 'SLOP', ['sb-beach'])
sql('; '.join(statements))
import urllib.request as _request
def models(change):
    req = _request.Request(base + '/api/admin/library/models', data=json.dumps(change).encode(), method='PUT',
                           headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token})
    return json.loads(_request.urlopen(req).read())
assert models({'image_quality': 'low'})['image_quality'] == 'low'  # chosen in Settings
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
        for name, options in (('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('mobile', {**p.devices['Pixel 7']})):
            context = browser.new_context(**options, http_credentials={'username': 'owner', 'password': token})
            page = context.new_page(); errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            confirms = []
            page.on('dialog', lambda dialog: (confirms.append(dialog.message), dialog.accept()))
            page.goto(base + '/admin')
            page.evaluate("sessionStorage.removeItem('ros-slop-studio-v1.0.0')")
            page.get_by_role('button', name='Generazione SLOP').click()
            studio = page.locator('#slop-studio')
            expect(studio.get_by_role('heading', name='Generazione SLOP')).to_be_visible()
            expect(studio.locator('.slop-totals')).to_contain_text('REAL')
            expect(studio.locator('.slop-closed')).to_have_count(0)
            # The chart: bars ordered by spread; «sb-filler» (41 REAL, 0 SLOP) above «sb-beach» (41 REAL, 6 SLOP).
            filler, beach = studio.locator('[data-slop-tag="sb-filler"]'), studio.locator('[data-slop-tag="sb-beach"]')
            expect(filler).to_contain_text('+41'); expect(beach).to_contain_text('+35')
            order = studio.locator('[data-slop-tag]').evaluate_all('rows => rows.map(r => r.dataset.slopTag)')
            assert order.index('sb-filler') < order.index('sb-beach'), order
            beach.hover()
            expect(studio.locator('.spread-tip')).to_contain_text('sb-beach, Ambiente: REAL 41, SLOP 6, spread +35')
            # Category filter: hiding «Altro» hides «sb-filler».
            studio.locator('[data-slop-cat=other]').click()
            expect(studio.locator('[data-slop-tag="sb-filler"]')).to_have_count(0)
            studio.locator('[data-slop-cat=all]').click()
            # Compact view: first 5; expanded view with search.
            studio.locator('[data-slop-top]').select_option('5')
            expect(studio.locator('.spread-hit')).to_have_count(5)
            studio.get_by_role('button', name='Mostra tutti').click()
            studio.locator('[data-slop-search]').fill('sb-')
            expect(studio.locator('.spread-hit')).to_have_count(len([t for t in tags if t.startswith('sb-')]))
            studio.locator('[data-slop-search]').fill('sb-tr')
            expect(studio.locator('.spread-hit')).to_have_count(1)
            page.screenshot(path=str(folder / f'{name}-theme-search.png'), full_page=True)
            studio.get_by_role('button', name='Vista compatta').click()
            # A click on a bar adds the tag to the theme; the live count needs 10 REAL with the whole theme.
            studio.locator('[data-slop-top]').select_option('20')
            studio.locator('[data-slop-tag="sb-beach"]').click()
            expect(studio.locator('.slop-reference')).to_contain_text('41 REAL contengono tutto il tema')
            studio.locator('[data-slop-remove="sb-beach"]').click()
            studio.locator('[data-slop-theme]').fill('sb-riot'); studio.locator('[data-slop-theme]').press('Enter')
            expect(studio.locator('.slop-reference')).to_contain_text('14 REAL contengono tutto il tema su 10 necessarie')
            studio.locator('[data-slop-count]').select_option('3')
            page.screenshot(path=str(folder / f'{name}-theme.png'), full_page=True)
            studio.get_by_role('button', name='Prepara gli slot').click()
            # Slots: Event is the theme; the other categories come from the 14 REAL with sb-riot.
            rows = studio.locator('.slot-table tbody tr'); expect(rows).to_have_count(3)
            expect(rows.first.locator('td', has_text='sb-riot')).to_have_count(1)
            expect(rows.first.locator('[data-slot-cat=time]')).to_have_value('1930s')
            place = rows.first.locator('[data-slot-cat=place]')
            assert place.input_value() in ('sb-roma', 'sb-napoli')
            place.select_option('sb-napoli'); expect(place).to_have_value('sb-napoli')
            studio.locator('[data-slop=reroll][data-slot="1"]').click()
            expect(studio.locator('.slop-message')).to_have_text('Immagine 2 ripescata.')
            page.screenshot(path=str(folder / f'{name}-slots.png'), full_page=True)
            # The draft survives a reload.
            page.reload(); page.get_by_role('button', name='Generazione SLOP').click()
            expect(studio.locator('.slot-table tbody tr').first.locator('[data-slot-cat=place]')).to_have_value('sb-napoli')
            # Prompts: one confirmed paid call; edits are free; a rewrite is confirmed again.
            studio.get_by_role('button', name='Genera prompt').click()
            expect(studio.locator('.slop-message')).to_have_text('Prompt scritti.')
            assert confirms[-1].startswith('Scrivere 3 prompt con gpt-6.1-terra') and 'a pagamento' in confirms[-1], confirms
            prompts = studio.locator('[data-prompt]'); expect(prompts).to_have_count(3)
            expect(prompts.first).to_have_value(re.compile('^A documentary photograph: sb-riot, 1930s, sb-color, sb-napoli'))
            prompts.nth(2).fill('Edited: workers with flags in a 1930s street, sb-riot'); prompts.nth(2).blur()
            expect(studio.locator('.slop-message')).to_have_text('Prompt salvato.')
            studio.locator('[data-slop=rewrite][data-slot="1"]').click()
            expect(studio.locator('.slop-message')).to_have_text("Prompt dell'immagine 2 riscritto.")
            expect(prompts.nth(2)).to_have_value('Edited: workers with flags in a 1930s street, sb-riot')
            expect(studio.locator('.slop-generate')).to_contain_text('gpt-image-2.5-flare')
            expect(studio.locator('.slop-generate')).to_contain_text('Qualità: low')
            page.screenshot(path=str(folder / f'{name}-prompts.png'), full_page=True)
            # Images and analysis after one confirmation; then the review.
            studio.get_by_role('button', name='Genera immagini e analizza').click()
            assert confirms[-1].startswith('Generare 3 immagini con gpt-image-2.5-flare in qualità low') and 'Sono 6 chiamate a pagamento' in confirms[-1], confirms
            cards = studio.locator('.slop-review'); expect(cards).to_have_count(3, timeout=60000)
            expect(studio.locator('.slop-message')).to_have_text('3 di 3 immagini pronte.')
            expect(cards.first.locator('.play-caption')).to_have_count(0)
            expect(cards.first.locator('.rw-pills')).to_contain_text('street')
            expect(cards.first).to_contain_text('Previsti ma non rilevati: sb-riot')
            expect(cards.first.locator('.slop-closed')).to_have_count(1)  # a theme tag is missing: highlighted
            expect(cards.first.locator('.rs-mark')).to_have_count(1)
            page.screenshot(path=str(folder / f'{name}-review.png'), full_page=True)
            long_press(page, cards.first.locator('[data-slop-preview]'))
            preview = page.locator('dialog.image-preview')
            expect(preview).to_be_visible()
            expect(preview).to_contain_text('Tag di partenza')
            expect(preview.locator('.rw-pill', has_text='sb-riot').first).to_contain_text('tema')
            expect(preview).to_contain_text("Tag dell'analisi")
            preview.get_by_role('button', name="Chiudi l'anteprima").click()
            expect(preview).to_be_hidden()
            cards.first.get_by_role('button', name='Approva').click()
            expect(studio.locator('.slop-message')).to_have_text('Immagine approvata.')
            cards.first.get_by_role('button', name='Pubblica').click()
            expect(studio.locator('.slop-message')).to_have_text('Immagine pubblicata.')
            cards.nth(1).get_by_role('button', name='Cestino').click()
            expect(studio.locator('.slop-message')).to_have_text('Immagine nel cestino.')
            cards.nth(2).get_by_role('button', name='Rigenera').click()
            assert 'Sono 2 chiamate a pagamento' in confirms[-1], confirms
            expect(cards).to_have_count(4, timeout=60000)
            # The approved and published SLOP now counts in the spread.
            studio.get_by_role('button', name='Nuovo gruppo').click()
            expect(studio.locator('[data-slop-tag="sb-filler"]')).to_have_count(1)
            assert not errors, errors
            context.close()
            print('SLOP studio browser E2E 1.4.0 passed (press-and-hold preview):', name)
        browser.close()
finally:
    models({'image_quality': 'medium'})
    sql("DELETE FROM images WHERE id LIKE 'slopb-%' OR generation_batch IS NOT NULL; DELETE FROM slop_batches")
