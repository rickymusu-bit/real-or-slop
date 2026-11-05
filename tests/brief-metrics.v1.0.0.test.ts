import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeVector, ROOT, readCatalog, fixtureEncoder, indexCatalog } from "../scripts/index-briefs.v1.0.0.mjs";
import { summarize, cosineDistance, distanceMatrix, pairDistances, neighbors, outliers, pca, dbscan, clusterStability, coverage,
  randomCoverage, spearman, analyzeSpace } from "../scripts/brief-metrics.v1.0.0.mjs";
import { validateConfig, validateReference, validateIndex, validateActivity, rowsFromIndex, csv, exportReport, main } from "../scripts/analyze-briefs.v1.0.0.mjs";

const config = validateConfig(JSON.parse(await readFile(join(ROOT, "data/editorial/brief-metrics.v1.0.0.json"), "utf8")));
const row = (id: string, vector: number[]) => ({ id, vector: normalizeVector(vector, vector.length), revision: 1, status: "draft", medium: "photograph", description: "A subject with the surrounding room visible.", tags: ["objects"], used: null, real_approved: null, slop_approved: null, provenance: "independent_exploration" });
const near = [row("a", [1, 0]), row("b", [1, 0.01]), row("c", [1, -0.01]), row("d", [0, 1]), row("e", [0.01, 1]), row("f", [-0.01, 1]), row("outlier", [-1, -1])];
const matrix = distanceMatrix(near);
async function workspace(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "ros-metrics-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("cosine metrics and interpolated quantiles have analytic values", () => {
  assert.equal(cosineDistance([1, 0], [1, 0]), 0);
  assert.equal(cosineDistance([1, 0], [0, 1]), 1);
  assert.equal(cosineDistance([1, 0], [-1, 0]), 2);
  assert.deepEqual(summarize([]), { n: 0, mean: null, min: null, p10: null, p25: null, median: null, p75: null, p90: null, max: null });
  const s = summarize([0, 1, 2, 3]); assert.equal(s.median, 1.5); assert.equal(s.p90, 2.7);
  assert.throws(() => distanceMatrix([row("x", [1, 0]), row("x", [0, 1])]));
  assert.throws(() => distanceMatrix([{ ...row("x", [1, 0]), vector: [2, 0] }]));
  assert.throws(() => distanceMatrix(near, 2));
});

test("pair reservoir sampling is deterministic, bounded, and explicitly sampled", () => {
  const full = pairDistances(near, matrix, 100, 45), a = pairDistances(near, matrix, 5, 45), b = pairDistances(near, matrix, 5, 46);
  assert.equal(full.total_pairs, 21); assert.equal(full.method, "complete");
  assert.equal(a.sampled_pairs, 5); assert.equal(a.method, "seeded_reservoir");
  assert.deepEqual(a, pairDistances(near, matrix, 5, 45)); assert.notDeepEqual(a.pairs, b.pairs);
  assert.equal(a.histogram.reduce((sum: number, r: { count: number }) => sum + r.count, 0), 5);
});

test("small N, duplicates and equal distances preserve explicit kNN availability and tie order", () => {
  const rows = [row("a", [1, 0]), row("b", [0, 1]), row("c", [0, -1])], nn = neighbors(rows, distanceMatrix(rows));
  assert.deepEqual(nn[0].nearest.map((r: { id: string }) => r.id), ["b", "c"]);
  assert.equal(nn[0].knn[1].state, "computed"); assert.equal(nn[0].knn[5].state, "insufficient_samples");
  assert.equal(nn[0].knn[5].mean_distance, null); assert.equal(nn[0].knn[10].kth_distance, null);
  const dup = [row("a", [1, 0]), row("b", [1, 0])], duplicate = neighbors(dup, distanceMatrix(dup));
  assert.equal(duplicate[0].knn[1].mean_distance, 0); assert.equal(duplicate[0].density.neighbor_fraction, 1);
  assert.equal(neighbors([dup[0]], distanceMatrix([dup[0]]))[0].density.neighbor_fraction, null);
  assert.equal(outliers(duplicate).state, "insufficient_samples");
  const knownOutlier = [...Array.from({ length: 5 }, (_, i) => row("dense" + i, [1, 0])), row("isolated", [-1, 0])];
  // With five other points, the dense rows' mean distances are 0.4 and the outlier's is 2.
  assert.deepEqual(outliers(neighbors(knownOutlier, distanceMatrix(knownOutlier))).ids, ["isolated"]);
});

