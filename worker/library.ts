/** Image library of the dashboard (spec `libreria-immagini`, `database-immagini`): states and transitions, edits with
 * optimistic revision, tags with categories and aliases, vocabulary, game copies with their crop, trash and deletion of every row
 * and file, bulk actions, statistics per image, distribution, Commons acquisition, regeneration of a SLOP, settings and contexts. */
import { body, HttpError, id, json, type Env } from "./core";
import { browseCommonsCategory, browseCommonsSearch, commonsFile, MAX_IMAGE_BYTES } from "./commons-editorial";
import { imageMime } from "../shared/image-format";
import { imageGeometry } from "../shared/image-geometry";
import { imageDimensions } from "../shared/image-dimensions";
import { cleanImage } from "../shared/media-clean";
import { centredCrop, copyDimensions, cropError, GAME_COPY, parseCrop, storedCrop } from "../shared/game-copy";
import { isNoDerivatives } from "../shared/licenses";
import { checkTag } from "../shared/tags";
import { contextRoute } from "./model-context";
import { categoryError, forcedCategory, isCategory, limitError, SINGLE, VISUAL, type Category } from "../shared/tag-categories";
import { treatedLong, validMetrics, validTreatment } from "../shared/copy-treatment";
import { groupOf, parseGroup } from "../shared/slop-groups";
import { analysisStatus, analyze, completable, completeCategories } from "./analysis";
import { modelsRoute } from "./models";
import { settingsRoute } from "./app-settings";
import { stats } from "./stats";
import { slopRoute } from "./slop";
import { candidateFile } from "./slop-generation";
import { realDescription } from "../shared/editorial";
import { gamesInPlay, retireCopy, reviveCopy, statsOf, sweepRetired } from "./in-play";

const base = "/api/admin/library";
const MAX_PIXELS = 32_000_000;
type Origin = "REAL" | "SLOP";
type Status = "new" | "approved" | "published" | "trash";
export interface Row {
  id: string; origin: Origin; status: Status; trashed_from: Status | null; title: string; description: string; caption: string;
  explanation: string; source_url: string; author: string; license_name: string; license_url: string; prompt: string; model: string;
  original_key: string; original_sha256: string; original_mime: string; width: number; height: number;
  copy_key: string | null; copy_sha256: string | null; copy_width: number | null; copy_height: number | null; copy_bytes: number | null;
  rights_confirmed: number; revision: number; created_at: string; updated_at: string; approved_at: string | null;
  published_at: string | null; trashed_at: string | null;
  analysis_status: "none" | "running" | "done" | "uncertain" | "failed"; analysis_error: string; analyzed_at: string | null;
  generated_caption: string | null; generated_tags: string | null;
  real_description: string | null; real_description_provenance: string | null; commons_description: string | null;
  generation_batch: string | null; generation_slot: string | null; generation_quality: string | null;
  analysis_base_context: string | null; analysis_task_context: string | null; copy_crop: string | null; copy_view: string | null;
  categories_completed_at: string | null; copy_metrics: string | null; copy_treatment: string | null; generation_group: string | null; generation_source: string | null;
}
const now = () => new Date().toISOString();
const sha256 = async (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2, "0")).join("");
const TEXT_FIELDS: Record<string, number> = { title: 200, description: 1000, explanation: 2000, source_url: 1000,
  author: 300, license_name: 200, license_url: 1000, prompt: 4000, model: 100 };

