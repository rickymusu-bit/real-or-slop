"""Browser E2E against the real local Worker with its fake outbound provider."""
import io
import json
import shutil
import os
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright, expect

base=os.environ['ROS_TEST_BASE']
token=os.environ['ROS_TEST_TOKEN']
folder=Path('artifacts/editorial-browser')
folder.mkdir(parents=True,exist_ok=True)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
    try:
        for name,width,height in [('desktop',1440,1000),('mobile',390,844)]:
            context=browser.new_context(viewport={'width':width,'height':height},http_credentials={'username':'admin','password':token})
            page=context.new_page()
            errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            dialog_answers={'cancel':False}
            page.on('dialog',lambda dialog:dialog.dismiss() if dialog_answers['cancel'] else dialog.accept())
            page.goto(base+'admin')
            expect(page.locator('.admin-dashboard')).to_be_visible()
            assert not page.locator('main').evaluate("el=>el.classList.contains('admin-bootstrapping')")
            expect(page.locator('#workspace-topic-form input[name=title]')).to_have_attribute('placeholder','Es. Vita quotidiana nei mercati di quartiere')
            expect(page.locator('#admin-overview')).to_be_visible()
            expect(page.locator('#editorial-workspace')).to_be_hidden()
            expect(page.locator('#admin-stat-mode')).to_contain_text('Demo')
            page.screenshot(path=str(folder/(name+'-overview.png')),full_page=True)
            page.get_by_role('button',name='Impostazioni',exact=True).click()
            expect(page.locator('#game-catalog-form')).to_be_visible()
            budget=page.locator('#intel-budget')
            expect(budget).to_contain_text('Budget operazioni AI')
            before_budget=page.request.get(base+'api/admin/editorial/intelligence').json()['budget']
            dialog_answers['cancel']=True
            budget.locator('[data-intel=reset-budget]').click()
            assert page.request.get(base+'api/admin/editorial/intelligence').json()['budget']['period_id']==before_budget['period_id']
            dialog_answers['cancel']=False
            budget.locator('[data-intel=reset-budget]').click()
            expect(page.locator('#intel-status')).to_contain_text('Budget reimpostato')
            after_budget=page.request.get(base+'api/admin/editorial/intelligence').json()['budget']
            assert after_budget['remaining_usd']==5 and after_budget['used_usd']==0
            assert after_budget['lifetime_usd']==before_budget['lifetime_usd']
            assert after_budget['period_id']!=before_budget['period_id']
            page.reload()
            expect(budget.locator('[data-intel=reset-budget]')).to_be_enabled()
            assert page.request.get(base+'api/admin/editorial/intelligence').json()['budget']['period_id']==after_budget['period_id']
            budget.locator('summary').click()
            budget.screenshot(path=str(folder/(name+'-budget-reset.png')))
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),name+' budget has horizontal overflow'
            page.get_by_role('button',name='Argomenti',exact=True).click()
            expect(page.locator('#workspace-topic-form button[type=submit]')).to_be_enabled()
            discovery=page.locator('#intel-topic-discovery')
            expect(page.locator('#intel-topic-memory')).to_contain_text('Memoria in popolamento')
            expect(discovery).to_contain_text('Qualità e copertura non validate')
            page.locator('[data-intel=toggle-discovery]').click()
            expect(page.locator('[data-intel=toggle-discovery]')).to_have_text('Disattiva Topic Discovery')
            excluded=discovery.locator('article').filter(has_text='Remote incoherent proposal')
            expect(excluded.locator('[data-intel=accept]')).to_be_disabled()
            expect(excluded).to_contain_text('non ammissibile')
            expect(discovery.locator('article').filter(has_text='Historical title-only suggestion').locator('[data-intel=accept]')).to_be_disabled()
            assert '%' not in discovery.inner_text(), 'Semantic distance was presented as a quality percentage'
            discovery.evaluate("el=>el.scrollIntoView({block:'start'})")
            page.screenshot(path=str(folder/(name+'-grounded-discovery.png')))
            excluded.screenshot(path=str(folder/(name+'-excluded-topic.png')))
            page.locator('[data-intel=toggle-discovery]').click()
            expect(page.locator('[data-intel=toggle-discovery]')).to_have_text('Attiva Topic Discovery')
            page.get_by_role('button',name='Produzione immagini',exact=True).click()
            formats=page.locator('#intel-format-audit')
            formats.locator('summary').click()
            unknown=page.locator('#intel-format-unknown article').filter(has_text='legacy-'+name)
            unknown.locator('[data-intel=geometry]').click()
            expect(page.locator('#intel-status')).to_contain_text('"orientation_status":"explicit"')
            expect(unknown).to_have_count(0)
            formats.screenshot(path=str(folder/(name+'-exif-audit.png')))
            page.get_by_role('button',name='Argomenti',exact=True).click()
            form=page.locator('#workspace-topic-form')
            # #78: title-only first shows an editable private proposal. Reload can resume it.
            draft_title='Browser ambiguous topic '+name
            form.locator('input[name=title]').fill(draft_title)
            form.locator('button[type=submit]').click()
            expect(page.locator('#workspace-description-preview')).to_be_visible()
            expect(form.locator('button[type=submit]')).not_to_be_visible()
            expect(page.locator('#workspace-description-ambiguity')).to_contain_text('does not establish')
            assert draft_title not in page.locator('#workspace-topic-select').inner_text()
            page.screenshot(path=str(folder/(name+'-description-proposal.png')),full_page=True)
            form.screenshot(path=str(folder/(name+'-description-editor.png')))
            page.reload()
            page.locator('#workspace-description-drafts p').filter(has_text=draft_title).get_by_role('button').click()
            expect(form.locator('textarea')).not_to_be_empty()
            form.locator('textarea').fill('The owner has edited and explicitly confirmed this description.')
            form.locator('[data-description=approve]').click()
            expect(page.locator('#workspace-status')).to_contain_text('Embedding calcolato')
            expect(page.locator('#workspace-semantic-form textarea')).to_have_value('The owner has edited and explicitly confirmed this description.')
            cancel_title='Browser cancelled draft '+name
            form.locator('input[name=title]').fill(cancel_title)
            form.locator('button[type=submit]').click()
            expect(page.locator('#workspace-description-preview')).to_be_visible()
            form.locator('[data-description=regenerate]').click()
            expect(page.locator('#workspace-status')).to_contain_text('Nuova proposta pronta')
            form.locator('[data-description=cancel]').click()
            expect(page.locator('#workspace-status')).to_contain_text('Bozza annullata')
            assert cancel_title not in page.locator('#workspace-topic-select').inner_text()
            # Disabled GPT never loses the typed title; a manual description remains usable.
            unavailable='Browser unavailable GPT '+name
            form.locator('input[name=title]').fill(unavailable)
            page.route('**/api/admin/editorial/workspace/topics',lambda route:route.fulfill(status=503,content_type='application/json',body='{"error":"IA admin disabilitata"}'))
            form.locator('button[type=submit]').click()
            expect(page.locator('#workspace-status')).to_contain_text('IA admin disabilitata')
            expect(form.locator('input[name=title]')).to_have_value(unavailable)
            page.unroute('**/api/admin/editorial/workspace/topics')
            form.locator('textarea').fill('A description written entirely by the owner after the unavailable service.')
            form.locator('button[type=submit]').click()
            expect(page.locator('#workspace-status')).to_contain_text('Embedding calcolato')
            # The removal control lives in the Topics view and frees the title of an unused topic.
            removable=page.locator('#workspace-topic-select').input_value()
            remove=page.get_by_role('button',name='Rimuovi argomento inutilizzato')
            expect(remove).to_be_visible()
            remove.click()
            expect(page.locator('#workspace-status')).to_contain_text('rimosso')
            assert page.locator('#workspace-topic-select option[value="'+removable+'"]').count()==0
            form.locator('input[name=title]').fill('Browser photographic topic '+name)
            form.locator('textarea').fill('Photographs of everyday work in a coastal town, with visible human activity.')
            form.locator('button[type=submit]').click()
            expect(page.locator('#workspace-status')).to_contain_text('Embedding calcolato')
            topic=page.locator('#workspace-topic-select').input_value()
            semantic=page.locator('#workspace-semantic-form')
            semantic.locator('textarea').fill('Visible everyday work in a coastal town, including early morning market activity.')
            semantic.locator('button').click()
            expect(page.locator('#workspace-status')).to_contain_text('Stato embedding: ready')
            page.get_by_role('button',name='Produzione immagini',exact=True).click()
            link=page.locator('#workspace-link-form')
            link.locator('textarea[name=source_urls]').fill('https://example.org/'+name+'/photo.jpg\nhttps://example.org/'+name+'/photo2.jpg')
            link.locator('button').click()
            expect(page.locator('#workspace-link-feedback')).to_contain_text('2 link registrati')
            link.locator('textarea[name=source_urls]').fill('https://example.org/'+name+'/photo.jpg')
            link.locator('button').click()
            expect(page.locator('#workspace-link-feedback')).to_contain_text('1 già presenti')
            assert page.locator('#workspace-proposals .workspace-proposal').count()==2
            files=[]
            for index,size in enumerate([(180,320),(900,180)]):
                buffer=io.BytesIO()
                Image.new('RGB',size,(35+index*100,45 if name=='desktop' else 95,180)).save(buffer,'PNG')
                files.append({'name':name+str(index)+'.png','mimeType':'image/png','buffer':buffer.getvalue()})
            page.locator('#workspace-upload-form input[type=file]').set_input_files(files)
            page.locator('#workspace-upload-form button').click()
            expect(page.locator('#workspace-status')).to_contain_text('2 fotografie consegnate')
            ranking=page.locator('#intel-ranking details').first
            ranking.locator('summary').click()
            expect(ranking.locator('article')).to_have_count(2)
            ranking.locator('[data-intel=profile]').first.click()
            expect(page.locator('#intel-status')).to_contain_text('Operazione registrata')
            expect(ranking).to_have_attribute('open','')
            ranking.locator('[data-intel=relevance]').first.click()
            expect(page.locator('#intel-status')).to_contain_text('mismatch')
            expect(ranking).to_have_attribute('open','')
            # Review only the selected topic's uploaded photo through the existing single queue.
            page.get_by_role('button',name='Revisione',exact=True).click()
            expect(page.locator('#visual-queue')).to_be_visible()
            page.locator('#inbox-origin').select_option('REAL')
            page.locator('#refresh-review').click()
            expect(page.locator('.inbox-selected-image')).to_be_visible()
            page.wait_for_function("document.querySelector('.inbox-selected-image')?.naturalWidth > 0")
            geometry=page.locator('.inbox-selected-image').evaluate("img=>({natural:img.naturalWidth/img.naturalHeight,fit:getComputedStyle(img).objectFit})")
            assert geometry['fit']=='contain',geometry
            assert geometry['natural'] in [180/320,900/180],geometry
            voted_title=page.locator('#visual-queue h2').inner_text()
            page.locator('[data-visual-decision=approved]').click()
            expect(page.locator('#review-message')).to_contain_text('Approvata')
            page.get_by_role('button',name='Produzione immagini',exact=True).click()
            preferences=page.locator('#intel-preference-audit')
            preferences.locator('summary').click()
            page.locator('#intel-preference-origin').select_option('REAL')
            expect(page.locator('#intel-preference-snapshots article').first).to_contain_text('REAL')
            page.locator('[data-intel=snapshot-detail]').first.click()
            expect(page.locator('#intel-snapshot-detail')).to_contain_text('"origin": "REAL"')
            expect(page.locator('#intel-snapshot-detail')).to_contain_text('"sources"')
            preferences.screenshot(path=str(folder/(name+'-preference-history.png')))
            # Voted image disappears from ranking and SLOP capacity updates without reloading.
            expect(page.locator('#intel-overview')).to_contain_text('1 sulla base dei voti correnti')
            page.locator('[data-intel=plan]').click()
            expect(page.locator('#intel-prompts')).to_contain_text('8 prompt congelati')
            page.locator('[data-intel=generate]').first.click()
            expect(page.locator('#intel-status')).to_contain_text('pending')
            expect(page.locator('#intel-overview')).to_contain_text('0 sulla base dei voti correnti')
            page.locator('[data-intel=manual-finished]').click()
            expect(page.locator('[data-intel=search]')).to_be_enabled()
            page.locator('[data-intel=search]').click()
            expect(page.locator('#intel-status')).to_contain_text('Operazione registrata')
            # Persisted topic text and Discovery setting survive navigation/refresh.
            page.reload()
            page.get_by_role('button',name='Argomenti',exact=True).click()
            page.locator('#workspace-topic-select').select_option(topic)
            expect(page.locator('#workspace-semantic-form textarea')).to_have_value('Visible everyday work in a coastal town, including early morning market activity.')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),name+' has horizontal page overflow'
            # Navigation is intentionally horizontally scrollable on mobile: hidden menu buttons
            # may lie beyond the viewport, but they must not expand the document width.
            overflow=page.locator('body *').evaluate_all("els=>els.filter(e=>e.getBoundingClientRect().right>innerWidth+1 && !e.closest('.admin-navigation')).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,80)}))")
            page.screenshot(path=str(folder/(name+'-layout.png')),full_page=True)
            assert not overflow,json.dumps(overflow,ensure_ascii=False)
            page.screenshot(path=str(folder/(name+'.png')),full_page=True)
            page.locator('#editorial-intelligence').scroll_into_view_if_needed()
            page.screenshot(path=str(folder/(name+'-dashboard.png')))
            page.get_by_role('button',name='Revisione',exact=True).click()
            def admit(title,origin):
                page.locator('#inbox-origin').select_option(origin)
                page.locator('#inbox-state').select_option('approved')
                page.get_by_role('button',name='Valuta '+('REAL' if origin=='REAL' else 'SLOP')+': '+title,exact=True).click()
                page.get_by_text('Verifica origine e diritti per il gioco',exact=True).click()
                admission=page.locator('#cycle-admission')
                for field,value in {'cycle_id':'browser-'+name,'author':'Fixture owner','source_url':'https://example.invalid/'+name+'/'+origin,
                                    'license_url':'https://creativecommons.org/publicdomain/zero/1.0/',
                                    'evidence':'Synthetic test fixture only; no documentary claim about a real photograph.',
                                    'explanation':'Local fixture for the browser publication test.'}.items():
                    admission.locator('[name='+field+']').fill(value)
                admission.locator('select').select_option('fixture')
                for checkbox in admission.locator('input[type=checkbox]').all():checkbox.check()
                admission.locator('#cycle-admit').click()
                expect(page.locator('#review-message')).to_contain_text('Ammessa')
            admit(voted_title,'REAL')
            page.locator('#inbox-origin').select_option('AI')
            page.locator('#inbox-state').select_option('pending')
            slop_title='Studio sintetico Browser photographic topic '+name
            page.get_by_role('button',name='Valuta SLOP: '+slop_title,exact=True).click()
            expect(page.locator('[data-visual-decision=approved]')).to_be_enabled()
            page.locator('[data-visual-decision=approved]').click()
            expect(page.locator('#review-message')).to_contain_text('Approvata')
            admit(slop_title,'AI')
            page.get_by_role('button',name='Pubblicazione',exact=True).click()
            expect(page.locator('.admin-publication-area')).to_be_visible()
            page.locator('#publication-cycle').fill('browser-'+name)
            page.locator('#cycle-state').click()
            expect(page.locator('#cycle-state-result')).to_contain_text('1 REAL e 1 SLOP')
            page.locator('#cycle-publish').click()
            expect(page.locator('#cycle-state-result')).to_contain_text('Pubblicate 1 REAL e 1 SLOP')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),name+' publication has horizontal overflow'
            page.locator('#cycle-state-result').screenshot(path=str(folder/(name+'-publication.png')))
            page.get_by_role('button',name='Produzione immagini',exact=True).click()
            link.locator('textarea[name=source_urls]').fill('https://commons.wikimedia.org/wiki/File:OwnerLink'+name.title()+'.jpg')
            link.locator('button').click()
            expect(page.locator('#workspace-link-feedback')).to_contain_text('1 link registrati')
            page.locator('#workspace-proposals [data-workspace-acquire]').click()
            expect(page.locator('#workspace-acquire-status')).to_contain_text('Fotografia acquisita')
            expect(page.locator('#workspace-proposals')).to_contain_text('acquisita')
            assert not errors,errors
            context.close()
            print('Editorial browser E2E passed: '+name)
    finally:
        browser.close()
