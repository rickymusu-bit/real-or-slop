"""REAL import batches keep running while the browser is frozen and closed, and resume observation without another paid request."""
import json
import os
from uuid import uuid4
import shutil
import time
from pathlib import Path
from local_db import read
from playwright.sync_api import expect, sync_playwright
from editorial_helpers import BASE, TOKEN, control, make_gallery, real

folder = Path('artifacts/real-descriptions-browser'); folder.mkdir(parents=True, exist_ok=True)
def eventually(check, message):
    for _ in range(200):
        value = check()
        if value: return value
        time.sleep(.1)
    raise AssertionError(message)

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
    for name, options in [('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('mobile', p.devices['Pixel 7'])]:
        gallery = make_gallery('Background REAL ' + name)['id']
        photos = [real('background-real-' + name + '-' + str(i), gallery=gallery) for i in range(8)]
        ids = [photo['id'] for photo in photos]
        draft_key = 'ros-real-wizard-v2:' + gallery
        draft = {'ids': ids, 'stage': 2, 'pending': []}
        context = browser.new_context(**options, http_credentials={'username': 'owner', 'password': TOKEN})
        context.add_init_script('sessionStorage.setItem(' + json.dumps(draft_key) + ', ' + json.dumps(json.dumps(draft)) + ')')
        page = context.new_page(); dialogs = []; errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        def answer(dialog): dialogs.append(dialog.message); dialog.accept()
        page.on('dialog', answer)
        control([{'delay': 1.5} for _ in ids])
        page.goto(BASE + '/admin/gallerie/' + gallery + '/real')
        expect(page.locator('.rw-editor')).to_have_count(8)
        with page.expect_response(lambda response: response.url.endswith('/' + gallery + '/prepare') and response.request.method == 'POST') as accepted:
            page.get_by_role('button', name='Generate missing visual descriptions', exact=True).click()
        assert accepted.value.status == 200, accepted.value.text()
        assert 'Maximum 8 paid calls' in dialogs[0] and len(dialogs) == 1
        # The legacy direct API cannot spend again on a photo already held by a queued preparation.
        direct = page.request.post(BASE + '/api/admin/library/' + ids[0] + '/description', data={
            'confirm': True, 'request': str(uuid4()), 'gallery_id': gallery})
        assert direct.status == 409, direct.text()
        # All eight jobs exist before the start response is acknowledged, with at most three acquired operations.
        jobs = read(f"SELECT state,count(*) AS n FROM pipeline_jobs WHERE gallery_id='{gallery}' GROUP BY state")
        assert sum(row['n'] for row in jobs) == 8, jobs
        assert sum(row['n'] for row in jobs if row['state'] in ('working', 'dispatching')) <= 3, jobs
        # Reload resumes free observation; no new confirmation or POST is issued.
        page.reload()
        expect(page.get_by_role('dialog', name='Processing photo')).to_contain_text('on the server')
        assert len(dialogs) == 1
        # Freeze the renderer: neither JavaScript callbacks nor polling can drive the next photo.
        cdp = context.new_cdp_session(page)
        cdp.send('Page.setWebLifecycleState', {'state': 'frozen'})
        eventually(lambda: read(f"SELECT count(*) AS n FROM images WHERE gallery_id='{gallery}' AND visual_description IS NOT NULL")[0]['n'] >= 3,
                   'No descriptions completed while the browser was frozen')
        assert len(control()) >= 3
        context.close()
        # Read local D1 directly; no admin status GET can dispatch the remaining queued work.
        eventually(lambda: read(f"SELECT count(*) AS n FROM images WHERE gallery_id='{gallery}' AND visual_description IS NOT NULL AND pipeline_profile IS NOT NULL")[0]['n'] == 8,
                   'The remaining descriptions did not finish after the browser closed')
        assert len(control()) == 8, control()
        assert all(call['body']['text']['format']['name'] == 'pipeline_profile' for call in control())
        assert not read(f"SELECT id FROM pipeline_jobs WHERE gallery_id='{gallery}'"), 'Successful jobs must release temporary source links'
        # A restored import reads the saved descriptions without spending again.
        restored = browser.new_context(**options, http_credentials={'username': 'owner', 'password': TOKEN})
        restored.add_init_script('sessionStorage.setItem(' + json.dumps(draft_key) + ', ' + json.dumps(json.dumps(draft)) + ')')
        page = restored.new_page(); page.goto(BASE + '/admin/gallerie/' + gallery + '/real')
        expect(page.locator('[data-visual-description]')).to_have_count(8)
        expect(page.get_by_role('button', name='Generate missing visual descriptions', exact=True)).to_have_count(0)
        assert len(control()) == 8 and not errors, errors
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        page.screenshot(path=str(folder / (name + '-completed.png')), full_page=True)
        restored.close()
    browser.close()
print('REAL description browser passed on desktop/mobile: whole batch persisted, one confirmed call per photo, reload, renderer freeze, browser closure, server-only completion, no duplicate paid calls.')