function text(value: unknown, field: string, required = false): string {
  if (value === undefined || value === null) { if (required) throw new HttpError(400, "Campo obbligatorio: " + field); return ""; }
  if (typeof value !== "string") throw new HttpError(400, "Campo non valido: " + field);
  // Control characters out, except tab and line breaks.
  const clean = [...value.normalize("NFC")].filter(ch => { const c = ch.charCodeAt(0); return c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127); }).join("").trim();
  if (clean.length > TEXT_FIELDS[field]) throw new HttpError(400, `Campo «${field}» oltre ${TEXT_FIELDS[field]} caratteri`);
  if (required && !clean) throw new HttpError(400, "Campo obbligatorio: " + field);
  if ((field === "source_url" || field === "license_url") && clean && !/^https:\/\/[^\s]+$/.test(clean))
    throw new HttpError(400, "Indirizzo HTTPS richiesto: " + field);
  return clean;
}
function origin(value: unknown): Origin {
  if (value !== "REAL" && value !== "SLOP") throw new HttpError(400, "Origine REAL o SLOP richiesta");
  return value;
}
function imageId(value: string): string {
  if (!/^[\w-]{1,64}$/.test(value)) throw new HttpError(400, "Immagine non valida");
  return value;
}
export async function find(env: Env, imageIdValue: string): Promise<Row> {
  const row = await env.DB.prepare("SELECT * FROM images WHERE id=?").bind(imageIdValue).first<Row>();
  if (!row) throw new HttpError(404, "Immagine non trovata");
  return row;
}
export interface TagRow { label: string; category: Category }
/** Tags of each image, with their category, by label. */
export async function tagRowsOf(env: Env, ids: readonly string[]): Promise<Map<string, TagRow[]>> {
  const out = new Map<string, TagRow[]>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await env.DB.prepare(`SELECT it.image_id,t.label,t.category FROM image_tags it JOIN tags t ON t.id=it.tag_id
      WHERE it.image_id IN (${chunk.map(() => "?").join(",")}) ORDER BY t.label`).bind(...chunk).all<{ image_id: string } & TagRow>();
    for (const row of rows.results) out.set(row.image_id, [...(out.get(row.image_id) || []), { label: row.label, category: row.category }]);
  }
  return out;
}
export async function tagsOf(env: Env, ids: readonly string[]): Promise<Map<string, string[]>> {
  return new Map([...(await tagRowsOf(env, ids))].map(([key, rows]) => [key, rows.map(r => r.label)]));
}
/** Category of each existing tag among the labels. */
export async function categoriesOf(env: Env, wanted: readonly string[]): Promise<Map<string, Category>> {
  if (!wanted.length) return new Map();
  const rows = (await env.DB.prepare("SELECT label,category FROM tags WHERE label IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(wanted)).all<TagRow>()).results;
  return new Map(rows.map(r => [r.label, r.category]));
}
/** Categories for a set of labels: an existing tag keeps its own; a new one takes the requested category, or its forced one (Time
 * for a decade, Color and Medium for their closed lists), or «other». Refuses labels outside their category and two tags of a
 * single-tag category. A category asked against the forced one is refused, not corrected: the server stays strict. */
export async function categorize(env: Env, wanted: readonly string[], requested: Record<string, unknown> = {}): Promise<Map<string, Category>> {
  const existing = await categoriesOf(env, wanted), out = new Map<string, Category>();
  for (const label of wanted) {
    const asked = requested[label];
    if (asked !== undefined && !isCategory(asked)) throw new HttpError(400, "Categoria inesistente per «" + label + "»");
    const category = existing.get(label) ?? (isCategory(asked) ? asked : forcedCategory(label) ?? "other");
    const error = categoryError(label, category);
    if (error) throw new HttpError(400, error);
    out.set(label, category);
  }
  const limit = limitError(out.values());
  if (limit) throw new HttpError(400, limit);
  return out;
}
/** Texts produced by the one generation of the image, or null if it never happened. */
function generatedOf(row: Row): { tags: string[] } | null {
  if (row.generated_tags === null || row.generated_tags === undefined) return null;
  let tags: unknown = [];
  try { tags = JSON.parse(row.generated_tags); } catch { /* unreadable: no tags */ }
  return { tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [] };
}
/** The crop of the copy, or null for a copy of an earlier recipe (4:5, or before migration 0042): to be made again. */
const cropOf = (row: Pick<Row, "copy_crop">) => storedCrop(row.copy_crop);
/** Slot of a generated SLOP: index, theme and tags by category. */
function parseSlot(value: string | null): unknown {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}
const parseJson = (value: string | null): unknown => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
/** What makes two treatments give the same copy. */
const treatmentKey = (t: ReturnType<typeof validTreatment>) => t ? JSON.stringify([t.version, t.off, t.seed, t.long, t.medium, t.color, t.sample.id]) : "";
interface Extra { stats?: { views: number; correct: number }; in_play?: number }
function view(row: Row, rows: TagRow[], extra: Extra = {}) {
  const tags = rows.map(r => r.label), group = groupOf(rows);
  const v = row.copy_sha256 ? row.copy_sha256.slice(0, 12) : row.original_sha256.slice(0, 12);
  return {
    id: row.id, origin: row.origin, status: row.status, trashed_from: row.trashed_from, title: row.title,
    real_description: parseJson(row.real_description), real_description_provenance: parseJson(row.real_description_provenance),
    commons_description: row.commons_description, description: row.description, explanation: row.explanation, source_url: row.source_url,
    author: row.author, license_name: row.license_name, license_url: row.license_url, prompt: row.prompt, model: row.model,
    width: row.width, height: row.height, original_mime: row.original_mime, original_sha256: row.original_sha256,
    copy: row.copy_key ? { sha256: row.copy_sha256, width: row.copy_width, height: row.copy_height, bytes: row.copy_bytes, crop: cropOf(row) } : null,
    no_derivatives: row.origin === "REAL" && isNoDerivatives(row.license_name, row.license_url),
    rights_confirmed: row.rights_confirmed === 1, revision: row.revision, tags, categories: Object.fromEntries(rows.map(r => [r.label, r.category])),
    created_at: row.created_at, updated_at: row.updated_at, approved_at: row.approved_at, published_at: row.published_at,
    trashed_at: row.trashed_at,
    analysis: { status: row.analysis_status, error: row.analysis_error, at: row.analyzed_at,
      context: row.analysis_task_context ? { base: row.analysis_base_context, task: row.analysis_task_context } : null },
    generated: generatedOf(row),
    generation: row.generation_batch ? { batch: row.generation_batch, slot: parseSlot(row.generation_slot), quality: row.generation_quality,
      source: row.generation_source } : null,
    group, missing_categories: VISUAL.filter(c => !rows.some(r => r.category === c)),
    completable: completable(row, rows.map(r => r.category)),
    metrics: validMetrics(parseJson(row.copy_metrics)), treatment: validTreatment(parseJson(row.copy_treatment)),
    file: `${base}/${row.id}/file?v=${v}`, original: `${base}/${row.id}/original`,
    stats: extra.stats || { views: 0, correct: 0 }, in_play: extra.in_play || 0,
  };
}
async function extras(env: Env, ids: string[]): Promise<Map<string, Extra>> {
  const [stats, playing] = await Promise.all([statsOf(env, ids), gamesInPlay(env, ids)]);
  return new Map(ids.map(i => [i, { stats: stats.get(i), in_play: playing.get(i) }]));
}
export async function viewOf(env: Env, imageIdValue: string) {
  const row = await find(env, imageIdValue);
  return view(row, (await tagRowsOf(env, [row.id])).get(row.id) || [], (await extras(env, [row.id])).get(row.id));
}
export function labels(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 40) throw new HttpError(400, "Elenco di tag non valido (massimo 40)");
  const out = new Set<string>();
  for (const item of value) {
    const checked = checkTag(item);
    if (!checked.ok) throw new HttpError(400, "«" + String(item).slice(0, 60) + "»: " + checked.reason + (checked.suggestion ? ". Prova «" + checked.suggestion + "»" : ""));
    out.add(checked.tag);
  }
  return [...out];
}
/** Aliases resolve to their tag before anything is stored (spec `libreria-immagini`). */
export async function resolveAliases(env: Env, wanted: string[]): Promise<string[]> {
  if (!wanted.length) return wanted;
  const rows = (await env.DB.prepare(`SELECT a.alias,t.label FROM tag_aliases a JOIN tags t ON t.id=a.tag_id
    WHERE a.alias IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(wanted)).all<{ alias: string; label: string }>()).results;
  const map = new Map(rows.map(r => [r.alias, r.label]));
  return [...new Set(wanted.map(label => map.get(label) || label))];
}
/** Statements that make the image's tags exactly `wanted`; tags rows are created on first use. */
/** New tags take the category given (default «other»); existing tags keep theirs. */
export function tagStatements(env: Env, imageIdValue: string, wanted: string[], guard: { sql: string; values: unknown[] }, categories = new Map<string, Category>()) {
  const stamp = now();
  return [
    ...wanted.map(label => env.DB.prepare(`INSERT INTO tags(id,label,category,created_at) SELECT ?,?,?,? WHERE ${guard.sql}
      ON CONFLICT(label) DO NOTHING`).bind(id(), label, categories.get(label) || "other", stamp, ...guard.values)),
    env.DB.prepare(`DELETE FROM image_tags WHERE image_id=? AND tag_id NOT IN (SELECT id FROM tags WHERE label IN (SELECT value FROM json_each(?)))
      AND ${guard.sql}`).bind(imageIdValue, JSON.stringify(wanted), ...guard.values),
    env.DB.prepare(`INSERT OR IGNORE INTO image_tags(image_id,tag_id) SELECT ?,id FROM tags WHERE label IN (SELECT value FROM json_each(?))
      AND ${guard.sql}`).bind(imageIdValue, JSON.stringify(wanted), ...guard.values),
  ];
}

/** Adds a new image to the library. The original goes to quarantine; the browser then uploads its game copy. */
export async function create(env: Env, input: { origin: Origin; title: string; description?: string; bytes: ArrayBuffer;
  source_url?: string; author?: string; license_name?: string; license_url?: string; prompt?: string; model?: string;
  generation?: { batch: string; slot: unknown; quality: string; source?: string | null } }) {
  if (!env.QUARANTINE) throw new HttpError(503, "Quarantena privata non configurata");
  const bytes = new Uint8Array(input.bytes);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, "File vuoto o oltre 12 MB");
  const mime = imageMime(bytes);
  if (!mime) throw new HttpError(415, "Usare JPEG, PNG o WebP");
  let geometry;
  try { geometry = imageGeometry(bytes); } catch { throw new HttpError(415, "Immagine non leggibile"); }
  const width = geometry.width ?? geometry.encoded_width, height = geometry.height ?? geometry.encoded_height;
  if (width * height > MAX_PIXELS) throw new HttpError(413, "Immagine oltre 32 megapixel");
  const hash = await sha256(bytes);
  const twin = await env.DB.prepare("SELECT id,status,title FROM images WHERE original_sha256=?").bind(hash).first<{ id: string; status: string; title: string }>();
  if (twin) throw new HttpError(409, twin.status === "trash" ? `È già nel cestino come «${twin.title}»: ripristinala` : `È già nella libreria come «${twin.title}»`);
  const imageIdValue = id(), key = `library/${imageIdValue}/original`, stamp = now();
  await env.QUARANTINE.put(key, bytes, { httpMetadata: { contentType: mime }, customMetadata: { sha256: hash } });
  try {
    await env.DB.prepare(`INSERT INTO images(id,origin,title,description,source_url,author,license_name,license_url,prompt,model,
      original_key,original_sha256,original_mime,width,height,created_at,updated_at,generation_batch,generation_slot,generation_quality,generation_source,commons_description)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(imageIdValue, input.origin, text(input.title, "title", true), text(input.description, "description"),
        text(input.source_url, "source_url"), text(input.author, "author"), text(input.license_name, "license_name"),
        text(input.license_url, "license_url"), text(input.prompt, "prompt"), text(input.model, "model"),
        key, hash, mime, width, height, stamp, stamp, input.generation?.batch ?? null,
        input.generation ? JSON.stringify(input.generation.slot) : null, input.generation?.quality ?? null, input.generation?.source ?? null, input.origin === "REAL" ? input.description || "" : null).run();
  } catch (error) {
    await env.QUARANTINE.delete(key);
    if (error instanceof HttpError) throw error;
    throw new HttpError(409, "Immagine già presente o caricamento concorrente");
  }
  return viewOf(env, imageIdValue);
}

/** Stores the WebP game copy made in the owner's browser from the original (spec `copie-di-gioco`): the crop given in
 * «crop» (x,y,width,height,format on the oriented original; the nearest format, centred, if absent), long side at most 1536 px,
 * A new or approved image may change its copy: the new copy replaces the old one, which leaves the quarantine; the image keeps
 * its state, since the owner sees the new copy (owner decision of 2026-11-11 on edits). Its statistics restart. */
async function storeCopy(request: Request, env: Env, row: Row) {
  if (!env.QUARANTINE) throw new HttpError(503, "Quarantena privata non configurata");
  if (row.status !== "new" && row.status !== "approved") throw new HttpError(409, row.status === "published"
    ? "Immagine pubblicata: avvia la modifica, che la ritira dal gioco" : "Immagine nel cestino: ripristinala per cambiarne la copia");
  const asked = new URL(request.url).searchParams.get("crop");
  let crop;
  try { crop = asked === null ? centredCrop(row.width, row.height) : parseCrop(asked); } catch { throw new HttpError(400, "Immagine troppo piccola per una copia di gioco"); }
  const invalid = cropError(row.width, row.height, crop);
  if (!crop || crop.format !== "4:5" || invalid) throw new HttpError(400, invalid || "Copia di gioco richiesta in 4:5");
  // Measures of the copy and, for a SLOP, its treatment (spec `copie-di-gioco`, section 4), sent by the browser in headers.
  const metricsHeader = request.headers.get("X-Copy-Metrics"), treatmentHeader = request.headers.get("X-Copy-Treatment");
  const readJson = (value: string | null) => { try { return value && value.length <= 4000 ? JSON.parse(value) : undefined; } catch { return undefined; } };
  const metrics = metricsHeader === null ? null : validMetrics(readJson(metricsHeader));
  if (metricsHeader !== null && !metrics) throw new HttpError(400, "Misure della copia non valide");
  const treatment = treatmentHeader === null ? null : validTreatment(readJson(treatmentHeader));
  if (treatmentHeader !== null && !treatment) throw new HttpError(400, "Trattamento non valido");
  if (treatment && row.origin !== "SLOP") throw new HttpError(400, "Il trattamento vale solo per le SLOP");
  if (treatment && !treatment.off && treatment.sample.id !== row.generation_source)
    throw new HttpError(400, "Il trattamento deve usare la REAL di riferimento");
  const cropLong = Math.max(crop.width, crop.height);
  const maxSide = treatment && !treatment.off ? treatedLong(treatment.sample.metrics.long, cropLong, GAME_COPY.maxSide) : GAME_COPY.maxSide;
  if (treatment && !treatment.off && treatment.long !== maxSide) throw new HttpError(400, `Lato lungo del trattamento ${treatment.long}, atteso ${maxSide}`);
  const expected = copyDimensions(crop, maxSide);
  const sameTreatment = treatmentKey(validTreatment(parseJson(row.copy_treatment))) === treatmentKey(treatment) || (!treatment && row.origin === "SLOP");
  if (row.copy_key && row.copy_crop === JSON.stringify(crop) && sameTreatment)
    return json({ ...(await viewOf(env, row.id)), already_prepared: true });
  if (Number(request.headers.get("content-length") || 0) > GAME_COPY.maxBytes) throw new HttpError(413, "Copia di gioco oltre 4 MB");
  const upload = new Uint8Array(await request.arrayBuffer());
  if (!upload.length || upload.length > GAME_COPY.maxBytes) throw new HttpError(413, "Copia di gioco vuota o oltre 4 MB");
  let copy;
  try { copy = cleanImage(upload); } catch { throw new HttpError(415, "Copia di gioco non leggibile"); }
  if (copy.mime !== GAME_COPY.mime) throw new HttpError(415, "La copia di gioco deve essere WebP");
  const actual = imageDimensions(copy.bytes);
  if (actual.width !== expected.width || actual.height !== expected.height)
    throw new HttpError(409, `Dimensioni della copia ${actual.width}×${actual.height}, attese ${expected.width}×${expected.height}`);
  const hash = await sha256(copy.bytes), key = `library/${row.id}/copy-${hash.slice(0, 16)}.webp`;
  // The same bytes with another crop or treatment record (a treatment that changed nothing): only the record changes.
  const sameFile = key === row.copy_key;
  if (sameFile && row.copy_crop === JSON.stringify(crop) && sameTreatment) return json({ ...(await viewOf(env, row.id)), already_prepared: true });
  if (!sameFile) await env.QUARANTINE.put(key, copy.bytes, { httpMetadata: { contentType: GAME_COPY.mime }, customMetadata: { sha256: hash } });
  // The record describes the bytes just uploaded; absence of a treatment cannot preserve a previous treatment record.
  const treatmentValue = treatment ? JSON.stringify(treatment) : null;
  const result = await env.DB.prepare(`UPDATE images SET copy_key=?,copy_sha256=?,copy_width=?,copy_height=?,copy_bytes=?,copy_crop=?,copy_view=NULL,
    copy_metrics=?,copy_treatment=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status IN ('new','approved')`)
    .bind(key, hash, actual.width, actual.height, copy.bytes.length, JSON.stringify(crop), metrics ? JSON.stringify(metrics) : null,
      treatmentValue, now(), row.id, row.revision).run();
  if (!result.meta.changes) { if (!sameFile) await env.QUARANTINE.delete(key); throw new HttpError(409, "Immagine modificata altrove: ricaricare"); }
  if (row.copy_key && !sameFile) await env.QUARANTINE.delete(row.copy_key);
  return json({ ...(await viewOf(env, row.id)), already_prepared: false }, 201);
}

async function edit(env: Env, row: Row, data: Record<string, unknown>) {
  const allowed = ["revision", "tags", "tag_categories", "real_description", ...Object.keys(TEXT_FIELDS)];
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new HttpError(400, "Campi non previsti");
  if (data.revision !== row.revision) throw new HttpError(409, "Immagine modificata altrove: ricaricare");
  if (row.status === "published" && !(row.origin === "REAL" && "real_description" in data && Object.keys(data).every(k => ["revision","real_description"].includes(k)))) throw new HttpError(409, "Immagine pubblicata: avvia la modifica, che la ritira dal gioco");
  if (row.status === "trash") throw new HttpError(409, "Immagine nel cestino: ripristinala per modificarla");
  const fields = Object.keys(TEXT_FIELDS).filter(key => key in data);
  const values = fields.map(key => text(data[key], key, key === "title"));
  if ("real_description" in data) {
    const description = realDescription(data.real_description);
    if (row.origin !== "REAL" || !description) throw new HttpError(400, "Descrizione editoriale non valida");
    fields.push("real_description"); values.push(JSON.stringify(description));
  }
  const wanted = data.tags === undefined ? null : await resolveAliases(env, labels(data.tags));
  const requested = data.tag_categories ?? {};
  if (typeof requested !== "object" || requested === null || Array.isArray(requested)) throw new HttpError(400, "Categorie dei tag non valide");
  const categories = wanted ? await categorize(env, wanted, requested as Record<string, unknown>) : undefined;
  if (row.status === "approved" && wanted && !wanted.length) throw new HttpError(409, "Un'immagine approvata deve avere almeno un tag");
  // Owner decision of 2026-11-11: at the end of an edit the image is approved. The owner edits what the player will see,
  // so an approved image stays approved; a new one stays new until it is approved.
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE images SET ${fields.map(key => key + "=?").join(",")}${fields.length ? "," : ""}
      revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status IN ('new','approved','published')`)
      .bind(...values, now(), row.id, row.revision),
    ...(wanted ? tagStatements(env, row.id, wanted, { sql: "EXISTS(SELECT 1 FROM images WHERE id=? AND revision=?)", values: [row.id, row.revision + 1] }, categories) : []),
  ]);
  if (!result[0].meta.changes) throw new HttpError(409, "Immagine modificata altrove: ricaricare");
  return viewOf(env, row.id);
}

/** State changes. Each is guarded by the current status, so repeated or concurrent requests are harmless. */
async function transition(env: Env, row: Row, action: string, data: Record<string, unknown>) {
  const stamp = now();
  if (action === "approve") {
    if (row.status !== "new") throw new HttpError(409, "Si approvano solo immagini nuove");
    if (!row.copy_key) throw new HttpError(409, "Prepara prima la copia di gioco: si approva ciò che vedrà il giocatore");
    if (!cropOf(row)) throw new HttpError(409, "Rifai la copia di gioco in 4:5: scegli l'inquadratura");
    if (row.origin === "REAL" && isNoDerivatives(row.license_name, row.license_url))
      throw new HttpError(409, "Licenza senza opere derivate (ND): la foto è esclusa dal gioco, perché la copia di gioco la ritaglia");
    if (!((await tagsOf(env, [row.id])).get(row.id) || []).length) throw new HttpError(409, "Aggiungi almeno un tag");
    if (row.origin === "REAL" && data.rights_confirmed !== true && row.rights_confirmed !== 1)
      throw new HttpError(409, "Conferma di aver verificato diritti e licenza della foto");
    const result = await env.DB.prepare(`UPDATE images SET status='approved',approved_at=?,rights_confirmed=CASE WHEN origin='REAL' THEN 1 ELSE rights_confirmed END,
      revision=revision+1,updated_at=? WHERE id=? AND status='new' AND copy_key IS NOT NULL
      AND EXISTS(SELECT 1 FROM image_tags WHERE image_id=images.id)`).bind(stamp, stamp, row.id).run();
    if (!result.meta.changes) throw new HttpError(409, "Immagine cambiata: ricaricare");
  } else if (action === "publish") {
    if (row.status === "published") return;
    if (row.status !== "approved" || !row.copy_key) throw new HttpError(409, "Si pubblicano solo immagini approvate");
    if (!cropOf(row)) throw new HttpError(409, "Rifai la copia di gioco in 4:5 prima di pubblicare");
    if (row.origin === "REAL" && isNoDerivatives(row.license_name, row.license_url)) throw new HttpError(409, "Licenza senza opere derivate (ND): esclusa dal gioco");
    if (!env.QUARANTINE || !env.IMAGES) throw new HttpError(503, "Storage non configurato");
    const file = await env.QUARANTINE.get(row.copy_key);
    if (!file) throw new HttpError(409, "Copia di gioco mancante");
    await env.IMAGES.put(row.copy_key, await file.arrayBuffer(), { httpMetadata: { contentType: GAME_COPY.mime } });
    await env.DB.prepare("UPDATE images SET status='published',published_at=?,revision=revision+1,updated_at=? WHERE id=? AND status='approved'")
      .bind(stamp, stamp, row.id).run();
    await reviveCopy(env, row.copy_key);
  } else if (action === "withdraw") {
    if (row.status !== "published") throw new HttpError(409, "L'immagine non è pubblicata");
    // No new game picks the image; games in progress keep its copy until they end.
    await env.DB.prepare("UPDATE images SET status='approved',published_at=NULL,revision=revision+1,updated_at=? WHERE id=? AND status='published'")
      .bind(stamp, row.id).run();
    if (row.copy_key) await retireCopy(env, row.copy_key, row.id);
  } else if (action === "trash") {
    if (row.status === "trash") return;
    // A published image leaves the game first: no new game picks it, games in progress keep its copy until they end.
    // It goes to the trash as approved, so that restoring it never publishes it again by itself.
    const result = await env.DB.prepare(`UPDATE images SET status='trash',trashed_from=CASE status WHEN 'published' THEN 'approved' ELSE status END,
      published_at=NULL,trashed_at=?,revision=revision+1,updated_at=? WHERE id=? AND status IN ('new','approved','published')`).bind(stamp, stamp, row.id).run();
    if (result.meta.changes && row.status === "published" && row.copy_key) await retireCopy(env, row.copy_key, row.id);
  } else if (action === "restore") {
    if (row.status !== "trash") return;
    const restored = await env.DB.prepare(`UPDATE images SET status=trashed_from,trashed_from=NULL,trashed_at=NULL,revision=revision+1,updated_at=? WHERE id=? AND status='trash'
      AND (origin<>'SLOP' OR generation_source IS NULL OR (
        NOT EXISTS(SELECT 1 FROM images other WHERE other.generation_source=images.generation_source AND other.id<>images.id AND other.status IN ('new','approved','published'))
        AND NOT EXISTS(SELECT 1 FROM slop_processes p WHERE p.source_id=images.generation_source AND p.state IN ('running','retry'))))`)
      .bind(stamp, row.id).run();
    if (!restored.meta.changes) throw new HttpError(409, "La REAL ha già una SLOP attiva o un processo in corso: impossibile ripristinare un'altra SLOP");
  } else throw new HttpError(404, "Azione inesistente");
}

/** Deletes trashed images for good: every row (cascade) and every file. An image still in a game in progress waits in the
 * trash: deleting it would remove the rounds of that game. */
async function destroy(env: Env, ids: readonly string[]): Promise<{ deleted: number; postponed: number }> {
  if (!ids.length) return { deleted: 0, postponed: 0 };
  const playing = await gamesInPlay(env, ids);
  const generating = (await env.DB.prepare("SELECT DISTINCT source_id FROM slop_processes WHERE state IN ('running','prompting') AND source_id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ids)).all<{source_id:string}>()).results;
  const blocked = new Set([...playing.keys(), ...generating.map(p=>p.source_id)]);
  const rows = (await env.DB.prepare(`SELECT id,original_key,copy_key FROM images WHERE status='trash'
    AND id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids.filter(i => !blocked.has(i)))).all<{ id: string; original_key: string; copy_key: string | null }>()).results;
  const postponed = ids.filter(i => blocked.has(i)).length;
  if (!rows.length) return { deleted: 0, postponed };
  const temporary = (await env.DB.prepare(`SELECT a.candidate_key FROM slop_attempts a JOIN slop_processes p ON p.id=a.process_id
    WHERE (p.source_id IN (SELECT value FROM json_each(?1)) OR p.image_id IN (SELECT value FROM json_each(?1))) AND a.candidate_key IS NOT NULL`)
    .bind(JSON.stringify(rows.map(r=>r.id))).all<{candidate_key:string}>()).results;
  for (const a of temporary) await env.QUARANTINE?.delete(a.candidate_key);
  await env.DB.prepare("DELETE FROM images WHERE status='trash' AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(rows.map(r => r.id))).run();
  const keys = rows.flatMap(r => [r.original_key, ...(r.copy_key ? [r.copy_key] : [])]);
  for (let i = 0; i < keys.length; i += 1000) await env.QUARANTINE?.delete(keys.slice(i, i + 1000));
  const copies = rows.flatMap(r => r.copy_key ? [r.copy_key] : []);
  for (let i = 0; i < copies.length; i += 1000) await env.IMAGES?.delete(copies.slice(i, i + 1000));
  await sweepRetired(env);
  return { deleted: rows.length, postponed };
}

