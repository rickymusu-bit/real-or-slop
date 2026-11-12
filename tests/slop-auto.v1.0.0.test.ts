/** v1.0.0, 2026-11-12T21:00:00Z: proposal of an automatic SLOP batch (shared/slop-auto.v1.0.0.ts, docs/proposta-generazione-slop.v2.0.0.md). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { candidates, proposal, spreadPercent, type AutoInput, type TagCount } from "../shared/slop-auto.v1.0.0";

const tag = (label: string, real: number, slop: number, fresh = 0): TagCount => ({ label, real, slop, fresh });
const input = (tags: TagCount[], over: Partial<AutoInput> = {}): AutoInput => ({
  tags, realTotal: 60, sectionMin: 50, themeMin: 10, thresholdPercent: 33, enabled: true, openBatch: false, ignored: new Map(), ...over });

test("spread percent: 100 without SLOP, 33 with 15 REAL and 10 SLOP, 0 at parity, negative beyond, none without REAL", () => {
  assert.equal(spreadPercent(20, 0), 100);
  assert.equal(Math.round(spreadPercent(15, 10)!), 33);
  assert.equal(spreadPercent(10, 10), 0);
  assert.equal(spreadPercent(10, 15), -50);
  assert.equal(spreadPercent(0, 3), null);
});

test("threshold of 33%: 1.5 REAL per SLOP reaches it, a smaller gap does not", () => {
  assert.deepEqual(candidates(input([tag("a", 15, 10)])).map(c => c.tag), ["a"]);
  assert.deepEqual(candidates(input([tag("a", 15, 11)])), []);
  assert.deepEqual(candidates(input([tag("a", 20, 10)], { thresholdPercent: 50 })).map(c => c.tag), ["a"]);
  assert.deepEqual(candidates(input([tag("a", 20, 11)], { thresholdPercent: 50 })), []);
});

test("missing = n_real − n_slop − n_new; the batch holds at most 10", () => {
  const [c] = candidates(input([tag("architecture", 24, 4, 2)]));
  assert.equal(Math.round(c.spread_percent), 83);
  assert.deepEqual({ spread: c.spread, missing: c.missing, size: c.size }, { spread: 20, missing: 18, size: 10 });
  assert.equal(candidates(input([tag("a", 12, 2, 3)]))[0].size, 7);
});

test("new SLOP covering the spread stop the proposal for that tag", () => {
  assert.deepEqual(candidates(input([tag("a", 12, 2, 10)])), []);
  assert.deepEqual(candidates(input([tag("a", 12, 2, 11)])), []);
  assert.equal(candidates(input([tag("a", 12, 2, 9)]))[0].missing, 1);
});

test("at least the theme threshold of REAL", () => {
  assert.deepEqual(candidates(input([tag("a", 9, 0)])), []);
  assert.equal(candidates(input([tag("a", 10, 0)]))[0].tag, "a");
  assert.equal(candidates(input([tag("a", 9, 0)], { themeMin: 5 }))[0].tag, "a");
});

test("one proposal: highest percentage, then most missing, then alphabetical", () => {
  const tags = [tag("b", 20, 10), tag("c", 12, 0), tag("a", 40, 0), tag("d", 12, 0)];
  assert.deepEqual(candidates(input(tags)).map(c => c.tag), ["a", "c", "d", "b"]);
  assert.equal(proposal(input(tags)).proposal!.tag, "a");
});

test("an ignored tag comes back only after 10 more points", () => {
  const ignored = new Map([["a", 50]]);
  assert.deepEqual(candidates(input([tag("a", 20, 10)], { ignored })), []);
  assert.deepEqual(candidates(input([tag("a", 20, 9)], { ignored })), []);
  assert.equal(candidates(input([tag("a", 20, 8)], { ignored }))[0].tag, "a");
  assert.equal(proposal(input([tag("a", 20, 10), tag("b", 12, 6)], { ignored })).proposal!.tag, "b");
});

test("no proposal when off, with an open batch, with the studio closed, or without candidates", () => {
  const tags = [tag("a", 20, 0)];
  assert.deepEqual(proposal(input(tags, { enabled: false })), { proposal: null, reason: "disabled" });
  assert.deepEqual(proposal(input(tags, { openBatch: true })), { proposal: null, reason: "batch_open" });
  assert.deepEqual(proposal(input(tags, { realTotal: 49 })), { proposal: null, reason: "studio_closed" });
  assert.deepEqual(proposal(input([tag("a", 20, 20)])), { proposal: null, reason: "none" });
});
