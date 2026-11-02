import { test } from "node:test";
import assert from "node:assert/strict";
import { explorationRate, preferenceProbability, preferenceOrder, preferenceFeatures, type PreferenceModel } from "../shared/editorial-preferences.ts";
const model: PreferenceModel = { version: "1.0.0", exploration: explorationRate, observations: 200, counts: [{ feature: "visual:quiet_scene", approved: 0, rejected: 100 }, { feature: "visual:active_scene", approved: 100, rejected: 0 }] };
test("human feedback changes a shrunken preference, never creates a permanent exclusion", () => {
  assert.equal(preferenceProbability([], model), .5);
  assert.ok(preferenceProbability(["visual:quiet_scene"], model) > 0);
  assert.ok(preferenceProbability(["visual:active_scene"], model) > .9);
  assert.equal(preferenceProbability(["unseen"], model), .5);
  assert.equal(preferenceProbability(["visual:quiet_scene"], { ...model, counts: [{ feature: "visual:quiet_scene", approved: 0, rejected: 1 }] }), .4);
});
test("exploration keeps rejected styles observable and queue ordering never loses a candidate", () => {
  let state = 193, disliked = 0;
  const rng = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const items = [{ id: "quiet", features: ["visual:quiet_scene"] }, { id: "active", features: ["visual:active_scene"] }];
  for (let i = 0; i < 10000; i++) {
    const ordered = preferenceOrder(items, model, rng);
    if (ordered[0].id === "quiet") disliked++;
    assert.equal(new Set(ordered.map(row => row.id)).size, 2);
  }
  assert.ok(disliked > 1000 && disliked < 3000, String(disliked));
  assert.deepEqual(items.map(row => row.id), ["quiet", "active"]);
});
test("features describe observed content, not the REAL/AI label or private prose", () => {
  assert.deepEqual(preferenceFeatures(["arte", "arte"], ["quiet_scene", "quiet_scene", "AI", "private prompt"]), ["category:arte", "visual:quiet_scene"]);
});
