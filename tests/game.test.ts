import { test } from "node:test";
import assert from "node:assert/strict";
import { settings } from "../worker/game.ts";
test("reject invalid settings", () => {
  for (const input of [
    { mode: "bad" },
    { mode: "timed", duration: -1 },
    { mode: "training", count: 1.5 },
  ])
    assert.throws(() => settings(input));
});

test("retired difficulty never filters or changes new settings, including legacy clients", () => {
  for (const difficulty of ["facile", "medio", "difficile", "esperto", "impossible"]) {
    assert.deepEqual(settings({mode: "training", difficulty}), settings({mode: "training"}));
    assert.ok(!("difficulty" in settings({mode: "training", difficulty})));
  }
});
