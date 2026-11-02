import { test } from "node:test";
import assert from "node:assert/strict";
import { settings } from "../worker/game.ts";
test("reject invalid settings", () => {
  for (const input of [
    { mode: "bad" },
    { mode: "timed", roundSeconds: -1 },
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

test("per-image duration is explicit and the retired total duration cannot set a new deadline", () => {
  assert.equal(settings({ mode: "timed" }).roundSeconds, 20);
  assert.equal(settings({ mode: "timed", count: 7, roundSeconds: 10, duration: 180 }).count, 7);
  assert.ok(!("duration" in settings({ mode: "timed", duration: 180 })));
  for (const roundSeconds of [0, 60, 20.5, "20"]) assert.throws(() => settings({ mode: "timed", roundSeconds }));
});
