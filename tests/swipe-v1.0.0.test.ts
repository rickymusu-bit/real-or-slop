import assert from "node:assert/strict";
import { test } from "node:test";
import { swipeDecision, swipeThreshold } from "../src/swipe-v1.0.0";

test("swipe v1.0.0: horizontal left/right map to existing answer values", () => {
  assert.equal(swipeDecision(-100, 2, 360), "REAL");
  assert.equal(swipeDecision(100, 2, 360), "AI");
  assert.equal(swipeDecision(-140, 20, 1200), "REAL");
  assert.equal(swipeDecision(140, 20, 1200), "AI");
});

test("swipe v1.0.0: taps and short drags cannot answer", () => {
  assert.equal(swipeDecision(0, 0, 360), null);
  assert.equal(swipeDecision(20, 1, 360), null);
  assert.equal(swipeDecision(-70, 5, 360), null);
  assert.equal(swipeDecision(100, 2, 1200), null);
});

test("swipe v1.0.0: predominantly vertical motion is not an answer", () => {
  assert.equal(swipeDecision(140, 200, 360), null);
  assert.equal(swipeDecision(-160, 200, 1200), null);
  assert.equal(swipeDecision(120, 90, 360), "AI");
});

test("swipe v1.0.0: threshold adapts without becoming too low or too high", () => {
  assert.equal(swipeThreshold(180), 55);
  assert.equal(swipeThreshold(360), 82.8);
  assert.equal(swipeThreshold(1200), 120);
});

