/** Gallery category lists: model proposal, owner review and approval, text-only classification, consistency check,
 * and blind observation of accepted SLOP with the REAL annotator. Every model call is confirmed and counted. */
import { HttpError, json, type Env } from "./core";
import { chosenModel, chosenQuality } from "./models";
import type { Row } from "./library";
import type { Profile, Proposal } from "../shared/pipeline";
import { CLASSIFY_BATCH, FIXED, TAXONOMY_KEYS, TAXONOMY_SCHEMA, allowedOf, applyTaxonomy, classificationSchema, cleanTaxonomy, pendingKeys, statCategory,
  type Consistency, type Taxonomy, type TaxonomyDraft, type TaxonomyKey, type TaxonomyKeys } from "../shared/taxonomy";
import type { VisualDescription } from "../shared/real-description";
import { annotate, definitionsOf, dispatchPipeline, modelResponse, now, parse, profileOf, settingsOf, taxonomyOf,
  type Job, type ProfileField, type Snapshot } from "./pipeline-core";

export const TAXONOMY_TARGETS = ["taxonomy", "classify", "consistency", "observe"];
const CONSISTENCY_SAMPLE = 30;
const ACTIVE = "('queued','dispatching','working')";
interface Stored { id: string; origin: string; status: string; visual_description: string | null; pipeline_scene: string | null; pipeline_profile: string | null; pipeline_observed: string | null }