/** The list: status, origin, title and one or more tags, all of them («all», default) or at least one («any»). */
async function list(env: Env, url: URL) {
  const status = url.searchParams.get("status") || "library", originFilter = url.searchParams.get("origin") || "all";
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100), match = url.searchParams.get("match") || "all";
  const batch = url.searchParams.get("batch") || "", groupFilter = url.searchParams.get("group") || "", incomplete = url.searchParams.get("incomplete") === "1" ? 1 : 0;
  const group = groupFilter ? parseGroup(groupFilter) : null;
  if (groupFilter && !group) throw new HttpError(400, "Filtro non valido");
  const wanted = [...new Set([url.searchParams.get("tag") || "", ...(url.searchParams.get("tags") || "").split(",")].map(t => t.trim()).filter(Boolean))];
  if (!["library", "new", "approved", "published", "trash"].includes(status) || !["all", "REAL", "SLOP"].includes(originFilter)
    || !["all", "any"].includes(match) || wanted.length > 20 || (batch && !/^[\w-]{1,64}$/.test(batch))) throw new HttpError(400, "Filtro non valido");
  const where = [status === "library" ? "status<>'trash'" : "status=?1", "(?2='all' OR origin=?2)",
    `(?3='[]' OR id IN (SELECT it.image_id FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE t.label IN (SELECT value FROM json_each(?3))
      GROUP BY it.image_id HAVING count(DISTINCT t.label)>=CASE ?5 WHEN 'any' THEN 1 ELSE json_array_length(?3) END))`,
    "(?4='' OR title LIKE '%'||?4||'%' COLLATE NOCASE)", "(?6='' OR generation_batch=?6)",
    `(?7='' OR (EXISTS(SELECT 1 FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=images.id AND t.category='genre' AND t.label=?7)
      AND EXISTS(SELECT 1 FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=images.id AND t.category='time' AND t.label=?8)))`,
    `(?9=0 OR (SELECT count(DISTINCT t.category) FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=images.id
      AND t.category IN ('genre','color','medium'))<3)`, `(?10=0 OR COALESCE(json_extract(copy_crop,'$.format'),'')<>'4:5')`].join(" AND ");
  await sweepRetired(env);
  const rows = (await env.DB.prepare(`SELECT * FROM images WHERE ${where} ORDER BY updated_at DESC,id LIMIT 500`)
    .bind(status, originFilter, JSON.stringify(wanted), q, match, batch, group?.genre || "", group?.time || "", incomplete, url.searchParams.get("redo_copy") === "1" ? 1 : 0).all<Row>()).results;
  const ids = rows.map(r => r.id), [tags, more] = await Promise.all([tagRowsOf(env, ids), extras(env, ids)]);
  const counts = (await env.DB.prepare("SELECT status,origin,count(*) AS n FROM images GROUP BY status,origin").all<{ status: string; origin: string; n: number }>()).results;
  return json({ items: rows.map(r => view(r, tags.get(r.id) || [], more.get(r.id))), counts });
}