test("DBSCAN recovers known clusters and leaves a real noise result", () => {
  const c = dbscan(near, matrix, 0.01, 3);
  assert.equal(c.cluster_count, 2); assert.equal(c.noise_count, 1);
  assert.deepEqual(c.clusters.map((r: { ids: string[] }) => r.ids), [["a", "b", "c"], ["d", "e", "f"]]);
  const allNoise = dbscan(near, matrix, 0, 3); assert.equal(allNoise.cluster_count, 0); assert.equal(allNoise.noise_count, 7);
  assert.equal(clusterStability(allNoise, allNoise).pair_jaccard_excluding_noise, null);
  assert.equal(clusterStability(c, c).pair_jaccard_excluding_noise, 1);
  assert.equal(clusterStability(c, allNoise).pair_jaccard_excluding_noise, 0);
  assert.equal(dbscan([], [], 0.1, 3).cluster_count, 0);
  assert.equal(dbscan([near[0]], [[0]], 0.1, 3).noise_count, 1);
  assert.throws(() => dbscan(near, matrix, -1, 3));
});

test("centered PCA recovers rank, total variance and effective dimension; duplicates are zero variance", () => {
  const axes = [row("a", [1, 0]), row("b", [-1, 0]), row("c", [0, 1]), row("d", [0, -1])];
  const result = pca(axes);
  assert.equal(result.state, "computed"); assert.equal(result.numerical_rank, 2);
  assert.ok(Math.abs(result.total_variance - 4 / 3) < 1e-9);
  assert.ok(Math.abs(result.effective_dimension - 2) < 1e-9);
  assert.ok(Math.abs(result.entropy_dimension - 2) < 1e-9);
  assert.ok(Math.abs(result.spectrum.reduce((s: number, r: { explained_fraction: number }) => s + r.explained_fraction, 0) - 1) < 1e-9);
  assert.equal(pca([axes[0]]).state, "insufficient_samples");
  const zero = pca([row("a", [1, 0]), row("b", [1, 0]), row("c", [1, 0])]);
  assert.equal(zero.state, "zero_variance"); assert.equal(zero.effective_dimension, 0);
  assert.ok(zero.projection.every((r: { x: number; y: number }) => r.x === 0 && r.y === 0));
  const sampled = pca(near, { maxSamples: 4, seed: 45 }); assert.equal(sampled.sampled, true); assert.equal(sampled.n, 4);
  assert.deepEqual(sampled, pca(near, { maxSamples: 4, seed: 45 }));
});

test("coverage is a distance to a named reference, with controls separate and empty states explicit", () => {
  const reference = [row("r1", [1, 0]), { ...row("r2", [0, 1]), provenance: "catalog_derived_control" }];
  const result = coverage([row("a", [1, 0])], reference);
  assert.equal(result.candidates[0].min_distance, 0); assert.equal(result.candidates[1].min_distance, 1);
  assert.equal(result.summary.median, 0.5);
  assert.equal(result.by_provenance.independent_exploration.median, 0);
  assert.equal(result.by_provenance.catalog_derived_control.median, 1);
  assert.equal(coverage([], reference).state, "empty_catalog"); assert.equal(coverage([], reference).summary.median, null);
  assert.equal(coverage(near, []).state, "empty_reference");
});

test("random/tag baseline uses identical active population and budget and records seeds", () => {
  const reference = [row("r1", [1, 0])], rows = near.map(r => ({ ...r })); rows[6].status = "retired";
  const a = randomCoverage(rows, reference, 3, 10, 45, ["a", "b", "c"]);
  assert.equal(a.budget, 3); assert.equal(a.active_population, 6);
  assert.ok(a.runs.every((r: { selected_ids: string[] }) => r.selected_ids.length === 3 && !r.selected_ids.includes("outlier")));
  assert.deepEqual(a, randomCoverage(rows, reference, 3, 10, 45, ["a", "b", "c"]));
  assert.throws(() => randomCoverage(rows, reference, 3, 10, 45, ["a", "outlier", "b"]));
  assert.equal(randomCoverage([], reference, 3, 10, 45).state, "insufficient_samples");
});

test("groups preserve unknowns, independent REAL/SLOP approvals, and within-group sample sizes", () => {
  const rows = [
    { ...near[0], used: true, real_approved: true, slop_approved: false },
    { ...near[1], status: "approved", real_approved: true, slop_approved: true },
    { ...near[2], status: "retired", used: false, real_approved: false, slop_approved: false },
  ];
  const result = analyzeSpace(rows, [row("r1", [1, 0])], config);
  assert.equal(result.groups.draft.n, 1); assert.equal(result.groups.approved.n, 1); assert.equal(result.groups.retired.n, 1);
  assert.equal(result.groups.REAL_approved.n, 2); assert.equal(result.groups.SLOP_approved.n, 1);
  assert.equal(result.groups.neither_origin_approved.n, 1); assert.equal(result.groups.usage_unknown.n, 1);
  assert.equal(result.groups.used.within_group_knn[1].n, 0);
  assert.equal(analyzeSpace([], [], config).state, "empty_catalog");
  assert.deepEqual(analyzeSpace([...rows].reverse(), [], config), analyzeSpace(rows, [], config));
});

