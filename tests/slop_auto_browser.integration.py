"""Gallery editing, membership, the SLOP wizard with its two confirmations, the link to the open batch and the removal of a gallery,
on desktop and mobile."""
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
                expect(page.locator('[data-generation-mode]')).to_have_count(0)  # one wizard (owner decision of 2026-11-22)
                controls=page.locator('#slop-auto-controls')
                expect(controls.locator('.slop-wizard-steps [aria-current=step]')).to_have_text('2. REAL')

                # No SLOP instructions in a gallery any more: the editor has title, description and thresholds.
                page.locator('[data-gallery-return]').click()
                page.locator('[data-gallery-edit]').click()
                expect(form.get_by_label('Indicazioni SLOP')).to_have_count(0)
                expect(form.get_by_role('button',name='Proponi indicazioni con IA')).to_have_count(0)
                page.locator('[data-gallery-editor-close]').click()
                expect(page.locator('#gallery-editor')).to_be_hidden()
                control([])

                page.get_by_role('link',name='Genera SLOP').click()
                controls.locator('#slop-auto-size').fill('2')
                controls.locator('[data-auto=preview]').click()
                expect(controls.locator('[data-select-real]:checked')).to_have_count(1)  # one REAL available
                assert control()==[] and call('auto')[1]['batch'] is None
                reference=controls.locator('[data-auto-reference]').first
                reference.click();expect(page.locator('.image-preview[open]')).to_be_visible()
                expect(page.locator('.image-preview img')).to_have_attribute('src',re.compile('/'+source['id']+'/original$'))
                page.locator('[data-preview-close]').click()
                long_press(page,reference);expect(page.locator('.image-preview[open]')).to_be_visible()
                page.locator('[data-preview-close]').click()
                controls.locator('[data-auto=to-ideas]').click()
                controls.locator(f'[data-own="{source["id"]}"]').fill('Lo stesso bus d’epoca in una piazza diversa, ripreso di lato.')
                controls.locator(f'[data-add-own="{source["id"]}"]').click()
                expect(controls.locator('[data-choose]:checked')).to_have_count(1)
                controls.locator('[data-auto=to-choice]').click()
                controls.locator('[data-auto=prepare]').click()
                assert 'Massimo 1 chiamata' in confirmations[-1],confirmations
                expect(controls.locator('[data-premise="0"]')).to_have_value(re.compile('bus'),timeout=20000)
                control_log=control()
                assert len(control_log)==1 and control_log[0]['body']['text']['format']['name']=='slop_gallery_proposal'
                expect(controls.locator('[data-prompt="0"]')).to_have_value(re.compile('A plausible invented vintage bus'))
                expect(controls.locator('[data-reference] [data-idea]')).to_contain_text('bus d’epoca')
                expect(page.locator('[data-auto=start]')).to_be_visible(timeout=20000)
                page.screenshot(path=str(folder/(name+'-setup.png')),full_page=True)
                page.reload()  # the dedicated URL reopens the pending prompts
                expect(controls.locator('[data-premise="0"]')).to_have_value(re.compile('bus'))
                page.goto(BASE+'/admin')
                open_gallery(page,old_gallery['id'])
                page.get_by_role('link',name='Genera SLOP').click()
                expect(controls.locator('[data-premise="0"]')).to_have_count(0)
                expect(controls).to_contain_text(title)
                controls.locator('[data-auto=open-gallery]').click()
                expect(page).to_have_url(f'{BASE}/admin/gallerie/{gallery_id}/slop')
                expect(page.locator('#wizard-gallery-name')).to_have_text(title)
                expect(controls.locator('[data-premise="0"]')).to_have_value(re.compile('bus'))
                assert len(control())==1
                control([{'delay':1.5}] if name=='desktop' else [])
                page.locator('[data-auto=start]').click()
                assert 'Massimo 4 chiamate' in confirmations[-1] and 'analisi' not in confirmations[-1],confirmations
                if name=='desktop':
                    for _ in range(100):
                        if any(r['path']=='/v1/images/generations' for r in control()):break
                        time.sleep(.05)
                    else:raise AssertionError('generation did not start')
                    page.goto(BASE+'/admin')
                    page.locator('#gallery-active-batch').click()
                expect(page.locator('[data-auto=review]')).to_be_visible(timeout=30000)
                assert len(control())==2,control()  # generation and evaluation, no analysis after acceptance
                auto=call('auto')[1];assert auto['batch']['status']=='review'
                generated=[i['id'] for i in auto['batch']['images']];assert len(generated)==1
                assert call('/'+generated[0],library=True)[1]['gallery_id']==gallery_id
                expect(page.locator('#slop-studio [data-image]')).to_have_count(1)
                page.locator('[data-auto=review]').click()
                expect(page).to_have_url(f'{BASE}/admin?gallery={gallery_id}&batch={auto["batch"]["id"]}')
                expect(page.locator('[data-open="'+generated[0]+'"]')).to_be_visible()
                assert len(control())==2
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
