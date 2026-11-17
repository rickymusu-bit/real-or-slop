"""Browser-driven automatic loop resumes safely and surfaces mixed outcomes on desktop and mobile."""
import os
import shutil
import re
import time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from editorial_helpers import *
from long_press import long_press
folder=Path('artifacts/slop-auto-browser');folder.mkdir(parents=True,exist_ok=True)
old=call('/settings',library=True)[1]['values']
call('/settings',{'max_generation_attempts':2},method='PUT',library=True)
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
        for name,options in [('desktop',{'viewport':{'width':1280,'height':900}}),('mobile',p.devices['Pixel 7'])]:
            sql("UPDATE slop_batches SET auto_status='closed' WHERE origin='auto'; UPDATE images SET trashed_from='approved',status='trash' WHERE status<>'trash'")
            source=real('auto-browser-'+name);generated=[]
            context=browser.new_context(**options,http_credentials={'username':'owner','password':TOKEN})
            page=context.new_page();errors=[];confirmations=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda d:(confirmations.append(d.message),d.accept()))
            try:
                control([None, {'delay':1.5}] if name=='desktop' else []);page.goto(BASE+'/admin')
                page.locator('[data-admin-tab=slop]').click()
                page.locator('[data-generation-mode=automatic]').click()
                expect(page.get_by_text('Proposta di generazione',exact=False)).to_have_count(0)
                page.locator('#slop-auto-size').fill('1')
                expect(page.locator('[data-auto=start]')).to_have_count(0)
                page.locator('[data-auto=preview]').click()
                expect(page.locator('[data-reference]')).to_have_count(1)
                expect(page.locator('[data-reference] strong')).to_have_text(source['title'])
                assert control()==[] and call('auto')[1]['batch'] is None  # extracting pays nothing
                reference=page.locator('[data-auto-reference]')
                reference.click();expect(page.locator('.image-preview[open]')).to_be_visible()
                expect(page.locator('#image-preview-title')).to_have_text(source['title'])
                expect(page.locator('.image-preview img')).to_have_attribute('src',re.compile('/'+source['id']+'/original$'))
                page.locator('[data-preview-close]').click()
                long_press(page,reference);expect(page.locator('.image-preview[open]')).to_be_visible()
                page.locator('[data-preview-close]').click()
                # A new quantity invalidates the old extraction, even if typed back to the original value.
                page.locator('#slop-auto-size').fill('1')
                expect(page.locator('[data-auto=start]')).to_have_count(0)
                page.locator('[data-auto=preview]').click();expect(page.locator('[data-reference]')).to_have_count(1)
                page.locator('[data-auto=discard]').click();expect(page.locator('[data-reference]')).to_have_count(0)
                assert control()==[]
                page.locator('[data-auto=preview]').click();expect(page.locator('[data-reference]')).to_have_count(1)
                page.screenshot(path=str(folder/(name+'-setup.png')),full_page=True)
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
