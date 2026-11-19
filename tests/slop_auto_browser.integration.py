"""Gallery editing, membership and the two automatic confirmations on desktop and mobile."""
import re
import shutil
import time
from playwright.sync_api import sync_playwright,expect
from editorial_helpers import *
from long_press import long_press
from catalog import open_gallery

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
            page=context.new_page();errors=[];confirmations=[];dismiss_delete=[True]
            page.on('pageerror',lambda e:errors.append(str(e)))
            def answer(dialog):
                confirmations.append(dialog.message)
                if dismiss_delete[0] and dialog.message.startswith('Eliminare definitivamente'):
                    dismiss_delete[0]=False
                    dialog.dismiss()
                else:
                    dialog.accept()
            page.on('dialog', answer)
            try:
                title='Galleria '+name
                control([]);page.goto(BASE+'/admin')
                expect(page.locator('#admin-galleries')).to_be_visible()
                page.get_by_role('button',name='Nuova galleria').click()
                form=page.locator('#gallery-editor form')
                expect(page.get_by_role('button',name='Elimina galleria')).to_have_count(0)
                form.get_by_label('Titolo').fill(title)
                form.get_by_label('Descrizione').fill('Fotografie di strada nella piazza.')
                form.get_by_role('button',name='Crea galleria').click()
                expect(page.locator('#gallery-editor')).to_be_hidden()
                expect(page.locator('#gallery-title')).to_have_text(title)
                expect(page.locator('.library-empty')).to_be_visible()
                card=page.locator('[data-gallery-open]',has_text=title)
                gallery_id=card.get_attribute('data-gallery-open')
                page.locator('[data-gallery-close]').click()
                expect(card).to_contain_text('0 foto')
                other_card=page.locator('[data-gallery-open="'+old_gallery['id']+'"]')
                expect(other_card.locator('img')).to_have_count(1)
                expect(other_card).to_contain_text('1 foto')
                open_gallery(page,old_gallery['id'])
                page.locator('[data-open="'+source['id']+'"]').click()
                page.locator('#library-detail-gallery').select_option(gallery_id)
                expect(page.locator('#library-detail-message')).to_have_text('Galleria aggiornata.')
                page.locator('#library-detail').get_by_role('button',name='Chiudi',exact=True).click()
                expect(page.locator('[data-open="'+source['id']+'"]')).to_have_count(0)
                page.locator('[data-gallery-close]').click()
                open_gallery(page,gallery_id)
                expect(page.locator('[data-open="'+source['id']+'"]')).to_be_visible()
                page.get_by_role('link',name='Genera SLOP').click()
                page.locator('[data-generation-mode=automatic]').click()
                expect(page.locator('[data-auto=preview]')).to_be_disabled()
                expect(page.locator('#slop-auto-controls')).to_contain_text('Salva le Indicazioni SLOP')

                page.locator('[data-gallery-return]').click()
                page.locator('[data-gallery-edit]').click()
                form.get_by_role('button',name='Proponi indicazioni con IA').click()
                expect(form.get_by_label('Indicazioni SLOP')).to_have_value(re.compile('conserva la piazza'))
                expect(page.locator('#gallery-readiness')).to_contain_text('Salva le Indicazioni SLOP')
                form.get_by_label('Indicazioni SLOP').fill('Conserva la piazza riconoscibile e inventa un bus plausibile.')
                form.get_by_role('button',name='Salva modifiche').click()
                expect(page.locator('#gallery-editor')).to_be_hidden()
                assert 'Massimo una chiamata' in confirmations[0]
                control([])

                page.get_by_role('link',name='Genera SLOP').click()
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
                page.reload()  # the dedicated URL reopens the pending review
                expect(page.locator('[data-premise]')).to_contain_text('bus')
                page.goto(BASE+'/admin')
                open_gallery(page,old_gallery['id'])
                page.get_by_role('link',name='Genera SLOP').click()
                expect(page.locator('[data-premise]')).to_have_count(0)
                expect(page.locator('#slop-auto-controls')).to_contain_text(title)
                page.locator('[data-auto=open-gallery]').click()
                expect(page).to_have_url(f'{BASE}/admin/gallerie/{gallery_id}/slop?mode=automatic')
                expect(page.locator('#wizard-gallery-name')).to_have_text(title)
                expect(page.locator('[data-premise]')).to_contain_text('bus')
                assert len(control())==1
                control([{'delay':1.5}] if name=='desktop' else [])
                page.locator('[data-auto=start]').click()
                if name=='desktop':
                    for _ in range(100):
                        if any(r['path']=='/v1/images/generations' for r in control()):break
                        time.sleep(.05)
                    else:raise AssertionError('generation did not start')
                    page.goto(BASE+'/admin')
                    page.locator('#gallery-active-batch').click()
                expect(page.locator('[data-auto=review]')).to_be_visible(timeout=30000)
                assert len(control())==3,control()
                assert 'Massimo 5 chiamate' in confirmations[2],confirmations
                auto=call('auto')[1];assert auto['batch']['status']=='review'
                generated=[i['id'] for i in auto['batch']['images']];assert len(generated)==1
                assert call('/'+generated[0],library=True)[1]['gallery_id']==gallery_id
                page.locator('[data-auto=review]').click()
                expect(page).to_have_url(f'{BASE}/admin?gallery={gallery_id}&batch={auto["batch"]["id"]}')
                expect(page.locator('[data-open="'+generated[0]+'"]')).to_be_visible()
                assert len(control())==3
                page.screenshot(path=str(folder/(name+'-review.png')),full_page=True)
                page.locator('[data-gallery-edit]').click()
                delete=page.get_by_role('button',name='Elimina galleria')
                delete.click()
                expect(page.locator('#gallery-editor')).to_be_visible()
                assert title in confirmations[-1] and 'anche quelle nel cestino' in confirmations[-1]
                assert call('/'+generated[0],library=True)[0]==200
                delete.click()
                expect(page.locator('#gallery-editor')).to_be_hidden()
                expect(page.locator('#gallery-workspace')).to_be_hidden()
                expect(card).to_have_count(0)
                expect(other_card).to_be_visible()
                assert call('/'+source['id'],library=True)[0]==404
                assert call('/'+generated[0],library=True)[0]==404
                assert call('batches/'+auto['batch']['id'])[0]==404
                assert not sql("SELECT object_key FROM gallery_files_to_delete")
                generated=[]
                assert errors==[],errors
            finally:
                context.close()
                if call('/'+source['id'],library=True)[0]==200: remove(generated+[source['id']])
        browser.close()
finally:call('/settings',old,method='PUT',library=True)
print('Editorial galleries and both automatic confirmations passed on desktop and mobile.')
