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