/** Distribution of the approved and published images: REAL and SLOP overall and for each tag, with the spread
 * REAL − SLOP over approved and published together (as in the SLOP studio). Free. */
async function distribution(env: Env) {
  const totals = (await env.DB.prepare(`SELECT origin,status,count(*) AS n FROM images WHERE status IN ('approved','published')
    GROUP BY origin,status`).all<{ origin: Origin; status: "approved" | "published"; n: number }>()).results;
  const tags = (await env.DB.prepare(`SELECT t.label,t.category,
    sum(i.origin='REAL' AND i.status='approved') AS real_approved,sum(i.origin='REAL' AND i.status='published') AS real_published,
    sum(i.origin='SLOP' AND i.status='approved') AS slop_approved,sum(i.origin='SLOP' AND i.status='published') AS slop_published
    FROM tags t JOIN image_tags it ON it.tag_id=t.id JOIN images i ON i.id=it.image_id WHERE i.status IN ('approved','published')
    GROUP BY t.id`).all<{ label: string; category: Category; real_approved: number; real_published: number; slop_approved: number; slop_published: number }>()).results;
  const count = (origin: Origin, state: string) => totals.find(t => t.origin === origin && t.status === state)?.n || 0;
  return {
    totals: { REAL: { approved: count("REAL", "approved"), published: count("REAL", "published") },
      SLOP: { approved: count("SLOP", "approved"), published: count("SLOP", "published") } },
    tags: tags.map(t => ({ ...t, spread: t.real_approved + t.real_published - t.slop_approved - t.slop_published }))
      .sort((a, b) => b.spread - a.spread || a.label.localeCompare(b.label)),
  };
}

