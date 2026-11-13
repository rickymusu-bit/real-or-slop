"""v1.2.0, 2026-11-13T10:00:00Z: explorable photo (docs/copie-di-gioco.v4.0.0.md, section 5): 4:5 frame on a vertical screen, the
copy's format on a horizontal one; drag and zoom enable «Vista iniziale», which goes back; REAL and SLOP buttons visible and used on
the phone, no swipe; the credits say «Ritagliata, ridotta e ricompressa».
v1.1.0, 2026-11-12T19:00:00Z: age declaration in the leaderboard form, Privacy and Terms pages, changes of a REAL in the credits, deletion of an
entry in Settings (docs/privacy-note-legali.v1.0.0.md).
v1.0.0, 2026-11-12T09:00:00Z: the level game in a real browser, desktop and mobile (docs/gioco-a-livelli.v1.0.0.md): level picker,
first photo prepared, 4:5 frame with caption, verdict after each answer (keys R and S on desktop, swipe on a phone, where the buttons
are out of sight), photo and caption hidden after leaving the page, results with score, leaderboard entry with the game code, the
photos of the game with sources and prompts, the leaderboard on the home page, the code checked in the dashboard Settings and the
entry hidden. Publishes 10 REAL and 10 SLOP in the LOCAL D1 and R2, then removes them."""
import os
import re
import shutil
import subprocess
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from catalog_v1_1_0 import publish, remove

base, state = os.environ['ROS_TEST_BASE'], os.environ['ROS_TEST_STATE']
token = Path('.dev.vars').read_text().strip().split('=', 1)[1]
API = base + '/api/admin/library'
folder = Path('artifacts/game-browser'); folder.mkdir(parents=True, exist_ok=True)
def sql(command):
    subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--command', command],
                   capture_output=True, text=True, check=True)

# Two fingers apart on the frame: a pinch that zooms in, then a one-finger drag.
PINCH = """() => { const f = document.querySelector('.card-media'); const r = f.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2, t = (id, cx, cy, type) => f.dispatchEvent(new PointerEvent(type,
    { pointerId: id, pointerType: 'touch', bubbles: true, isPrimary: id === 1, clientX: cx, clientY: cy }));
  t(1, x - 10, y, 'pointerdown'); t(2, x + 10, y, 'pointerdown'); t(1, x - 40, y, 'pointermove'); t(2, x + 40, y, 'pointermove');
  t(1, x - 40, y, 'pointerup'); t(2, x + 40, y, 'pointerup');
  t(3, x, y, 'pointerdown'); t(3, x + 30, y + 20, 'pointermove'); t(3, x + 30, y + 20, 'pointerup');
  return getComputedStyle(document.querySelector('.viewer-layer')).transform; }"""

# Only this script's photos in play: photos left published by earlier scripts are withdrawn first.
import json, urllib.request
listing = urllib.request.Request(API + '?status=published', headers={'Authorization': 'Bearer ' + token})
for item in json.loads(urllib.request.urlopen(listing).read())['items']:
    urllib.request.urlopen(urllib.request.Request(f'{API}/{item["id"]}/withdraw', data=b'{}', method='POST',
                                                  headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}))
