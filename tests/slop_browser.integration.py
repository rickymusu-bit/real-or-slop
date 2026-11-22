"""The SLOP wizard on desktop and mobile (owner decision of 2026-11-22): every step from the choice of the REAL to the review, and the
processes without a SLOP that wait for the owner, with the explicit acceptance of a candidate and its publication."""
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from editorial_helpers import *
from catalog import open_gallery
folder=Path('artifacts/slop-browser');folder.mkdir(parents=True,exist_ok=True)
old=call('/settings',library=True)[1]['values']
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
        for name,options in [('desktop',{'viewport':{'width':1280,'height':900}}),('mobile',p.devices['Pixel 7'])]:
            gallery=make_gallery('Wizard SLOP '+name)['id'];generated=[]
            context=browser.new_context(**options,http_credentials={'username':'owner','password':TOKEN})
            page=context.new_page();errors=[];confirmations=[];dismiss_next=[False]
            page.on('pageerror',lambda e:errors.append(str(e)))
            def confirm(dialog):
                confirmations.append(dialog.message)
                if dismiss_next[0]:
                    dismiss_next[0]=False;dialog.dismiss()
                else:dialog.accept()
            page.on('dialog',confirm)
            try:
                # A process that ended without a SLOP is shown on top of the wizard, with its attempts, until the owner closes it.
                stuck,_=wizard_prepare(gallery,generated,'browser-stuck-'+name)
                stuck=wizard_start(stuck,[None,{'evaluation':'review_needed'}])
                page.goto(BASE+'/admin');open_gallery(page,gallery)
                page.get_by_role('link',name='Genera SLOP').click()
                expect(page.locator('[data-generation-mode]')).to_have_count(0)  # one wizard, no manual mode
                studio=page.locator('#slop-studio')
                card=studio.locator('[data-attention="'+stuck['processes'][0]['id']+'"]')
                expect(card).to_contain_text('il valutatore chiede la tua revisione')
                card.locator(':scope > summary').click();card.locator('details > summary').first.click()
                expect(card.locator('img')).to_be_visible();expect(card.locator('p[lang=en]')).to_be_visible()
                expect(page.locator('.slop-wizard-steps [aria-current=step]')).to_have_text('7. Revisione')
                page.screenshot(path=str(folder/(name+'-attention.png')),full_page=True)
                card.locator('[data-slop=close-process]').click();expect(card).to_have_count(0)
                assert 'Chiudere questo processo' in confirmations[-1]
                assert sql("SELECT state FROM slop_processes WHERE id='"+stuck['processes'][0]['id']+"'")[0]['state']=='closed'
                wizard_release(stuck)

                # The owner can accept critical/minor findings and uncertainty, after a cancellable confirmation; the SLOP then waits
                # in the review of its batch for frame, approval and publication.
                review,_=wizard_prepare(gallery,generated,'browser-review-'+name)
                review=wizard_start(review,[None,{'evaluation':'review_needed','critical':['A hand has six fingers'],'minor':['Soft focus on the edge'],'uncertainty':['Place cannot be confirmed'],'constraints':False}])
                page.reload()
                card=studio.locator('[data-attention="'+review['processes'][0]['id']+'"]')
                card.locator(':scope > summary').click()
                control([]);dismiss_next[0]=True;card.locator('[data-slop=accept-process]').click()
                expect(card).to_be_visible();assert control()==[]
                assert all(note in confirmations[-1] for note in ['A hand has six fingers','Soft focus on the edge','Place cannot be confirmed','Nessuna chiamata a pagamento'])
                card.locator('[data-slop=accept-process]').click();expect(card).to_have_count(0,timeout=20000)
                assert 'Accettare questa candidata' in confirmations[-1] and 'non ha potuto confermare' in confirmations[-1] and control()==[]
                reviewed=sql("SELECT state,image_id FROM slop_processes WHERE id='"+review['processes'][0]['id']+"'")[0]
                assert reviewed['state']=='accepted' and reviewed['image_id'];generated.append(reviewed['image_id'])
                expect(studio.locator('[data-owner-accepted]')).to_be_visible(timeout=20000)
                studio.locator('[data-slop=frame]').click();editor=page.locator('.crop-dialog')
                editor.locator('[data-crop=ok]').click();expect(editor).to_have_count(0)
                studio.locator('[data-slop=approve]').click();expect(studio.locator('[data-slop=publish]')).to_be_visible()
                studio.locator('[data-slop=publish]').click();expect(studio.get_by_role('heading',name='SLOP published')).to_be_visible()
                wizard_release(review)

                # The whole wizard: REAL from an extraction the owner edits, a proposal written by the owner and one asked to the model,
                # the choice, premise and prompt corrected before the second confirmation, the generation and the review.
                first=real('browser-wizard-'+name,gallery=gallery);second=real('browser-wizard-'+name,gallery=gallery);generated+=[first['id'],second['id']]
                page.reload()
                controls=page.locator('#slop-auto-controls')
                expect(controls.locator('.slop-wizard-steps [aria-current=step]')).to_have_text('2. REAL')
                controls.locator('#slop-auto-size').fill('1');controls.locator('[data-auto=preview]').click()
                expect(controls.locator('[data-select-real]:checked')).to_have_count(1)
                for box in controls.locator('[data-select-real]').all(): box.uncheck() if box.is_checked() else None
                controls.locator(f'[data-select-real="{first["id"]}"]').check()
                controls.locator(f'[data-select-real="{second["id"]}"]').check()
                expect(controls.get_by_role('status').first).to_contain_text('2 REAL scelte')
                controls.locator('[data-auto=to-ideas]').click()
                expect(controls.locator('.slop-wizard-steps [aria-current=step]')).to_have_text('3. Proposte')
                controls.locator(f'[data-own="{first["id"]}"]').fill('La stessa console su un banco di legno, ripresa di lato con luce radente.')
                controls.locator(f'[data-add-own="{first["id"]}"]').click()
                expect(controls.locator(f'[data-real="{first["id"]}"] [data-choose]:checked')).to_have_count(1)
                control([]);controls.locator(f'[data-ask="{second["id"]}"]').click()
                expect(controls.locator(f'[data-real="{second["id"]}"] [data-choose]')).to_have_count(2,timeout=20000)
                assert confirmations[-1].startswith('Chiedere proposte per «') and len(control())==1
                controls.locator(f'[data-real="{second["id"]}"] [data-choose]').first.check()
                expect(controls.locator('[data-chosen-count]')).to_contain_text('Proposte scelte: 2')
                page.screenshot(path=str(folder/(name+'-ideas.png')),full_page=True)
                controls.locator('[data-auto=to-choice]').click()
                expect(controls.locator('.slop-wizard-chosen li')).to_have_count(2)
                control([]);controls.locator('[data-auto=prepare]').click()
                assert 'Massimo 2 chiamate' in confirmations[-1]
                expect(controls.locator('[data-premise="0"]')).to_be_visible(timeout=30000)
                expect(controls.locator('.slop-wizard-steps [aria-current=step]')).to_have_text('5. Prompt')
                controls.locator('[data-premise="0"]').fill('Una console d’epoca su un banco di legno, mai fotografata così.')
                controls.locator('[data-premise="0"]').blur()
                expect(controls.locator('.slop-auto-notice')).to_contain_text('Premessa salvata')
                batch=call('auto')[1]['batch']
                assert batch['processes'][0]['premise']=='Una console d’epoca su un banco di legno, mai fotografata così.'
                assert len(control())==2  # one prompt call per chosen proposal
                control([None,{'evaluation':'accept'},None,{'evaluation':'accept'}])
                controls.locator('[data-auto=start]').click()
                assert 'Generare 2 SLOP' in confirmations[-1]
                expect(controls.locator('.slop-wizard-steps [aria-current=step]')).to_have_text('7. Revisione',timeout=30000)
                expect(studio.locator('[data-image]')).to_have_count(2,timeout=20000)
                generated+=[i['id'] for i in load(batch)['images']]
                evaluation=[r for r in control() if r['path']=='/v1/responses'][0]['body']
                assert json.loads(evaluation['input'][0]['content'][0]['text'])['premise']=='Una console d’epoca su un banco di legno, mai fotografata così.'
                expect(studio.get_by_alt_text('Originale SLOP intero').first).to_be_visible()
                page.screenshot(path=str(folder/(name+'-review.png')),full_page=True)
                studio.locator('[data-slop=frame]').first.click();editor=page.locator('.crop-dialog')
                expect(editor.get_by_role('heading', name='Inquadratura 4:5')).to_be_visible()
                editor.locator('[data-crop=ok]').click();expect(editor).to_have_count(0)
                expect(studio.locator('[data-slop=approve]').first).to_be_enabled(timeout=20000)
                studio.locator('[data-slop=approve]').first.click();expect(studio.locator('[data-slop=publish]').first).to_be_visible()
                wizard_release(batch)
                assert errors==[],errors
            finally:
                context.close()
                state=call('auto')[1]
                if state['batch'] and state['batch']['gallery_id']==gallery:
                    try:wizard_release(state['batch'])
                    except AssertionError:pass
                remove(generated)
        browser.close()
finally:call('/settings',old,method='PUT',library=True)
print('SLOP wizard desktop/mobile: REAL, proposals, choice, editable prompts, generation, review, exceptions and owner acceptance passed.')
