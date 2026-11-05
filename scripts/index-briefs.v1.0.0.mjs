/** Private offline brief index. No Worker/frontend imports or paid API adapters. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { parseArgs } from "node:util";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const VERSION = "1.0.0";
export const MODEL = Object.freeze({
  id: "Xenova/all-MiniLM-L6-v2", revision: "751bff37182d3f1213fa05d7196b954e230abad9",
  dimension: 384, dtype: "q8", pooling: "mean", normalization: "l2", device: "cpu",
  runtime: "@huggingface/transformers@3.8.1", max_tokens: 256,
});
const FORMAT = "description-medium.v1.0.0";
const FIXTURE_DIMENSION = 32;
export const hash = value => createHash("sha256").update(typeof value === "string" ? value : stable(value)).digest("hex");
export function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
function requireValue(condition, message) { if (!condition) throw Error(message); }
async function json(path) { return JSON.parse(await readFile(path, "utf8")); }
export function canonicalText(row) {
  requireValue(row && typeof row.description === "string" && row.description.trim() && ["photograph", "artwork"].includes(row.medium), "Missing description or medium");
  return row.description.normalize("NFKC").trim().replace(/\s+/gu, " ") + "\nMedium: " + row.medium;
}
export function normalizeVector(vector, dimension) {
  requireValue(Array.isArray(vector) && Number.isSafeInteger(dimension) && dimension > 0 && vector.length === dimension && vector.every(v => typeof v === "number" && Number.isFinite(v)), "Malformed embedding: finite nonempty vector of declared dimension required");
  const norm = Math.hypot(...vector);
  requireValue(Number.isFinite(norm) && norm > 1e-12, "Malformed embedding norm");
  return vector.map(v => v / norm);
}
export function validateVector(vector, dimension) {
  normalizeVector(vector, dimension);
  requireValue(Math.abs(Math.hypot(...vector) - 1) < 1e-6, "Embedding must already be L2 normalized");
  return vector;
}
export function readCatalog(path) {
  // The existing validator owns schema, IDs, prompt independence and language.
  // Shell-free invocation keeps arbitrary paths out of command interpolation.
  try {
    execFileSync("python3", ["-m", "pipeline.v2.brief_catalog", "--catalog", resolve(path), "--check", "--english"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    throw Error(error.stdout?.toString().trim() || error.stderr?.toString().trim() || "Invalid canonical English catalogue");
  }
  return json(path);
}
const tokens = text => text.toLowerCase().match(/[a-z]+/g) || [];
export function lexicalEncoder(texts) {
  // Exact corpus fit is part of model identity; a new corpus never reuses old IDF.
  const documents = texts.map(t => new Set(tokens(t)));
  const vocabulary = [...new Set(documents.flatMap(d => [...d]))].sort();
  requireValue(vocabulary.length > 0, "Empty TF-IDF corpus");
  const idf = vocabulary.map(word => Math.log((1 + documents.length) / (1 + documents.filter(d => d.has(word)).length)) + 1);
  const metadata = { id: "real-or-slop/tfidf", revision: VERSION, dimension: vocabulary.length,
    normalization: "l2", tokenizer: "ascii-lower-words.v1.0.0", tf: "raw", idf_formula: "log((1+n)/(1+df))+1",
    fit_sha256: hash({ vocabulary, idf, documents: texts.map(hash).sort() }), vocabulary, idf };
  return { metadata, encode: async text => {
    const counts = new Map(); for (const word of tokens(text)) counts.set(word, (counts.get(word) || 0) + 1);
    return normalizeVector(vocabulary.map((word, i) => (counts.get(word) || 0) * idf[i]), vocabulary.length);
  } };
}
export function fixtureEncoder() {
  return { metadata: { id: "real-or-slop/fixture-hash", revision: VERSION, dimension: FIXTURE_DIMENSION, normalization: "l2", semantic: false },
    encode: async text => normalizeVector([...createHash("sha256").update(text).digest()].map(v => v - 127.5), FIXTURE_DIMENSION) };
}
export function modelEncoder({ cacheDir, allowDownload = false } = {}) {
  let extractorPromise;
  async function load() {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.cacheDir = resolve(cacheDir || join(ROOT, ".pipeline/brief-models"));
      env.allowLocalModels = true;
      env.localModelPath = join(env.cacheDir, "local");
      env.allowRemoteModels = allowDownload;
      return pipeline("feature-extraction", MODEL.id, { revision: MODEL.revision, dtype: MODEL.dtype, device: MODEL.device, local_files_only: !allowDownload });
  }
  return { metadata: { ...MODEL }, encode: async text => {
    // Lazy: cache hits and --dry-run never load ONNX or contact a model host.
    // A missing model also fails once per process, without 100 reload attempts.
    extractorPromise ||= load();
    const extractor = await extractorPromise;
    // Reject truncation rather than silently discarding composition at the tail.
    const encoded = await extractor.tokenizer(text);
    requireValue(encoded.input_ids.dims.at(-1) <= MODEL.max_tokens, "Brief exceeds MiniLM's documented 256-token window");
    const output = await extractor(text, { pooling: MODEL.pooling, normalize: true, truncation: true, max_length: MODEL.max_tokens });
    requireValue(output.dims.at(-1) === MODEL.dimension, "Incompatible MiniLM output shape");
    return normalizeVector(Array.from(output.data), MODEL.dimension);
  } };
}
export function recordKey(row, metadata, representation = FORMAT, text = canonicalText(row)) {
  return hash({ version: VERSION, brief_id: row.id, brief_revision: row.revision,
    content_sha256: hash(row), text_sha256: hash(text), representation, encoder: metadata });
}
async function readCache(path) {
  try { return await json(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
export async function immutableJSON(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try { await writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    requireValue(stable(await json(path)) === stable(value), "Refusing to overwrite immutable snapshot: " + path);
  }
}
function validateRecord(record, expected) {
  requireValue(record && Object.keys(expected).every(key => stable(record[key]) === stable(expected[key])) && record.state === "complete" &&
    typeof record.generated_at === "string" && Number.isFinite(Date.parse(record.generated_at)), "Cache metadata mismatch");
  validateVector(record.vector, expected.encoder.dimension);
  requireValue(record.vector_sha256 === hash(record.vector), "Cache vector checksum mismatch");
  return record;
}
export async function indexCatalog(catalog, encoder, { cache, out, dryRun = false, generatedAt = new Date().toISOString() } = {}) {
  requireValue(cache && out, "Private cache and snapshot paths required");
  const texts = catalog.briefs.map(canonicalText);
  const stats = { total: catalog.briefs.length, processed: 0, cache_hits: 0, planned: 0, errors: [], estimated_api_cost_usd: 0, paid_api_enabled: false };
  const records = [], keys = [];
  for (const [i, row] of catalog.briefs.entries()) {
    const key = recordKey(row, encoder.metadata, FORMAT, texts[i]);
    keys.push(key);
    const path = join(cache, key + ".v1.0.0.json");
    const expected = { version: VERSION, key, brief_id: row.id, brief_revision: row.revision, brief_status: row.status, medium: row.medium,
      content_sha256: hash(row), text_sha256: hash(texts[i]), representation: FORMAT, encoder: encoder.metadata,
      normalization: "l2", dimension: encoder.metadata.dimension };
    try {
      const cached = await readCache(path);
      if (cached) { records.push(validateRecord(cached, expected)); stats.cache_hits++; continue; }
      if (dryRun) { stats.planned++; continue; }
      const vector = validateVector(await encoder.encode(texts[i]), encoder.metadata.dimension);
      const record = { ...expected, generated_at: generatedAt, state: "complete", vector, vector_sha256: hash(vector) };
      await immutableJSON(path, record); records.push(record); stats.processed++;
    } catch (error) {
      // Cache corruption is reported, never hidden by overwriting a historical entry.
      stats.errors.push({ brief_id: row.id, key, state: "error", message: String(error.message).slice(0, 400) });
    }
  }
  const snapshotId = hash({ version: VERSION, catalog_sha256: hash(catalog), encoder: encoder.metadata, representation: FORMAT, keys });
  const snapshotPath = join(out, snapshotId + ".v1.0.0.json");
  const complete = records.length === catalog.briefs.length;
  let snapshot = null;
  if (!dryRun && complete) {
    // Snapshot includes exact reusable rows; all successful runs resolve to one ID.
    snapshot = { version: VERSION, kind: "private_brief_text_index", snapshot_id: snapshotId, catalog_id: catalog.catalog_id,
      catalog_version: catalog.version, catalog_sha256: hash(catalog), representation: FORMAT, encoder: encoder.metadata,
      state: "complete", coverage: { total: stats.total, indexed: records.length, errors: 0 }, records };
    await immutableJSON(snapshotPath, snapshot);
  }
  return { ...stats, indexed: records.length, complete, dry_run: dryRun, snapshot_id: snapshotId,
    snapshot_path: !dryRun && complete ? snapshotPath : null, fixture: encoder.metadata.semantic === false };
}
const cosine = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
export async function compareRepresentations(catalog, annotations, makeEncoder) {
  const rows = new Map(catalog.briefs.map(row => [row.id, row]));
  const results = [];
  requireValue(annotations.version === VERSION && annotations.samples.length >= 3 && annotations.triplets.length > 0, "Annotated sample required");
  requireValue(new Set(annotations.samples.map(s => s.brief_id)).size === annotations.samples.length, "Duplicate annotations");
  for (const sample of annotations.samples) requireValue(rows.has(sample.brief_id) &&
    [sample.subject, sample.context, sample.composition].every(v => typeof v === "string" && v.trim()), "Incomplete structured annotation");
  for (const triplet of annotations.triplets) requireValue(new Set([triplet.anchor, triplet.closer, triplet.further]).size === 3 &&
    [triplet.anchor, triplet.closer, triplet.further].every(id => annotations.samples.some(s => s.brief_id === id)) && triplet.reason, "Invalid annotated triplet");
  for (const representation of [FORMAT, "subject-context-composition.v1.0.0"]) {
    const texts = annotations.samples.map(s => representation === FORMAT ? canonicalText(rows.get(s.brief_id)) :
      `Subject: ${s.subject}\nContext: ${s.context}\nComposition: ${s.composition}\nMedium: ${rows.get(s.brief_id).medium}`);
    const encoder = makeEncoder(texts), vectors = new Map();
    for (const [i, sample] of annotations.samples.entries()) vectors.set(sample.brief_id, validateVector(await encoder.encode(texts[i]), encoder.metadata.dimension));
    const triplets = annotations.triplets.map(t => {
      const closer = cosine(vectors.get(t.anchor), vectors.get(t.closer)), further = cosine(vectors.get(t.anchor), vectors.get(t.further));
      return { ...t, closer_cosine: closer, further_cosine: further, margin: closer - further, agrees: closer > further };
    });
    results.push({ representation, encoder: encoder.metadata, annotated_triplets: triplets.length,
      agreement: triplets.filter(t => t.agrees).length / triplets.length, triplets });
  }
  return { version: VERSION, kind: "brief_representation_comparison", catalog_sha256: hash(catalog), annotations_sha256: hash(annotations),
    annotation_status: annotations.annotation_status, limitations: annotations.limitations, results };
}
export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({ args: argv, options: {
    catalog: { type: "string", default: join(ROOT, "data/editorial/briefs.v1.1.0.json") },
    encoder: { type: "string", default: "minilm" },
    cache: { type: "string", default: join(ROOT, ".pipeline/brief-embeddings/cache" ) },
    out: { type: "string", default: join(ROOT, ".pipeline/brief-embeddings/snapshots") },
    "model-cache": { type: "string", default: join(ROOT, ".pipeline/brief-models") },
    "dry-run": { type: "boolean", default: false }, fixture: { type: "boolean", default: false },
    "allow-model-download": { type: "boolean", default: false },
    compare: { type: "boolean", default: false }, help: { type: "boolean", default: false },
  } });
  if (values.help) {
    console.log("Usage: node scripts/index-briefs.v1.0.0.mjs [--encoder minilm|tfidf] [--fixture] [--dry-run] [--compare] [--catalog PATH] [--cache PATH] [--out PATH] [--allow-model-download]\nOffline by default; the explicit download flag allows free pinned model downloads, never paid inference. Private content-addressed JSON snapshots.");
    return 0;
  }
  requireValue(["minilm", "tfidf"].includes(values.encoder), "Unknown encoder (no API adapters enabled)");
  requireValue(!(values.fixture && values["allow-model-download"]), "Fixture must remain offline");
  const catalog = await readCatalog(values.catalog);
  const makeEncoder = texts => values.fixture ? fixtureEncoder() : values.encoder === "tfidf" ? lexicalEncoder(texts) :
    modelEncoder({ cacheDir: values["model-cache"], allowDownload: !values["dry-run"] && values["allow-model-download"] });
  let result;
  if (values.compare) {
    requireValue(!values["dry-run"], "Comparison requires inference; use --fixture for an offline smoke check");
    const annotations = await json(join(ROOT, "data/editorial/brief-annotations.v1.0.0.json"));
    result = await compareRepresentations(catalog, annotations, makeEncoder);
    const path = join(values.out, "comparison-" + hash(result) + ".v1.0.0.json");
    await immutableJSON(path, result);
    result = { comparison_path: path, fixture: values.fixture, results: result.results.map(({ representation, encoder, agreement, annotated_triplets }) => ({ representation, encoder_id: encoder.id, agreement, annotated_triplets })) };
  } else {
    result = await indexCatalog(catalog, makeEncoder(catalog.briefs.map(canonicalText)), { cache: values.cache, out: values.out, dryRun: values["dry-run"] });
  }
  console.log(JSON.stringify(result));
  return result.errors?.length ? 1 : 0;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(JSON.stringify({ state: "error", message: error.stderr?.toString().trim() || error.message, paid_api_enabled: false }));
    process.exitCode = 1;
  });
}