test("rank correlation handles ties and constants without NaN", () => {
  assert.equal(spearman([0, 1, 2], [0, 1, 2]), 1); assert.equal(spearman([0, 1, 2], [2, 1, 0]), -1);
  assert.equal(spearman([1, 1, 1], [1, 2, 3]), null); assert.equal(spearman([], []), null);
  assert.equal(spearman([1, 1, 2], [2, 2, 3]), 1);
});

test("reference English/provenance, configuration and activity validation reject missing or stale evidence", async () => {
  const ref = JSON.parse(await readFile(join(ROOT, "data/editorial/brief-reference.v1.0.0.json"), "utf8"));
  assert.equal(validateReference(ref).candidates.length, 48);
  const bad = structuredClone(ref); bad.candidates[0].description = "Un ritratto con la stanza visibile.";
  assert.throws(() => validateReference(bad), /English/);
  const duplicate = structuredClone(ref); duplicate.candidates[1].description = duplicate.candidates[0].description;
  assert.throws(() => validateReference(duplicate), /Duplicate/);
  assert.throws(() => validateConfig({ ...config, seed: -1 }));
  assert.throws(() => validateConfig({ ...config, cluster_default_epsilon: 0.123 }));
  assert.throws(() => validateConfig({ ...config, max_pairs: 0 }));
  const catalog = { briefs: [{ id: "a", revision: 2 }] };
  const activity = { version: "1.0.0", kind: "verified_brief_activity", observed_at: "2026-11-05T00:00:00Z", source: "Fixture, never actual evidence", briefs: [{ id: "a", revision: 2, used_in_cycles: ["cycle-one"], real_approved_image_ids: ["real-one", "real-two"], slop_approved_image_ids: null }] };
  const known = validateActivity(activity, catalog);
  const r = rowsFromIndex({ briefs: [{ ...near[0], revision: 2 }] }, { records: [{ vector: [1, 0] }] }, known)[0];
  assert.equal(r.used, true); assert.equal(r.real_approved, true); assert.equal(r.slop_approved, null);
  activity.briefs[0].revision = 1; assert.throws(() => validateActivity(activity, catalog), /stale/);
});

test("offline fixture CLI exports deterministic private JSON/CSV/Markdown; corruption and dry-run are safe", async () => {
  const catalog = await readCatalog(join(ROOT, "data/editorial/briefs.v1.1.0.json"));
  await workspace(async root => {
    const result = await indexCatalog(catalog, fixtureEncoder(), { cache: join(root, "index-cache"), out: join(root, "index") });
    const index = JSON.parse(await readFile(result.snapshot_path, "utf8"));
    assert.throws(() => validateIndex(index, catalog), /Fixture/);
    assert.equal(validateIndex(index, catalog, true), index);
    const altered = structuredClone(index); altered.records[0].vector[0] += 0.1;
    assert.throws(() => validateIndex(altered, catalog, true), /integrity/);
    const out = join(root, "analysis"), args = ["--index", result.snapshot_path, "--fixture", "--out", out];
    assert.equal(await main([...args, "--dry-run"]), 0);
    await assert.rejects(() => readdir(out));
    assert.equal(await main(args), 0);
    const folder = (await readdir(out)).find(name => /^[a-f0-9]{64}$/.test(name)); assert.ok(folder);
    const path = join(out, folder, "report.v1.0.0.json"), before = await readFile(path, "utf8"), report = JSON.parse(before);
    assert.equal(report.primary.n, 100); assert.equal(report.primary.distances.total_pairs, 4950);
    assert.equal(report.activity.state, "not_provided_all_unknown"); assert.equal(report.primary.groups.REAL_approval_unknown.n, 100);
    assert.equal(report.fixture, true); assert.equal(report.network, false); assert.equal(report.automatic_decisions, false);
    assert.equal(report.primary.coverage.candidates.length, 48);
    assert.equal(report.primary.random_baseline.budget, 25);
    assert.equal((await readdir(join(out, folder))).length, 6);
    assert.equal(await main(args), 0); assert.equal(await readFile(path, "utf8"), before);
    assert.doesNotMatch(before, /"vector"\s*:/);
    const { snapshot_id: snapshotId, generated_at: generatedAt, ...core } = report;
    assert.ok(snapshotId && generatedAt);
    await writeFile(join(out, folder, "coverage.v1.0.0.csv"), "corrupted export");
    await assert.rejects(() => exportReport(core, rowsFromIndex(catalog, index), out), /overwrite/);
  });
  assert.equal(csv(["text"], [['a,"b'], ["=1+1"], [null]]), '"text"\n"a,""b"\n"\'=1+1"\n""\n');
});