catalogue = publish(API, token, 'gb', real=10, slop=10, seed=7)
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get('ROS_CHROMIUM_PATH') or shutil.which('chromium'), args=['--no-sandbox'])
        for name, options in (('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('mobile', {**p.devices['Pixel 7']})):
            context = browser.new_context(**options)
            page = context.new_page(); errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/allenamento')  # old addresses lead to the level picker
            expect(page).to_have_url(base + '/gioca')
            expect(page.locator('[data-level=facile]')).to_be_enabled()
            expect(page.locator('[data-level=esperto]')).to_be_disabled()
            page.screenshot(path=str(folder / f'{name}-levels.png'), full_page=True)
            page.locator('[data-level=facile]').click()
            page.locator('#start').click()
            for number in range(1, 11):
                expect(page.locator('.play-levels')).to_have_attribute('aria-label', f'Foto {number} di 10', timeout=15000)
                frame = page.locator('.card-media').bounding_box()
                # Fixtures are 40×50: copies 38×50 (3:4). Vertical screen: the 4:5 frame; horizontal: the copy's format.
                expected = 0.8 if name == 'mobile' else 38 / 50
                assert abs(frame['width'] / frame['height'] - expected) < 0.02, (frame, expected)
                expect(page.locator('.play-levels .choices [data-choice=REAL]')).to_be_visible()  # also on the phone
                reset = page.locator('[data-viewer-reset]')
                if number == 1:
                    expect(reset).to_be_disabled()
                    before = page.evaluate("getComputedStyle(document.querySelector('.viewer-layer')).transform")
                    if name == 'mobile': after = page.evaluate(PINCH)
                    else:
                        page.mouse.move(frame['x'] + frame['width'] / 2, frame['y'] + frame['height'] / 2); page.mouse.wheel(0, -300)
                        after = page.evaluate("getComputedStyle(document.querySelector('.viewer-layer')).transform")
                    assert after != before, (before, after)
                    expect(reset).to_be_enabled()
                    page.screenshot(path=str(folder / f'{name}-zoomed.png'))
                    reset.click()
                    expect(reset).to_be_disabled()
                    assert page.evaluate("getComputedStyle(document.querySelector('.viewer-layer')).transform") == before
                expect(page.locator('.card .play-caption')).to_contain_text('Didascalia')
                if number == 2:
                    # Leaving the page hides photo and caption; the time goes on.
                    page.evaluate("window.dispatchEvent(new Event('blur'))")
                    expect(page.locator('.media-privacy-cover')).to_be_visible()
                    expect(page.locator('.card .play-caption')).to_be_hidden()
                    page.locator('[data-reveal-media]').click()
                    expect(page.locator('.card .play-caption')).to_be_visible()
                if number == 1: page.screenshot(path=str(folder / f'{name}-photo.png'))
                if name == 'desktop':
                    page.keyboard.press('r' if number % 2 else 's')
                else:
                    page.locator('[data-choice=REAL]' if number % 2 else '[data-choice=AI]').tap()
                expect(page.locator('.verdict')).to_be_visible()
                expect(page.locator('.verdict')).to_have_text(re.compile(r'^(✓ Giusto|✗ Sbagliato): era (REAL|SLOP)$'))
                if number == 1: page.screenshot(path=str(folder / f'{name}-verdict.png'))
            expect(page.locator('.results .score')).to_be_visible(timeout=15000)
            expect(page.locator('.credit')).to_have_count(10)
            expect(page.locator('.credit .credit-prompt').first).to_contain_text('A street scene')
            expect(page.locator('.credit a', has_text='Fonte')).to_have_count(0)  # uploaded REAL fixtures have no source page
            expect(page.locator('.credit-changes').first).to_contain_text('Ritagliata, ridotta e ricompressa')
            page.locator('[name=nickname]').fill(f'Browser {name}'); page.locator('#enter-form button').click()
            expect(page.locator('[data-game-code]')).to_have_count(0)  # the age declaration is required
            page.locator('[name=age_ok]').check()
            page.locator('[name=nickname]').fill('m3rda'); page.locator('#enter-form button').click()
            expect(page.locator('#enter-error')).to_contain_text('non ammesso')
            page.locator('[name=nickname]').fill(f'Browser {name}'); page.locator('#enter-form button').click()
            code = page.locator('[data-game-code]')
            expect(code).to_have_text(re.compile(r'^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{2}$'))
            game_code = code.inner_text()
            page.screenshot(path=str(folder / f'{name}-results.png'), full_page=True)
            page.goto(base + '/')
            expect(page.locator('.leaderboard').first.locator('tbody')).to_contain_text(f'Browser {name}')
            expect(page.locator('.leaderboard').first.locator('tbody')).to_contain_text('Facile')
            page.screenshot(path=str(folder / f'{name}-home.png'), full_page=True)
            page.locator('footer a', has_text='Privacy e cookie').click()
            expect(page.get_by_role('heading', name='Privacy e cookie.')).to_be_visible()
            expect(page.locator('.legal')).to_contain_text('12 mesi')
            page.screenshot(path=str(folder / f'{name}-privacy.png'), full_page=True)
            page.locator('footer a', has_text='Termini d’uso').click()
            expect(page.get_by_role('heading', name='Termini d’uso.')).to_be_visible()
            assert not errors, errors
            context.close()
            # The owner checks the code in Settings and hides the entry.
            admin = browser.new_context(**options, http_credentials={'username': 'owner', 'password': token})
            page = admin.new_page()
            page.goto(base + '/admin')
            page.get_by_role('button', name='Impostazioni').click()
            page.locator('#library-leaderboard summary').click()
            page.locator('#library-code [name=code]').fill(game_code.lower())
            page.locator('#library-code button').click()
            expect(page.locator('#library-code-result')).to_contain_text(f'Codice valido: Browser {name}')
            entry = page.locator('#library-entries li', has_text=f'Browser {name}')
            entry.get_by_role('button', name='Nascondi').click()
            expect(page.locator('#library-entries li', has_text=f'Browser {name}')).to_contain_text('nascosta')
            page.on('dialog', lambda dialog: dialog.accept())
            page.locator('#library-entries li', has_text=f'Browser {name}').get_by_role('button', name='Cancella').click()
            expect(page.locator('#library-entries li', has_text=f'Browser {name}')).to_have_count(0)
            admin.close()
            print('Game browser E2E 1.2.0 passed (explorable photo, buttons on the phone):', name)
        browser.close()
finally:
    sql("DELETE FROM leaderboard WHERE nickname LIKE 'Browser%'")
    sql("UPDATE game_sessions SET phase='completed',completed=1 WHERE phase IN ('preparing','active')")
    remove(API, token, catalogue)