const keysOrThrow = (value: unknown, lenient = false) => { try { return cleanTaxonomy(value, lenient); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid category lists"); } };
const confirmed = (data: Record<string, unknown>) => {
  if (data.confirm !== true || typeof data.request !== "string" || !/^[\da-f-]{36}$/i.test(data.request)) throw new HttpError(400, "Explicit confirmation required");
  return data.request;
};
async function busy(env: Env, gallery: string, operations: string[]) {
  return !!await env.DB.prepare(`SELECT 1 FROM pipeline_jobs WHERE gallery_id=? AND state IN ${ACTIVE} AND json_extract(snapshot,'$.operation') IN (SELECT value FROM json_each(?))`)
    .bind(gallery, JSON.stringify(operations)).first();
}
async function snapshotBase(env: Env, gallery: string) {
  const row = await env.DB.prepare("SELECT pipeline_settings FROM galleries WHERE id=?").bind(gallery).first<{ pipeline_settings: string | null }>();
  const [textModel, imageModel, quality] = await Promise.all([chosenModel(env, "text_model"), chosenModel(env, "image_model"), chosenQuality(env)]);
  return { settings: settingsOf(row?.pipeline_settings ?? null), textModel, imageModel, quality, sourceRevision: 0 };
}
async function enqueue(env: Env, gallery: string, request: string, jobs: { id: string; source: string | null; snapshot: Snapshot }[]) {
  const stamp = now(), ids: string[] = [];
  const statements = jobs.map(job => env.DB.prepare("INSERT OR IGNORE INTO pipeline_jobs(id,gallery_id,source_id,state,snapshot,request,created_at,updated_at) VALUES(?,?,?,'queued',?,?,?,?) RETURNING id")
    .bind(job.id, gallery, job.source, JSON.stringify(job.snapshot), request, stamp, stamp));
  // Every confirmed job is recorded before any Workflow starts.
  for (let at = 0; at < statements.length; at += 50) for (const r of await env.DB.batch<{ id: string }>(statements.slice(at, at + 50))) ids.push(...r.results.map(x => x.id));
  await dispatchPipeline(env);
  return ids;
}
/** Every stored profile of the gallery outside Trash: REAL observations, SLOP intentions and SLOP observations. */
async function storedProfiles(env: Env, gallery: string) {
  const rows = (await env.DB.prepare(`SELECT id,origin,status,visual_description,pipeline_scene,pipeline_profile,pipeline_observed FROM images
    WHERE gallery_id=? AND status<>'trash' AND (pipeline_profile IS NOT NULL OR pipeline_observed IS NOT NULL) ORDER BY created_at,id`).bind(gallery).all<Stored>()).results;
  return rows.flatMap(row => (["pipeline_profile", "pipeline_observed"] as ProfileField[]).flatMap(field => {
    const profile = profileOf(row[field]);
    return profile && (field === "pipeline_profile" || row.origin === "SLOP") ? [{ row, field, profile, text: row[field]! }] : [];
  }));
}

export async function taxonomyRoute(env: Env, gallery: string, target: string, action: string, data: Record<string, unknown>): Promise<Response> {
  const current = await taxonomyOf(env, gallery);
  if (target === "taxonomy" && action === "edit") {
    if (!current.approved) throw new HttpError(409, "No approved lists to edit");
    if (current.draft) return json({ saved: true });
    const draft: TaxonomyDraft = { proposed_at: now(), model: null, notes: `Copy of approved version ${current.approved.version}.`, keys: current.approved.keys };
    await env.DB.prepare("UPDATE pipeline_taxonomies SET draft=?,updated_at=? WHERE gallery_id=? AND draft IS NULL").bind(JSON.stringify(draft), now(), gallery).run();
    return json({ saved: true });
  }
  if (target === "taxonomy" && action === "discard") {
    await env.DB.prepare("UPDATE pipeline_taxonomies SET draft=NULL,updated_at=? WHERE gallery_id=?").bind(now(), gallery).run();
    return json({ discarded: true });
  }
  if (target === "taxonomy" && action === "save") {
    if (!current.draft) throw new HttpError(409, "No draft to save");
    const keys = keysOrThrow(data.keys);
    if (data.approve !== true) {
      await env.DB.prepare("UPDATE pipeline_taxonomies SET draft=?,updated_at=? WHERE gallery_id=?").bind(JSON.stringify({ ...current.draft, keys }), now(), gallery).run();
      return json({ saved: true });
    }
    // Annotations and scenes in flight would read one list and be written under another.
    if (await busy(env, gallery, ["profile", "plan", "classify", "consistency", "observe", "taxonomy"])) throw new HttpError(409, "Wait for the operations in progress");
    const version = current.version + 1, taxonomy: Taxonomy = { version, approved_at: now(), keys };
    const claimed = await env.DB.prepare("UPDATE pipeline_taxonomies SET taxonomy=?,draft=NULL,version=?,updated_at=? WHERE gallery_id=? AND version=?")
      .bind(JSON.stringify(taxonomy), version, now(), gallery, current.version).run();
    if (!claimed.meta.changes) throw new HttpError(409, "Lists changed: reload before approving");
    // Free remapping through names and aliases; values the list cannot resolve stay pending for a confirmed classification.
    const writes = (await storedProfiles(env, gallery)).flatMap(item => {
      const mapped = JSON.stringify(applyTaxonomy(item.profile, keys));
      return mapped === JSON.stringify(item.profile) && item.text === mapped ? [] : [env.DB.prepare(`UPDATE images SET ${item.field}=? WHERE id=? AND ${item.field}=?`).bind(mapped, item.row.id, item.text)];
    });
    let updated = 0;
    for (let at = 0; at < writes.length; at += 50) for (const r of await env.DB.batch(writes.slice(at, at + 50))) updated += r.meta.changes || 0;
    return json({ version, updated });
  }
  const request = confirmed(data);
  if (!env.OPENAI_API_KEY || !env.SLOP_RUNNER || !env.QUARANTINE) throw new HttpError(503, "Models or Workflow not configured");
  const base = await snapshotBase(env, gallery);
  if (target === "taxonomy" && action === "propose") {
    if (data.max_calls !== 1) throw new HttpError(400, "Confirm one call for the proposal");
    if (await busy(env, gallery, ["taxonomy"])) throw new HttpError(409, "A proposal is already in progress");
    if (!(await storedProfiles(env, gallery)).some(p => p.row.origin === "REAL")) throw new HttpError(409, "Prepare some REAL first");
    return json({ jobs: await enqueue(env, gallery, request, [{ id: `${request}-taxonomy`, source: null, snapshot: { ...base, operation: "taxonomy" } }]) });
  }
  if (target === "classify" || target === "consistency") {
    if (!current.approved) throw new HttpError(409, "Approve the gallery lists first");
    if (await busy(env, gallery, ["classify", "consistency"])) throw new HttpError(409, "A classification is already in progress");
    const keys = current.approved.keys, stored = await storedProfiles(env, gallery);
    let items = target === "classify" ? stored.filter(p => pendingKeys(p.profile, keys).length)
      : stored.filter(p => p.row.origin === "REAL" && !pendingKeys(p.profile, keys).length);
    if (target === "consistency") {
      if (items.length < 10) throw new HttpError(409, "At least 10 classified REAL are needed");
      const random = new Uint32Array(items.length); crypto.getRandomValues(random);
      items = items.map((item, i) => ({ item, r: random[i] })).sort((a, b) => a.r - b.r).slice(0, CONSISTENCY_SAMPLE).map(x => x.item);
    }
    const batches: (typeof items)[] = [];
    for (let at = 0; at < items.length; at += CLASSIFY_BATCH) batches.push(items.slice(at, at + CLASSIFY_BATCH));
    if (!batches.length) return json({ jobs: [] });
    if (data.max_calls !== batches.length) throw new HttpError(409, `Confirm exactly ${batches.length} ${batches.length === 1 ? "call" : "calls"}: the pending profiles changed`);
    return json({ jobs: await enqueue(env, gallery, request, batches.map((batch, i) => ({ id: `${request}-${target === "classify" ? "c" : "k"}${i}`, source: null,
      snapshot: { ...base, operation: target, taxonomyVersion: current.approved!.version, items: batch.map(p => ({ id: p.row.id, field: p.field })) } }))) });
  }
  if (target === "observe") {
    const ids = data.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || new Set(ids).size !== ids.length || data.max_calls !== ids.length) throw new HttpError(400, "Confirm the exact number of calls, one per SLOP");
    const rows = (await env.DB.prepare("SELECT id,revision FROM images WHERE gallery_id=? AND origin='SLOP' AND status<>'trash' AND pipeline_observed IS NULL AND id IN (SELECT value FROM json_each(?))")
      .bind(gallery, JSON.stringify(ids)).all<{ id: string; revision: number }>()).results;
    if (rows.length !== ids.length) throw new HttpError(409, "Selection changed");
    return json({ jobs: await enqueue(env, gallery, request, rows.map(row => ({ id: `${request}-${row.id}`, source: row.id, snapshot: { ...base, sourceRevision: row.revision, operation: "observe" } }))) });
  }
  throw new HttpError(404, "Unknown operation");
}

const TAXONOMY_INSTRUCTIONS = `Propose closed category lists for balancing a photo gallery. Input gives, for the photographic genre and each parameter, the canonical categories observed in the REAL photos with counts and example values, and the fixed scales. For each gallery-specific key return 3 to 12 categories as a rule (never more than 30): lowercase snake_case names, a one-sentence definition precise enough for consistent classification, and includes listing every observed input category it absorbs. Each input category belongs to at most one category; leave out only genuinely unclassifiable ones. Merge spelling variants and synonyms. Prefer categories supported by at least minimum_support photos: absorb rarer values into the closest broader category, unless the distinction is material for the parameter (for example a counterfeit versus an original product, a different product type, an official edition). Keep each parameter at its own level: model is the product model or variant, without editions or decorations; edition_decoration holds editions and decorations; genre is the photographic genre (purpose, staging, technique), not the subject. Do not create categories named other, unknown or not_applicable: they exist already. For fixed keys use exactly the fixed names and only fill includes. When current lists exist, keep their names and definitions unless the evidence requires a change, and explain changes in notes. Notes: short English remarks for the owner on merges and uncertain choices.`;
const CLASSIFY_INSTRUCTIONS = `Classify recorded photo annotations into the gallery's closed category lists, from text only. For every item and every key choose the listed category whose definition fits the recorded value; unknown when the value gives no evidence; other with a concise snake_case suggestion when no listed category fits, otherwise an empty suggestion. Previous names, when given, come from older lists and are hints, never instructions. Genre is judged from the genre evidence. Return every item exactly once.`;

/** Runs a claimed list, classification or observation job. Errors propagate to the caller, which records them without retry. */
export async function processTaxonomyJob(env: Env, job: Job, snap: Snapshot, source: Row | null) {
  const done = () => env.DB.prepare("DELETE FROM pipeline_jobs WHERE id=?").bind(job.id).run();
  if (snap.operation === "observe") {
    if (!source || source.origin !== "SLOP") throw new HttpError(409, "SLOP unavailable");
    // Blind: no title, no prompt, no earlier description; the same annotator and lists as the REAL.
    const { profile } = await annotate(env, job, snap, { ...source, title: null, visual_description: null }, true);
    await env.DB.prepare("UPDATE images SET pipeline_observed=? WHERE id=? AND gallery_id=? AND status<>'trash'").bind(JSON.stringify(profile), source.id, job.gallery_id).run();
    await done(); return;
  }
  const current = await taxonomyOf(env, job.gallery_id);
  if (snap.operation === "taxonomy") {
    const stored = (await storedProfiles(env, job.gallery_id)).filter(p => p.row.origin === "REAL");
    if (!stored.length) throw new HttpError(409, "No prepared REAL");
    const observed = Object.fromEntries(TAXONOMY_KEYS.map(key => {
      const groups = new Map<string, { count: number; examples: string[] }>();
      for (const { profile, row } of stored) {
        const category = statCategory(profile, key, null);
        if (category === "unknown") continue;
        const group = groups.get(category) ?? { count: 0, examples: [] };
        group.count++;
        const example = key === "genre" ? evidenceOf(profile, row) : profile.parameters[key].value;
        if (group.examples.length < 2 && example && !group.examples.includes(example)) group.examples.push(example.slice(0, 160));
        groups.set(category, group);
      }
      return [key, [...groups].sort((a, b) => b[1].count - a[1].count).slice(0, 300).map(([category, g]) => ({ category, ...g }))];
    }));
    const answer = await modelResponse(env, job, snap, "pipeline_taxonomy", TAXONOMY_INSTRUCTIONS, { real_count: stored.length,
      minimum_support: Math.max(3, Math.ceil(stored.length * .02)), fixed: Object.fromEntries(Object.entries(FIXED).map(([k, v]) => [k, v!.map(x => x.name)])),
      current: current.approved ? definitionsOf(current.approved.keys) : null, observed }, TAXONOMY_SCHEMA) as { notes?: unknown; keys?: unknown };
    const draft: TaxonomyDraft = { proposed_at: now(), model: snap.textModel, notes: typeof answer.notes === "string" ? answer.notes.slice(0, 4000) : "", keys: keysOrThrow(answer.keys, true) };
    await env.DB.prepare(`INSERT INTO pipeline_taxonomies(gallery_id,draft,version,updated_at) VALUES(?,?,0,?)
      ON CONFLICT(gallery_id) DO UPDATE SET draft=excluded.draft,updated_at=excluded.updated_at`).bind(job.gallery_id, JSON.stringify(draft), now()).run();
    await done(); return;
  }
  // classify | consistency
  if (!current.approved || current.approved.version !== snap.taxonomyVersion) throw new HttpError(409, "Gallery lists changed: request a new classification");
  const keys = current.approved.keys, items = snap.items ?? [];
  const rows = new Map((await env.DB.prepare(`SELECT id,origin,status,visual_description,pipeline_scene,pipeline_profile,pipeline_observed FROM images
    WHERE gallery_id=? AND status<>'trash' AND id IN (SELECT value FROM json_each(?))`).bind(job.gallery_id, JSON.stringify(items.map(i => i.id))).all<Stored>()).results.map(r => [r.id, r]));
  const entries = items.flatMap(item => {
    const row = rows.get(item.id), text = row?.[item.field] ?? null, profile = profileOf(text);
    if (!row || !profile) return [];
    const pending = pendingKeys(profile, keys);
    return (snap.operation === "classify" ? pending.length : !pending.length) ? [{ ...item, row, text: text!, profile, pending }] : [];
  });
  if (!entries.length) { await done(); return; }
  const ids = entries.map((_, i) => `i${i + 1}`), consistency = snap.operation === "consistency";
  const answer = await modelResponse(env, job, snap, "pipeline_classification", CLASSIFY_INSTRUCTIONS, { categories: definitionsOf(keys),
    items: entries.map((e, i) => ({ id: ids[i], genre: { evidence: evidenceOf(e.profile, e.row), ...(consistency ? {} : { previous: e.profile.genre }) },
      ...Object.fromEntries(TAXONOMY_KEYS.filter(k => k !== "genre").map(k => [k, { value: e.profile.parameters[k as Exclude<TaxonomyKey, "genre">].value,
        ...(consistency ? {} : { previous: e.profile.parameters[k as Exclude<TaxonomyKey, "genre">].category }) }])) })) }, classificationSchema(keys, ids)) as { items?: unknown };
  const results = readClassification(answer, ids, keys);
  if (consistency) {
    const agreement: Consistency["agreement"] = {};
    for (const key of TAXONOMY_KEYS) {
      const pairs = entries.flatMap((e, i) => results.has(ids[i]) ? [[statCategory(e.profile, key, keys), results.get(ids[i])![key].category]] : []);
      if (pairs.length) agreement[key] = pairs.filter(([a, b]) => a === b).length / pairs.length;
    }
    const value: Consistency = { at: now(), version: current.approved.version, items: results.size, agreement };
    await env.DB.prepare("UPDATE pipeline_taxonomies SET taxonomy=json_set(taxonomy,'$.consistency',json(?)),updated_at=? WHERE gallery_id=? AND version=?")
      .bind(JSON.stringify(value), now(), job.gallery_id, current.approved.version).run();
    await done(); return;
  }
  const writes = entries.flatMap((e, i) => {
    const result = results.get(ids[i]); if (!result) return [];
    const profile: Profile = { ...e.profile, parameters: { ...e.profile.parameters } };
    for (const key of e.pending) {
      const { category, suggestion } = result[key];
      if (key === "genre") { profile.genre = category; profile.genre_suggestion = category === "other" ? suggestion : ""; }
      else profile.parameters[key] = { ...profile.parameters[key], category, suggestion: category === "other" ? suggestion : "" };
    }
    // Compare-and-set on the text read for the call: a profile edited meanwhile is left for a later classification.
    return [env.DB.prepare(`UPDATE images SET ${e.field}=? WHERE id=? AND ${e.field}=?`).bind(JSON.stringify(applyTaxonomy(profile, keys)), e.row.id, e.text)];
  });
  for (let at = 0; at < writes.length; at += 50) await env.DB.batch(writes.slice(at, at + 50));
  await done();
}
/** Genre evidence: the annotator's own sentence when present, otherwise the technique of the description or of the scene. */
function evidenceOf(profile: Profile, row: Stored) {
  if (profile.genre_evidence?.trim()) return profile.genre_evidence.trim().slice(0, 400);
  const description = parse<VisualDescription | null>(row.visual_description, null), scene = parse<{ proposal?: Proposal } | null>(row.pipeline_scene, null);
  const text = description ? `${description.sections.technique} ${description.sections.rendering}` : scene?.proposal ? `${scene.proposal.scene.technique} ${scene.proposal.scene.rendering}` : "";
  return (text.trim() || `Previously labelled ${profile.genre}.`).slice(0, 400);
}
function readClassification(answer: { items?: unknown }, ids: string[], keys: TaxonomyKeys) {
  if (!Array.isArray(answer.items)) throw new HttpError(502, "Invalid classification");
  const out = new Map<string, Record<TaxonomyKey, { category: string; suggestion: string }>>();
  for (const item of answer.items as Record<string, unknown>[]) {
    if (!item || typeof item.id !== "string" || !ids.includes(item.id) || out.has(item.id)) continue;
    const result = {} as Record<TaxonomyKey, { category: string; suggestion: string }>;
    for (const key of TAXONOMY_KEYS) {
      const field = item[key] as { category?: unknown; suggestion?: unknown } | undefined;
      const category = typeof field?.category === "string" && allowedOf(keys, key).includes(field.category) ? field.category : FIXED[key] ? "unknown" : "other";
      result[key] = { category, suggestion: typeof field?.suggestion === "string" ? field.suggestion.slice(0, 120) : "" };
    }
    out.set(item.id, result);
  }
  if (!out.size) throw new HttpError(502, "Empty classification");
  return out;
}
