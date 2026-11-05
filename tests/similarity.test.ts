import { test } from "node:test";
import assert from "node:assert/strict";
import { compareFeatures, compareSameOrigin, hashDistance, normalizedEmbedding, sceneGroups } from "../shared/similarity.ts";
import { curatedSample } from "../worker/sampling.ts";
import { image, scriptedCoins } from "./sampling-fixtures.ts";

const vector = (first: number, second: number) => normalizedEmbedding([first, second, ...Array(382).fill(0)]);
test("REAL and SLOP never enter the same similarity comparison, even with identical bytes and embeddings", () => {
  const real = { origin: "REAL", sha256: "a".repeat(64), dhash: "0000000000000000", embedding: vector(1, 0) };
  assert.equal(compareSameOrigin(real, { ...real, origin: "AI" }), null);
  assert.equal(compareSameOrigin({ ...real, origin: "AI" }, real), null);
  assert.equal(compareSameOrigin(real, { ...real }).reason, "exact");
  const ai = { ...real, origin: "AI" };
  assert.equal(compareSameOrigin(ai, { ...ai }).reason, "exact");
});
test("perceptual and scene families remain separate for REAL and SLOP in new games", () => {
  const real = { ...image("real", "REAL"), perceptual_hash: "0000000000000000", scene_group: "legacy-mixed" };
  const ai = { ...image("ai", "AI"), perceptual_hash: "0000000000000001", scene_group: "legacy-mixed" };
  for (const coin of ["R", "A"]) {
    const result = curatedSample([real, ai], 1, scriptedCoins(coin));
    assert.equal(result.images.length, 1);
    assert.equal(result.images[0].type, coin === "R" ? "REAL" : "AI");
    assert.equal(result.diagnostics.removed, 0);
  }
});
test("similarity separates byte identity, perceptual matches and visually related scenes", () => {
  const a = { sha256: "a".repeat(64), dhash: "0000000000000000", embedding: vector(1, 0) };
  assert.equal(compareFeatures(a, { ...a }).reason, "exact");
  assert.equal(compareFeatures(a, { ...a, sha256: "b".repeat(64), dhash: "000000000000001f", embedding: vector(0, 1) }).reason, "perceptual");
  assert.equal(compareFeatures(a, { ...a, sha256: "b".repeat(64), dhash: "ffffffffffffffff", embedding: vector(0.96, 0.2) }).reason, "visual");
  assert.equal(compareFeatures(a, { ...a, sha256: "b".repeat(64), dhash: "ffffffffffffffff", embedding: vector(0, 1) }).reason, null);
  assert.equal(hashDistance("0000000000000000", "ffffffffffffffff"), 64);
  assert.throws(() => normalizedEmbedding(Array(384).fill(0)));
  assert.throws(() => normalizedEmbedding([1]));
  assert.throws(() => normalizedEmbedding([NaN, ...Array(383).fill(1)]));
  assert.throws(() => normalizedEmbedding(Array(384).fill(1e308)));
});
test("scene groups are transitive and can split when a human reverses an edge", () => {
  const edges = [{ a: "a", b: "b", decision: "same_scene" }, { a: "b", b: "c", decision: "prefer_b" }];
  assert.equal(sceneGroups(edges).get("a"), sceneGroups(edges).get("c"));
  const split = sceneGroups([{ ...edges[0], decision: "different" }, edges[1]]);
  assert.equal(split.has("a"), false);
  assert.equal(split.get("b"), split.get("c"));
  assert.equal(sceneGroups([{ a: "a", b: "b", decision: "pending" }]).size, 0);
});
test("new games use the preferred scene representative before stock and independent coins", () => {
  const a = { ...image("a", "REAL"), scene_group: "scene" };
  const b = { ...image("b", "REAL"), scene_group: "scene", scene_preferred: true };
  const rows = [a, b, image("ai", "AI")];
  const result = curatedSample(rows, 2, scriptedCoins("R"));
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].id, "b");
  assert.equal(result.diagnostics.removed, 1);
  const reversed = curatedSample([a, { ...b, scene_group: null, scene_preferred: false }, image("ai1", "AI"), image("ai2", "AI")], 2, scriptedCoins("RR"));
  assert.equal(reversed.images.length, 2);
});
test("keep both overrides perceptual suggestions including indirect hash paths, but never byte identity", () => {
  const a = { ...image("a", "REAL"), perceptual_hash: "0000000000000000", perceptual_distinct: [image("c", "REAL").sha256] };
  const b = { ...image("b", "REAL"), perceptual_hash: "000000000000001f" };
  const c = { ...image("c", "REAL"), perceptual_hash: "00000000000003ff" };
  const ai = [image("ai1", "AI"), image("ai2", "AI")];
  assert.equal(curatedSample([a, b, c, ...ai], 2, scriptedCoins("RR")).images.length, 2);
  const sameBytes = { ...c, sha256: a.sha256 };
  assert.equal(curatedSample([a, sameBytes, ...ai], 2, scriptedCoins("RR")).images.length, 1);
});
