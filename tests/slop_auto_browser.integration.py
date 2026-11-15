"""Browser-driven automatic loop resumes safely and surfaces mixed outcomes on desktop and mobile."""
import os
import shutil
import time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from editorial_helpers import *
folder=Path('artifacts/slop-auto-browser');folder.mkdir(parents=True,exist_ok=True)
old=call('/settings',library=True)[1]['values']
call('/settings',{'slop_section_min_real':1,'slop_auto_enabled':1,'max_generation_attempts':2},method='PUT',library=True)
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
        for name,options in [('desktop',{'viewport':{'width':1280,'height':900}}),('mobile',p.devices['Pixel 7'])]:
            sql("UPDATE slop_batches SET auto_status='closed' WHERE origin='auto'; DELETE FROM slop_proposal_ignored; UPDATE images SET trashed_from='approved',status='trash' WHERE status<>'trash'")
            source=real('auto-browser-'+name);generated=[]
            context=browser.new_context(**options,http_credentials={'username':'owner','password':TOKEN})
            page=context.new_page();errors=[];confirmations=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda d:(confirmations.append(d.message),d.accept()))
            try:
                control([None, {'delay':1.5}] if name=='desktop' else []);page.goto(BASE+'/admin')
                page.locator('[data-auto=start]').click()
                if name=='desktop':
                    for _ in range(60):
                        if any(r['path']=='/v1/images/generations' for r in control()):break
                        time.sleep(.05)
                    else:raise AssertionError('generation did not start')
                    page.reload()  # another dashboard must await the already claimed attempt

                expect(page.locator('[data-auto=review]')).to_be_visible(timeout=30000)
                assert len(control())==4,control()  # brief, image, evaluator, tags
                auto=call('auto')[1];assert auto['batch']['status']=='review'
                generated=[i['id'] for i in auto['batch']['images']];assert len(generated)==1
                assert call('/'+generated[0],library=True)[1]['status']=='new'
                assert 'Massimo 6 chiamate' in confirmations[0],confirmations
                page.reload();expect(page.locator('[data-auto=review]')).to_be_visible()
                assert len(control())==4  # refresh cannot pay again
                page.screenshot(path=str(folder/(name+'-review.png')),full_page=True)
                assert errors==[],errors
            finally:context.close();remove(generated+[source['id']])
        browser.close()
finally:call('/settings',old,method='PUT',library=True)
print('Automatic editorial browser loop desktop/mobile: bounded consent, final review and refresh idempotency passed.')
