"""v1.0.0, 2026-11-14T09:00:00Z: press and hold in the browser checks (docs/anteprima-descrizione.v1.0.0.md). With a finger (Chrome
DevTools touch events) on contexts with a touch screen, with the left mouse button elsewhere; the press lasts 800 ms (the dashboard
opens the preview after 500 ms)."""

def long_press(page, locator, hold_ms=800):
    locator.scroll_into_view_if_needed()
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