/** POST /:id/regenerate {confirm, prompt, quality, revision}: a new image for a SLOP from its prompt, with the image model chosen in
 * Settings. Paid and confirmed; the generator receives only the text. The image keeps its row, tags and caption until the new
 * analysis; it goes back to «new» without a game copy, its analysis can run once more, and its statistics restart, since they
 * count only rounds played with the current copy. A published image must first leave the game (start of the edit). */
async function regenerate(env: Env, row: Row, data: Record<string, unknown>) {
  void env; void row; void data;
  throw new HttpError(409, "La rigenerazione richiede un nuovo processo nello studio SLOP, con brief, valutazione e conferma del tetto di chiamate");
}

export async function library(request: Request, env: Env, path: string): Promise<Response> {
  const url = new URL(request.url);
  if (path === base && request.method === "GET") return list(env, url);
  if (path === base + "/tags" || path.startsWith(base + "/tags/")) return vocabulary(request, env, path);
  const candidate = /^\/api\/admin\/library\/slop\/batches\/([\w-]{1,64})\/candidate\/([\w-]{1,64})$/.exec(path);
  if (candidate && request.method === "GET") return candidateFile(env, candidate[1], candidate[2]);
  if (path === base + "/analysis" && request.method === "GET") return json(await analysisStatus(env));
  if (path === base + "/distribution" && request.method === "GET") return json(await distribution(env));
  if (path === base + "/contexts" || path === base + "/contexts/restore")
    return json(await contextRoute(env, request.method, path.endsWith("/restore"), request.method === "POST" ? await body(request, 20_000) : {}));
  if (path === base + "/models") return json(await modelsRoute(env, request.method, request.method === "PUT" ? await body(request, 500) : {}));
  if (path === base + "/settings") return json(await settingsRoute(env, request.method, request.method === "PUT" ? await body(request, 500) : {}));
  if (path === base + "/stats" && request.method === "GET") return json(await stats(env, url.searchParams.get("period") || "30"));
  if (path.startsWith(base + "/slop/")) return json(await slopRoute(env, request.method, path.slice((base + "/slop/").length), request.method === "POST" || request.method === "PUT" ? await body(request, 320_000) : {}));
  if (path === base + "/upload" && request.method === "POST") {
    const params = url.searchParams;
    return json(await create(env, { origin: origin(params.get("origin")), title: params.get("title") || "", bytes: await request.arrayBuffer(),
      description: params.get("description") || "", prompt: params.get("prompt") || "", model: params.get("model") || "" }), 201);
  }
  if (path === base + "/commons" && request.method === "POST") {
    const data = await body(request, 2000);
    if (Object.keys(data).some(key => key !== "url") || typeof data.url !== "string") throw new HttpError(400, "Link Commons richiesto");
    const file = await commonsFile(data.url);
    if (isNoDerivatives(file.license_name, file.license_url))
      throw new HttpError(409, `Licenza ${file.license_name || "senza opere derivate"}: le foto ND sono escluse dal gioco, perché la copia di gioco le ritaglia`);
    return json(await create(env, { origin: "REAL", bytes: file.bytes, title: file.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").slice(0, 200),
      description: file.description.slice(0, 1000), source_url: file.source_url, author: file.author.slice(0, 300),
      license_name: file.license_name, license_url: /^https:\/\//.test(file.license_url) ? file.license_url : "" }), 201);
  }
  if (path === base + "/commons/search" && request.method === "GET")
    return json(await browseCommonsSearch(url.searchParams.get("q") || "", url.searchParams.get("offset") || "", url.searchParams.get("sort") || "relevance"));
  if (path === base + "/commons/category" && request.method === "GET")
    return json(await browseCommonsCategory(url.searchParams.get("name") || "", url.searchParams.get("cont") || ""));
  if (path === base + "/trash/empty" && request.method === "POST") {
    const ids = (await env.DB.prepare("SELECT id FROM images WHERE status='trash'").all<{ id: string }>()).results.map(r => r.id);
    return json(await destroy(env, ids));
  }
  if (path === base + "/bulk" && request.method === "POST") {
    const data = await body(request, 40_000);
    const ids = Array.isArray(data.ids) ? [...new Set(data.ids.map(String))].map(imageId) : [];
    if (!ids.length || ids.length > 500) throw new HttpError(400, "Selezione vuota o oltre 500 immagini");
    const action = String(data.action);
    if (action === "delete") return json(await destroy(env, ids));
    const done: string[] = [], failed: { id: string; error: string }[] = [];
    for (const target of ids) {
      try {
        const row = await find(env, target);
        if (action === "tag-add" || action === "tag-remove") {
          const current = (await tagsOf(env, [row.id])).get(row.id) || [], change = await resolveAliases(env, labels(data.tags));
          const wanted = action === "tag-add" ? [...new Set([...current, ...change])] : current.filter(t => !change.includes(t));
          await edit(env, row, { revision: row.revision, tags: wanted,
            tag_categories: isCategory(data.category) ? Object.fromEntries(change.map(label => [label, data.category])) : {} });
        } else await transition(env, row, action, data);
        done.push(target);
      } catch (error) { failed.push({ id: target, error: error instanceof HttpError ? error.message : "Errore" }); }
    }
    return json({ done: done.length, failed });
  }
  const match = path.match(/^\/api\/admin\/library\/([\w-]{1,64})(?:\/(file|original|copy|approve|publish|withdraw|trash|restore|analyze|regenerate|categories|metrics))?$/);
  if (!match) throw new HttpError(404, "API della libreria inesistente");
  const row = await find(env, match[1]);
  if (match[2] === "file" || match[2] === "original") {
    if (request.method !== "GET") throw new HttpError(405, "Metodo non consentito");
    const key = match[2] === "file" && row.copy_key ? row.copy_key : row.original_key;
    const file = await env.QUARANTINE?.get(key);
    if (!file) throw new HttpError(404, "File non disponibile");
    return new Response(file.body, { headers: { "Content-Type": file.httpMetadata?.contentType || "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (match[2] === "analyze") {
    if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
    return json(await analyze(env, row, await body(request, 1000)));
  }
  if (match[2] === "categories") {
    if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
    return json(await completeCategories(env, row, await body(request, 1000)));
  }
  if (match[2] === "metrics") {
    // Measures of an existing copy, made by the browser from that copy: free, any state, the copy must still be the same.
    if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
    const data = await body(request, 2000), metrics = validMetrics(data.metrics);
    if (Object.keys(data).some(key => key !== "metrics" && key !== "sha256") || !metrics || typeof data.sha256 !== "string") throw new HttpError(400, "Misure non valide");
    const result = await env.DB.prepare("UPDATE images SET copy_metrics=? WHERE id=? AND copy_sha256=?").bind(JSON.stringify(metrics), row.id, data.sha256).run();
    if (!result.meta.changes) throw new HttpError(409, "Copia cambiata: misure non salvate");
    return json({ id: row.id, metrics });
  }
  if (match[2] === "regenerate") {
    if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
    return json(await regenerate(env, row, await body(request, 20_000)));
  }
  if (match[2] === "copy") {
    if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
    return storeCopy(request, env, row);
  }
  if (match[2]) {
    if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
    await transition(env, row, match[2], await body(request, 1000));
    return json(await viewOf(env, row.id));
  }
  if (request.method === "GET") return json(await viewOf(env, row.id));
  if (request.method === "PATCH") return json(await edit(env, row, await body(request, 20_000)));
  if (request.method === "DELETE") {
    if (row.status !== "trash") throw new HttpError(409, "Si elimina definitivamente solo dal cestino");
    const result = await destroy(env, [row.id]);
    if (result.postponed) throw new HttpError(409, "L'immagine è usata da partite o generazioni in corso: si potrà eliminare quando saranno finite");
    return json(result);
  }
  throw new HttpError(405, "Metodo non consentito");
}

/** /tags: vocabulary with counts and aliases; merge a tag into another; add or remove an alias. No paid calls. */
async function vocabulary(request: Request, env: Env, path: string): Promise<Response> {
  if (path === base + "/tags" && request.method === "GET") {
    const tags = (await env.DB.prepare(`SELECT t.id,t.label,t.category,count(it.image_id) AS images,
      (SELECT json_group_array(alias) FROM (SELECT alias FROM tag_aliases WHERE tag_id=t.id ORDER BY alias)) AS aliases
      FROM tags t LEFT JOIN image_tags it ON it.tag_id=t.id GROUP BY t.id ORDER BY t.label`).all<{ id: string; label: string; category: Category; images: number; aliases: string }>()).results;
    return json({ tags: tags.map(t => ({ label: t.label, category: t.category, images: t.images, aliases: JSON.parse(t.aliases) as string[] })) });
  }
  if (request.method !== "POST" && request.method !== "DELETE" && request.method !== "PUT") throw new HttpError(405, "Metodo non consentito");
  const data = await body(request, 2000);
  const tag = async (label: string) => env.DB.prepare("SELECT id,label,category FROM tags WHERE label=?").bind(label).first<{ id: string; label: string; category: Category }>();
  /** Images that would hold two tags of a single-tag category if «tagId» took «category» (other than «except»). */
  const clashes = async (tagId: string, category: Category, except = "") => !SINGLE.includes(category) ? 0
    : (await env.DB.prepare(`SELECT count(DISTINCT a.image_id) AS n FROM image_tags a JOIN image_tags b ON b.image_id=a.image_id
      JOIN tags t ON t.id=b.tag_id WHERE a.tag_id=? AND b.tag_id<>? AND b.tag_id<>? AND t.category=?`).bind(tagId, tagId, except, category).first<{ n: number }>())!.n;
  if (path === base + "/tags/category" && request.method === "PUT") {
    // The category belongs to the tag: changing it applies to every image that uses it.
    const [label] = labels([data.label]);
    if (!isCategory(data.category)) throw new HttpError(400, "Categoria inesistente");
    const category = data.category, target = await tag(label);
    if (!target) throw new HttpError(404, "Tag inesistente");
    const error = categoryError(label, category);
    if (error) throw new HttpError(400, error);
    const clash = await clashes(target.id, category);
    if (clash) throw new HttpError(409, `${clash} ${clash === 1 ? "immagine ha" : "immagini hanno"} già un tag di questa categoria, che ne ammette uno solo`);
    await env.DB.prepare("UPDATE tags SET category=? WHERE id=?").bind(category, target.id).run();
    return json({ label, category });
  }
  if (path === base + "/tags/merge" && request.method === "POST") {
    const [from] = labels([data.from]), [into] = labels([data.into]);
    if (from === into) throw new HttpError(400, "Scegli due tag diversi");
    const [source, target] = await Promise.all([tag(from), tag(into)]);
    if (!source || !target) throw new HttpError(404, "Tag inesistente");
    // The remaining tag keeps its category: images of the merged one must not end up with two Time or Format tags.
    const clash = await clashes(source.id, target.category, target.id);
    if (clash) throw new HttpError(409, `${clash} ${clash === 1 ? "immagine avrebbe" : "immagini avrebbero"} due tag di una categoria che ne ammette uno solo`);
    // Images move to the remaining tag; the merged label becomes its alias, with the aliases it had.
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO image_tags(image_id,tag_id) SELECT image_id,? FROM image_tags WHERE tag_id=?").bind(target.id, source.id),
      env.DB.prepare("UPDATE tag_aliases SET tag_id=? WHERE tag_id=?").bind(target.id, source.id),
      env.DB.prepare("DELETE FROM image_tags WHERE tag_id=?").bind(source.id),
      env.DB.prepare("DELETE FROM tags WHERE id=?").bind(source.id),
      env.DB.prepare("INSERT INTO tag_aliases(alias,tag_id,created_at) VALUES(?,?,?)").bind(from, target.id, now()),
    ]);
    return json({ merged: from, into });
  }
  if (path === base + "/tags/alias" && request.method === "POST") {
    const [alias] = labels([data.alias]), [into] = labels([data.into]);
    const target = await tag(into);
    if (!target) throw new HttpError(404, "Tag inesistente");
    if (await tag(alias)) throw new HttpError(409, `«${alias}» è un tag: usa «Unisci» per farlo diventare alias di «${into}»`);
    try { await env.DB.prepare("INSERT INTO tag_aliases(alias,tag_id,created_at) VALUES(?,?,?)").bind(alias, target.id, now()).run(); }
    catch { throw new HttpError(409, `«${alias}» è già un alias`); }
    return json({ alias, into }, 201);
  }
  if (path === base + "/tags/alias" && request.method === "DELETE") {
    const [alias] = labels([data.alias]);
    await env.DB.prepare("DELETE FROM tag_aliases WHERE alias=?").bind(alias).run();
    return json({ removed: alias });
  }
  throw new HttpError(404, "API dei tag inesistente");
}
