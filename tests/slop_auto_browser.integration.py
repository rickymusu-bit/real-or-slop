"""Automatic SLOP batches in the browser, desktop and mobile: proposal box and count, close, Settings, confirmation,
batch run, review in the Database with the batch filter and the starting tags. Runs last."""
import json
import os
import shutil
import subprocess
import urllib.request
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from long_press import long_press

base, state = os.environ['ROS_TEST_BASE'], os.environ['ROS_TEST_STATE']
fake = os.environ['ROS_TEST_FAKE_OPENAI']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
folder = Path('artifacts/slop-auto-browser'); folder.mkdir(parents=True, exist_ok=True)
def sql(command):
    subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command],
                   capture_output=True, text=True, check=True)
def openai(queue=None):
    req = urllib.request.Request(fake + '/control', data=json.dumps({'queue': queue}).encode() if queue is not None else None,
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r: return json.loads(r.read()).get('log')
def clean_field():
    sql("UPDATE images SET trashed_from=CASE status WHEN 'new' THEN 'new' ELSE 'approved' END,status='trash' WHERE status<>'trash' AND id NOT LIKE 'autob-%'; "
        "DELETE FROM slop_batches; DELETE FROM slop_proposal_ignored")

# 62 REAL approved (12 in the group ab-arch/1830s) and 9 new SLOP of the group: spread 100%, 3 missing, a batch of 3.
clean_field()
statements = ["INSERT OR IGNORE INTO tags(id,label,category,created_at) VALUES ('ab-tag-arch','ab-arch','genre','x'),('ab-tag-1830s','1830s','time','x'),('ab-tag-roma','ab-roma','place','x'),('ab-tag-napoli','ab-napoli','place','x')"]
def add(i, origin, labels, status='approved'):
    h = format(20_000 + i, '064x')
    statements.append(f"INSERT INTO images(id,origin,status,title,original_key,original_sha256,original_mime,width,height,copy_key,copy_sha256,created_at,updated_at) "
                      f"VALUES('autob-{i}','{origin}','{status}','ab{i}','autob/{i}','{h}','image/jpeg',10,10,'autob/c{i}','{h}','x','x')")
    if labels: statements.append('INSERT INTO image_tags(image_id,tag_id) VALUES ' + ','.join(f"('autob-{i}','ab-tag-{l}')" for l in labels))
for i in range(62): add(i, 'REAL', ['arch', '1830s', ['roma', 'napoli'][i % 2]] if i < 12 else [])
for i in range(100, 109): add(i, 'SLOP', ['arch', '1830s'], 'new')
sql('; '.join(statements))
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
        for name, options in (('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('mobile', {**p.devices['Pixel 7']})):
            context = browser.new_context(**options, http_credentials={'username': 'owner', 'password': token})
            page = context.new_page(); errors, confirms = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('dialog', lambda dialog: (confirms.append(dialog.message), dialog.accept()))
            page.goto(base + '/admin')
            box = page.locator('#slop-auto')
            expect(box).to_contain_text('Proposta di generazione')
            expect(box).to_contain_text('ab-arch'); expect(box).to_contain_text('1830s'); expect(box).to_contain_text('12 REAL'); expect(box).to_contain_text('9 SLOP nuove')
            expect(box).to_contain_text('spread 100%, ne mancano 3')
            expect(page.locator('#slop-auto-count')).to_have_text(' (1)')
            page.screenshot(path=str(folder / f'{name}-proposal.png'), full_page=True)
            # «Chiudi» hides it until the next opening of the dashboard.
            box.get_by_role('button', name='Chiudi la proposta').click()
            expect(box).to_be_hidden()
            page.reload(); expect(box).to_contain_text('Proposta di generazione')
            # Settings «Studio SLOP»: the two new commands, saved and read back.
            page.get_by_role('button', name='Impostazioni').click()
            page.locator('#library-thresholds summary').click()
            expect(page.locator('[name="slop_auto_enabled"]')).to_have_value('1')
            expect(page.locator('[name="slop_auto_threshold_percent"]')).to_have_value('33')
            page.locator('[name="slop_auto_enabled"]').select_option('0')
            page.locator('#library-thresholds-form').get_by_role('button', name='Salva').click()
            expect(page.locator('#library-settings-message')).to_contain_text('Soglie dello studio SLOP salvate')
            expect(box).to_be_hidden()
            page.locator('[name="slop_auto_enabled"]').select_option('1')
            page.locator('#library-thresholds-form').get_by_role('button', name='Salva').click()
            expect(box).to_contain_text('Proposta di generazione')
            # «Genera»: one confirmation for the whole batch, then prompts, images, copies and analyses in the browser.
            openai([])
            box.get_by_role('button', name='Genera 3 SLOP').click()
            expect(box).to_contain_text('3 di 3 immagini da decidere', timeout=90_000)
            assert any('7 chiamate a pagamento' in c for c in confirms), confirms
            sent = openai(); assert [s['path'] for s in sent].count('/v1/images/generations') == 3 and len(sent) == 7, [s['path'] for s in sent]
            expect(page.locator('#slop-auto-count')).to_have_text('')
            page.screenshot(path=str(folder / f'{name}-review.png'), full_page=True)
            box.get_by_role('button', name='Rivedi nel Database').click()
            expect(page.locator('#admin-database')).to_be_visible()
            expect(page.locator('#library-batch-filter')).to_be_visible()
            cards = page.locator('#library-grid .library-card')
            expect(cards).to_have_count(3)
            expect(cards.first).to_contain_text('SLOP'); expect(cards.first).not_to_contain_text('senza copia')
            page.screenshot(path=str(folder / f'{name}-database.png'), full_page=True)
            # Starting tags: the group of the batch and a place drawn for the slot, in the detail and in the preview.
            cards.first.locator('.library-open').click()
            start = page.locator('#library-detail [data-start-tags]')
            expect(start).to_contain_text('Tag di partenza')
            expect(start.locator('.rw-pill', has_text='ab-arch')).to_contain_text('gruppo')
            expect(page.locator('#library-detail [data-group]')).to_be_visible()
            expect(start.locator('.rw-pill.tag-cat-place')).to_have_count(1)
            page.locator('#library-detail .library-detail-close button').click()
            long_press(page, cards.first.locator('.library-open'))
            preview = page.locator('dialog.image-preview')
            expect(preview.locator('[data-start-tags] .rw-pill', has_text='ab-arch')).to_have_count(1)
            expect(preview).to_contain_text('Prompt')
            page.screenshot(path=str(folder / f'{name}-preview.png'))
            preview.get_by_role('button', name="Chiudi l'anteprima").click()
            expect(preview).to_be_hidden()
            # Deciding the images (trash, from the selection bar) closes the batch and the proposal comes back.
            for i in range(3): cards.nth(i).locator('[data-select]').check()
            page.locator('#library-selection [data-bulk="trash"]').click()
            expect(box).to_contain_text('Proposta di generazione', timeout=10_000)
            page.get_by_role('button', name='Mostra tutte').click()
            expect(page.locator('#library-batch-filter')).to_be_hidden()
            assert not errors, errors
            context.close()
            clean_field()
        browser.close()
finally:
    sql("DELETE FROM image_tags WHERE image_id IN (SELECT id FROM images WHERE id LIKE 'autob-%' OR generation_batch IS NOT NULL); "
        "DELETE FROM images WHERE id LIKE 'autob-%'; DELETE FROM tags WHERE id LIKE 'ab-tag-%'; DELETE FROM slop_batches; DELETE FROM slop_proposal_ignored; "
        "DELETE FROM app_settings WHERE key IN ('slop_auto_enabled','slop_auto_threshold_percent')")
print('Automatic SLOP batches in the browser 1.1.0 passed on desktop and mobile: starting tags in the Database, proposal, close, Settings, confirmation, batch run, review, Database filter.')
