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
            page.on('dialog',lambda dialog:dialog.accept())
            page.goto(base+'admin')
            expect(page.locator('#workspace-topic-form button')).to_be_enabled()
            form=page.locator('#workspace-topic-form')
            form.locator('input[name=title]').fill('Browser photographic topic '+name)
            form.locator('textarea').fill('Photographs of everyday work in a coastal town, with visible human activity.')
            form.locator('button').click()
            expect(page.locator('#workspace-status')).to_contain_text('Embedding calcolato')
            topic=page.locator('#workspace-topic-select').input_value()
            semantic=page.locator('#workspace-semantic-form')
            semantic.locator('textarea').fill('Visible everyday work in a coastal town, including early morning market activity.')
            semantic.locator('button').click()
            expect(page.locator('#workspace-status')).to_contain_text('Stato embedding: ready')
            link=page.locator('#workspace-link-form')
            link.locator('input[type=url]').fill('https://example.org/'+name+'/photo.jpg')
            link.locator('button').click()
            expect(page.locator('#workspace-status')).to_contain_text('ancora da acquisire')
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
            ranking.locator('summary').click() # refresh replaces details with a closed element
            ranking.locator('[data-intel=relevance]').first.click()
            expect(page.locator('#intel-status')).to_contain_text('mismatch')
            # Review only the selected topic's uploaded photo through the existing single queue.
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
            page.locator('#workspace-topic-select').select_option(topic)
            expect(page.locator('#workspace-semantic-form textarea')).to_have_value('Visible everyday work in a coastal town, including early morning market activity.')
            overflow=page.locator('body *').evaluate_all("els=>els.filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,80)}))")
            page.screenshot(path=str(folder/(name+'-layout.png')),full_page=True)
            assert not overflow,json.dumps(overflow,ensure_ascii=False)
            page.screenshot(path=str(folder/(name+'.png')),full_page=True)
            page.locator('#editorial-intelligence').scroll_into_view_if_needed()
            page.screenshot(path=str(folder/(name+'-dashboard.png')))
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
            page.get_by_text('Pubblicazione del ciclo',exact=True).click()
            page.locator('#publication-cycle').fill('browser-'+name)
            page.locator('#cycle-state').click()
            expect(page.locator('#cycle-state-result')).to_contain_text('1 REAL e 1 SLOP')
            page.locator('#cycle-publish').click()
            expect(page.locator('#cycle-state-result')).to_contain_text('Pubblicate 1 REAL e 1 SLOP')
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'),name+' publication has horizontal overflow'
            page.locator('#cycle-state-result').screenshot(path=str(folder/(name+'-publication.png')))
            assert not errors,errors
            context.close()
            print('Editorial browser E2E passed: '+name)
    finally:
        browser.close()
