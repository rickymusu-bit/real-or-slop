"""Gallery management and scope of the replacement SLOP wizard on desktop and mobile."""
import shutil
from playwright.sync_api import sync_playwright,expect
from editorial_helpers import *
from catalog import open_gallery
folder=Path('artifacts/slop-auto-browser');folder.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
    for name,options in [('desktop',{'viewport':{'width':1280,'height':900}}),('mobile',p.devices['Pixel 7'])]:
        source_gallery=make_gallery('Gallery origine '+name);source=real('gallery-scope-'+name,gallery=source_gallery['id'])
        context=browser.new_context(**options,http_credentials={'username':'owner','password':TOKEN});page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
        try:
            control([]);page.goto(BASE+'/admin');page.get_by_role('button',name='New gallery').click();form=page.locator('#gallery-editor form')
            form.get_by_label('Title').fill('Destinazione '+name);form.get_by_label('Description').fill('Console e fotografie ordinarie.');form.get_by_role('button',name='Create gallery').click()
            expect(page.locator('#gallery-title')).to_have_text('Destinazione '+name)
            card=page.locator('[data-gallery-open]',has_text='Destinazione '+name);target=card.get_attribute('data-gallery-open')
            page.locator('[data-gallery-close]').click();open_gallery(page,source_gallery['id']);page.locator('[data-open="'+source['id']+'"]').click();page.locator('#library-detail-gallery').select_option(target)
            expect(page.locator('#library-detail-message')).to_have_text('Gallery updated.');page.locator('#library-detail').get_by_role('button',name='Close',exact=True).click();page.locator('[data-gallery-close]').click();open_gallery(page,target)
            page.get_by_role('link',name='Generate SLOP').click();root=page.locator('.pipeline');expect(root.get_by_role('heading',name='1. Prepare the gallery')).to_be_visible()
            expect(root.locator('[data-source]')).to_have_count(1);assert control()==[]
            root.get_by_text('Rules and probabilities',exact=True).click();root.locator('[data-rules]').fill('Mantieni i dettagli hardware e varia i dati temporanei.');root.locator('[data-environment]').select_option('change_genre');root.locator('[data-probability=damage]').fill('5');root.locator('[data-action=settings]').click()
            page.reload();root.get_by_text('Rules and probabilities',exact=True).click();expect(root.locator('[data-environment]')).to_have_value('change_genre');expect(root.locator('[data-probability=damage]')).to_have_value('5')
            assert control()==[];assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            page.screenshot(path=str(folder/(name+'-gallery-rules.png')),full_page=True)
            assert not errors,errors
        finally:context.close()
    browser.close()
print('Gallery browser passed: creation, membership, scope, configurable rules/probabilities and genre, persistence, no unconfirmed calls, desktop/mobile.')
