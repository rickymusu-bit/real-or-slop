import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalText, fixtureEncoder, hash, indexCatalog, lexicalEncoder, MODEL, normalizeVector,
  recordKey, readCatalog, ROOT, stable, validateVector, compareRepresentations, immutableJSON, main } from "../scripts/index-briefs.v1.0.0.mjs";

const englishPath = join(ROOT, "data/editorial/briefs.v1.1.0.json");
const catalog = await readCatalog(englishPath);
const small = { ...catalog, briefs: catalog.briefs.slice(0, 3) };
async function workspace(run: (paths: { cache: string; out: string; root: string }) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "ros-brief-index-"));
  try { await run({ root, cache: join(root, "cache"), out: join(root, "snapshots") }); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("canonical embedding text excludes prompts, queries, tags, IDs and status", () => {
  const row = catalog.briefs[0];
  assert.equal(canonicalText(row), row.description + "\nMedium: photograph");
  assert.equal(canonicalText({ ...row, slop_prompt: "boilerplate", search_queries: ["Italian query"], tags: ["noise"], status: "retired" }), canonicalText(row));
  assert.equal(canonicalText({ ...row, description: " A  cat\n with a room. " }), "A cat with a room.\nMedium: photograph");
  assert.throws(() => canonicalText({ description: "", medium: "photograph" }));
});

test("finite, nonempty normalized vectors are mandatory", () => {
  for (const invalid of [[], [0, 0], [NaN, 1], [Infinity, 1], ["1", 2], [1e308, 1e308, 1e308, 1e308]]) {
    assert.throws(() => normalizeVector(invalid, invalid.length));
  }
  assert.throws(() => normalizeVector([1, 2], 3));
  assert.throws(() => validateVector([1, 1], 2));
  assert.deepEqual(validateVector(normalizeVector([3, 4], 2), 2), [0.6, 0.8]);
});

test("100-brief fixture index is repeatable, private, immutable and cache-only on repeat", async () => {
  await workspace(async paths => {
    const first = await indexCatalog(catalog, fixtureEncoder(), paths);
    assert.equal(first.processed, 100); assert.equal(first.indexed, 100); assert.equal(first.errors.length, 0);
    const before = await readFile(first.snapshot_path, "utf8");
    const neverEncode = { metadata: fixtureEncoder().metadata, encode: async () => { throw Error("Must reuse cache"); } };
    const second = await indexCatalog(catalog, neverEncode, paths);
    assert.equal(second.cache_hits, 100); assert.equal(second.processed, 0); assert.equal(second.snapshot_id, first.snapshot_id);
    assert.equal(await readFile(second.snapshot_path, "utf8"), before);
    assert.equal((await readdir(paths.out)).length, 1);
    const snapshot = JSON.parse(before);
    assert.ok(snapshot.records.every((r: { state: string; dimension: number; vector: number[]; brief_revision: number }) =>
      r.state === "complete" && r.dimension === 32 && r.vector.length === 32 && r.brief_revision === 2));
    assert.ok(snapshot.encoder.semantic === false);
  });
});

test("cache identity includes brief revision, full content, representation and complete encoder configuration", async () => {
  const row = catalog.briefs[0], metadata = fixtureEncoder().metadata;
  const original = recordKey(row, metadata);
  for (const changed of [{ ...row, revision: 3 }, { ...row, description: "A cat with a visible room." }, { ...row, tags: ["portraits"] }, { ...row, slop_prompt: "A different independent prompt." }]) {
    assert.notEqual(recordKey(changed, metadata), original);
  }
  for (const changed of [{ ...metadata, revision: "1.0.1" }, { ...metadata, dimension: 64 }, { ...metadata, normalization: "none" }, { ...metadata, runtime: "different" }]) {
    assert.notEqual(recordKey(row, changed), original);
  }
  assert.notEqual(recordKey(row, metadata, "structured.v1.0.0"), original);
  assert.equal(recordKey({ ...row, tags: [...row.tags] }, metadata), original);
  assert.equal(hash({ a: 1, b: 2 }), hash({ b: 2, a: 1 }));
  assert.equal(MODEL.dimension, 384); assert.match(MODEL.revision, /^[a-f0-9]{40}$/);
  await workspace(async paths => {
    const first = await indexCatalog(small, fixtureEncoder(), paths);
    const revised = structuredClone(small); revised.briefs[0].revision++;
    const second = await indexCatalog(revised, fixtureEncoder(), paths);
    assert.equal(second.cache_hits, 2); assert.equal(second.processed, 1);
    assert.notEqual(first.snapshot_id, second.snapshot_id);
    assert.equal((await readdir(paths.out)).length, 2);
    const model = fixtureEncoder(); model.metadata.revision = "1.0.1";
    const newModel = await indexCatalog(small, model, paths);
    assert.equal(newModel.processed, 3); assert.equal(newModel.cache_hits, 0);
    assert.notEqual(newModel.snapshot_id, first.snapshot_id);
    assert.equal((await readdir(paths.out)).length, 3);
  });
});

test("dry-run never encodes or creates directories and CLI rejects the Italian catalogue", async () => {
  await workspace(async paths => {
    const encoder = { metadata: { ...MODEL }, encode: async () => { throw Error("Dry run must not infer"); } };
    const result = await indexCatalog(small, encoder, { ...paths, dryRun: true });
    assert.equal(result.planned, 3); assert.equal(result.processed, 0); assert.equal(result.snapshot_path, null);
    assert.deepEqual(await readdir(paths.root), []);
    assert.equal(await main(["--dry-run", "--cache", paths.cache, "--out", paths.out]), 0);
    assert.deepEqual(await readdir(paths.root), []);
  });
  assert.throws(() => readCatalog(join(ROOT, "data/editorial/briefs.v1.json")), /inglese/);
  await assert.rejects(() => main(["--encoder", "paid-api"]));
});

test("malformed model output and cache tampering are reported without overwrites or a complete snapshot", async () => {
  await workspace(async paths => {
    const badEncoder = { ...fixtureEncoder(), encode: async () => [0] };
    const failed = await indexCatalog(small, badEncoder, paths);
    assert.equal(failed.errors.length, 3); assert.equal(failed.snapshot_path, null);
    const first = await indexCatalog(small, fixtureEncoder(), paths);
    const key = recordKey(small.briefs[0], fixtureEncoder().metadata), path = join(paths.cache, key + ".v1.0.0.json");
    const original = await readFile(path, "utf8"), corrupted = JSON.parse(original);
    corrupted.vector[0] += 0.01;
    await writeFile(path, JSON.stringify(corrupted));
    const second = await indexCatalog(small, fixtureEncoder(), paths);
    assert.equal(second.errors.length, 1); assert.equal(second.cache_hits, 2); assert.equal(second.snapshot_path, null);
    assert.equal(await readFile(path, "utf8"), JSON.stringify(corrupted));
    assert.ok(await readFile(first.snapshot_path, "utf8"));
    await writeFile(path, original);
    assert.equal((await indexCatalog(small, fixtureEncoder(), paths)).cache_hits, 3);
    const metadata = JSON.parse(original); metadata.encoder.revision = "forged";
    await writeFile(path, JSON.stringify(metadata));
    assert.equal((await indexCatalog(small, fixtureEncoder(), paths)).errors.length, 1);
  });
});

test("partial failure resumes only missing records and snapshots cannot be replaced", async () => {
  await workspace(async paths => {
    const good = fixtureEncoder(); let calls = 0;
    const flaky = { ...good, encode: async (text: string) => { if (++calls === 2) throw Error("Fixture interruption"); return good.encode(text); } };
    const partial = await indexCatalog(small, flaky, paths);
    assert.equal(partial.processed, 2); assert.equal(partial.errors.length, 1); assert.equal(partial.complete, false);
    const resumed = await indexCatalog(small, good, paths);
    assert.equal(resumed.cache_hits, 2); assert.equal(resumed.processed, 1); assert.equal(resumed.complete, true);
    await assert.rejects(() => immutableJSON(resumed.snapshot_path, { forged: true }), /overwrite/);
  });
});

test("TF-IDF baseline is fitted to the corpus, deterministic, finite and distinct from semantic and fixture encoders", async () => {
  const texts = catalog.briefs.map(canonicalText), a = lexicalEncoder(texts), b = lexicalEncoder([...texts].reverse());
  assert.equal(stable(a.metadata), stable(b.metadata));
  assert.deepEqual(await a.encode(texts[0]), await b.encode(texts[0]));
  const changed = lexicalEncoder([...texts, "A cat with the room visible."]);
  assert.notEqual(changed.metadata.fit_sha256, a.metadata.fit_sha256);
  assert.notEqual(a.metadata.id, MODEL.id); assert.notEqual(a.metadata.id, fixtureEncoder().metadata.id);
  for (const text of texts) validateVector(await a.encode(text), a.metadata.dimension);
});

test("canonical and structured representations use the same explicit annotated sample", async () => {
  const annotations = JSON.parse(await readFile(join(ROOT, "data/editorial/brief-annotations.v1.0.0.json"), "utf8"));
  const result = await compareRepresentations(catalog, annotations, lexicalEncoder);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].annotated_triplets, result.results[1].annotated_triplets);
  assert.ok(result.results.every((r: { agreement: number }) => r.agreement >= 0 && r.agreement <= 1));
  assert.match(result.annotation_status, /not_independent_human_validation/);
  annotations.samples[0].brief_id = "unknown";
  await assert.rejects(() => compareRepresentations(catalog, annotations, fixtureEncoder));
});