// Exercise event sequences too: a correct threshold alone cannot protect a
// vertical scroll, a cancelled gesture, or a round that expires mid-drag.
import { enableAnswerSwipe } from "../src/swipe-v1.0.0";
function fixture(attribute: "data-choice" | "data-pvp-choice" = "data-choice") {
  const classes = () => {
    const values = new Set<string>();
    return {
      contains: (name: string) => values.has(name),
      add: (...names: string[]) => names.forEach(name => values.add(name)),
      remove: (...names: string[]) => names.forEach(name => values.delete(name)),
      toggle(name: string, on: boolean) { if (on) values.add(name); else values.delete(name); },
    };
  };
  const win = new EventTarget();
  const preview = { className: "", classList: classes(), textContent: "", setAttribute() {}, remove() {} };
  const doc = Object.assign(new EventTarget(), {
    defaultView: win, visibilityState: "visible", documentElement: { classList: classes() },
    createElement: () => preview,
  });
  const answers: string[] = [];
  const buttons = Object.fromEntries(["REAL", "AI"].map(choice => [choice, {
    disabled: false, click() {
      if (this.disabled) return;
      answers.push(choice);
      buttons.REAL.disabled = buttons.AI.disabled = true;
    },
  }]));
  const root = { querySelector(selector: string) {
    return selector === `[${attribute}="REAL"]` ? buttons.REAL : selector === `[${attribute}="AI"]` ? buttons.AI : null;
  } };
  const captured = new Set<number>();
  let width = 360, allowed = true;
  const image = Object.assign(new EventTarget(), {
    ownerDocument: doc, parentElement: { append() {} }, closest: () => root,
    isConnected: true, classList: classes(), style: { transform: "", opacity: "" },
    getBoundingClientRect: () => ({ width }),
    setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  });
  const dispose = enableAnswerSwipe(image as unknown as HTMLImageElement, attribute, () => allowed);
  function pointer(type: string, x: number, y = 0, extra = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, clientX: x, clientY: y, button: 0, isPrimary: true, ...extra });
    doc.dispatchEvent(event); image.dispatchEvent(event);
  }
  function click(detail = 1) {
    const event = new Event("click", { cancelable: true });
    Object.assign(event, { detail }); image.dispatchEvent(event); return event.defaultPrevented;
  }
  return { image, buttons, answers, pointer, click, doc, win, dispose, preview, captured,
    expire: () => { allowed = false; }, resize: () => { width = 1200; } };
}
test("swipes activate the existing solo/PvP buttons once and suppress the zoom click", () => {
  for (const attribute of ["data-choice", "data-pvp-choice"] as const) {
    for (const dx of [-100, 100]) {
      const f = fixture(attribute);
      f.pointer("pointerdown", 180); f.pointer("pointermove", 180 + dx);
      assert.equal(f.preview.textContent, dx < 0 ? "REAL" : "SLOP");
      f.pointer("pointerup", 180 + dx);
      assert.deepEqual(f.answers, [dx < 0 ? "REAL" : "AI"]);
      assert.equal(f.click(), true);
      assert.equal(f.image.style.transform, ""); assert.equal(f.captured.size, 0);
      f.pointer("pointerdown", 180); f.pointer("pointermove", 180 - dx); f.pointer("pointerup", 180 - dx);
      assert.equal(f.answers.length, 1); f.dispose();
    }
  }
});
test("tap and keyboard zoom survive; a short drag never answers or opens zoom", () => {
  const f = fixture();
  f.pointer("pointerdown", 180); f.pointer("pointerup", 182);
  assert.equal(f.click(), false);
  f.pointer("pointerdown", 180); f.pointer("pointermove", 210); f.pointer("pointerup", 210);
  assert.deepEqual(f.answers, []); assert.equal(f.click(), true);
  assert.equal(f.click(0), false); f.dispose();
});
test("a vertical gesture stays a scroll even when its final position is horizontal", () => {
  const f = fixture();
  f.pointer("pointerdown", 0); f.pointer("pointermove", 2, 20);
  f.pointer("pointermove", 150, 25); f.pointer("pointerup", 150, 25);
  assert.deepEqual(f.answers, []); assert.equal(f.preview.textContent, "");
  assert.equal(f.click(), true); f.dispose();
});
test("release coordinates determine the answer and width is fixed at pointerdown", () => {
  const f = fixture();
  f.pointer("pointerdown", 180); f.pointer("pointermove", 300); f.pointer("pointerup", 185);
  assert.deepEqual(f.answers, []);
  f.pointer("pointerdown", 180); f.pointer("pointermove", 200); f.resize(); f.pointer("pointerup", 80);
  assert.deepEqual(f.answers, ["REAL"]); f.dispose();
});
test("cancel, capture loss, backgrounding, multitouch and disposal never answer", () => {
  for (const cancel of ["pointercancel", "lostpointercapture", "blur", "pagehide", "hidden", "second-contact", "dispose"]) {
    const f = fixture(); f.pointer("pointerdown", 180); f.pointer("pointermove", 280);
    if (cancel === "blur" || cancel === "pagehide") f.win.dispatchEvent(new Event(cancel));
    else if (cancel === "hidden") { f.doc.visibilityState = "hidden"; f.doc.dispatchEvent(new Event("visibilitychange")); }
    else if (cancel === "second-contact") f.pointer("pointerdown", 50, 0, { pointerId: 2, isPrimary: false });
    else if (cancel === "dispose") f.dispose();
    else f.pointer(cancel, 280);
    f.pointer("pointerup", 280);
    assert.deepEqual(f.answers, [], cancel); assert.equal(f.image.style.transform, "", cancel);
    assert.equal(f.captured.size, 0, cancel);
    assert.equal(f.click(), true, cancel + " suppresses the final native zoom click"); f.dispose();
  }
});
test("disabled buttons, expiry, hidden media and detached rounds cannot submit", () => {
  for (const invalidate of ["disabled", "expired", "covered", "detached"]) {
    const f = fixture(); f.pointer("pointerdown", 180); f.pointer("pointermove", 280);
    if (invalidate === "disabled") f.buttons.REAL.disabled = true;
    if (invalidate === "expired") f.expire();
    if (invalidate === "covered") f.doc.documentElement.classList.add("media-obscured");
    if (invalidate === "detached") f.image.isConnected = false;
    f.pointer("pointerup", 280); assert.deepEqual(f.answers, [], invalidate); f.dispose();
  }
});
test("secondary mouse buttons and non-primary pointers do not start swipes", () => {
  for (const extra of [{ button: 2 }, { isPrimary: false }]) {
    const f = fixture(); f.pointer("pointerdown", 180, 0, extra);
    f.pointer("pointermove", 280); f.pointer("pointerup", 280);
    assert.deepEqual(f.answers, []); f.dispose();
  }
});

test("a fresh tap can zoom after a swipe answer even when no native drag click was emitted", () => {
  const f = fixture();
  f.pointer("pointerdown", 180); f.pointer("pointermove", 280); f.pointer("pointerup", 280);
  assert.deepEqual(f.answers, ["AI"]);
  f.pointer("pointerdown", 180); f.pointer("pointerup", 180);
  assert.equal(f.click(), false); f.dispose();
});
