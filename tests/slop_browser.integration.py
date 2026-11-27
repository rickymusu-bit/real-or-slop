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
            control([{'delay':4} for _ in range(2)]+[{'delay':1.2} for _ in range(7)]);page.goto(BASE+'/admin/gallerie/'+gallery+'/slop');root=page.locator('.pipeline')
            expect(root.get_by_role('heading',name='1. Prepare the gallery')).to_be_visible()
            expect(root.locator('[data-action=index]')).to_have_count(0)
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
            root.locator('[data-action=refresh]').click()
            expect(root.locator(f'[data-source="{first_id}"]')).to_be_checked()
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
            card=root.locator('[data-job-card]').first;card.get_by_text('Suggestion: Small local detail.',exact=True).click();card.locator('[data-action=edit]').click();page.locator('[data-mask-confirm]').click()
            expect(overlay).to_be_visible();expect(overlay).to_contain_text('Applying confirmed local correction')
            expect(overlay).to_have_count(0,timeout=30000)
            expect(root.get_by_alt_text('Before correction')).to_be_visible(timeout=30000)
            assert len(control())==9 and control()[-1]['path']=='/v1/images/edits'
            assert control()[-1]['body']['files']['image[]']['size']==control()[-1]['body']['files']['mask']['size']
            root.locator('[data-job-card]').first.locator('[data-action=accept]').click()
            accepted=root.locator('[data-accepted-image]');expect(accepted).to_have_count(1)
            accepted_id=accepted.get_attribute('data-accepted-image')
            expect(root.locator('[data-generated-count]')).to_have_text(['1 SLOP generated','1 SLOP generated'])
            root.get_by_text('Gallery composition',exact=True).click()
            expect(root.get_by_role('columnheader',name='Observed in SLOP',exact=True)).to_be_visible()
            expect(root.locator('[data-action=observe-all]')).to_have_text('Observe 1 SLOP (1 call)')
            root.locator('[data-action=observe-all]').click()
            expect(overlay).to_be_visible();expect(overlay).to_contain_text('Observing SLOP parameters')
            expect(overlay).to_have_count(0,timeout=30000)
            assert len(control())==10 and control()[-1]['body']['text']['format']['name']=='pipeline_observation'
            sent=json.loads(control()[-1]['body']['input'][0]['content'][0]['text'])
            assert set(sent)=={'width','height','known_categories'},sent
            expect(root.locator('[data-action=observe-all]')).to_be_disabled()
            accepted.locator('[data-action=copy]').click();expect(accepted.locator('[data-action=approve]')).to_be_enabled(timeout=30000)
            accepted.locator('[data-action=approve]').click();expect(accepted).to_have_count(0)
            expect(root.locator('[data-pipeline-notice]')).to_contain_text('Find it in the gallery')
            status=call('/'+accepted_id,library=True)[1];assert status['status']=='approved'
            page.goto(BASE+'/admin?gallery='+gallery)
            expect(page.locator('.library-card[data-id="'+accepted_id+'"]')).to_be_visible()
            expect(page.locator('.library-card[data-id="'+first_id+'"] [data-generated-count]')).to_have_text('1 SLOP generated')
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
        finally:context.close()
    browser.close()
print('Pipeline browser passed on desktop/mobile: blocking paid progress, resume without resubmission, cancellation and failure release, gallery-wide profiles, free scene edits, text-only generation, gated evaluation, concrete mask confirmation, final copy, approval and publication.')
