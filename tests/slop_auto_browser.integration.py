"""Gallery editing, membership and the two automatic confirmations on desktop and mobile."""
import re
import shutil
import time
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
            old_gallery=make_gallery('Galleria di partenza '+name)
            source=real('auto-browser-'+name,gallery=old_gallery['id']);generated=[]
            context=browser.new_context(**options,http_credentials={'username':'owner','password':TOKEN})
            page=context.new_page();errors=[];confirmations=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda d:(confirmations.append(d.message),d.accept()))
            try:
                title='Galleria '+name
                control([]);page.goto(BASE+'/admin')
                page.locator('[data-admin-tab=database]').click()
                page.locator('[data-db-tab=galleries]').click()
                form=page.locator('#db-galleries form')
                form.get_by_label('Titolo').fill(title)
                form.get_by_label('Descrizione').fill('Fotografie di strada nella piazza.')
                form.get_by_role('button',name='Crea galleria').click()
                expect(page.locator('#gallery-message')).to_have_text('Galleria salvata.')
                gallery_id=page.locator('#gallery-editor-select').input_value()
                expect(page.locator('#gallery-readiness')).to_contain_text('Salva le Indicazioni SLOP')
                page.locator('[data-db-tab=images]').click()
                page.locator('#library-gallery').select_option(old_gallery['id'])
                page.locator('[data-open="'+source['id']+'"]').click()
                page.locator('#library-detail-gallery').select_option(gallery_id)
                expect(page.locator('#library-detail-message')).to_have_text('Galleria aggiornata.')
                page.locator('#library-detail').get_by_role('button',name='Chiudi',exact=True).click()
                page.locator('#library-gallery').select_option(gallery_id)
                expect(page.locator('[data-open="'+source['id']+'"]')).to_be_visible()
                page.locator('[data-admin-tab=real]').click()
                page.locator('#rw-import-gallery').select_option(gallery_id)
                page.locator('[data-admin-tab=slop]').click()
                page.locator('[data-generation-mode=automatic]').click()
                page.locator('#slop-auto-gallery').select_option(gallery_id)
                expect(page.locator('[data-auto=preview]')).to_be_disabled()

                page.locator('[data-admin-tab=database]').click()
                page.locator('[data-db-tab=galleries]').click()
                form.get_by_role('button',name='Proponi indicazioni con IA').click()
                expect(form.get_by_label('Indicazioni SLOP')).to_have_value(re.compile('conserva la piazza'))
                expect(page.locator('#gallery-readiness')).to_contain_text('Salva le Indicazioni SLOP')
                form.get_by_label('Indicazioni SLOP').fill('Conserva la piazza riconoscibile e inventa un bus plausibile.')
                form.get_by_role('button',name='Salva modifiche').click()
                expect(page.locator('#gallery-readiness')).to_have_text('Pronta per la generazione automatica.')
                assert 'Massimo una chiamata' in confirmations[0]
                control([])

                page.locator('[data-admin-tab=slop]').click()
                expect(page.locator('[data-auto=preview]')).to_be_enabled()
                page.locator('#slop-auto-size').fill('2')
                page.locator('[data-auto=preview]').click()
                expect(page.locator('.slop-auto-notice')).to_contain_text('eleggibili disponibili: 1')
                page.locator('#slop-auto-size').fill('1')
                page.locator('[data-auto=preview]').click()
                expect(page.locator('[data-reference] strong')).to_have_text(source['title'])
                assert control()==[] and call('auto')[1]['batch'] is None
                reference=page.locator('[data-auto-reference]')
                reference.click();expect(page.locator('.image-preview[open]')).to_be_visible()
                expect(page.locator('.image-preview img')).to_have_attribute('src',re.compile('/'+source['id']+'/original$'))
                page.locator('[data-preview-close]').click()
                long_press(page,reference);expect(page.locator('.image-preview[open]')).to_be_visible()
                page.locator('[data-preview-close]').click()
                page.locator('[data-auto=discard]').click();expect(page.locator('[data-reference]')).to_have_count(0)
                assert control()==[]
                page.locator('[data-auto=preview]').click();expect(page.locator('[data-reference]')).to_have_count(1)
                page.locator('[data-auto=prepare]').click()
                expect(page.locator('[data-premise]')).to_contain_text('bus',timeout=20000)
                control_log=control()
                assert len(control_log)==1 and control_log[0]['body']['text']['format']['name']=='slop_gallery_proposal'
                assert 'Massimo 1 chiamata' in confirmations[1]
                expect(page.locator('[data-auto=start]')).to_be_visible(timeout=20000)
                page.locator('summary').filter(has_text='Prompt inglese').click()
                expect(page.get_by_text('A plausible invented vintage bus',exact=False)).to_be_visible()
                page.screenshot(path=str(folder/(name+'-setup.png')),full_page=True)
                page.reload()  # persists the pending review across dashboard reloads
                expect(page.locator('[data-premise]')).to_contain_text('bus')
                assert len(control())==1
                control([{'delay':1.5}] if name=='desktop' else [])
                page.locator('[data-auto=start]').click()
                if name=='desktop':
                    for _ in range(100):
                        if any(r['path']=='/v1/images/generations' for r in control()):break
                        time.sleep(.05)
                    else:raise AssertionError('generation did not start')
                    page.reload()
                expect(page.locator('[data-auto=review]')).to_be_visible(timeout=30000)
                assert len(control())==3,control()
                assert 'Massimo 5 chiamate' in confirmations[2],confirmations
                auto=call('auto')[1];assert auto['batch']['status']=='review'
                generated=[i['id'] for i in auto['batch']['images']];assert len(generated)==1
                assert call('/'+generated[0],library=True)[1]['gallery_id']==gallery_id
                page.locator('[data-auto=review]').click()
                expect(page.locator('[data-open="'+generated[0]+'"]')).to_be_visible()
                assert len(control())==3
                page.screenshot(path=str(folder/(name+'-review.png')),full_page=True)
                assert errors==[],errors
            finally:context.close();remove(generated+[source['id']])
        browser.close()
finally:call('/settings',old,method='PUT',library=True)
print('Editorial galleries and both automatic confirmations passed on desktop and mobile.')
