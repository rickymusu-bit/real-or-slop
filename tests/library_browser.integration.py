"""Dashboard in the browser, desktop and mobile: loading notice, sections, Settings, statistics, sorting, trash of a
published photo, editing in the detail, and absence of retired crowding/detail controls."""
import io
import os
import re
import shutil
import urllib.parse
from pathlib import Path
from PIL import Image
from playwright.sync_api import expect, sync_playwright
from catalog import make_gallery, open_gallery
from game_copy import game_copy

base = os.environ['ROS_TEST_BASE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
gallery_id = make_gallery(base + '/api/admin/library', token, 'Test library_browser')
destination = make_gallery(base + '/api/admin/library', token, 'Destinazione library_browser')
folder = Path('artifacts/library-browser'); folder.mkdir(parents=True, exist_ok=True)

def picture(name, color, size):
    color = tuple((c + (37 if name.startswith('mobile') else 0)) % 256 for c in color)  # distinct files per viewport
    image = Image.new('RGB', size, color)
    for x in range(0, size[0], 7): image.putpixel((x, size[1] // 2), (255, 255, 255))
    out = io.BytesIO(); image.save(out, 'JPEG', quality=92)
    return {'name': name, 'mimeType': 'image/jpeg', 'buffer': out.getvalue()}

def add(page, picture_file, origin):
    """Adds a photo through the API, as the REAL wizard and the SLOP studio do (the Database section no longer uploads, owner decision
    of 2026-11-13), with its game copy made by the stand-in encoder."""
    title = picture_file['name'].rsplit('.', 1)[0]
    response = page.request.post(base + '/api/admin/library/upload?' + urllib.parse.urlencode({'gallery_id': gallery_id, 'origin': origin, 'title': title}),
                                 data=picture_file['buffer'], headers={'Content-Type': picture_file['mimeType']})
    assert response.ok, response.text()
    item = response.json()
    response = page.request.post(base + f'/api/admin/library/{item["id"]}/copy', data=game_copy(picture_file['buffer']), headers={'Content-Type': 'image/webp'})
    assert response.ok, response.text()
    return response.json()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
    for name, options in (('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('mobile', {**p.devices['Pixel 7']})):
        context = browser.new_context(**options, http_credentials={'username': 'owner', 'password': token})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        # Confirmations of the dashboard (no paid analysis of the photos since 2026-11-20).
        confirms = []
        def answer(dialog):
            confirms.append(dialog.message)
            accepted = ('Analizzare «', 'Measure crowding', 'Restore this version', 'Move', '1 image is published',
                        '1 published image will return', '2 published images', 'Have you checked')
            dialog.accept() if dialog.message.startswith(accepted) else dialog.dismiss()
        page.on('dialog', answer)
        assert page.request.put(base + '/api/admin/library/models', data={'image_quality':'medium'}, headers={'Origin':base}).status == 200
        page.goto(base + '/admin')
        expect(page.locator('#dashboard-loading')).to_have_count(0, timeout=15000)  # the loading line goes once all sections are in
        expect(page.locator('#admin-galleries')).to_be_visible()
        expect(page.locator('.admin-tabs button')).to_have_text(['Galleries', 'Statistics', 'Settings'])
        expect(page.locator('html')).to_have_attribute('lang', 'en')
        expect(page.locator('header a[href="/gioca"]')).to_have_text('Play')
        expect(page.locator('footer a[href="/crediti"]')).to_have_text('Sources and credits')
        expect(page.locator('[data-gallery-create]')).to_be_enabled()
        expect(page.locator('#gallery-workspace')).to_be_hidden()
        open_gallery(page, gallery_id)
        expect(page.locator('#gallery-title')).to_have_text('Test library_browser')
        page.get_by_role('link', name='Import REAL').click()
        expect(page).to_have_url(f'{base}/admin/gallerie/{gallery_id}/real')
        expect(page.locator('#gallery-workspace')).to_have_count(0)
        expect(page.locator('#real-wizard .rw-steps li')).to_have_count(4)
        page.locator('[data-gallery-return]').click()
        page.locator('.db-filter-panel summary').click()
        # No upload, copy filter, «Da Commons» or drop zone in the Database section any more.
        for gone in ('#library-files', '#library-copy-filter', '#library-commons-toggle', '#library-drop', '#library-redo-copy', '#library-undescribed', '#library-incomplete', '#library-group'):
            expect(page.locator(gone)).to_have_count(0)
        expect(page.locator('#library-search')).to_be_visible()
        page.locator('#library-search').fill('no-such-dashboard-image')
        expect(page.locator('#library-grid .library-card')).to_have_count(0)
        page.locator('#library-search').fill('')
        # The detail of a REAL has no analysis and no editorial description: only its source description (2026-11-20).
        for picture_file in (picture(f'{name}-rivoli.jpg', (180, 40, 30), (320, 200)), picture(f'{name}-spare.jpg', (30, 160, 40), (200, 320))):
            add(page, picture_file, 'REAL')
        page.locator('[data-view=new]').click()
        page.get_by_role('button', name=f'Open {name}-rivoli').click()
        expect(page.locator('#library-detail [data-editorial], #library-analyze, #library-description-analysis, .library-analysis, [data-ideas], .library-ideas')).to_have_count(0)
        expect(page.locator('#library-detail label', has=page.locator('[data-field=description]'))).to_contain_text('Source description')
        page.locator('.library-detail-close button').click()
        page.locator('[data-view=library]').click()
        expect(page.locator('#library-analysis')).to_have_count(0)

        # Retired scoring has no commands, gallery thresholds or warnings.
        expect(page.locator('[data-bulk=measure], [data-over-threshold]')).to_have_count(0)
        page.locator('[data-gallery-edit]').click()
        editor = page.locator('#gallery-editor')
        expect(editor.locator('[name=max_crowdedness], [name=max_detail]')).to_have_count(0)
        editor.locator('[data-gallery-editor-close]').click()
        page.get_by_role('button', name=f'Open {name}-rivoli').click()
        detail = page.locator('#library-detail')
        expect(detail.locator('[data-measure], #library-measure')).to_have_count(0)
        detail.locator('.library-detail-close button').click()

        # Selecting a new image keeps keyboard focus and shows the matching commands below the scroll viewport.
        spare = page.get_by_role('checkbox', name=f'Select {name}-spare')
        spare.check()
        expect(spare).to_be_focused()
        bar = page.locator('#library-selection')
        expect(bar.locator('.library-selection-actions').get_by_role('button')).to_have_text(
            ['Approve', 'Publish', 'Move to Trash', 'Move to gallery'])
        expect(bar.get_by_role('button', name='Deselect')).to_be_visible()
        assert page.evaluate("""() => {
            const scroll = document.querySelector('.gallery-workspace-scroll');
            const bar = document.querySelector('#library-selection');
            return !scroll.contains(bar) && scroll.getBoundingClientRect().bottom <= bar.getBoundingClientRect().top;
        }""")
        page.screenshot(path=str(folder / f'{name}-selection.png'))
        page.locator('[data-bulk=set-approved]').click()
        expect(page.locator('#library-message')).to_contain_text('1 updated')
        assert 'checked the rights and license' in confirms[-1]
        expect(page.locator('.library-card', has=spare).locator('.badge-status')).to_have_text('approved')
        rivoli_card = page.locator(f'.library-card:has([aria-label="Open {name}-rivoli"])')
        # A card shows only thumbnail, origin and state; views are in the detail. No tags anywhere (2026-11-20).
        expect(rivoli_card.locator('.badge')).to_have_text(['REAL', 'new'])
        for hidden in ('.db-tag', '.library-card-title', '[data-stats]'): expect(rivoli_card.locator(hidden)).to_have_count(0)
        rivoli_card.locator('.library-open').click()
        detail = page.locator('#library-detail')
        expect(detail.locator('.library-tags, #library-tag-input, #library-complete, #library-restore, [data-missing-categories]')).to_have_count(0)
        expect(detail.locator('[data-stats]')).to_have_text('Viewed 0 times / correctly identified 0')
        detail.locator('.library-detail-close button').click()
        slop=add(page, picture(f'{name}-street.jpg', (40, 40, 190), (300, 300)), 'SLOP')
        slop_label='SLOP '+slop['id'][:8]
        page.locator('[data-view=library]').click()  # reload the list
        expect(page.locator(f'.library-open[aria-label^="Open {name}-"], .library-open[data-open="{slop["id"]}"]')).to_have_count(3)
        # Sorting: date added, newest first by default; ascending puts the oldest first; views all 0 keep the newest first.
        titles = lambda: [l[5:] for l in page.locator('.library-open').evaluate_all("bs => bs.map(b => b.getAttribute('aria-label'))") if l.startswith(f'Open {name}-') or l==f'Open {slop_label}']
        expect(page.locator('#library-sort')).to_have_value('added'); expect(page.locator('#library-order')).to_have_value('desc')
        assert titles()[:3] == [slop_label, f'{name}-spare', f'{name}-rivoli'], titles()
        page.locator('#library-order').select_option('asc')
        expect(page.locator(f'.library-open[aria-label^="Open {name}-"], .library-open[data-open="{slop["id"]}"]').first).to_have_attribute('aria-label', f'Open {name}-rivoli')
        mine = titles(); assert mine.index(f'{name}-rivoli') < mine.index(f'{name}-spare') < mine.index(slop_label), mine
        page.locator('#library-sort').select_option('views')
        expect(page.locator(f'.library-open[aria-label^="Open {name}-"], .library-open[data-open="{slop["id"]}"]').first).to_have_attribute('aria-label', f'Open {slop_label}')
        mine = titles(); assert mine.index(slop_label) < mine.index(f'{name}-spare') < mine.index(f'{name}-rivoli'), mine  # ties: newest first
        page.reload()
        expect(page.locator('#gallery-workspace')).to_be_visible()
        page.locator('.db-filter-panel summary').click()
        expect(page.locator('#library-sort')).to_have_value('views'); expect(page.locator('#library-order')).to_have_value('asc')  # remembered
        page.locator('#library-sort').select_option('added'); page.locator('#library-order').select_option('desc')
        expect(page.locator('.badge-warn')).to_have_count(0)  # every image has its game copy
        page.screenshot(path=str(folder / f'{name}-grid.png'))
        page.locator('[data-gallery-close]').click()
        expect(page.locator(f'[data-gallery-open="{gallery_id}"] img')).to_have_count(3)
        # Settings: model selectors, no budget.
        page.get_by_role('button', name='Settings').click()
        expect(page.locator('#library-budget')).to_have_count(0)
        page.locator('#library-models summary').click()
        text_select, image_select = page.locator('#library-models-form [name=text_model]'), page.locator('#library-models-form [name=image_model]')
        expect(text_select).to_have_value('gpt-6.1-sol')
        expect(image_select).to_have_value('gpt-image-2.5-flare')
        expect(image_select.locator('option[value="gpt-image-2"]')).to_contain_text('retired by OpenAI on 10/02/2027')
        expect(image_select.locator('option[value="gpt-image-2.6-flare"]')).to_have_attribute('disabled', '')
        image_select.select_option('gpt-image-2')
        expect(page.locator('#library-settings-message')).to_have_text('Image model: gpt-image-2.')
        image_select.select_option('gpt-image-2.5-flare')
        expect(page.locator('#library-settings-message')).to_have_text('Image model: gpt-image-2.5-flare.')
        expect(page.locator('#library-calls')).to_have_count(0)  # figures moved to «Statistiche»
        quality = page.locator('#library-models-form [name=image_quality]')
        expect(quality).to_have_value('medium')
        quality.select_option('high')
        expect(page.locator('#library-settings-message')).to_have_text('Image quality: high.')
        quality.select_option('medium')
        expect(page.locator('#library-settings-message')).to_have_text('Image quality: medium.')
        page.locator('#library-thresholds summary').click()
        expect(page.locator('[name=max_generation_attempts]')).to_have_value('3')
        page.locator('[name=max_generation_attempts]').fill('4'); page.locator('#library-thresholds-form button').click()
        expect(page.locator('#library-settings-message')).to_have_text('Legacy SLOP generation settings saved.')
        # Saving one form never overwrites what is typed, and not yet saved, in another one.
        page.locator('#library-games summary').click()
        expect(page.locator('[name=open_game_hours]')).to_have_value('24')
        page.locator('[name=open_game_hours]').fill('30')
        page.locator('#library-settings-message').evaluate('m => m.textContent = ""')
        page.locator('[name=max_generation_attempts]').fill('3'); page.locator('#library-thresholds-form button').click()
        expect(page.locator('#library-settings-message')).to_have_text('Legacy SLOP generation settings saved.')
        expect(page.locator('[name=open_game_hours]')).to_have_value('30')
        page.locator('[name=open_game_hours]').fill('0'); page.locator('#library-games-form button').click()
        expect(page.locator('[name=open_game_hours]')).to_have_value('0')  # the browser stops it: minimum 1
        page.locator('[name=open_game_hours]').fill('24')
        # Statistics remain available without creating any paid measurement.
        page.get_by_role('button', name='Statistics').click()
        stats = page.locator('#stats-body')
        expect(stats.locator('.stat-tile', has_text='games active now')).to_be_visible()
        expect(stats.locator('.stats-calls tbody tr', has_text='Analisi delle photos')).to_have_count(0)
        stats.locator('[data-stats-kind]').select_option('images')
        stats.locator('[data-stats-period]').select_option('7')
        expect(stats.locator('[data-stats-period]')).to_have_value('7')
        expect(stats.locator('.stats-levels li')).to_have_count(4)
        page.screenshot(path=str(folder / f'{name}-stats.png'), full_page=True)
        page.get_by_role('button', name='Settings').click()
        # Model context: edit the base, save a version, then restore the approved one.
        page.locator('#library-contexts summary').first.click()
        base_field = page.locator('[data-context=base]')
        expect(base_field).to_have_value(re.compile('^You work on a photographic archive'))
        expect(page.locator('[data-context]')).to_have_count(3)
        expect(page.locator('[data-context=real_measure]')).to_have_count(0)
        expect(page.locator('[data-context=slop_gallery_prompt]')).to_have_value(re.compile('themed gallery'))
        approved = base_field.input_value()
        base_field.fill(approved + '\nProva dalla dashboard.')
        expect(page.locator('[data-context-part=base] [data-context-count]')).to_have_text('%d/4000' % (len(approved) + 23))
        page.locator('[data-context-save=base]').click()
        expect(page.locator('#library-settings-message')).to_have_text('Shared instructions: version saved.')
        expect(page.locator('[data-context-part=base] .library-context-history > summary')).to_have_text(re.compile(r'Versions \(\d+\)'))
        before = int(re.search(r'\d+', page.locator('[data-context-part=base] .library-context-history > summary').inner_text()).group())
        page.locator('[data-context-part=base] .library-context-history > summary').click()
        page.locator('[data-context-part=base] [data-context-restore]').nth(0).click()
        expect(page.locator('#library-settings-message')).to_have_text('Version restored.')
        expect(page.locator('[data-context=base]')).to_have_value(approved)
        expect(page.locator('[data-context-part=base] .library-context-history > summary')).to_have_text('Versions (%d)' % (before + 1))
        page.screenshot(path=str(folder / f'{name}-settings.png'), full_page=True)
        # No vocabulary of tags in Settings any more.
        expect(page.locator('#library-vocabulary')).to_have_count(0)
        expect(page.locator('.settings-index button')).to_have_text(['Models', 'Generation', 'AI instructions', 'Games', 'Commons sources', 'Leaderboard'])
        expect(page.locator('#library-measures, [name=crowdedness_threshold], [name=detail_threshold]')).to_have_count(0)
        # REAL checked on Commons each night: 50 by default, from 0 (paused) to 500.
        page.locator('.settings-index button', has_text='Commons sources').click()
        checks = page.locator('[name=commons_checks_per_night]')
        expect(checks).to_have_value('50')
        expect(checks).to_have_attribute('max', '500')
        checks.fill('120'); page.locator('#library-sources-form button').click()
        expect(page.locator('#library-settings-message')).to_have_text('Nightly REAL check count saved.')
        assert page.request.get(base + '/api/admin/library/settings').json()['values']['commons_checks_per_night'] == 120
        page.locator('[name=commons_checks_per_night]').fill('50'); page.locator('#library-sources-form button').click()
        expect(page.locator('#library-settings-message')).to_have_text('Nightly REAL check count saved.')
        expect(page.locator('[data-context-part]')).to_have_count(4)
        expect(page.locator('[data-context-part=analysis]')).to_have_count(0)
        page.locator('[data-admin-tab=galleries]').click()
        open_gallery(page, gallery_id)

        def edit_and_publish(title, description, real):
            page.get_by_role('button', name=f'Open {title}').click()
            dialog = page.locator('#library-detail')
            expect(dialog).to_contain_text('WebP game copy')
            expect(dialog.locator('#library-analyze, #library-description-analysis, [data-editorial]')).to_have_count(0)
            expect(dialog.locator('#library-crop')).to_be_visible()
            expect(dialog.locator('[data-field=caption], [data-field=explanation]')).to_have_count(0)
            for key in ('source_url', 'author', 'license_name', 'license_url'):
                expect(dialog.locator(f'[data-field={key}]')).to_have_count(1 if real else 0)
            expect(dialog.locator('[data-field=title]')).to_have_count(1 if real else 0)
            expect(dialog.locator('[data-start-tags]')).to_have_count(0)
            for key in ('prompt', 'model'):
                expect(dialog.locator(f'[data-field={key}]')).to_have_count(0 if real else 1)
            # The source description of a REAL is editable; a SLOP has no description, its prompt instead.
            field = dialog.locator('[data-field=description]' if real else '[data-field=prompt]')
            expect(dialog.locator('[data-field=description]')).to_have_count(1 if real else 0)
            field.fill(description); field.blur()
            expect(dialog.locator('#library-detail-message')).to_contain_text('Saved')
            expect(dialog.locator('#library-tag-input, .library-tags')).to_have_count(0)
            if real: dialog.locator('#library-rights').check()
            dialog.locator('[data-action=approve]').click()
            expect(dialog.locator('[data-action=publish]')).to_be_visible()
            if title.endswith('rivoli'): dialog.screenshot(path=str(folder / f'{name}-detail.png'))
            dialog.locator('[data-action=publish]').click()
            expect(dialog.locator('[data-action=withdraw]')).to_be_visible()
            dialog.locator('.library-detail-close button').click()
        spare.check()
        edit_and_publish(f'{name}-rivoli', 'Parigi, maggio 1968. Barricate in rue de Rivoli.', True)
        expect(spare).to_be_checked()
        bar.get_by_role('button', name='Deselect').click()
        edit_and_publish(slop_label, 'Parigi, 1968. Una strada bloccata.', False)
        rivoli_check = page.get_by_role('checkbox', name=f'Select {name}-rivoli')
        spare.check()
        rivoli_check.check()
        withdraw = bar.get_by_role('button', name='Unpublish')
        expect(withdraw).to_be_visible()
        bar.get_by_role('button', name='Deselect').click()
        expect(rivoli_check).not_to_be_checked()
        expect(spare).not_to_be_checked()
        expect(bar).to_be_hidden()
        spare.check()
        rivoli_check.check()
        withdraw.click()
        expect(page.locator('#library-message')).to_have_text('1 updated.')
        expect(rivoli_check).not_to_be_checked()
        expect(spare).to_be_checked()
        expect(withdraw).to_be_hidden()
        expect(rivoli_card.locator('.badge-status')).to_have_text('approved')
        bar.get_by_role('button', name='Deselect').click()
        rivoli_check.check()
        page.locator('[data-bulk=set-published]').click()
        expect(rivoli_card.locator('.badge-status')).to_have_text('published')
        # Multi-selection: the spare photo and a published one go to the trash together (the published one leaves the game at once,
        # after a confirmation), then the spare is deleted for good and the published one comes back approved.
        page.get_by_role('checkbox', name=f'Select {name}-spare').check()
        page.get_by_role('checkbox', name=f'Select {slop_label}').check()
        confirms.clear()
        page.locator('[data-bulk=trash]').click()
        expect(page.locator('#library-message')).to_contain_text('2 updated')
        assert any('published' in c for c in confirms), confirms
        page.locator('[data-view=trash]').click()
        expect(page.locator('.library-card')).to_have_count(2)
        page.get_by_role('checkbox', name=f'Select {slop_label}').check()
        page.locator('[data-bulk=restore]').click()
        expect(page.locator('#library-message')).to_contain_text('1 updated')
        page.get_by_role('checkbox', name=f'Select {name}-spare').check()
        page.locator('[data-bulk=delete]').click()
        expect(page.locator('#library-message')).to_contain_text('1 permanently deleted')
        expect(page.locator('.library-empty')).to_contain_text('Trash is empty')
        page.locator('[data-view=approved]').click()
        expect(page.locator(f'.library-card:has([aria-label="Open {slop_label}"])')).to_have_count(1)
        page.get_by_role('checkbox', name=f'Select {slop_label}').check()
        page.locator('[data-bulk=set-published]').click()
        expect(page.locator('#library-message')).to_contain_text('1 updated')
        # Withdraw both, so that the next viewport works with its own images.
        page.locator('[data-view=published]').click()
        for title in (f'{name}-rivoli', slop_label): page.get_by_role('checkbox', name=f'Select {title}').check()
        bar.get_by_role('button', name='Unpublish').click()
        expect(page.locator('#library-message')).to_contain_text('2 updated')
        expect(page.locator(f'.library-card:has([aria-label="Open {name}-rivoli"])')).to_have_count(0)
        # Move a mixed selection to another gallery, preserving both approved states.
        page.locator('[data-view=approved]').click()
        for title in (f'{name}-rivoli', slop_label): page.get_by_role('checkbox', name=f'Select {title}').check()
        page.locator('[data-bulk=gallery]').click()
        move = page.locator('#library-move-gallery')
        expect(move).to_be_visible()
        expect(move.locator(f'option[value="{gallery_id}"]')).to_have_count(0)
        move.get_by_role('button', name='Cancel').click()
        expect(bar.locator('strong')).to_have_text('2 selected')
        page.locator('[data-bulk=gallery]').click()
        move.locator('#library-bulk-gallery').select_option(destination)
        move.get_by_role('button', name='Move', exact=True).click()
        expect(page.locator('#library-message')).to_have_text('2 moved.')
        expect(page.get_by_role('button', name=f'Open {name}-rivoli')).to_have_count(0)
        page.locator('[data-gallery-close]').click()
        open_gallery(page, destination)
        for title in (f'{name}-rivoli', slop_label):
            photo = page.get_by_role('button', name=f'Open {title}')
            expect(photo.locator('.badge-status')).to_have_text('approved')
        page.locator('[data-gallery-close]').click()
        open_gallery(page, gallery_id)
        # The gallery window and both wizards fit on desktop and mobile.
        page.get_by_role('link', name='Generate SLOP').click()
        expect(page).to_have_url(f'{base}/admin/gallerie/{gallery_id}/slop')
        expect(page.locator('#gallery-workspace')).to_have_count(0)
        expect(page.locator('#wizard-gallery-name')).to_have_text('Test library_browser')
        # One wizard for every SLOP (owner decision of 2026-11-22): steps from the gallery to the review, no manual mode.
        expect(page.locator('[data-generation-mode], [data-manual=prompt]')).to_have_count(0)
        expect(page.locator('.pipeline h2')).to_have_text(['1. Prepare the gallery', '2. Gallery variations', '3. Scenes and images to review', '4. Treatment and game copies'])
        assert page.evaluate("""() => document.querySelector('#wizard-gallery-name').getBoundingClientRect().bottom
            < document.querySelector('.pipeline').getBoundingClientRect().top""")
        expect(page.locator('[data-auto=start]')).to_have_count(0)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        page.screenshot(path=str(folder / f'{name}-workspace-slop.png'))
        page.go_back()
        expect(page).to_have_url(f'{base}/admin?gallery={gallery_id}')
        expect(page.locator('#gallery-workspace')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.locator('#gallery-workspace')).to_be_hidden()
        for section in ('galleries', 'stats', 'settings'):
            page.locator('[data-admin-tab="'+section+'"]').click()
            expect(page.locator('#admin-'+section)).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), section
            if name == 'desktop':
                assert page.evaluate('''() => {
                    const nav = document.querySelector('.admin-tabs').getBoundingClientRect();
                    const panel = document.querySelector('.admin-workspace-body').getBoundingClientRect();
                    return nav.right < panel.left && [...document.querySelectorAll('[data-admin-tab]')].every(button =>
                        button.getBoundingClientRect().right <= nav.right + 1);
                }'''), 'navigation overlaps ' + section
            page.evaluate('window.scrollTo(0, 0)')
            page.screenshot(path=str(folder / f'{name}-workspace-{section}.png'), full_page=True)
        page.locator('[data-admin-tab=stats]').click()
        expect(page.locator('.stats-groups, .stats-measures')).to_have_count(0)
        page.locator('[data-stats-view=calls]').click()
        expect(page.locator('[aria-labelledby=stats-calls]')).to_be_visible()
        expect(page.locator('[aria-labelledby=stats-games]')).to_be_hidden()
        page.locator('[data-stats-view=all]').click()
        expect(page.locator('[aria-labelledby=stats-games]')).to_be_visible()
        assert not errors, errors
        context.close()
        print('Library browser E2E 1.14.0 passed (loading indicator, no captions, no upload in the Database, sorting, trash of a published photo):', name)
    browser.close()
