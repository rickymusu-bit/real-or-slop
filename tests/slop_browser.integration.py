"""Gallery pipeline on desktop/mobile: all call gates, scenes, masks, owner acceptance and final game copies."""
import re,shutil,time
from playwright.sync_api import sync_playwright,expect
from editorial_helpers import *
folder=Path('artifacts/slop-browser');folder.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
    for name,options in [('desktop',{'viewport':{'width':1280,'height':900}}),('mobile',p.devices['Pixel 7'])]:
        gallery=make_gallery('Pipeline browser '+name)['id'];real('pipeline-browser-a-'+name,gallery=gallery);real('pipeline-browser-b-'+name,gallery=gallery)
        context=browser.new_context(**options,http_credentials={'username':'owner','password':TOKEN});page=context.new_page();errors=[];dialogs=[];dismiss=[True]
        page.on('pageerror',lambda e:errors.append(str(e)))
        def answer(dialog):
            dialogs.append(dialog.message)
            if dismiss[0]:dismiss[0]=False;dialog.dismiss()
            else:dialog.accept()
        page.on('dialog',answer)
        try:
            control([{'delay':4} for _ in range(2)]+[{'delay':1.2} for _ in range(8)]);page.goto(BASE+'/admin/gallerie/'+gallery+'/slop');root=page.locator('.pipeline')
            expect(root.get_by_role('heading',name='1. Prepare the gallery')).to_be_visible()
            expect(root.locator('[data-action=index]')).to_have_count(0)
            expect(root.locator('[data-action=refresh-parameters], [data-action=profile]')).to_have_count(0)
            expect(root.locator('[data-panel=parameters] input, [data-panel=parameters] textarea, [data-panel=parameters] select')).to_have_count(0)
            diagram=page.request.get(BASE+'/docs/pipeline-slop.svg');assert diagram.status==200
            assert 'Select the REAL photos' in diagram.text() and 'separately confirmed' in diagram.text()
            expect(root.locator('[data-source]').first).to_be_disabled()  # Not yet prepared.
            expect(root.locator('[data-selection-count]')).to_contain_text('0 selected')
            root.locator('[data-action=prepare]').click();assert control()==[]
            with page.expect_response(lambda r:r.url.endswith('/prepare') and r.request.method=='POST') as prepared:
                root.locator('[data-action=prepare]').click()
            assert len(prepared.value.json()['jobs'])==2
            overlay=page.get_by_role('dialog',name='Processing photo')
            expect(overlay).to_be_visible()
            expect(overlay).to_contain_text('Preparing REAL descriptions and parameters')
            assert overlay.evaluate('(dialog) => dialog.matches(":modal")')
            assert root.locator('button:enabled, input:enabled, textarea:enabled, select:enabled').count()==0
            page.keyboard.press('Escape');expect(overlay).to_be_visible()
            page.keyboard.press('Tab')
            assert not root.evaluate('(element) => element.contains(document.activeElement)')  # Tab may focus browser chrome, never the blocked page.
            # A click on the underlying navigation cannot leave the page while the paid jobs run.
            href=page.url;box=page.locator('[data-gallery-return]').bounding_box()
            page.mouse.click(box['x']+box['width']/2,box['y']+box['height']/2)
            assert page.url==href and overlay.is_visible()
            page.screenshot(path=str(folder/(name+'-parameters-progress.png')),full_page=True)
            # Reload observes the same paid operations, without another confirmation or paid POST.
            confirmed=len(dialogs);page.reload()
            expect(overlay).to_be_visible();expect(overlay).to_contain_text('Observing paid operations already queued')
            assert len(dialogs)==confirmed
            expect(overlay).to_have_count(0,timeout=30000)
            # Explicit subset selection is visible and updates the action without a refresh.
            choices=root.locator('[data-source]');expect(choices).to_have_count(2)
            expect(root.locator('[data-panel=parameters] input, [data-panel=parameters] textarea, [data-panel=parameters] select')).to_have_count(0)
            expect(choices.first).to_be_enabled()
            expect(root.locator('[data-action=plan]')).to_be_disabled()
            expect(root.locator('[data-selection-count]')).to_contain_text('0 selected')
            choices.first.check();expect(root.locator('[data-action=plan]')).to_contain_text('Prepare 1 scene')
            expect(root.locator('[data-all]')).to_have_js_property('indeterminate',True)
            choices.first.uncheck();expect(root.locator('[data-action=plan]')).to_be_disabled()
            root.locator('[data-all]').check();expect(root.locator('[data-selection-count]')).to_contain_text('2 selected')
            root.locator('[data-action=clear-selection]').click();expect(choices.first).not_to_be_checked()
            expect(root.locator('[data-action=plan]')).to_be_disabled()
            # Keep unsaved fields intact when choosing a source.
            root.get_by_text('Rules and probabilities',exact=True).click()
            root.locator('[data-rules]').fill('Unsaved rules stay visible while selecting.')
            choices.first.check();expect(root.locator('[data-rules]')).to_have_value('Unsaved rules stay visible while selecting.')
            first_id=choices.first.get_attribute('data-source');second_id=choices.nth(1).get_attribute('data-source')
            # Sorting moves existing cards without losing selections or any unsaved fields.
            ordering=root.get_by_role('combobox',name='Sort REAL by',exact=True)
            expect(ordering).to_have_value('date_desc')
            order=lambda:choices.evaluate_all('(inputs)=>inputs.map(input=>input.dataset.source)')
            sources=page.request.get(BASE+'/api/admin/pipeline/'+gallery).json()['sources']
            assert [r['id'] for r in sorted(sources,key=lambda r:r['created_at'],reverse=True)]==[first_id,second_id]
            expect(root.locator('[data-source-card] time')).to_have_count(2)
            for source in sources:assert source['title'] not in root.locator('[data-source-grid]').inner_text()
            expect(root.locator('[data-source-card] [title]')).to_have_count(0)
            for mode,expected in [('date_asc',[second_id,first_id]),('approved_asc',[first_id,second_id]),('approved_desc',[first_id,second_id]),('date_desc',[first_id,second_id])]:
                ordering.select_option(mode)
                assert order()==expected
                expect(root.locator(f'[data-source="{first_id}"]')).to_be_checked()
                expect(root.locator('[data-rules]')).to_have_value('Unsaved rules stay visible while selecting.')
                expect(root.locator('[data-selection-count]')).to_contain_text('1 selected')
            assert len(control())==2  # Sorting is local and never sends model calls.

            root.locator('[data-action=refresh]').click()
            expect(root.locator(f'[data-source="{first_id}"]')).to_be_checked()
            expect(root.locator('[data-source-sort]')).to_have_value('date_desc')
            page.screenshot(path=str(folder/(name+'-real-selection.png')),full_page=True)
            assert len(control())==2 and all(x['body']['text']['format']['name']=='pipeline_profile' for x in control())
            with page.expect_request(lambda r:r.url.endswith('/plan') and r.method=='POST') as planning:
                root.locator('[data-action=plan]').click()
            assert planning.value.post_data_json['ids']==[first_id]
            assert planning.value.post_data_json['max_calls']==1
            expect(overlay).to_be_visible();expect(overlay).to_contain_text('Preparing English scenes')
            expect(overlay).to_have_count(0,timeout=30000)
            expect(root.locator('[data-action=generate]')).to_have_count(1,timeout=30000)
            expect(root.locator(f'[data-source="{first_id}"]')).to_be_disabled()
            expect(root.locator(f'[data-source="{second_id}"]')).to_be_enabled()
            expect(root.locator('[data-selection-count]')).to_contain_text('0 selected')
            root.locator('[data-all]').check()  # Selects only the remaining ready REAL.
            expect(root.locator('[data-selection-count]')).to_contain_text('1 selected')
            with page.expect_request(lambda r:r.url.endswith('/plan') and r.method=='POST') as planning:
                root.locator('[data-action=plan]').click()
            assert planning.value.post_data_json['ids']==[second_id]
            expect(overlay).to_have_count(0,timeout=30000)
            expect(root.locator('[data-action=generate]')).to_have_count(2,timeout=30000)
            assert len(control())==4
            # Editing a scene is free and saves typed fields, not a JSON document.
            card=root.locator('[data-job-card]').first;card.locator('details > summary').first.click()
            card.locator('[data-axis=environment]').fill('An ordinary muted gray tabletop with stable support.')
            card.locator('[data-action=scene]').click()
            expect(root.locator('[data-action=generate-all]')).to_be_enabled()
            expect(root.locator('[data-action=generate]')).to_have_count(2)
            assert len(control())==4
            # Generating also saves edits still visible in a scene before asking for the paid call.
            second_card=root.locator('[data-job-card]').nth(1);second_card.locator('details > summary').first.click()
            second_card.locator('[data-axis=environment]').fill('Unsaved reviewed scene: stable support on a blue desk.')
            root.locator('[data-action=generate-all]').click()
            expect(overlay).to_be_visible();expect(overlay).to_contain_text('Generating SLOP images')
            expect(overlay).to_have_count(0,timeout=30000)
            expect(root.locator('[data-action=evaluate]')).to_have_count(2,timeout=30000)
            assert len(control())==6
            image_calls=[x for x in control() if x['path']=='/v1/images/generations'];assert len(image_calls)==2
            assert all('image' not in x['body'] and 'mask' not in x['body'] for x in image_calls)
            assert any('Unsaved reviewed scene' in x['body']['prompt'] for x in image_calls)
            root.locator('[data-action=evaluate-all]').click()
            expect(overlay).to_be_visible();expect(overlay).to_contain_text('Evaluating full images')
            expect(overlay).to_have_count(0,timeout=30000)
            expect(root.locator('[data-action=edit]')).to_have_count(2,timeout=30000)
            assert len(control())==8
            reviews=[x for x in control() if x['body'].get('text',{}).get('format',{}).get('name')=='pipeline_review']
            assert all('Write every generated field in English' in x['body']['instructions'] for x in reviews)
            page.wait_for_timeout(500);assert len(control())==8
            # A mask is concretely previewed before its separate one-call confirmation.
            card=root.locator('[data-job-card]').first
            card.get_by_text('Suggestion: Small local detail.',exact=True).click()
            card.locator('[data-action=edit]').click();expect(page.locator('.pipeline-mask[open]')).to_be_visible()
            page.screenshot(path=str(folder/(name+'-mask.png')),full_page=True)
            page.locator('[data-mask-cancel]').click();assert len(control())==8
            # The free action refreshes the cards after cancelling: wait before toggling the new details.
            expect(root.locator('[data-action=refresh]')).to_be_enabled()
            card=root.locator('[data-job-card]').first;card.get_by_text('Suggestion: Small local detail.',exact=True).click();card.locator('[data-action=edit]').click();page.locator('[data-mask-confirm]').click()
            expect(overlay).to_be_visible();expect(overlay).to_contain_text('Applying confirmed local correction')
            expect(overlay).to_have_count(0,timeout=30000)
            expect(root.get_by_alt_text('Before correction')).to_be_visible(timeout=30000)
            assert len(control())==9 and control()[-1]['path']=='/v1/images/edits'
            assert control()[-1]['body']['files']['image[]']['size']==control()[-1]['body']['files']['mask']['size']
            with page.expect_request(lambda r:'/copy?' in r.url and 'if_missing=1' in r.url and r.method=='POST'):
                root.locator('[data-job-card]').first.locator('[data-action=accept]').click()
            expect(overlay).to_have_count(0,timeout=30000)
            accepted=root.locator('[data-accepted-image]');expect(accepted).to_have_count(1)
            accepted_id=accepted.get_attribute('data-accepted-image')
            expect(root.locator('[data-approved-count]')).to_have_text(['0 approved SLOP','0 approved SLOP'])
            root.get_by_text('Gallery composition',exact=True).click()
            expect(root.get_by_role('columnheader',name='Observed in SLOP',exact=True)).to_be_visible()
            expect(root.locator('[data-action=observe-all], [data-action=observe-image]')).to_have_count(0)
            assert len(control())==9  # Accepting and preparing the copy do not observe the original yet.
            expect(accepted.locator('[data-action=copy]')).to_have_count(0)
            expect(root.get_by_role('heading',name='4. Final review and approval')).to_be_visible()
            prepared=call('/'+accepted_id,library=True)[1]
            assert prepared['copy']['crop']['format']=='4:5' and abs(prepared['copy']['width']/prepared['copy']['height']-.8)<.02
            assert prepared['treatment'] and not prepared['treatment']['off'] and prepared['treatment']['applied']
            # Final review still edits treatment and framing; reopening must preserve the saved copy and choices.
            accepted.locator('[data-action=treatment]').click()
            treatment=page.get_by_role('dialog',name='Game copy treatment')
            expect(treatment).to_be_visible()
            treatment.locator('[data-key=monochrome]').select_option('black-and-white')
            treatment.locator('[data-treatment=ok]').click();expect(treatment).to_have_count(0)
            expect(root.locator('[data-action=refresh]')).to_be_enabled()
            changed=call('/'+accepted_id,library=True)[1];assert changed['treatment']['settings']['monochrome']=='black-and-white'
            accepted.locator('[data-action=frame]').click()
            framing=page.get_by_role('dialog',name='Game copy framing');expect(framing).to_be_visible()
            framing.locator('[data-crop=cancel]').click();expect(framing).to_have_count(0)
            expect(root.locator('[data-action=refresh]')).to_be_enabled()
            page.reload();expect(accepted).to_have_count(1)
            expect(root.locator('[data-action=refresh]')).to_be_enabled()
            preserved=call('/'+accepted_id,library=True)[1]
            assert preserved['revision']==changed['revision'] and preserved['copy']['sha256']==changed['copy']['sha256']
            assert preserved['treatment']==changed['treatment'] and len(control())==9
            expect(accepted.locator('[data-action=approve]')).to_be_enabled()
            confirmations=len(dialogs)
            accepted.locator('[data-action=approve]').click()
            expect(overlay).to_be_visible();expect(overlay).to_contain_text('observing parameters')
            expect(overlay).to_have_count(0,timeout=30000);expect(accepted).to_have_count(0)
            assert len(dialogs)==confirmations+1  # Only the existing approval check, no observation confirmation.
            assert len(control())==10 and control()[-1]['body']['text']['format']['name']=='pipeline_observation'
            sent=json.loads(control()[-1]['body']['input'][0]['content'][0]['text'])
            assert set(sent)=={'width','height','known_categories'},sent
            expect(root.locator('[data-pipeline-notice]')).to_contain_text('Find it in the gallery')
            status=call('/'+accepted_id,library=True)[1];assert status['status']=='approved'
            expect(root.locator('[data-approved-count]')).to_have_text(['1 approved SLOP','0 approved SLOP'])
            if not root.locator('[data-rules]').is_visible():root.get_by_text('Rules and probabilities',exact=True).click()
            root.locator('[data-rules]').fill('Unsaved approved-count ordering.')
            root.locator(f'[data-source="{first_id}"]').check()
            for mode,expected in [('approved_asc',[second_id,first_id]),('approved_desc',[first_id,second_id]),('date_asc',[second_id,first_id]),('date_desc',[first_id,second_id])]:
                root.locator('[data-source-sort]').select_option(mode)
                assert choices.evaluate_all('(inputs)=>inputs.map(input=>input.dataset.source)')==expected
                expect(root.locator(f'[data-source="{first_id}"]')).to_be_checked()
                expect(root.locator('[data-rules]')).to_have_value('Unsaved approved-count ordering.')
            assert len(control())==10

            page.goto(BASE+'/admin?gallery='+gallery)
            expect(page.locator('.library-card[data-id="'+accepted_id+'"]')).to_be_visible()
            expect(page.locator('#db-images [data-approved-count]')).to_have_count(0)
            assert call('/'+accepted_id+'/publish',{'revision':status['revision']},library=True)[0]==200
            assert call('/'+accepted_id,library=True)[1]['status']=='published'
            page.goto(BASE+'/admin/gallerie/'+gallery+'/slop');expect(root.get_by_role('heading',name='1. Prepare the gallery')).to_be_visible();expect(root.locator('[data-accepted-image]')).to_have_count(0)
            assert len(control())==10 and not errors,errors
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            page.screenshot(path=str(folder/(name+'-pipeline.png')),full_page=True)
            assert any('Prepare English scenes? Maximum 1 paid call' in d for d in dialogs),dialogs
            # A failed/uncertain operation releases the page, reports attention and is not paid again on reload.
            control([{'delay':1,'status':503}])
            root.locator('[data-action=evaluate]').first.click()
            expect(overlay).to_be_visible();expect(overlay).to_contain_text('Evaluating full image')
            expect(overlay).to_have_count(0,timeout=30000)
            expect(root.locator('[data-pipeline-notice]')).to_contain_text('need attention')
            assert len(control())==1
            page.reload();expect(root.get_by_role('heading',name='1. Prepare the gallery')).to_be_visible()
            expect(overlay).to_have_count(0)
            assert len(control())==1 and not errors,errors
            # The modal retains free cancellation of queued calls while already acquired calls finish.
            cancel_gallery=make_gallery('Cancel progress '+name)['id']
            for n in range(6):real('cancel-progress-'+name+'-'+str(n),gallery=cancel_gallery)
            control([{'delay':2} for _ in range(6)])
            page.goto(BASE+'/admin/gallerie/'+cancel_gallery+'/slop')
            expect(root.get_by_role('heading',name='1. Prepare the gallery')).to_be_visible()
            root.locator('[data-action=prepare]').click();expect(overlay).to_be_visible()
            overlay.get_by_role('button',name='Stop queued requests',exact=True).click()
            expect(overlay).to_have_count(0,timeout=30000)
            expect(root.locator('[data-pipeline-notice]')).to_contain_text('need attention')
            assert len(control())<=3,control()
            assert not errors,errors
            # Gallery detail and bulk approval start observation without a dedicated command or confirmation.
            historical=make_gallery('Automatic observation '+name)['id'];published=[]
            for n in range(3):
                photo=real('auto-observe-'+name+'-'+str(n),gallery=historical)
                sql("UPDATE images SET origin='SLOP',title=NULL,status='new',approved_at=NULL,prompt='Requested scene must not guide observation',model='fake' WHERE id='"+photo['id']+"'")
                published.append(photo['id'])
            real('observation-real-'+name,gallery=historical)
            control([{'delay':4},{'delay':1.2},{'delay':1.2}])
            page.goto(BASE+'/admin?gallery='+historical)
            expect(page.locator('[id^=library-observe], [data-bulk=observe]')).to_have_count(0)
            first=published[0];before=call('/'+first,library=True)[1]
            page.locator('[data-open="'+first+'"]').click()
            detail=page.locator('#library-detail');expect(detail.locator('[data-slop-observation]')).to_contain_text('automatically on approval')
            confirmations=len(dialogs)
            with page.expect_request(lambda r:r.url.endswith('/'+first+'/approve') and r.method=='POST'):
                detail.locator('[data-action=approve]').click()
            expect(overlay).to_be_visible();assert len(dialogs)==confirmations
            page.screenshot(path=str(folder/(name+'-automatic-observation-progress.png')),full_page=True)
            page.reload();expect(overlay).to_be_visible()
            expect(overlay).to_have_count(0,timeout=30000);assert len(dialogs)==confirmations and len(control())==1
            after=call('/'+first,library=True)[1]
            assert after['has_slop_observation'] and after['status']=='approved' and after['revision']==before['revision']+1
            assert call('/'+first+'/publish',{'revision':after['revision']},library=True)[0]==200
            assert len(control())==1
            for photo_id in published[1:]:page.locator('[data-select="'+photo_id+'"]').check()
            with page.expect_request(lambda r:r.url.endswith('/bulk') and r.method=='POST') as approved:
                page.locator('[data-bulk=set-approved]').click()
            assert set(approved.value.post_data_json['ids'])==set(published[1:])
            expect(overlay).to_be_visible();expect(overlay).to_have_count(0,timeout=30000)
            assert len(dialogs)==confirmations and len(control())==3
            for photo_id in published:
                photo=call('/'+photo_id,library=True)[1];assert photo['has_slop_observation']
                if photo['status']=='approved':assert call('/'+photo_id+'/publish',{'revision':photo['revision']},library=True)[0]==200
            assert len(control())==3 and all(x['body']['text']['format']['name']=='pipeline_observation' for x in control())
            page.locator('[data-open="'+first+'"]').click()
            expect(detail.locator('[data-slop-observation]')).to_contain_text('Observed from the full original')
            expect(page.locator('[id^=library-observe], [data-bulk=observe]')).to_have_count(0)
            detail.locator('[data-slop-observation]').scroll_into_view_if_needed()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1') and not errors,errors
            page.screenshot(path=str(folder/(name+'-automatic-observation.png')),full_page=True)
            # Step 4: select only checked copies; approve an exact subset together, then handle partial failures.
            bulk_gallery=make_gallery('Step 4 bulk '+name)['id'];bulk_ids=[]
            for n in range(4):
                photo=real('step4-bulk-'+name+'-'+str(n),gallery=bulk_gallery)
                sql("UPDATE images SET origin='SLOP',title=NULL,status='new',approved_at=NULL,pipeline_scene='{}',prompt='Bulk approval fixture',model='fake' WHERE id='"+photo['id']+"'")
                bulk_ids.append(photo['id'])
            sql("UPDATE images SET copy_key=NULL,copy_sha256=NULL,copy_width=NULL,copy_height=NULL,copy_bytes=NULL,copy_crop=NULL,copy_metrics=NULL WHERE id='"+bulk_ids[3]+"'")
            control([{'delay':2},{'delay':1.2}])
            page.goto(BASE+'/admin/gallerie/'+bulk_gallery+'/slop')
            expect(root.locator('[data-select-image]')).to_have_count(4)
            expect(overlay).to_have_count(0,timeout=30000)
            recovered=call('/'+bulk_ids[3],library=True)[1]
            assert recovered['copy']['crop']['format']=='4:5' and recovered['status']=='new'
            assert control()==[]  # Missing copies resume for free, never by repeating acceptance or generation.
            expect(root.locator('[data-action=approve-selected]')).to_be_disabled()
            expect(root.locator('[data-select-image="'+bulk_ids[3]+'"]')).to_be_enabled()
            root.get_by_text('Rules and probabilities',exact=True).click()
            root.locator('[data-rules]').fill('Unsaved rules survive SLOP selection.')
            root.locator('[data-images-all]').check()
            expect(root.locator('[data-image-selection-count]')).to_contain_text('4 selected · 4 ready · 4 SLOP')
            root.locator('[data-action=clear-image-selection]').click()
            expect(root.locator('[data-action=approve-selected]')).to_be_disabled()
            for photo_id in bulk_ids[:2]:root.locator('[data-select-image="'+photo_id+'"]').check()
            expect(root.locator('[data-images-all]')).to_have_js_property('indeterminate',True)
            expect(root.locator('[data-rules]')).to_have_value('Unsaved rules survive SLOP selection.')
            expect(root.locator('[data-image-observation-limit]')).to_contain_text('at most 2 model calls')
            dismiss[0]=True;root.locator('[data-action=approve-selected]').click()
            expect(root.locator('[data-image-selection-count]')).to_contain_text('2 selected')
            expect(root.locator('[data-action=refresh]')).to_be_enabled()
            assert control()==[]
            root.locator('[data-action=refresh]').click()
            expect(root.locator('[data-select-image="'+bulk_ids[0]+'"]')).to_be_checked()
            expect(root.locator('[data-action=refresh]')).to_be_enabled()
            page.screenshot(path=str(folder/(name+'-step4-selection.png')),full_page=True)
            confirmations=len(dialogs)
            with page.expect_request(lambda r:r.url.endswith('/bulk') and r.method=='POST') as approved:
                root.locator('[data-action=approve-selected]').click()
            assert approved.value.post_data_json['action']=='set-approved'
            assert set(approved.value.post_data_json['ids'])==set(bulk_ids[:2])
            expect(overlay).to_be_visible();expect(overlay).to_have_count(0,timeout=30000)
            expect(root.locator('[data-accepted-image]')).to_have_count(2)
            expect(root.locator('[data-pipeline-notice]')).to_contain_text('2 SLOP approved')
            assert len(dialogs)==confirmations+1 and len(control())==2
            expect(root.locator('[data-unattributed-approved]')).to_contain_text('2 approved or published SLOP')
            for photo_id in bulk_ids[:2]:
                photo=call('/'+photo_id,library=True)[1];assert photo['status']=='approved' and photo['has_slop_observation']
            for photo_id in bulk_ids[2:]:assert call('/'+photo_id,library=True)[1]['status']=='new'
            # A copy removed in another session is rejected by the server without blocking the other selected photo.
            root.locator('[data-images-all]').check()
            sql("UPDATE images SET copy_key=NULL,copy_sha256=NULL,copy_width=NULL,copy_height=NULL,copy_bytes=NULL,copy_crop=NULL,copy_metrics=NULL WHERE id='"+bulk_ids[2]+"'")
            control([{'delay':1.2}]);root.locator('[data-action=approve-selected]').click()
            expect(overlay).to_be_visible();expect(overlay).to_have_count(0,timeout=30000)
            expect(root.locator('[data-pipeline-notice]')).to_contain_text('1 not approved')
            expect(root.locator('[data-pipeline-notice]')).not_to_contain_text('No observation is pending')
            expect(root.locator('[data-accepted-image]')).to_have_count(1)
            expect(root.locator('[data-select-image="'+bulk_ids[2]+'"]')).to_be_enabled(timeout=30000)
            expect(root.locator('[data-action=refresh]')).to_be_enabled()
            assert call('/'+bulk_ids[2],library=True)[1]['copy']
            assert len(control())==1 and call('/'+bulk_ids[2],library=True)[1]['status']=='new'
            assert call('/'+bulk_ids[3],library=True)[1]['status']=='approved'
            assert not errors,errors
            resume_gallery=make_gallery('Resume copy '+name)['id'];orphan=real('resume-copy-'+name,gallery=resume_gallery)
            sql("UPDATE images SET origin='SLOP',title=NULL,status='new',approved_at=NULL,pipeline_scene='{}',copy_key=NULL,copy_sha256=NULL,copy_width=NULL,copy_height=NULL,copy_bytes=NULL,copy_crop=NULL,copy_metrics=NULL WHERE id='"+orphan['id']+"'")
            control([])
            page.route('**/api/admin/library/*/copy?*',lambda route:route.abort('failed'))
            page.goto(BASE+'/admin/gallerie/'+resume_gallery+'/slop')
            expect(root.locator('[data-pending-copy]')).to_have_count(1)
            expect(root.locator('[data-pipeline-notice]')).to_contain_text('Not prepared',timeout=30000)
            expect(root.locator('[data-accepted-image]')).to_have_count(0)
            page.unroute('**/api/admin/library/*/copy?*');page.reload()
            expect(root.locator('[data-accepted-image]')).to_have_count(1,timeout=30000)
            expect(root.locator('[data-pending-copy]')).to_have_count(0)
            assert call('/'+orphan['id'],library=True)[1]['copy'] and control()==[]
        finally:context.close()
    browser.close()
print('Pipeline browser passed on desktop/mobile: blocking paid progress, resume without resubmission, cancellation and failure release, gallery-wide profiles, free scene edits, text-only generation, gated evaluation, concrete mask confirmation, final copy, approval and publication.')
