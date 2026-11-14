/** Proposal of an automatic SLOP batch by group (shared/slop-auto.ts) and the counts per group (shared/slop-groups.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { candidates, proposal, spreadPercent, type AutoInput } from "../shared/slop-auto";
import { groupCounts, groupOf, parseGroup, type GroupCount } from "../shared/slop-groups";

const group = (key: string, real: number, slop: number, fresh = 0): GroupCount => ({ ...parseGroup(key)!, real, slop, fresh });
const input = (groups: GroupCount[], over: Partial<AutoInput> = {}): AutoInput => ({
  groups, realTotal: 60, sectionMin: 50, groupMin: 5, thresholdPercent: 33, enabled: true, openBatch: false, ignored: new Map(), ...over });

test("a group is a Genre and a Time tag", () => {
  assert.deepEqual(parseGroup("mugshot/1960s"), { key: "mugshot/1960s", genre: "mugshot", time: "1960s" });
  assert.equal(parseGroup("mugshot"), null);
  assert.equal(parseGroup("mugshot/1965"), null);
  assert.deepEqual(groupOf([{ label: "1960s", category: "time" }, { label: "mugshot", category: "genre" }, { label: "police", category: "people" }])?.key, "mugshot/1960s");
  assert.equal(groupOf([{ label: "mugshot", category: "genre" }]), null);
});
test("counts per group: approved and published REAL and SLOP, new SLOP apart, trash and new REAL out", () => {
  const counts = groupCounts([
    { origin: "REAL", status: "published", group: "mugshot/1960s" }, { origin: "REAL", status: "approved", group: "mugshot/1960s" },
    { origin: "REAL", status: "new", group: "mugshot/1960s" }, { origin: "SLOP", status: "approved", group: "mugshot/1960s" },
    { origin: "SLOP", status: "new", group: "mugshot/1960s" }, { origin: "SLOP", status: "trash", group: "mugshot/1960s" },
    { origin: "REAL", status: "published", group: null }, { origin: "REAL", status: "published", group: "crowd-scene/2010s" },
  ]);
  assert.deepEqual(counts.map(c => [c.key, c.real, c.slop, c.fresh]), [["crowd-scene/2010s", 1, 0, 0], ["mugshot/1960s", 2, 1, 1]]);
});
test("spread percent: 100 without SLOP, 33 with 15 REAL and 10 SLOP, 0 at parity, negative beyond, none without REAL", () => {
  assert.equal(spreadPercent(20, 0), 100);
  assert.equal(Math.round(spreadPercent(15, 10)!), 33);
  assert.equal(spreadPercent(10, 10), 0);
  assert.equal(spreadPercent(10, 15), -50);
  assert.equal(spreadPercent(0, 3), null);
});
test("threshold of 33%: 1.5 REAL per SLOP reaches it, a smaller gap does not", () => {
  assert.deepEqual(candidates(input([group("a/1960s", 15, 10)])).map(c => c.group), ["a/1960s"]);
  assert.deepEqual(candidates(input([group("a/1960s", 15, 11)])), []);
  assert.deepEqual(candidates(input([group("a/1960s", 20, 11)], { thresholdPercent: 50 })), []);
});
test("missing = n_real − n_slop − n_new, never more SLOP than REAL; the batch holds at most 10", () => {
  const [c] = candidates(input([group("press-photo/1960s", 24, 4, 2)]));
  assert.deepEqual({ spread: c.spread, missing: c.missing, size: c.size, genre: c.genre, time: c.time },
    { spread: 20, missing: 18, size: 10, genre: "press-photo", time: "1960s" });
  assert.equal(candidates(input([group("a/1960s", 7, 0, 3)]))[0].size, 4);
  assert.deepEqual(candidates(input([group("a/1960s", 12, 2, 10)])), []);
});
test("at least the group threshold of REAL (5 by default)", () => {
  assert.deepEqual(candidates(input([group("a/1960s", 4, 0)])), []);
  assert.equal(candidates(input([group("a/1960s", 5, 0)]))[0].size, 5);
  assert.equal(candidates(input([group("a/1960s", 4, 0)], { groupMin: 3 }))[0].group, "a/1960s");
});
test("one proposal: highest percentage, then most missing, then alphabetical; an ignored group comes back after 10 points", () => {
  const groups = [group("b/1960s", 20, 10), group("c/1960s", 12, 0), group("a/1960s", 40, 0), group("d/1960s", 12, 0)];
  assert.deepEqual(candidates(input(groups)).map(c => c.group), ["a/1960s", "c/1960s", "d/1960s", "b/1960s"]);
  const ignored = new Map([["a/1960s", 50]]);
  assert.deepEqual(candidates(input([group("a/1960s", 20, 10)], { ignored })), []);
  assert.equal(candidates(input([group("a/1960s", 20, 8)], { ignored }))[0].group, "a/1960s");
});
test("no proposal when off, with an open batch, with the studio closed, or without candidates", () => {
  const groups = [group("a/1960s", 20, 0)];
  assert.deepEqual(proposal(input(groups, { enabled: false })), { proposal: null, reason: "disabled" });
  assert.deepEqual(proposal(input(groups, { openBatch: true })), { proposal: null, reason: "batch_open" });
  assert.deepEqual(proposal(input(groups, { realTotal: 49 })), { proposal: null, reason: "studio_closed" });
  assert.deepEqual(proposal(input([group("a/1960s", 20, 20)])), { proposal: null, reason: "none" });
});
