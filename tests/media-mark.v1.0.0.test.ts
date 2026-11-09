/** v1.0.0, 2026-11-09T10:00:00Z: «RS» mark inside the rendered picture, never on letterbox bands. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { markPlacement } from "../src/media-mark.v1.0.0.ts";

test("landscape photo in a tall box: mark above the bottom band, at the picture's right edge", () => {
  // 1000×500 shown in a 400×400 box: 400×200 picture, 100 px bands above and below.
  const at = markPlacement({ box: { left: 0, top: 0, width: 400, height: 400 }, natural: { width: 1000, height: 500 }, parent: { width: 400, height: 400 }, fit: "contain" })!;
  assert.equal(at.fontSize, 14); // 6.5% of 200 is 13: readable minimum
  assert.equal(at.right, 5); // gap 2.5% of 200
  assert.equal(at.bottom, 105);
});

test("portrait photo in a wide box: mark left of the right band", () => {
  // 600×900 in an 800×600 box: 400×600 picture, 200 px bands left and right.
  const at = markPlacement({ box: { left: 0, top: 0, width: 800, height: 600 }, natural: { width: 600, height: 900 }, parent: { width: 800, height: 600 }, fit: "contain" })!;
  assert.equal(at.fontSize, 26); // 6.5% of the 400 px short side
  assert.equal(at.right, 210);
  assert.equal(at.bottom, 10);
});

test("image box equal to the picture (zoom dialog) and offsets inside the parent", () => {
  const at = markPlacement({ box: { left: 12, top: 30, width: 600, height: 300 }, natural: { width: 1200, height: 600 }, parent: { width: 640, height: 342 }, fit: "fill" })!;
  assert.equal(at.right, 640 - 612 + 8);
  assert.equal(at.bottom, 342 - 330 + 8);
});

test("not yet decoded or hidden images get no mark", () => {
  assert.equal(markPlacement({ box: { left: 0, top: 0, width: 400, height: 300 }, natural: { width: 0, height: 0 }, parent: { width: 400, height: 300 }, fit: "contain" }), null);
  assert.equal(markPlacement({ box: { left: 0, top: 0, width: 0, height: 0 }, natural: { width: 10, height: 10 }, parent: { width: 0, height: 0 }, fit: "contain" }), null);
});
