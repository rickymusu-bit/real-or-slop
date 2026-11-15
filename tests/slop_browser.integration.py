"""Desktop/mobile editorial studio: editable brief, observed loop, full image, manual acceptance and publication."""
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from editorial_helpers import *
folder=Path('artifacts/slop-browser');folder.mkdir(parents=True,exist_ok=True)
old=call('/settings',library=True)[1]['values']
call('/settings',{'slop_section_min_real':1,'slop_auto_enabled':0},method='PUT',library=True)
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
        for name,options in [('desktop',{'viewport':{'width':1280,'height':900}}),('mobile',p.devices['Pixel 7'])]:
            source=real('browser-'+name);generated=[]
            context=browser.new_context(**options,http_credentials={'username':'owner','password':TOKEN})
            page=context.new_page();errors=[];confirmations=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda d:(confirmations.append(d.message),d.accept()))
            try:
                page.goto(BASE+'/admin');page.get_by_role('button',name='Generazione SLOP',exact=True).click()
                studio=page.locator('#slop-studio')
                studio.locator('[data-slop-pick="'+source['id']+'"]').check()
                control([]);studio.locator('[data-slop=prompts]').click()
                expect(studio.locator('[data-prompt="0"]')).to_be_visible(timeout=20000)
                assert len(control())==1 and 'Massimo 1' in confirmations[-1]
                studio.locator('[data-brief="0"][data-key=required]').fill('street-scene')
                studio.locator('[data-prompt="0"]').fill('A credible street photograph in ordinary daylight.')
                studio.locator('[data-slop=save]').click();expect(studio.get_by_role('status').first).to_contain_text('salvati')
                control([None,{'evaluation':'retry_same_prompt'},None,{'evaluation':'accept'}])
                studio.locator('[data-slop=images]').click()
                expect(studio.locator('[data-slop=approve]')).to_be_visible(timeout=30000)
                assert len(control())==5  # two images, two evaluations, final tags
                image_id=studio.locator('[data-image]').get_attribute('data-image');generated.append(image_id)
                assert call('/'+image_id,library=True)[1]['status']=='new'
                expect(studio.get_by_alt_text('Originale SLOP intero')).to_be_visible()
                expect(studio.get_by_alt_text('Copia di gioco 4:5')).to_be_visible()
                expect(studio.locator('details summary',has_text='Tentativo 2: accept')).to_be_visible()
                page.screenshot(path=str(folder/(name+'-review.png')),full_page=True)
                studio.locator('[data-slop=frame]').click();editor=page.locator('.crop-dialog')
                expect(editor.locator('select')).to_have_value('4:5');expect(editor.locator('select option')).to_have_count(1)
                editor.locator('[data-crop=ok]').click();expect(editor).to_have_count(0)
                studio.locator('[data-slop=approve]').click();expect(studio.locator('[data-slop=publish]')).to_be_visible()
                studio.locator('[data-slop=publish]').click();expect(studio.get_by_role('heading',name='SLOP published')).to_be_visible()
                assert 'Massimo 7' in confirmations[-1]  # generation loop excludes the already paid brief
                assert errors==[],errors
            finally:
                context.close();remove(generated+[source['id']])
        browser.close()
finally:call('/settings',old,method='PUT',library=True)
print('Editorial studio desktop/mobile: brief editing, retry, whole-image evaluation, crop after acceptance, manual approval/publication passed.')
