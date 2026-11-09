/** v1.0.0, 2026-11-09T11:00:00Z: shared game copy recipe (docs/copie-di-gioco.v1.0.0.md). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GAME_COPY, GAME_COPY_RECIPE, gameCopyDimensions } from "../shared/game-copy.v1.0.0.ts";

test("longest side capped at 2048 px, proportions kept, never enlarged", () => {
  assert.deepEqual(gameCopyDimensions(6000, 4000), { width: 2048, height: 1365 });
  assert.deepEqual(gameCopyDimensions(4000, 6000), { width: 1365, height: 2048 });
  assert.deepEqual(gameCopyDimensions(9504, 6336), { width: 2048, height: 1365 });
  assert.deepEqual(gameCopyDimensions(1024, 1536), { width: 1024, height: 1536 });
  assert.deepEqual(gameCopyDimensions(48, 48), { width: 48, height: 48 });
  assert.deepEqual(gameCopyDimensions(20000, 3), { width: 2048, height: 1 });
  assert.throws(() => gameCopyDimensions(0, 10));
  assert.throws(() => gameCopyDimensions(10.5, 10));
});
test("recipe is the same for REAL and SLOP and names its parameters", () => {
  assert.equal(GAME_COPY.mime, "image/webp");
  assert.equal(GAME_COPY_RECIPE, "webp-q0.85-max2048-srgb-v1");
});
