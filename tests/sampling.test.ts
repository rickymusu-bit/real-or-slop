import { test } from "node:test";
import assert from "node:assert/strict";
import { curatedSample } from "../worker/sampling.ts";
import { diverseCatalog, image, scriptedCoins, seeded, smallComparableCatalog } from "./sampling-fixtures.ts";

const labels = (rows: { type: string }[]) => rows.map((row) => row.type === "REAL" ? "R" : "A").join("");
test("preflight preserves filters, uniqueness and input for every supported game size", () => {
  const rows = diverseCatalog(), original = JSON.stringify(rows);
  for (let count = 1; count <= 50; count++) {
    const random = seeded(count), expected = seeded(count);
    const sequence = Array.from({ length: count }, () => expected() < 0.5 ? "R" : "A").join("");
    const sample = curatedSample([...rows, { ...image("pending", "REAL"), status: "in-review" }], count, random);
    assert.equal(sample.images.length, count);
    assert.equal(labels(sample.images), sequence);
    assert.equal(new Set(sample.images.map((row) => row.id)).size, count);
    assert.ok(sample.images.every((row) => row.status === "approved" && row.id !== "pending"));
  }
  assert.equal(JSON.stringify(rows), original);
});
test("all 256 eight-round sequences and extreme twelve-round runs are supported without compensation", () => {
  const rows = smallComparableCatalog();
  const sequences = Array.from({ length: 256 }, (_, bits) => bits.toString(2).padStart(8, "0").replaceAll("0", "R").replaceAll("1", "A"));
  sequences.push("R".repeat(12), "A".repeat(12), "R".repeat(10) + "AA", "R".repeat(9) + "AAA");
  for (const sequence of sequences) {
    const result = curatedSample(rows, sequence.length, scriptedCoins(sequence));
    assert.equal(labels(result.images), sequence);
    assert.equal(new Set(result.images.map((row) => row.id)).size, sequence.length);
    assert.deepEqual(result.warnings, []);
  }
});
test("warnings and editorial diagnostics cannot disclose the realized label mix", () => {
  const rows = smallComparableCatalog();
  const a = curatedSample(rows, 12, scriptedCoins("R".repeat(12)));
  const b = curatedSample(rows, 12, scriptedCoins("RA".repeat(6)));
  assert.deepEqual(a.warnings, b.warnings);
  assert.deepEqual(a.diagnostics, b.diagnostics);
});
test("deduplication and contradictory-label exclusions are applied before capacity and coins", () => {
  const a = image("a", "REAL"), b = image("b", "AI");
  const rows = [a, b, { ...image("a", "REAL"), sha256: "different" },
    { ...image("same-sha", "REAL"), sha256: a.sha256 },
    { ...image("same-key", "AI"), r2_key: b.r2_key },
    { ...image("near1", "REAL"), perceptual_hash: "0000000000000000" },
    { ...image("near2", "REAL"), perceptual_hash: "000000000000001f" },
    { ...image("near3", "REAL"), perceptual_hash: "00000000000003ff" },
    image("conflict", "REAL"), { ...image("ai-conflict", "AI"), sha256: image("conflict", "REAL").sha256 }];
  const result = curatedSample(rows, 12, scriptedCoins("R"));
  assert.equal(result.images.length, 1);
  assert.equal(result.diagnostics.removed, 7);
  assert.equal(result.diagnostics.capacity, 1);
  assert.ok(!result.images.some((row) => row.id.includes("conflict")));
  assert.ok(result.warnings.some((warning) => warning.includes("duplicate")));
});
test("small inventories are reduced in advance and never filled using the other class", () => {
  for (const scarce of ["REAL", "AI"] as const) {
    const other = scarce === "REAL" ? "AI" : "REAL";
    const rows = [image("scarce", scarce), ...Array.from({ length: 9 }, (_, i) => image("other" + i, other))];
    for (const coin of ["R", "A"]) {
      const result = curatedSample(rows, 6, scriptedCoins(coin));
      assert.equal(result.images.length, 1);
      assert.equal(labels(result.images), coin);
      assert.ok(result.warnings.some((warning) => warning.includes("ridotto")));
    }
    const none = curatedSample(rows.slice(1), 6);
    assert.equal(none.images.length, 0);
    assert.ok(none.warnings.some((warning) => warning.includes("partita valida")));
  }
  assert.deepEqual(curatedSample([], 10).images, []);
  assert.throws(() => curatedSample([], 51));
});
test("strata broaden inside the eligible catalog without changing label probabilities", () => {
  const rows = Array.from({ length: 20 }, (_, i) => image("disjoint" + i, i % 2 ? "REAL" : "AI", i % 2));
  const sequence = "R".repeat(10);
  const result = curatedSample(rows, 10, scriptedCoins(sequence));
  assert.equal(labels(result.images), sequence);
  assert.equal(result.diagnostics.level, 3);
  assert.ok(Math.abs(result.diagnostics.distances.image_medium! - 1) < 1e-12);
  assert.ok(result.warnings.some((warning) => warning.includes("ampliati")));
  assert.ok(result.warnings.some((warning) => warning.includes("non sono comparabili")));
  assert.ok(result.images.every((row) => rows.includes(row)));
});
test("missing metadata remains unknown, without merging unrelated pending hashes", () => {
  const rows = smallComparableCatalog().map((row) => ({ ...row, sha256: "pending", perceptual_hash: null, curation: null }));
  const result = curatedSample(rows, 12, scriptedCoins("R".repeat(12)));
  assert.equal(result.images.length, 12);
  assert.equal(new Set(result.images.map((row) => row.id)).size, 12);
  assert.equal(result.diagnostics.distances.image_medium, null);
  assert.ok(result.warnings.some((warning) => warning.includes("incompleti")));
});
test("injected seeds reproduce the whole result", () => {
  assert.deepEqual(curatedSample(diverseCatalog(), 12, seeded(42)), curatedSample(diverseCatalog(), 12, seeded(42)));
  assert.equal(labels(curatedSample(diverseCatalog(), 12, seeded(42)).images),
    labels(curatedSample(smallComparableCatalog(), 12, seeded(42)).images));
});
