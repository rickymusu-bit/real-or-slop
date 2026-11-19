"""Desktop/mobile editorial studio: editable brief, observed loop, full image, manual acceptance and publication."""
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
            source=real('browser-'+name);generated=[]
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
                # A process that ended without a SLOP is shown on top, with its attempts, until the owner closes it.
                stuck_source=real('browser-stuck-'+name);generated.append(stuck_source['id']);stuck=batch(stuck_source['gallery_id'])
                control([None,{'evaluation':'review_needed'}]);assert generate(stuck)[1]['process']['state']=='review_needed'
                page.goto(BASE+'/admin');open_gallery(page,stuck_source['gallery_id'])
                page.get_by_role('link',name='Genera SLOP').click()
                studio=page.locator('#slop-studio')
                card=studio.locator('[data-attention="'+stuck['processes'][0]['id']+'"]')
                expect(card).to_contain_text('il valutatore chiede la tua revisione')
                card.locator(':scope > summary').click();card.locator('details > summary').first.click()
                expect(card.locator('img')).to_be_visible();expect(card.locator('p[lang=en]')).to_be_visible()
                # Refreshing the studio preserves the expanded attempt, including its prompt and evaluation.
                page.locator('[data-gallery-return]').click()
                page.get_by_role('link',name='Genera SLOP').click()
                expect(card.locator('p[lang=en]')).to_be_visible()
                expect(studio.locator('.slop-attention h3')).to_contain_text('Da vedere')
                page.screenshot(path=str(folder/(name+'-attention.png')),full_page=True)
                card.locator('[data-slop=close-process]').click();expect(card).to_have_count(0)
                assert 'Chiudere questo processo' in confirmations[-1]
                assert sql("SELECT state FROM slop_processes WHERE id='"+stuck['processes'][0]['id']+"'")[0]['state']=='closed'
                # The owner can accept critical/minor findings and uncertainty, after a cancellable confirmation.
                review_source=real('browser-review-'+name);generated.append(review_source['id']);review=batch(review_source['gallery_id'])
                control([None,{'evaluation':'review_needed','critical':['A hand has six fingers'],'minor':['Soft focus on the edge'],'uncertainty':['Place cannot be confirmed'],'constraints':False}]);assert generate(review)[1]['process']['state']=='review_needed'
                page.goto(BASE+'/admin');open_gallery(page,review_source['gallery_id'])
                page.get_by_role('link',name='Genera SLOP').click()
                card=studio.locator('[data-attention="'+review['processes'][0]['id']+'"]')
                card.locator(':scope > summary').click()
                control([]);dismiss_next[0]=True;card.locator('[data-slop=accept-process]').click()
                expect(card).to_be_visible();assert control()==[]
                assert all(note in confirmations[-1] for note in ['A hand has six fingers','Soft focus on the edge','Place cannot be confirmed','Massimo 1'])
                card.locator('[data-slop=accept-process]').click();expect(card).to_have_count(0,timeout=20000)
                assert 'Accettare questa candidata' in confirmations[-1] and 'non ha potuto confermare' in confirmations[-1] and len(control())==1
                expect(studio.get_by_role('status').first).to_contain_text('SLOP accettata')
                reviewed=sql("SELECT state,image_id FROM slop_processes WHERE id='"+review['processes'][0]['id']+"'")[0]
                assert reviewed['state']=='accepted' and reviewed['image_id'];generated.append(reviewed['image_id'])
                studio.locator('[data-recent]').select_option(review['id'])
                expect(studio.locator('[data-owner-accepted]')).to_be_visible()
                expect(studio.locator('[data-slop=approve]')).to_be_disabled()
                studio.locator('[data-slop=frame]').click();editor=page.locator('.crop-dialog')
                editor.locator('[data-crop=ok]').click();expect(editor).to_have_count(0)
                studio.locator('[data-slop=approve]').click();expect(studio.locator('[data-slop=publish]')).to_be_visible()
                studio.locator('[data-slop=publish]').click();expect(studio.get_by_role('heading',name='SLOP published')).to_be_visible()
                # Exhausted attempts with minor defects have the same explicit override.
                call('/settings',{'max_generation_attempts':1},method='PUT',library=True)
                minor_gallery=make_gallery('Revisione difetti minori '+name)
                minor_source=real('browser-minor-'+name,gallery=minor_gallery['id']);generated.append(minor_source['id']);minor=batch(minor_source['gallery_id'])
                call('/settings',{'max_generation_attempts':old['max_generation_attempts']},method='PUT',library=True)
                control([None,{'evaluation':'retry_same_prompt','minor':['Visible banding']}]);assert generate(minor)[1]['process']['state']=='exhausted'
                page.goto(BASE+'/admin');open_gallery(page,minor_source['gallery_id'])
                page.get_by_role('link',name='Genera SLOP').click()
                minor_proc=load(minor)['processes'][0]
                card=studio.locator('[data-attention="'+minor_proc['id']+'"]');card.locator(':scope > summary').click()
                control([]);card.locator('[data-slop=accept-process]').click();expect(card).to_have_count(0,timeout=20000)
                assert 'Visible banding' in confirmations[-1] and len(control())==1
                generated.append(load(minor)['images'][0]['id'])
                assert studio.locator(f'[data-recent] option[value="{review["id"]}"]').count() == 0
                studio.locator('[data-manual=prompt]').fill('A credible street photograph in ordinary daylight.')
                studio.locator('[data-manual=tags]').fill('street-scene, 1960s')
                studio.locator('[data-manual=required]').fill('street-scene')
                control([]);studio.locator('[data-slop=manual-draft]').click()
                expect(studio.locator('[data-prompt="0"]')).not_to_have_value('', timeout=20000)
                assert control()==[]  # manual draft has no prompt call and no REAL
                expect(studio.locator('[data-slop=rewrite]')).to_have_count(0)
                studio.locator('[data-brief="0"][data-key=required]').fill('street-scene')
                studio.locator('[data-prompt="0"]').fill('A credible street photograph in ordinary daylight.')
                studio.locator('[data-slop=save]').click();expect(studio.get_by_role('status').first).to_contain_text('salvati')
                control([None,{'evaluation':'retry_same_prompt'},None,{'evaluation':'accept'}])
                studio.locator('[data-slop=images]').click()
                expect(studio.locator('[data-slop=approve]')).to_be_visible(timeout=30000)
                assert len(control())==5  # two images, two evaluations, final tags
                image_id=studio.locator('[data-image]').get_attribute('data-image');generated.append(image_id)
                saved=call('/'+image_id,library=True)[1]
                assert saved['status']=='new' and saved['gallery_id']==minor_source['gallery_id']
                expect(studio.get_by_alt_text('Originale SLOP intero')).to_be_visible()
                expect(studio.get_by_alt_text('Copia di gioco 4:5')).to_be_visible()
                expect(studio.locator('details summary',has_text='Tentativo 2: accept')).to_be_visible()
                page.screenshot(path=str(folder/(name+'-review.png')),full_page=True)
                studio.locator('[data-slop=frame]').click();editor=page.locator('.crop-dialog')
                expect(editor.locator('.crop-format select')).to_have_value('4:5')
                expect(editor.locator('[data-crop-mode] option')).to_have_text(['Ritaglia', 'Adatta alla larghezza'])
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
