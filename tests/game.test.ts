import { test } from "node:test";
import assert from "node:assert/strict";
import { settings } from "../worker/game.ts";
test("reject invalid settings", () => {
  for (const input of [
    { mode: "bad" },
    { mode: "timed", duration: -1 },
    { mode: "training", count: 1.5 },
    { mode: "training", difficulty: "impossible" },
    { mode: "training", difficulty: "esperto" },
  ])
    assert.throws(() => settings(input));
});
