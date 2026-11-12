/** v2.0.0, 2026-11-12T08:00:00Z: 4:5 game copies with the owner's frame (docs/copie-di-gioco.v3.0.0.md), licences without
 * derivatives, size asked to the generator. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GAME_COPY_RECIPE, centredCrop, cropError, cropWidth, gameCopyDimensions, parseCrop } from "../shared/game-copy.v2.0.0.ts";
import { isNoDerivatives } from "../shared/licenses.v1.0.0.ts";
import { generationSize } from "../shared/image-size.v1.0.0.ts";

test("the centred frame is the largest 4:5 rectangle inside the image", () => {
  assert.deepEqual(centredCrop(6000, 4000), { x: 1400, y: 0, height: 4000 });   // landscape: full height
  assert.deepEqual(centredCrop(1024, 1536), { x: 0, y: 128, height: 1280 });    // 2:3 portrait: full width
  assert.deepEqual(centredCrop(1024, 1280), { x: 0, y: 0, height: 1280 });      // already 4:5
  assert.deepEqual(centredCrop(48, 32), { x: 11, y: 0, height: 32 });
  for (const [w, h] of [[6000, 4000], [999, 1001], [3, 2000], [2000, 3], [1, 1]]) {
    const crop = centredCrop(w, h);
    assert.equal(cropError(w, h, crop), "", `${w}×${h}`);
  }
  assert.throws(() => centredCrop(0, 10));
});

test("frames outside the image, too small or malformed are refused", () => {
  assert.equal(cropError(1000, 1000, { x: 0, y: 0, height: 1000 }), "");
  assert.match(cropError(1000, 1000, { x: 201, y: 0, height: 1000 }), /fuori/);
  assert.match(cropError(1000, 1000, { x: 0, y: 1, height: 1000 }), /fuori/);
  assert.match(cropError(1000, 1000, { x: -1, y: 0, height: 500 }), /piccola o fuori/);
  assert.match(cropError(1000, 1000, { x: 0, y: 0, height: 10 }), /piccola/);
  assert.equal(cropError(40, 30, { x: 0, y: 0, height: 30 }), "");             // a tiny image may use its whole height
  assert.match(cropError(1000, 1000, { x: 0.5, y: 0, height: 500 }), /non valida/);
  assert.match(cropError(1000, 1000, null), /mancante/);
  assert.deepEqual(parseCrop("12,0,4000"), { x: 12, y: 0, height: 4000 });
  for (const bad of ["", "1,2", "1,2,3,4", "-1,0,10", "a,b,c", null]) assert.equal(parseCrop(bad), null);
});

test("the copy is 4:5, at most 2048 px high, never enlarged", () => {
  assert.deepEqual(gameCopyDimensions({ x: 0, y: 0, height: 4000 }), { width: 1638, height: 2048 });
  assert.deepEqual(gameCopyDimensions({ x: 0, y: 0, height: 1280 }), { width: 1024, height: 1280 });
  assert.deepEqual(gameCopyDimensions({ x: 0, y: 0, height: 32 }), { width: 26, height: 32 });
  assert.equal(cropWidth(1280), 1024);
  assert.equal(GAME_COPY_RECIPE, "webp-q0.85-4x5-max2048-srgb-v2");
});

test("licences without derivatives are recognised", () => {
  for (const name of ["CC BY-ND 4.0", "CC BY-NC-ND 3.0", "cc-by-nd-2.0", "Creative Commons Attribution-NoDerivs 2.0", "Attribution-NoDerivatives 4.0 International"])
    assert.equal(isNoDerivatives(name), true, name);
  assert.equal(isNoDerivatives("", "https://creativecommons.org/licenses/by-nd/4.0/"), true);
  assert.equal(isNoDerivatives("", "https://creativecommons.org/licenses/by-nc-nd/2.0/deed.en"), true);
  for (const name of ["CC BY-SA 4.0", "CC BY 2.0", "Public domain", "CC0", "GFDL", "Attribution and share alike", ""])
    assert.equal(isNoDerivatives(name, "https://creativecommons.org/licenses/by-sa/4.0/"), false, name);
});

test("the generator is asked for 4:5 where the model accepts custom sizes", () => {
  assert.equal(generationSize("gpt-image-2.5-flare"), "1024x1280");
  assert.equal(generationSize("gpt-image-2.6-sunburst"), "1024x1280");
  assert.equal(generationSize("gpt-image-2"), "1024x1536");
  assert.equal(generationSize("gpt-image-1.5"), "1024x1536");
});
