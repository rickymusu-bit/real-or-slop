import { test } from "node:test";
import assert from "node:assert/strict";
import { curatedSample, dimensions, distributionDistance } from "../worker/sampling.ts";
import { balanced } from "../worker/game.ts";
import { diverseCatalog, image, seeded, skewedCatalog } from "./sampling-fixtures.ts";

test("stratified sample preserves quotas, eligibility, uniqueness and source data for every game size", () => {
  const rows = diverseCatalog();
  const original = JSON.stringify(rows);
  for (let count = 1; count <= 50; count++) {
    const sample = curatedSample([...rows, { ...image("pending", "REAL"), status: "in-review" }], count, seeded(count));
    assert.equal(sample.images.length, count);
    assert.equal(new Set(sample.images.map((row) => row.id)).size, count);
    assert.ok(Math.abs(sample.images.filter((row) => row.type === "REAL").length - sample.images.filter((row) => row.type === "AI").length) <= 1);
    assert.ok(sample.images.every((row) => row.status === "approved" && row.id !== "pending"));
  }
  assert.equal(JSON.stringify(rows), original);
});
test("all six editorial axes and category/medium strata improve on legacy balanced()", () => {
  const rows = skewedCatalog();
  let previousTotal = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const sample = curatedSample(rows, 20, seeded(seed));
    const previous = distributionDistance(balanced(rows, 20, seeded(seed)));
    for (const dimension of dimensions) {
      assert.equal(sample.diagnostics.distances[dimension], 0, dimension);
      previousTotal += previous[dimension]!;
    }
    assert.equal(new Set(sample.images.map((row) => row.categories![0])).size, 2);
    assert.deepEqual(sample.warnings, []);
  }
  assert.ok(previousTotal / (24 * dimensions.length) > 0.6);
});
test("joint category/medium strata detect correlations hidden by equal marginals", () => {
  const rows = (["REAL", "AI"] as const).flatMap((type) => Array.from({ length: 100 }, (_, i) => {
    const category = i < 50 ? 0 : 1;
    const medium = (i % 50 < (type === "REAL" ? 40 : 10) ? category : 1 - category);
    return { ...image(type + i, type), categories: ["category-" + category], curation: { ...image(type + i, type).curation, image_medium: medium ? "foto_colori" : "foto_bn" } };
  }));
  let before = 0, after = 0;
  for (let seed = 1; seed <= 16; seed++) {
    before += distributionDistance(balanced(rows, 20, seeded(seed))).category_medium!;
    after += curatedSample(rows, 20, seeded(seed)).diagnostics.distances.category_medium!;
  }
  assert.ok(after / 16 < 0.1);
  assert.ok(after < before / 3);
});
test("secondary dimensions also affect selection independently", () => {
  for (const dimension of ["subject_kind", "composition", "period_bucket", "country_or_region", "perceived_plausibility"] as const) {
    const rows = skewedCatalog().map((row) => ({ ...image(row.id, row.type), curation: { ...image(row.id, row.type).curation, [dimension]: row.curation![dimension] } }));
    const selected = curatedSample(rows, 20, seeded(73));
    assert.equal(selected.diagnostics.distances[dimension], 0, dimension);
    assert.equal(new Set(selected.images.map((row) => row.curation![dimension])).size, 2);
  }
});
test("duplicate IDs, exact assets, near hashes and contradictory labels never share a session", () => {
  const a = image("a", "REAL"), b = image("b", "AI");
  const sameId = { ...image("a", "REAL"), sha256: "different" };
  const sameHash = { ...image("same-sha", "REAL"), sha256: a.sha256 };
  const sameStorage = { ...image("same-key", "AI"), r2_key: b.r2_key };
  const nearOne = { ...image("near-1", "REAL"), perceptual_hash: "0000000000000000" };
  const nearTwo = { ...image("near-2", "REAL"), perceptual_hash: "000000000000001f" };
  const nearThree = { ...image("near-3", "REAL"), perceptual_hash: "00000000000003ff" };
  const conflict = image("conflict", "REAL");
  const aiConflict = { ...image("ai-conflict", "AI"), sha256: conflict.sha256 };
  const result = curatedSample([a, b, sameId, sameHash, sameStorage, nearOne, nearTwo, nearThree, conflict, aiConflict], 20, seeded(11));
  assert.equal(result.images.length, 3);
  assert.equal(result.diagnostics.removed, 7);
  assert.ok(!result.images.some((row) => row.id.includes("conflict")));
  assert.ok(result.warnings.some((warning) => warning.includes("duplicate")));
  assert.ok(result.warnings.some((warning) => warning.includes("ridotto")));
});
test("missing hashes do not collapse unrelated images; legacy tags and one-class pools fall back explicitly", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ ...image("legacy" + i, "AI"), sha256: "pending", perceptual_hash: i % 2 ? "invalid" : null, curation: null, categories: [] }));
  const result = curatedSample(rows, 10, seeded(1));
  assert.equal(result.images.length, 5);
  assert.ok(result.warnings.some((warning) => warning.includes("50/50")));
  assert.ok(result.warnings.some((warning) => warning.includes("incompleti")));
  assert.ok(Object.values(result.diagnostics.distances).every((distance) => distance === null));
  assert.equal(curatedSample([{ ...image("unapproved", "REAL"), status: "candidate" }], 10).images.length, 0);
  const unknown = curatedSample([
    { ...image("unknown-real", "REAL"), curation: null },
    { ...image("unknown-ai", "AI"), curation: null },
  ], 2, seeded(3));
  assert.equal(unknown.diagnostics.distances.image_medium, null);
  assert.equal(unknown.diagnostics.distances.category_medium, null);
  assert.equal(unknown.diagnostics.distances.category, 0);
});
test("non-overlapping strata signal residual bias without inventing or relabelling images", () => {
  const rows = Array.from({ length: 10 }, (_, index) => image("disjoint" + index, index % 2 ? "REAL" : "AI", index % 2));
  const result = curatedSample(rows, 8, seeded(2));
  assert.ok(result.warnings.some((warning) => warning.includes("non sono comparabili")));
  assert.equal(result.diagnostics.distances.image_medium, 1);
  assert.ok(result.images.every((row) => rows.includes(row)));
});
test("small and asymmetric catalogs exhaust only approved stock and report unavailable quotas", () => {
  for (const scarce of ["REAL", "AI"] as const) {
    const other = scarce === "REAL" ? "AI" : "REAL";
    const rows = [image("scarce", scarce), ...Array.from({ length: 9 }, (_, i) => image("other" + i, other))];
    const result = curatedSample(rows, 6, seeded(7));
    assert.equal(result.images.length, 6);
    assert.equal(result.images.filter((row) => row.type === scarce).length, 1);
    assert.ok(result.warnings.some((warning) => warning.includes("50/50")));
    assert.equal(curatedSample(rows.slice(0, 2), 50, seeded(3)).images.length, 2);
  }
  assert.deepEqual(curatedSample([], 10).images, []);
  assert.throws(() => curatedSample([], 51));
});
test("seeded runs reproduce selection and shuffle final labels without enforcing alternation", () => {
  const rows = diverseCatalog();
  assert.deepEqual(curatedSample(rows, 15, seeded(42)), curatedSample(rows, 15, seeded(42)));
  const orders = new Set<string>();
  for (let seed = 1; seed <= 30; seed++) orders.add(curatedSample(rows, 10, seeded(seed)).images.map((row) => row.type === "REAL" ? "R" : "A").join(""));
  assert.ok(orders.size > 20);
  assert.ok([...orders].some((order) => /RR|AA/.test(order)));
  assert.ok([...orders].some((order) => order.startsWith("R")) && [...orders].some((order) => order.startsWith("A")));
});
