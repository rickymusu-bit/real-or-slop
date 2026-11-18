"""Browser-driven automatic loop resumes safely and surfaces mixed outcomes on desktop and mobile."""
import os
import shutil
import re
import time
from pathlib import Path
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
            sql("UPDATE slop_batches SET auto_status='closed' WHERE origin='auto'; UPDATE images SET trashed_from='approved',status='trash' WHERE status<>'trash'")
            source=real('auto-browser-'+name);generated=[];imported=[]
            context=browser.new_context(**options,http_credentials={'username':'owner','password':TOKEN})
            page=context.new_page();errors=[];confirmations=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('dialog',lambda d:(confirmations.append(d.message),d.accept()))
            try:
                control([None, {'delay':1.5}] if name=='desktop' else []);page.goto(BASE+'/admin')
                page.locator('[data-admin-tab=slop]').click()
                page.locator('[data-generation-mode=automatic]').click()
                expect(page.get_by_text('Proposta di generazione',exact=False)).to_have_count(0)
                query=page.locator('[data-auto-query]')
                query.fill('no-match-at-all');expect(page.locator('[data-auto-pick]')).to_have_count(0)
                query.fill(source['title'])
                page.locator('[data-auto-pick]').check()
                expect(page.locator('.slop-auto-picked')).to_contain_text(source['title'])
                if name=='mobile':
                    # Only Wikimedia is stubbed. The imported original, its paid analysis and the SLOP loop use the local Worker.
                    commons_url='https://commons.wikimedia.org/wiki/File:River_bridge.jpg'
                    picture_url=BASE+'/api/admin/library/'+source['id']+'/original'
                    page.route('**/api/admin/library/commons/search?*',lambda route: route.fulfill(json={
                        'files':[{'title':'File:River bridge.jpg','page_url':commons_url,'thumb_url':picture_url,
                                  'preview_url':picture_url,'width':180,'height':120}],'next':None}))
                    def mock_import(route):
                        assert route.request.post_data_json['url']==commons_url
                        raw=io.BytesIO();Image.new('RGB',(180,120),(124,146,197)).save(raw,'PNG')
                        code,item=call('/upload?'+urllib.parse.urlencode({'origin':'REAL','title':'River bridge'}),
                                       raw=raw.getvalue(),library=True)
                        assert code==201,item
                        imported.append(item['id'])
                        route.fulfill(status=201,json=item)
                    page.route('**/api/admin/library/commons',mock_import)
                    page.locator('[data-source-mode=commons]').click()
                    picker=page.locator('[data-auto-commons]')
                    picker.locator('#slop-rw-search [name=q]').fill('river bridge')
                    picker.get_by_role('button',name='Cerca',exact=True).click()
                    picker.get_by_role('checkbox',name='Seleziona River bridge.jpg').check()
                    picker.get_by_role('button',name='Importa e prepara i riferimenti').click()
                    expect(picker.locator('[data-rw=choose-generation]')).to_be_visible()
                    assert control()==[] and not call('/'+imported[0],library=True)[1]['copy']
                    picker.locator('[data-rw=use-references]').click()
                    expect(picker.locator('.rw-message')).to_contain_text('Completa tag e descrizione editoriale')
                    picker.locator('[data-rw=choose-generation]').click()
                    picker.locator('[data-rw=run-gen]').click()
                    expect(picker.locator('.rw-message')).to_contain_text('1 immagine elaborata')
                    assert len(control())==1 and call('/'+imported[0],library=True)[1]['status']=='new'
                    picker.locator('[data-rw=use-references]').click()
                    expect(page.locator('.slop-auto-picked li')).to_have_count(2)
                    control([])
                count=1+len(imported)
                expect(page.locator('[data-auto=start]')).to_have_count(0)
                page.locator('[data-auto=preview]').click()
                expect(page.locator('[data-reference]')).to_have_count(count)
                expect(page.locator('[data-reference] strong').first).to_have_text(source['title'])
                assert control()==[] and call('auto')[1]['batch'] is None  # review pays nothing
                reference=page.locator('[data-auto-preview] [data-auto-reference]').first
                reference.click();expect(page.locator('.image-preview[open]')).to_be_visible()
                expect(page.locator('#image-preview-title')).to_have_text(source['title'])
                expect(page.locator('.image-preview img')).to_have_attribute('src',re.compile('/'+source['id']+'/original$'))
                page.locator('[data-preview-close]').click()
                long_press(page,reference);expect(page.locator('.image-preview[open]')).to_be_visible()
                page.locator('[data-preview-close]').click()
                page.locator('[data-auto=discard]').click();expect(page.locator('[data-reference]')).to_have_count(0)
                assert control()==[]
                if name=='desktop':
                    page.locator('[data-source-mode=random]').click()
                    page.locator('[data-auto=preview]').click();expect(page.locator('[data-reference]')).to_have_count(1)
                    page.locator('#slop-auto-size').fill('1')
                    expect(page.locator('[data-auto=start]')).to_have_count(0)
                    page.locator('[data-source-mode=database]').click()
                    expect(page.locator('.slop-auto-picked li')).to_have_count(1)
                page.locator('[data-auto=preview]').click();expect(page.locator('[data-reference]')).to_have_count(count)
                page.screenshot(path=str(folder/(name+'-setup.png')),full_page=True)
                page.locator('[data-auto=start]').click()
                if name=='desktop':
                    for _ in range(60):
                        if any(r['path']=='/v1/images/generations' for r in control()):break
                        time.sleep(.05)
                    else:raise AssertionError('generation did not start')
                    page.reload()  # another dashboard must await the already claimed attempt

                expect(page.locator('[data-auto=review]')).to_be_visible(timeout=30000)
                assert len(control())==4*count,control()  # brief, image, evaluator, tags
                auto=call('auto')[1];assert auto['batch']['status']=='review'
                generated=[i['id'] for i in auto['batch']['images']];assert len(generated)==count
                batch_id=auto['batch']['id']
                assert [row['source_id'] for row in sql(f"SELECT u.source_id FROM slop_reference_uses u JOIN slop_processes p ON p.id=u.process_id WHERE p.batch_id='{batch_id}' ORDER BY p.slot")]==[source['id']]+imported
                assert call('/'+generated[0],library=True)[1]['status']=='new'
                assert f'Massimo {6*count} chiamate' in confirmations[-1],confirmations
                page.reload();expect(page.locator('[data-auto=review]')).to_be_visible()
                assert len(control())==4*count  # refresh cannot pay again
                page.screenshot(path=str(folder/(name+'-review.png')),full_page=True)
                assert errors==[],errors
            finally:
                context.close();remove(generated);remove([source['id']]+imported)
        browser.close()
finally:call('/settings',old,method='PUT',library=True)
print('Automatic editorial browser loop desktop/mobile: bounded consent, final review and refresh idempotency passed.')
