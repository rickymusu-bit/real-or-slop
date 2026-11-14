"""SLOP studio in the browser, desktop and mobile: REAL waiting for a twin, choice, prompts, images with the treated copy and analysis
after one confirmation, review with what the twin was meant to keep and the press-and-hold preview, approve, publish, trash,
regenerate."""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from long_press import long_press
from playwright.sync_api import expect, sync_playwright

base, state = os.environ['ROS_TEST_BASE'], os.environ['ROS_TEST_STATE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
folder = Path('artifacts/slop-browser'); folder.mkdir(parents=True, exist_ok=True)
def sql(command):
    subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command],
                   capture_output=True, text=True, check=True)

# 55 REAL approved: 14 measured press photos of a riot in the 1930s (roma or napoli), the others with filler tags. Created in order.
tags = {'sb-riot': 'event', '1930s': 'time', 'sb-press': 'genre', 'sb-colour': 'color', 'sb-print': 'medium',
        'sb-roma': 'place', 'sb-napoli': 'place', 'sb-street': 'setting', 'sb-workers': 'people', 'sb-tram': 'object', 'sb-flag': 'object',
        'sb-filler': 'other', 'sb-beach': 'setting'}
statements = ['INSERT OR IGNORE INTO tags(id,label,category,created_at) VALUES ' + ','.join(f"('sb-tag-{l}','{l}','{c}','x')" for l, c in tags.items())]
METRICS = json.dumps({'long': 300, 'noise': 4.5, 'sharpness': 6, 'contrast': 150, 'saturation': 0.1, 'cast': [3, 0, -4], 'v': 2})
def add(i, origin, labels, metrics=None):
    h = format(10_000 + i, '064x')
    statements.append(f"INSERT INTO images(id,origin,status,title,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,copy_metrics,created_at,updated_at) "
                      f"VALUES('slopb-{i:03d}','{origin}','approved','b{i}','slopb/{i}','{h}','image/jpeg',10,10,'slopb/c{i}','{h}',{repr(metrics) if metrics else 'NULL'},'0000-{i:03d}','x')")
    statements.append('INSERT INTO image_tags(image_id,tag_id) VALUES ' + ','.join(f"('slopb-{i:03d}','sb-tag-{l}')" for l in labels))
for i in range(55):
    if i < 14: add(i, 'REAL', ['sb-riot', 'sb-press', '1930s', 'sb-colour', 'sb-print', ['sb-roma', 'sb-napoli'][i % 2], 'sb-street', 'sb-workers', ['sb-tram', 'sb-flag'][i % 2]], METRICS)
    else: add(i, 'REAL', ['sb-filler', 'sb-beach'])
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
            page.evaluate("sessionStorage.removeItem('ros-slop-studio-v3')")
            page.get_by_role('button', name='Generazione SLOP').click()
            studio = page.locator('#slop-studio')
            expect(studio.get_by_role('heading', name='Generazione SLOP')).to_be_visible()
            expect(studio.locator('.slop-totals')).to_contain_text('gemella di una REAL')
            expect(studio.locator('.slop-closed')).to_have_count(0)
            # The REAL waiting for a twin, oldest first; nothing chosen, no prompt to ask.
            waiting = studio.locator('.slop-waiting li')
            expect(waiting.first).to_contain_text('b0')
            expect(studio.get_by_role('button', name=re.compile('^Genera .*prompt'))).to_be_disabled()
            picks = ['slopb-003', 'slopb-004', 'slopb-005'] if name == 'desktop' else ['slopb-006', 'slopb-007', 'slopb-008']
            for pick in picks: studio.locator(f'[data-slop-pick="{pick}"]').check()
            expect(studio.locator('.slop-waiting li.is-chosen')).to_have_count(3)
            long_press(page, studio.locator(f'[data-slop-waiting="{picks[0]}"]'))
            expect(page.locator('dialog.image-preview')).to_contain_text('sb-press')
            page.locator('dialog.image-preview').get_by_role('button', name="Chiudi l'anteprima").click()
            page.screenshot(path=str(folder / f'{name}-choice.png'), full_page=True)
            # The choice survives a reload.
            page.reload(); page.get_by_role('button', name='Generazione SLOP').click()
            expect(studio.locator('.slop-waiting li.is-chosen')).to_have_count(3)
            # Prompts: one confirmed paid call for the batch; edits are free; a rewrite is confirmed again.
            studio.get_by_role('button', name='Genera 3 prompt').click()
            expect(studio.locator('.slop-message')).to_have_text('Prompt scritti.')
            assert confirms[-1].startswith('Scrivere 3 prompt con gpt-6.1-terra') and 'a pagamento' in confirms[-1], confirms
            prompts = studio.locator('[data-prompt]'); expect(prompts).to_have_count(3)
            expect(prompts.first).to_have_value(re.compile('^A documentary photograph: 1930s, sb-press, sb-colour, sb-print, sb-(roma|napoli), sb-riot'))
            expect(studio.locator('.slop-prompts li').first).to_contain_text('b' + str(int(picks[0][-3:])))
            expect(studio.locator('[data-prompt-length="0"]')).to_contain_text('caratteri')
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
            expect(cards.first).to_contain_text('Previsti ma non rilevati: 1930s, sb-press, sb-colour, sb-print')
            expect(cards.first.locator('.slop-closed')).to_have_count(1)  # decade, genre, colour and medium are missing: highlighted
            # The copy was treated in the browser towards a REAL campione (another REAL of the same look), and measured.
            first_id = cards.first.get_attribute('data-image')
            item = page.evaluate("id => fetch('/api/admin/library/' + id).then(r => r.json())", first_id)
            assert item['treatment'] and not item['treatment']['off'] and item['treatment']['sample']['id'].startswith('slopb-'), item['treatment']
            assert item['treatment']['sample']['id'] != item['generation']['source'] and item['generation']['source'] == picks[0], item['generation']
            assert item['treatment']['medium'] == 'sb-print' and item['treatment']['applied']['contrast'] > 0 and item['metrics']['long'] == item['copy']['width'], item
            expect(cards.first.locator('.rs-mark')).to_have_count(1)
            page.screenshot(path=str(folder / f'{name}-review.png'), full_page=True)
            long_press(page, cards.first.locator('[data-slop-preview]'))
            preview = page.locator('dialog.image-preview')
            expect(preview).to_be_visible()
            expect(preview).to_contain_text('Tag di partenza')
            expect(preview.locator('[data-start-tags] .rw-pill', has_text='sb-press')).to_have_count(1)
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
            # A new batch: the REAL with a live twin are no longer waiting; the one whose twin went to the trash is back.
            studio.get_by_role('button', name='Nuovo batch').click()
            expect(studio.locator(f'[data-slop-pick="{picks[0]}"]')).to_have_count(0)
            expect(studio.locator(f'[data-slop-pick="{picks[1]}"]')).to_have_count(1)
            expect(studio.locator(f'[data-slop-pick="{picks[2]}"]')).to_have_count(0)
            assert not errors, errors
            context.close()
            print('SLOP studio browser E2E 3.0.0 passed (twins, treated copies, press-and-hold preview):', name)
        browser.close()
finally:
    models({'image_quality': 'medium'})
    sql("DELETE FROM images WHERE id LIKE 'slopb-%' OR generation_batch IS NOT NULL; DELETE FROM slop_batches")
