import { test } from "node:test";
import assert from "node:assert/strict";
import { protectGameMedia } from "../src/media-privacy.ts";
function fixture(hidden = false) {
  const classes = new Set<string>();
  let closes = 0, allowed = true;
  const doc = Object.assign(new EventTarget(), {
    visibilityState: hidden ? "hidden" : "visible",
    documentElement: { classList: {
      toggle(name: string, on: boolean) { if (on) classes.add(name); else classes.delete(name); },
      remove(name: string) { classes.delete(name); },
    } },
    querySelector() { return { close() { closes++; } }; },
  });
  const win = new EventTarget();
  const guard = protectGameMedia(doc as unknown as Document, win as unknown as Window, () => allowed);
  function dispatch(type: string, selector = "") {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "target", { value: { closest: (value: string) => value === selector } });
    doc.dispatchEvent(event); return event;
  }
  return { doc, win, guard, dispatch, covered: () => classes.has("media-obscured"), closes: () => closes, disallow: () => { allowed = false; } };
}
test("hidden tab covers media, closes zoom, and return requires explicit reopening", () => {
  const f = fixture();
  assert.equal(f.covered(), false);
  f.doc.visibilityState = "hidden"; f.dispatch("visibilitychange");
  assert.equal(f.covered(), true); assert.equal(f.closes(), 1);
  f.dispatch("click", "[data-reveal-media]"); assert.equal(f.covered(), true);
  f.doc.visibilityState = "visible"; f.dispatch("visibilitychange");
  assert.equal(f.covered(), true);
  f.dispatch("click", "[data-reveal-media]"); assert.equal(f.covered(), false);
  f.guard.dispose();
});
test("window loss and page exit cover media", () => {
  const f = fixture();
  f.win.dispatchEvent(new Event("blur")); assert.equal(f.covered(), true);
  f.win.dispatchEvent(new Event("pagehide"));
  f.disallow(); f.dispatch("click", "[data-reveal-media]");
  assert.equal(f.covered(), true);
  f.guard.dispose(); assert.equal(f.covered(), false);
  f.win.dispatchEvent(new Event("blur")); assert.equal(f.covered(), false);
});
test("copy deterrents cover normal and zoom images but leave other context menus intact", () => {
  const f = fixture(true); assert.equal(f.covered(), true);
  for (const type of ["contextmenu", "dragstart"]) {
    assert.equal(f.dispatch(type, "[data-game-media]").defaultPrevented, true);
    assert.equal(f.dispatch(type, "a").defaultPrevented, false);
  }
  f.guard.dispose();
  assert.equal(f.dispatch("contextmenu", "[data-game-media]").defaultPrevented, false);
});
