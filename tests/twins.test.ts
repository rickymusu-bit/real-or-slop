/** Twin SLOP (shared/twins.ts): the sample of the treatment, the proposal of a batch, pairs kept out of the same game. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSample, proposal, separateTwins, spreadPercent, type AutoInput, type Tag } from "../shared/twins";

const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const look = (color: string, medium: string, time: string): Tag[] => [{ label: color, category: "color" }, { label: medium, category: "medium" },
  { label: time, category: "time" }, { label: "riot", category: "event" }];
const real = (id: string, color: string, medium: string, time: string, measured = true) => ({ id, tags: look(color, medium, time), measured });

test("the sample is another measured REAL of the same colour, medium and decade", () => {
  const all = [real("a", "black-and-white", "photo-print", "1960s"), real("b", "black-and-white", "photo-print", "1960s"),
    real("c", "black-and-white", "photo-print", "1960s", false), real("d", "color", "slide", "1960s"), real("e", "black-and-white", "photo-print", "1970s")];
  for (let seed = 1; seed < 30; seed++) assert.equal(pickSample(all[0], all, new Set(), seeded(seed)), "b");
  assert.equal(pickSample(all[3], all), "d", "alone in its look: its own measures");
  assert.ok(["a", "b"].includes(pickSample(all[2], all)!), "an unmeasured source still gets a fitting sample");
  assert.equal(pickSample(real("z", "sepia", "postcard", "1900s", false), [real("z", "sepia", "postcard", "1900s", false)]), null);
});
test("samples already taken in the batch are avoided while others fit", () => {
  const all = ["a", "b", "c"].map(id => real(id, "color", "digital-photo", "2020s"));
  for (let seed = 1; seed < 30; seed++) assert.equal(pickSample(all[0], all, new Set(["b"]), seeded(seed)), "c");
  assert.ok(["b", "c"].includes(pickSample(all[0], all, new Set(["b", "c"]))!));
});

const input = (over: Partial<AutoInput>): AutoInput => ({ real: 60, twinned: 0, waiting: 60, sectionMin: 50, thresholdPercent: 33, enabled: true,
  openBatch: false, ignoredAt: null, ...over });
test("proposal: 100 × (REAL − twins) / REAL against the threshold, at most 10 per batch", () => {
  assert.equal(spreadPercent(60, 0), 100); assert.equal(spreadPercent(60, 60), 0); assert.equal(spreadPercent(0, 0), null);
  assert.deepEqual(proposal(input({})).proposal, { n_real: 60, n_slop: 0, n_new: 0, spread: 60, spread_percent: 100, missing: 60, size: 10 });
  // 15 REAL per 10 twins reaches 33% exactly; one more twin does not.
  assert.equal(proposal(input({ real: 60, twinned: 40, waiting: 20 })).proposal!.size, 10);
  assert.equal(proposal(input({ real: 60, twinned: 41, waiting: 19 })).reason, "none");
  // New twins still to decide take their REAL out of the batch.
  const p = proposal(input({ real: 60, twinned: 30, waiting: 4 })).proposal!;
  assert.deepEqual([p.n_new, p.missing, p.size], [26, 4, 4]);
  assert.equal(proposal(input({ real: 60, twinned: 30, waiting: 0 })).reason, "none");
});
test("no proposal when off, with an open batch, with the studio closed; an ignored one comes back after 10 points", () => {
  assert.equal(proposal(input({ enabled: false })).reason, "disabled");
  assert.equal(proposal(input({ openBatch: true })).reason, "batch_open");
  assert.equal(proposal(input({ real: 49, waiting: 49 })).reason, "studio_closed");
  assert.equal(proposal(input({ twinned: 30, waiting: 30, ignoredAt: 50 })).reason, "none");
  assert.equal(proposal(input({ twinned: 24, waiting: 36, ignoredAt: 50 })).proposal!.missing, 36);
});

const img = (id: string, type: "REAL" | "AI") => ({ id, type });
test("a SLOP and its REAL never stay in the same game, and the sequence of origins does not change", () => {
  const catalogue = [...Array.from({ length: 8 }, (_, i) => img("r" + i, "REAL")), ...Array.from({ length: 8 }, (_, i) => img("s" + i, "AI"))];
  const pairs = new Map(Array.from({ length: 8 }, (_, i) => ["s" + i, "r" + i] as [string, string]));
  const sample = [img("r0", "REAL"), img("s0", "AI"), img("s1", "AI"), img("r1", "REAL"), img("r2", "REAL")];
  for (let seed = 1; seed < 60; seed++) {
    const out = separateTwins(sample, catalogue, pairs, seeded(seed)), ids = new Set(out.map(i => i.id));
    assert.deepEqual(out.map(i => i.type), sample.map(i => i.type));
    assert.equal(ids.size, 5);
    for (const [slop, source] of pairs) assert.ok(!(ids.has(slop) && ids.has(source)), `${slop} with ${source}, seed ${seed}`);
  }
  // Either member may leave.
  const left = new Set(Array.from({ length: 40 }, (_, seed) => separateTwins(sample, catalogue, pairs, seeded(seed + 1))[0].id === "r0"));
  assert.equal(left.size, 2);
});
test("without a free replacement the pair stays; a sample without pairs is returned as it is", () => {
  const sample = [img("r0", "REAL"), img("s0", "AI")], pairs = new Map([["s0", "r0"]]);
  assert.deepEqual(separateTwins(sample, sample, pairs), sample);
  const plain = [img("r0", "REAL"), img("s1", "AI")];
  assert.deepEqual(separateTwins(plain, [...plain, img("s0", "AI")], pairs), plain);
});
