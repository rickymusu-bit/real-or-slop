"""Press and hold in the browser checks: with a finger (Chrome DevTools touch events) on touch screens, with the left mouse
button elsewhere; the press lasts 800 ms (the dashboard opens the preview after 500 ms)."""

def long_press(page, locator, hold_ms=800):
    # Unlike scrolling an element handle, this locator action reacquires a card
    # replaced by the catalogue's background measurement before the gesture starts.
    locator.hover()
    box = locator.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    if page.evaluate("matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0"):
        cdp = page.context.new_cdp_session(page)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
        page.wait_for_timeout(hold_ms)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        cdp.detach()
    else:
        page.mouse.move(x, y); page.mouse.down(); page.wait_for_timeout(hold_ms); page.mouse.up()
