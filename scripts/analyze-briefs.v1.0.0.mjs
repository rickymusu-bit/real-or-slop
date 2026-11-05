/** Local-only semantic variety study; no writes to catalogues, images or services. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { ROOT, MODEL, hash, stable, readCatalog, canonicalText, recordKey, validateVector, modelEncoder, lexicalEncoder, fixtureEncoder, indexCatalog, immutableJSON } from "./index-briefs.v1.0.0.mjs";
import { VERSION, check, analyzeSpace, randomCoverage, cosineDistance, summarize } from "./brief-metrics.v1.0.0.mjs";
const json = async path => JSON.parse(await readFile(path, "utf8"));
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);

function pythonJSON(value, code, args = []) {
  const folder = mkdtempSync(join(tmpdir(), "ros-private-json-"));
  try {
    const path = join(folder, "input.json");
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
    return execFileSync("python3", ["-c", code, path, ...args], { cwd: ROOT, timeout: 15000, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

export function validateConfig(c) {
  check(c.version === VERSION && Number.isSafeInteger(c.seed) && c.seed >= 0 && c.seed <= 4294967295, "Invalid config version/seed");
  const radii = a => Array.isArray(a) && a.length > 0 && a.length <= 20 && new Set(a).size === a.length && a.every(x => Number.isFinite(x) && x >= 0 && x <= 2);
  check(stable(c.ks) === "[1,5,10]" && radii(c.cluster_epsilons) && radii(c.coverage_radii) && Number.isFinite(c.density_radius) && c.density_radius >= 0 && c.density_radius <= 2, "Invalid distances/kNN configuration");
  check(Array.isArray(c.cluster_min_samples) && c.cluster_min_samples.length > 0 && c.cluster_min_samples.length <= 20 && new Set(c.cluster_min_samples).size === c.cluster_min_samples.length && c.cluster_min_samples.every(x => Number.isSafeInteger(x) && x >= 2) &&
    c.cluster_min_samples.includes(c.cluster_default_min_samples) && c.cluster_epsilons.includes(c.cluster_default_epsilon), "Invalid cluster grid/default");
  for (const [key, min, max] of [["max_samples", 2, 1500], ["max_pairs", 1, 100000], ["pca_max_samples", 2, 500], ["pca_sweeps", 1, 100], ["baseline_size", 1, 25], ["baseline_repetitions", 1, 1000]]) {
    check(Number.isSafeInteger(c[key]) && c[key] >= min && c[key] <= max, "Invalid bounded configuration: " + key);
  }
  check(Number.isFinite(c.pca_tolerance) && c.pca_tolerance >= 1e-14 && c.pca_tolerance <= 1e-4, "Invalid PCA tolerance");
  return c;
}
export function validateReference(value) {
  check(value.version === VERSION && value.language === "en" && id(value.corpus_id) && typeof value.created_at === "string" && Number.isFinite(Date.parse(value.created_at)), "Versioned English reference required");
  check(value.editorial_review && ["implementation_reviewed_owner_pending", "owner_reviewed"].includes(value.editorial_review.status) && value.editorial_review.reviewer && value.independence_statement && Array.isArray(value.limitations), "Reference provenance/editorial review required");
  check(Array.isArray(value.candidates) && value.candidates.length <= 1500 && new Set(value.candidates.map(r => r.id)).size === value.candidates.length, "Reference IDs must be unique and bounded");
  const descriptions = new Set();
  for (const row of value.candidates) {
    check(id(row.id) && Number.isSafeInteger(row.revision) && row.revision >= 1 && row.status === "draft" && ["photograph", "artwork"].includes(row.medium) &&
      typeof row.description === "string" && row.description.trim() && row.description.length <= 1000 && row.provenance &&
      ["independent_exploration", "catalog_derived_control"].includes(row.provenance.kind) && row.provenance.method && row.provenance.topic, "Incomplete or non-draft reference candidate");
    check(!Object.keys(row).some(k => /prompt|query|image|description_it/.test(k)), "Reference probes must not include REAL inputs, prompts or parallel Italian descriptions");
    const text = row.description.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
    check(!descriptions.has(text), "Duplicate reference description"); descriptions.add(text);
  }
  // Reuse #44's conservative guard rather than introducing another language rule.
  try {
    // Bounded private files avoid sync stdin EOF stalls and argv size limits.
    pythonJSON(value.candidates, "import json,sys; from pipeline.v2.protocol import english_text; [english_text(r['description']) for r in json.load(open(sys.argv[1]))]");
  } catch { throw Error("Reference descriptions must be canonical English"); }
  return value;
}
export function validateIndex(index, catalog, allowFixture = false) {
  check(index.version === VERSION && index.kind === "private_brief_text_index" && index.state === "complete" && index.catalog_id === catalog.catalog_id &&
    index.catalog_version === catalog.version && index.catalog_sha256 === hash(catalog) && Array.isArray(index.records) && index.records.length === catalog.briefs.length &&
    stable(index.coverage) === stable({ total: catalog.briefs.length, indexed: catalog.briefs.length, errors: 0 }), "Index/catalogue mismatch or incomplete index");
  check(index.representation === "description-medium.v1.0.0" && index.encoder && index.encoder.normalization === "l2", "Unsupported representation/normalization");
  check(allowFixture || index.encoder.semantic !== false, "Fixture index is not semantic; explicit --fixture required");
  for (const [i, record] of index.records.entries()) {
    const row = catalog.briefs[i];
    check(record.brief_id === row.id && record.brief_revision === row.revision && record.brief_status === row.status && record.medium === row.medium && record.version === VERSION && record.state === "complete" &&
      record.representation === index.representation && record.normalization === "l2" && record.dimension === index.encoder.dimension && stable(record.encoder) === stable(index.encoder) &&
      record.content_sha256 === hash(row) && record.text_sha256 === hash(canonicalText(row)) && record.key === recordKey(row, index.encoder) && record.vector_sha256 === hash(record.vector) && Number.isFinite(Date.parse(record.generated_at)), "Index record integrity mismatch: " + row.id);
    validateVector(record.vector, index.encoder.dimension);
  }
  check(index.snapshot_id === hash({ version: VERSION, catalog_sha256: hash(catalog), encoder: index.encoder, representation: index.representation, keys: index.records.map(r => r.key) }), "Snapshot identity mismatch");
  return index;
}
export function validateActivity(activity, catalog) {
  if (activity === null) return new Map();
  check(activity.version === VERSION && activity.kind === "verified_brief_activity" && Number.isFinite(Date.parse(activity.observed_at)) &&
    typeof activity.source === "string" && activity.source.trim() && Array.isArray(activity.briefs), "Dated, sourced private activity manifest required");
  const lookup = new Map(catalog.briefs.map(r => [r.id, r])), result = new Map();
  for (const row of activity.briefs) {
    check(lookup.get(row.id)?.revision === row.revision && !result.has(row.id), "Unknown, stale or duplicate activity brief");
    for (const field of ["used_in_cycles", "real_approved_image_ids", "slop_approved_image_ids"]) check(row[field] === null || Array.isArray(row[field]) &&
      row[field].every(id) && new Set(row[field]).size === row[field].length, "Activity arrays must be distinct IDs or null for unknown");
    result.set(row.id, row);
  }
  return result;
}
export function rowsFromIndex(catalog, index, activity = new Map()) {
  return catalog.briefs.map((row, i) => {
    const a = activity.get(row.id), known = key => !a || a[key] === null ? null : a[key].length > 0;
    return { id: row.id, revision: row.revision, status: row.status, medium: row.medium, description: row.description, tags: row.tags || [],
      vector: index.records[i].vector, used: known("used_in_cycles"), real_approved: known("real_approved_image_ids"), slop_approved: known("slop_approved_image_ids"), provenance: row.provenance?.kind };
  });
}
function encoderFor(index, catalog, modelCache) {
  if (stable(index.encoder) === stable(MODEL)) return modelEncoder({ cacheDir: modelCache, allowDownload: false });
  const lexical = lexicalEncoder(catalog.briefs.map(canonicalText));
  if (stable(index.encoder) === stable(lexical.metadata)) return lexical;
  const fixture = fixtureEncoder();
  if (stable(index.encoder) === stable(fixture.metadata)) return fixture;
  throw Error("No offline adapter for the exact indexed encoder configuration; never mix vector spaces");
}
async function cachedIndex(catalog, encoder, root) {
  const result = await indexCatalog(catalog, encoder, { cache: join(root, "embeddings/cache"), out: join(root, "embeddings/snapshots") });
  check(result.complete && result.errors.length === 0, "Local embedding index failed: " + JSON.stringify(result.errors));
  return json(result.snapshot_path);
}
function tagSelection(catalog, count, seed) {
  const active = catalog.briefs.filter(r => r.status !== "retired"); if (!active.length) return [];
  const code = "import json,sys; from pipeline.v2.brief_catalog import select; v=json.load(open(sys.argv[1])); print(json.dumps([r['id'] for r in select(v,count=int(sys.argv[2]),seed=int(sys.argv[3]))['briefs']]))";
  return JSON.parse(pythonJSON(catalog, code, [String(Math.min(count, active.length)), String(seed)]));
}
export function neighborReview(rows, neighbors, review, annotations) {
  check(review.version === VERSION && review.annotation_status === "implementation_author_not_independent_human_validation" && Array.isArray(review.pairs), "Versioned development neighbor review required");
  const lookup = new Map(rows.map(r => [r.id, r]));
  const pairs = review.pairs.map(p => {
    check(lookup.has(p.a) && lookup.has(p.b) && p.a !== p.b && ["correct_neighbor", "false_neighbor", "context_match_subject_mismatch"].includes(p.judgment) && p.reason, "Invalid neighbor judgment");
    return { ...p, distance: cosineDistance(lookup.get(p.a).vector, lookup.get(p.b).vector), rank_within_top10: (neighbors.find(r => r.id === p.a)?.nearest.findIndex(r => r.id === p.b) ?? -1) + 1 || null };
  });
  const triplets = annotations.triplets.map(t => {
    check([t.anchor, t.closer, t.further].every(uid => lookup.has(uid)), "Annotated triplet missing from catalogue");
    const closer = cosineDistance(lookup.get(t.anchor).vector, lookup.get(t.closer).vector), further = cosineDistance(lookup.get(t.anchor).vector, lookup.get(t.further).vector);
    return { ...t, closer_distance: closer, further_distance: further, agrees: closer < further, tied: Math.abs(closer - further) < 1e-12 };
  });
  return { annotation_status: review.annotation_status, pairs, triplets, triplet_agreement: triplets.length ? triplets.filter(t => t.agrees).length / triplets.length : null,
    random_choice_expected_agreement: triplets.length ? 0.5 : null, caveat: "Purposive implementation annotations, not owner validation or a blind benchmark. False neighbors may share context while differing in subject." };
}
export function compareEncoders(a, b) {
  const neighbors = new Map(b.neighbors.map(r => [r.id, r]));
  const overlap = a.neighbors.map(r => { const top = r.nearest.slice(0, 5).map(x => x.id), other = neighbors.get(r.id).nearest.slice(0, 5).map(x => x.id); return top.length ? top.filter(uid => other.includes(uid)).length / top.length : 0; });
  return { top5_neighbor_overlap: summarize(overlap), caveat: "Encoder-specific cosine scales are not calibrated; compare neighbor identities and annotated judgments, not absolute cross-encoder distance magnitudes." };
}
export function csv(headers, rows) {
  const cell = v => { let text = v === null || v === undefined ? "" : String(v); if (/^[=+@\-\t\r]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; };
  return [headers, ...rows].map(row => row.map(cell).join(",")).join("\n") + "\n";
}
const fmt = v => v === null || v === undefined ? "non calcolato" : typeof v === "number" ? v.toFixed(4) : String(v);
const md = v => String(v).replaceAll("|", "\\|").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", " ");
export function readableReport(report) {
  const primary = report.primary, independent = primary.coverage.by_provenance.independent_exploration;
  const close = primary.distances.pairs.slice().sort((a, b) => a.distance - b.distance || (a.a < b.a ? -1 : a.a > b.a ? 1 : 0)).slice(0, 8);
  const gaps = primary.coverage.candidates.filter(r => r.provenance === "independent_exploration").sort((a, b) => b.min_distance - a.min_distance).slice(0, 8);
  return `# Varietà semantica dei brief — v${VERSION}\n\nSnapshot: ${report.snapshot_id}. Seed: ${report.config.seed}. Encoder: ${md(report.encoder.id)}.\n\n` +
    `Catalogo: ${primary.n} brief inglesi. Distanza coseno: mediana ${fmt(primary.distances.summary.median)}, P90 ${fmt(primary.distances.summary.p90)}. ` +
    `kNN medi (k=1/5/10): ${[1, 5, 10].map(k => fmt(primary.knn_summary[k].median)).join(" / ")}.\n\n` +
    `PCA: stato ${primary.pca.state}, dimensione effettiva ${fmt(primary.pca.effective_dimension)}. Cluster DBSCAN: ${primary.clustering.default.cluster_count}; rumore: ${primary.clustering.default.noise_count}. ` +
    `La sensibilità completa è nel JSON. Nessun cluster è obbligatorio.\n\n` +
    `Corpus: ${report.reference.candidates} probe; review: ${report.reference.editorial_review.status}. ` +
    `Sulle sole esplorazioni indipendenti: mediana distanza dal brief più vicino ${fmt(independent?.median)}, P90 ${fmt(independent?.p90)}. ` +
    `I controlli derivati dal seed sono separati. Le lacune sono relative a questo corpus, non all'universo delle immagini.\n\n` +
    `## Vicinanze da esaminare\n\n| Brief A | Brief B | Distanza |\n| --- | --- | --- |\n` + close.map(p => `| ${md(p.a)} | ${md(p.b)} | ${fmt(p.distance)} |`).join("\n") +
    `\n\n## Lacune relative al corpus indipendente\n\n| Probe | Descrizione | Brief più vicino | Distanza |\n| --- | --- | --- | --- |\n` +
    gaps.map(r => `| ${md(r.id)} | ${md(r.description)} | ${md(r.nearest_id)} | ${fmt(r.min_distance)} |`).join("\n") +
    `\n\n## Stato e origine\n\n| Gruppo | N | Mediana kNN(1) interna | Mediana distanza corpus |\n| --- | --- | --- | --- |\n` +
    Object.entries(primary.groups).map(([name, g]) => `| ${name} | ${g.n} | ${fmt(g.within_group_knn[1].median)} | ${fmt(g.coverage.summary.median)} |`).join("\n") +
    `\n\nI gruppi REAL e SLOP possono sovrapporsi. Dati assenti significano sconosciuto; non significano nessuna approvazione.\n\n` +
    `## Confronti e limiti\n\nBaseline: TF-IDF nello spazio lessicale fissato dal catalogo; copertura di sottoinsiemi casuali e selezione per tag con identico budget. ` +
    `Accordo terne annotate: primario ${fmt(primary.review.triplet_agreement)}, TF-IDF ${fmt(report.lexical_baseline.review.triplet_agreement)}. ` +
    `Sovrapposizione media top-5 fra encoder: ${fmt(report.encoder_comparison.top5_neighbor_overlap.mean)}.\n\n` +
    `Lunghezza, fraseologia ripetuta, medium e categorie del seed sono confondenti misurati nel JSON. ` +
    `Annotazioni dell'implementazione: non sono review umana indipendente. Le distanze non certificano qualità, autenticità, diritti o valore formativo. ` +
    `La PCA 2D non conserva tutte le distanze e non dimostra vuoti oggettivi. N piccolo e sensibilità dei cluster richiedono cautela. ` +
    `Nessun risultato approva, rifiuta o modifica brief e immagini.\n`;
}
async function immutableText(path, value) {
  try { await writeFile(path, value, { flag: "wx", mode: 0o600 }); }
  catch (error) { if (error.code !== "EEXIST") throw error; check(await readFile(path, "utf8") === value, "Refusing to overwrite export: " + path); }
}
export async function exportReport(core, rows, out) {
  const snapshotId = hash(core), folder = join(out, snapshotId), path = join(folder, "report.v1.0.0.json");
  let previous = null;
  try { previous = await json(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const report = { ...core, snapshot_id: snapshotId, generated_at: previous?.generated_at || new Date().toISOString() };
  await mkdir(folder, { recursive: true, mode: 0o700 }); await immutableJSON(path, report);
  const lookup = new Map(rows.map(r => [r.id, r]));
  await immutableText(join(folder, "distances.v1.0.0.csv"), csv(["a", "b", "cosine_distance"], core.primary.distances.pairs.map(p => [p.a, p.b, p.distance])));
  await immutableText(join(folder, "neighbors.v1.0.0.csv"), csv(["brief_id", "neighbor_id", "rank", "cosine_distance"], core.primary.neighbors.flatMap(r => r.nearest.map((n, i) => [r.id, n.id, i + 1, n.distance]))));
  await immutableText(join(folder, "coverage.v1.0.0.csv"), csv(["reference_id", "provenance", "description", "nearest_brief", "min_cosine_distance"], core.primary.coverage.candidates.map(r => [r.id, r.provenance, r.description, r.nearest_id, r.min_distance])));
  await immutableText(join(folder, "briefs.v1.0.0.csv"), csv(["brief_id", "revision", "status", "used", "REAL_approved", "SLOP_approved", "mean_knn1", "mean_knn5", "mean_knn10", "density_neighbor_fraction"], core.primary.neighbors.map(n => {
    const r = lookup.get(n.id); return [r.id, r.revision, r.status, r.used, r.real_approved, r.slop_approved, n.knn[1].mean_distance, n.knn[5].mean_distance, n.knn[10].mean_distance, n.density.neighbor_fraction];
  })));
  await immutableText(join(folder, "report.v1.0.0.md"), readableReport(report));
  return { snapshot_id: snapshotId, folder, report };
}
export async function main(argv = process.argv.slice(2)) {
  const { values: v } = parseArgs({ args: argv, options: { index: { type: "string" },
    catalog: { type: "string", default: join(ROOT, "data/editorial/briefs.v1.1.0.json") }, reference: { type: "string", default: join(ROOT, "data/editorial/brief-reference.v1.0.0.json") },
    config: { type: "string", default: join(ROOT, "data/editorial/brief-metrics.v1.0.0.json") }, activity: { type: "string" }, review: { type: "string", default: join(ROOT, "data/editorial/brief-neighbor-review.v1.0.0.json") },
    out: { type: "string", default: join(ROOT, ".pipeline/brief-variety") }, "model-cache": { type: "string", default: join(ROOT, ".pipeline/brief-models") },
    seed: { type: "string" }, fixture: { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false }, help: { type: "boolean", default: false } } });
  if (v.help) { console.log("Usage: npm run analyze:briefs -- --index SNAPSHOT [--reference PATH] [--activity PRIVATE_MANIFEST] [--out PATH] [--seed INTEGER] [--dry-run] [--fixture]\nStrictly offline. Reuses the #44 snapshot and its exact encoder space. JSON, CSV and Markdown exports remain private."); return 0; }
  check(v.index, "An explicit #44 --index snapshot is required");
  const catalog = await readCatalog(v.catalog), config = validateConfig({ ...await json(v.config), ...(v.seed === undefined ? {} : { seed: Number(v.seed) }) });
  check(catalog.briefs.length <= config.max_samples, "Catalogue exceeds configured exact-analysis limit");
  const index = validateIndex(await json(v.index), catalog, v.fixture), reference = validateReference(await json(v.reference));
  const activity = v.activity ? await json(v.activity) : null, activityRows = validateActivity(activity, catalog);
  const review = await json(v.review), annotations = await json(join(ROOT, "data/editorial/brief-annotations.v1.0.0.json"));
  const primaryEncoder = encoderFor(index, catalog, v["model-cache"]);
  const rows = rowsFromIndex(catalog, index, activityRows);
  neighborReview(rows, [], review, annotations);
  if (v["dry-run"]) { console.log(JSON.stringify({ state: "validated", catalog_rows: catalog.briefs.length, reference_rows: reference.candidates.length, activity_provided: !!activity, encoder: index.encoder.id, writes: false, network: false, paid_api_enabled: false })); return 0; }
  const referenceCatalog = { version: reference.version, catalog_id: reference.corpus_id, briefs: reference.candidates };
  const referenceIndex = reference.candidates.length ? await cachedIndex(referenceCatalog, primaryEncoder, v.out) : null;
  const refRows = referenceIndex ? rowsFromIndex(referenceCatalog, referenceIndex) : [];
  const primary = analyzeSpace(rows, refRows, config), baselineEncoder = lexicalEncoder(catalog.briefs.map(canonicalText));
  const baselineIndex = await cachedIndex(catalog, baselineEncoder, v.out), baselineRef = reference.candidates.length ? await cachedIndex(referenceCatalog, baselineEncoder, v.out) : null;
  const baselineRows = rowsFromIndex(catalog, baselineIndex, activityRows), baselineRefRows = baselineRef ? rowsFromIndex(referenceCatalog, baselineRef) : [];
  const baseline = analyzeSpace(baselineRows, baselineRefRows, config), tagIds = tagSelection(catalog, config.baseline_size, config.seed);
  baseline.encoder = baselineEncoder.metadata;
  const vocabulary = new Set(baselineEncoder.metadata.vocabulary);
  baseline.reference_token_support = reference.candidates.map(r => {
    const words = r.description.toLowerCase().match(/[a-z]+/g) || [], matched = words.filter(w => vocabulary.has(w)).length;
    return { id: r.id, tokens: words.length, matched_tokens: matched, matched_fraction: words.length ? matched / words.length : null };
  });
  for (const [analysis, r, refs] of [[primary, rows, refRows], [baseline, baselineRows, baselineRefRows]]) {
    analysis.random_baseline = randomCoverage(r, refs.filter(x => x.provenance === "independent_exploration"), config.baseline_size, config.baseline_repetitions, config.seed, tagIds);
    analysis.review = neighborReview(r, analysis.neighbors, review, annotations);
  }
  const core = { version: VERSION, kind: "private_brief_variety_report", config, encoder: index.encoder, fixture: index.encoder.semantic === false,
    inputs: { catalog_sha256: hash(catalog), index_snapshot_id: index.snapshot_id, index_content_sha256: hash(index), reference_sha256: hash(reference), reference_index_sha256: referenceIndex ? hash(referenceIndex) : null,
      lexical_index_sha256: hash(baselineIndex), lexical_reference_index_sha256: baselineRef ? hash(baselineRef) : null, activity_sha256: activity ? hash(activity) : null, review_sha256: hash(review), annotations_sha256: hash(annotations) },
    reference: { corpus_id: reference.corpus_id, version: reference.version, candidates: reference.candidates.length, editorial_review: reference.editorial_review, independence_statement: reference.independence_statement, limitations: reference.limitations },
    activity: { state: activity ? "provided_partial_unknowns_preserved" : "not_provided_all_unknown", observed_at: activity?.observed_at ?? null, source: activity?.source ?? null },
    primary, lexical_baseline: baseline, encoder_comparison: compareEncoders(primary, baseline), paid_api_enabled: false, network: false, automatic_decisions: false };
  const exported = await exportReport(core, rows, resolve(v.out));
  console.log(JSON.stringify({ snapshot_id: exported.snapshot_id, output: exported.folder, n: primary.n, median_distance: primary.distances.summary.median,
    clusters: primary.clustering.default.cluster_count, noise: primary.clustering.default.noise_count, reference_candidates: refRows.length, activity: core.activity.state, paid_api_enabled: false }));
  return 0;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().then(code => { process.exitCode = code; }).catch(error => { console.error(JSON.stringify({ state: "error", message: error.message, paid_api_enabled: false })); process.exitCode = 1; });
