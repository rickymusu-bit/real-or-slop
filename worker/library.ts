import { galleryId, galleryRoute } from "./galleries";
import { removeGallery, sweepGalleryFiles } from "./gallery-removal";
/** Image library of the dashboard (spec `libreria-immagini`, `database-immagini`): states and transitions, edits with
 * optimistic revision, game copies with their crop, trash and deletion of every row and file, bulk actions, statistics per image,
 * distribution, Commons acquisition, regeneration of a SLOP, settings and contexts. Tags were retired on 2026-11-20 (owner decision). */
import { imageLabel } from "../shared/image-label";
import { body, HttpError, id, json, type Env } from "./core";
import { browseCommonsCategory, browseCommonsSearch, commonsFile, MAX_IMAGE_BYTES } from "./commons-editorial";
import { imageMime } from "../shared/image-format";
import { imageGeometry } from "../shared/image-geometry";
import { cleanImage } from "../shared/media-clean";
import { centredCrop, copyDimensions, cropError, frameLongSide, GAME_COPY, parseCrop, storedCrop } from "../shared/game-copy";
import { imageDimensions } from "../shared/image-dimensions";
import { isNoDerivatives } from "../shared/licenses";
import { contextRoute } from "./model-context";
import { treatedLong, validMetrics, validSettings, validTreatment } from "../shared/copy-treatment";
import { modelsRoute } from "./models";
import { settingsRoute } from "./app-settings";
import { stats } from "./stats";
import { slopRoute } from "./slop";
import { candidateFile } from "./slop-generation";
import { currentCopyCorrect, currentCopyViews, gamesInPlay, retireCopy, reviveCopy, statsOf, sweepRetired } from "./in-play";
import { ideaRoute, ideasOf, ownIdea, proposeIdeas } from "./real-ideas";
import { describeReal, undescribedReals } from "./real-description";
import type { VisualDescription } from "../shared/real-description";

const base = "/api/admin/library";
const MAX_PIXELS = 32_000_000;
type Origin = "REAL" | "SLOP";
type Status = "new" | "approved" | "published" | "trash";
export interface Row {
  id: string; gallery_id: string; origin: Origin; status: Status; trashed_from: Status | null; title: string | null; description: string;
  source_url: string; author: string; license_name: string; license_url: string; prompt: string; model: string;
  original_key: string; original_sha256: string; original_mime: string; width: number; height: number;
  copy_key: string | null; copy_sha256: string | null; copy_width: number | null; copy_height: number | null; copy_bytes: number | null;
  rights_confirmed: number; revision: number; created_at: string; updated_at: string; approved_at: string | null;
  published_at: string | null; trashed_at: string | null;
  generation_batch: string | null; generation_slot: string | null; generation_quality: string | null;
  copy_crop: string | null;
  copy_metrics: string | null; copy_treatment: string | null; source_checked_at: string | null; source_missing_at: string | null;
  ideas_reason: string;
  visual_description: string | null;
}
const now = () => new Date().toISOString();
const sha256 = async (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2, "0")).join("");
const TEXT_FIELDS: Record<string, number> = { title: 200, description: 1000, source_url: 1000,
  author: 300, license_name: 200, license_url: 1000, prompt: 24000, model: 100 };

function text(value: unknown, field: string, required = false): string {
  if (value === undefined || value === null) { if (required) throw new HttpError(400, "Required field: " + field); return ""; }
  if (typeof value !== "string") throw new HttpError(400, "Invalid field: " + field);
  // Control characters out, except tab and line breaks.
  const clean = [...value.normalize("NFC")].filter(ch => { const c = ch.charCodeAt(0); return c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127); }).join("").trim();
  if (clean.length > TEXT_FIELDS[field]) throw new HttpError(400, `Field “${field}” exceeds ${TEXT_FIELDS[field]} characters`);
  if (required && !clean) throw new HttpError(400, "Required field: " + field);
  if ((field === "source_url" || field === "license_url") && clean && !/^https:\/\/[^\s]+$/.test(clean))
    throw new HttpError(400, "HTTPS URL required: " + field);
  return clean;
}
function origin(value: unknown): Origin {
  if (value !== "REAL" && value !== "SLOP") throw new HttpError(400, "REAL or SLOP origin required");
  return value;
}
function imageId(value: string): string {
  if (!/^[\w-]{1,64}$/.test(value)) throw new HttpError(400, "Invalid image");
  return value;
}
export async function find(env: Env, imageIdValue: string): Promise<Row> {
  const row = await env.DB.prepare("SELECT * FROM images WHERE id=?").bind(imageIdValue).first<Row>();
  if (!row) throw new HttpError(404, "Image not found");
  return row;
}
/** The crop of the copy, or null for a copy of an earlier recipe (4:5, or before migration 0042): to be made again. */
const cropOf = (row: Pick<Row, "copy_crop">) => storedCrop(row.copy_crop);
/** Slot of a generated SLOP: index, process, measures and evaluation. */
function parseSlot(value: string | null): unknown {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}
const parseJson = (value: string | null): unknown => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
interface Extra { stats?: { views: number; correct: number }; in_play?: number;
  ideas?: Awaited<ReturnType<typeof ideasOf>> extends Map<string, infer T> ? T : never }
function view(row: Row, extra: Extra = {}, detail = false) {
  const v = row.copy_sha256 ? row.copy_sha256.slice(0, 12) : row.original_sha256.slice(0, 12);
  return {
    id: row.id, gallery_id: row.gallery_id, origin: row.origin, status: row.status, trashed_from: row.trashed_from,
    // REAL: source description (Commons, corrected by the owner); a SLOP has its prompt and model and no description (2026-11-20).
    ...(row.origin === "REAL" ? { title: row.title, description: row.description, source_url: row.source_url,
      has_visual_description: !!row.visual_description,
      ...(detail ? { visual_description: parseJson(row.visual_description) as VisualDescription | null } : {}),
      source_checked_at: row.source_checked_at, source_missing_at: row.source_missing_at,
      author: row.author, license_name: row.license_name, license_url: row.license_url,
      // Ideas of falsification and why the model proposed none (specification `generazione-slop`, section 2).
      ideas: extra.ideas ?? [], ideas_reason: row.ideas_reason }
      : { prompt: row.prompt, model: row.model }),
    width: row.width, height: row.height, original_mime: row.original_mime, original_sha256: row.original_sha256,
    copy: row.copy_key ? { sha256: row.copy_sha256, width: row.copy_width, height: row.copy_height, bytes: row.copy_bytes, crop: cropOf(row) } : null,
    no_derivatives: row.origin === "REAL" && isNoDerivatives(row.license_name, row.license_url),
    rights_confirmed: row.rights_confirmed === 1, revision: row.revision,
    created_at: row.created_at, updated_at: row.updated_at, approved_at: row.approved_at, published_at: row.published_at,
    trashed_at: row.trashed_at,
    generation: row.generation_batch || row.generation_slot ? { batch: row.generation_batch, slot: parseSlot(row.generation_slot), quality: row.generation_quality } : null,
    metrics: validMetrics(parseJson(row.copy_metrics)), treatment: validTreatment(parseJson(row.copy_treatment)),
    file: `${base}/${row.id}/file?v=${v}`, original: `${base}/${row.id}/original`,
    stats: extra.stats || { views: 0, correct: 0 }, in_play: extra.in_play || 0,
  };
}
async function extras(env: Env, rows: readonly Pick<Row, "id" | "origin" | "gallery_id">[]): Promise<Map<string, Extra>> {
  const ids = rows.map(r => r.id), real = rows.filter(r => r.origin === "REAL");
  const [stats, playing, ideas] = await Promise.all([statsOf(env, ids), gamesInPlay(env, ids), ideasOf(env, real.map(r => r.id))]);
  return new Map(rows.map(r => [r.id, { stats: stats.get(r.id), in_play: playing.get(r.id),
    ideas: ideas.get(r.id) }]));
}
export async function viewOf(env: Env, imageIdValue: string) {
  const row = await find(env, imageIdValue);
  return view(row, (await extras(env, [row])).get(row.id), true);
}
/** Adds a new image to the library. The original goes to quarantine; the browser then uploads its game copy. */
export async function create(env: Env, input: { origin: Origin; title?: string; description?: string; bytes: ArrayBuffer;
  source_url?: string; author?: string; license_name?: string; license_url?: string; prompt?: string; model?: string;
  gallery_id: string; generation?: { batch: string; slot: unknown; quality: string } }) {
  if (!env.QUARANTINE) throw new HttpError(503, "Private quarantine not configured");
  const bytes = new Uint8Array(input.bytes);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, "File empty or larger than 12 MB");
  const mime = imageMime(bytes);
  if (!mime) throw new HttpError(415, "Use JPEG, PNG or WebP");
  let geometry;
  try { geometry = imageGeometry(bytes); } catch { throw new HttpError(415, "Unreadable image"); }
  const width = geometry.width ?? geometry.encoded_width, height = geometry.height ?? geometry.encoded_height;
  if (width * height > MAX_PIXELS) throw new HttpError(413, "Image exceeds 32 megapixels");
  const hash = await sha256(bytes);
  const twin = await env.DB.prepare("SELECT id,origin,status,title FROM images WHERE original_sha256=?").bind(hash).first<{ id: string; origin: Origin; status: string; title: string | null }>();
  if (twin) throw new HttpError(409, twin.status === "trash" ? `Already in Trash as “${imageLabel(twin)}”: restore it` : `Already in the library as “${imageLabel(twin)}»`);
  const imageIdValue = id(), key = `library/${imageIdValue}/original`, stamp = now();
  await env.QUARANTINE.put(key, bytes, { httpMetadata: { contentType: mime }, customMetadata: { sha256: hash } });
  try {
    await env.DB.prepare(`INSERT INTO images(id,origin,title,description,source_url,author,license_name,license_url,prompt,model,
      original_key,original_sha256,original_mime,width,height,created_at,updated_at,generation_batch,generation_slot,generation_quality,gallery_id,
      source_checked_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(imageIdValue, input.origin, input.origin === "REAL" ? text(input.title, "title", true) : null,
        input.origin === "REAL" ? text(input.description, "description") : "",
        text(input.source_url, "source_url"), text(input.author, "author"), text(input.license_name, "license_name"),
        text(input.license_url, "license_url"), text(input.prompt, "prompt"), text(input.model, "model"),
        key, hash, mime, width, height, stamp, stamp, input.generation?.batch ?? null,
        input.generation ? JSON.stringify(input.generation.slot) : null, input.generation?.quality ?? null, input.gallery_id,
        // Reading the file from Commons at the acquisition is its first check (spec `libreria-immagini`, section 9).
        input.origin === "REAL" && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(input.source_url || "") ? stamp : null).run();
  } catch (error) {
    await env.QUARANTINE.delete(key);
    if (error instanceof HttpError) throw error;
    throw new HttpError(409, "Image already exists or a concurrent import is in progress");
  }
  return viewOf(env, imageIdValue);
}

/** What makes two treatments give the same copy. */
const treatmentKey = (t: ReturnType<typeof validTreatment>) =>
  t ? JSON.stringify([t.version, t.off, t.seed, t.long, t.sample.metrics, t.settings || null]) : "";

/** POST /:id/copy?crop=…[&force=1]: stores the WebP game copy made in the owner's browser from the original (spec `copie-di-gioco`; owner
 * decision of 2026-11-16: the Worker handles what concerns OpenAI, the browser everything else). The crop is «x,y,width,height,4:5»
 * on the oriented original, with «,padded» for coordinates in the canvas with bands, «,fit» for the whole photo and «,fit-width» for
 * earlier full-width copies. Omission keeps the
 * centred crop used by older callers. The copy has the size of the recipe or the SLOP treatment. Its
 * measures and, for a SLOP, its treatment come in headers. A new or approved image may change its copy: the new copy replaces the
 * old one, which leaves the quarantine; the image keeps its state (owner decision of 2026-11-11 on edits). Its statistics restart.
 * The same crop and treatment are «already prepared», unless «force» asks to store the new bytes (a copy of an earlier recipe). */
async function storeCopy(request: Request, env: Env, row: Row) {
  if (!env.QUARANTINE) throw new HttpError(503, "Private quarantine not configured");
  if (row.status !== "new" && row.status !== "approved") throw new HttpError(409, row.status === "published"
    ? "Published image: start editing to withdraw it from the game" : "Image in Trash: restore it to change the copy");
  const query = new URL(request.url).searchParams, asked = query.get("crop"), force = query.get("force") === "1";
  let crop;
  try { crop = asked === null ? centredCrop(row.width, row.height) : parseCrop(asked); } catch { throw new HttpError(400, "Image too small for a game copy"); }
  const invalid = cropError(row.width, row.height, crop);
  if (!crop || crop.format !== "4:5" || invalid) throw new HttpError(400, invalid || "Game copy must be 4:5");
  // Measures of the copy and, for a SLOP, its treatment (spec `copie-di-gioco`, section 4), sent by the browser in headers.
  const metricsHeader = request.headers.get("X-Copy-Metrics"), treatmentHeader = request.headers.get("X-Copy-Treatment");
  const readJson = (value: string | null) => { try { return value && value.length <= 4000 ? JSON.parse(value) : undefined; } catch { return undefined; } };
  const metrics = metricsHeader === null ? null : validMetrics(readJson(metricsHeader));
  if (metricsHeader !== null && !metrics) throw new HttpError(400, "Invalid copy measurements");
  const treatment = treatmentHeader === null ? null : validTreatment(readJson(treatmentHeader));
  if (treatmentHeader !== null && !treatment) throw new HttpError(400, "Invalid treatment");
  if (treatment && row.origin !== "SLOP") throw new HttpError(400, "Treatment applies only to SLOP");
  const cropLong = frameLongSide(crop);
  if (treatment?.settings && !validSettings(treatment.settings, cropLong)) throw new HttpError(400, "Treatment settings out of range");
  // The long side: the owner's (sliders), else the one proposed from the source REAL, else the recipe's.
  const maxSide = !treatment || treatment.off ? GAME_COPY.maxSide : treatment.settings ? Math.min(treatment.settings.long, cropLong, GAME_COPY.maxSide)
    : treatedLong(treatment.sample.metrics.long, cropLong, GAME_COPY.maxSide);
  if (treatment && !treatment.off && treatment.long !== maxSide) throw new HttpError(400, `Treatment long edge ${treatment.long}, expected ${maxSide}`);
  const expected = copyDimensions(crop, maxSide);
  const sameTreatment = treatmentKey(validTreatment(parseJson(row.copy_treatment))) === treatmentKey(treatment) || (!treatment && row.origin === "SLOP");
  if (!force && row.copy_key && row.copy_crop === JSON.stringify(crop) && sameTreatment)
    return json({ ...(await viewOf(env, row.id)), already_prepared: true });
  if (Number(request.headers.get("content-length") || 0) > GAME_COPY.maxBytes) throw new HttpError(413, "Game copy exceeds 4 MB");
  const upload = new Uint8Array(await request.arrayBuffer());
  if (!upload.length || upload.length > GAME_COPY.maxBytes) throw new HttpError(413, "Game copy empty or larger than 4 MB");
  let copy;
  try { copy = cleanImage(upload); } catch { throw new HttpError(415, "Unreadable game copy"); }
  if (copy.mime !== GAME_COPY.mime) throw new HttpError(415, "Game copy must be WebP");
  const actual = imageDimensions(copy.bytes);
  if (actual.width !== expected.width || actual.height !== expected.height)
    throw new HttpError(409, `Copy dimensions ${actual.width}×${actual.height}, expected ${expected.width}×${expected.height}`);
  const hash = await sha256(copy.bytes), key = `library/${row.id}/copy-${hash.slice(0, 16)}.webp`;
  // The same bytes with another crop or treatment record (a treatment that changed nothing): only the record changes.
  const sameFile = key === row.copy_key;
  if (sameFile && row.copy_crop === JSON.stringify(crop) && sameTreatment) return json({ ...(await viewOf(env, row.id)), already_prepared: true });
  if (!sameFile) await env.QUARANTINE.put(key, copy.bytes, { httpMetadata: { contentType: GAME_COPY.mime }, customMetadata: { sha256: hash } });
  // The record describes the bytes just uploaded; absence of a treatment cannot preserve a previous treatment record.
  const result = await env.DB.prepare(`UPDATE images SET copy_key=?,copy_sha256=?,copy_width=?,copy_height=?,copy_bytes=?,copy_crop=?,
    copy_metrics=?,copy_treatment=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status IN ('new','approved')`)
    .bind(key, hash, actual.width, actual.height, copy.bytes.length, JSON.stringify(crop), metrics ? JSON.stringify(metrics) : null,
      treatment ? JSON.stringify(treatment) : null, now(), row.id, row.revision).run();
  if (!result.meta.changes) { if (!sameFile) await env.QUARANTINE.delete(key); throw new HttpError(409, "Image changed elsewhere: reload"); }
  if (row.copy_key && !sameFile) await env.QUARANTINE.delete(row.copy_key);
  return json({ ...(await viewOf(env, row.id)), already_prepared: false }, 201);
}

/** Gallery membership is editorial metadata and does not withdraw or restore a photo. */
async function assignGallery(env: Env, row: Row, gallery: string, revision = row.revision) {
  if (row.gallery_id === gallery) return;
  const result = await env.DB.prepare("UPDATE images SET gallery_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?")
    .bind(gallery, now(), row.id, revision).run();
  if (!result.meta.changes) throw new HttpError(409, "Image changed elsewhere: reload");
}

async function edit(env: Env, row: Row, data: Record<string, unknown>) {
  if (Object.keys(data).every(key => ["revision", "gallery_id"].includes(key)) && "gallery_id" in data) {
    if (data.revision !== row.revision) throw new HttpError(409, "Image changed elsewhere: reload");
    await assignGallery(env, row, await galleryId(env, data.gallery_id));
    return viewOf(env, row.id);
  }
  const applicable = Object.keys(TEXT_FIELDS).filter(key => row.origin === "REAL"
    ? !["prompt", "model"].includes(key) : !["title", "description", "source_url", "author", "license_name", "license_url"].includes(key));
  const allowed = ["revision", ...applicable];
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new HttpError(400, "Unexpected fields");
  if (data.revision !== row.revision) throw new HttpError(409, "Image changed elsewhere: reload");
  if (row.status === "published") throw new HttpError(409, "Published image: start editing to withdraw it from the game");
  if (row.status === "trash") throw new HttpError(409, "Image in Trash: restore it to edit");
  const fields = Object.keys(TEXT_FIELDS).filter(key => key in data);
  const values: (string | null)[] = fields.map(key => text(data[key], key, key === "title"));
  // A corrected source address is checked on Commons the next night, and its flag goes until then.
  if (row.origin === "REAL" && "source_url" in data && values[fields.indexOf("source_url")] !== row.source_url) {
    fields.push("source_checked_at", "source_missing_at"); values.push(null, null);
  }
  // Owner decision of 2026-11-11: at the end of an edit the image is approved. The owner edits what the player will see,
  // so an approved image stays approved; a new one stays new until it is approved.
  const result = await env.DB.prepare(`UPDATE images SET ${fields.map(key => key + "=?").join(",")}${fields.length ? "," : ""}
      revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status IN ('new','approved','published')`)
      .bind(...values, now(), row.id, row.revision).run();
  if (!result.meta.changes) throw new HttpError(409, "Image changed elsewhere: reload");
  return viewOf(env, row.id);
}

/** State changes. Each is guarded by the current status, so repeated or concurrent requests are harmless. */
export async function transition(env: Env, row: Row, action: string, data: Record<string, unknown>) {
  const stamp = now();
  if (action === "approve") {
    if (row.status !== "new") throw new HttpError(409, "Only new images can be approved");
    if (!row.copy_key) throw new HttpError(409, "Prepare the game copy first: approve what players will see");
    if (!cropOf(row)) throw new HttpError(409, "Recreate the game copy in 4:5: choose its frame");
    if (row.origin === "REAL" && isNoDerivatives(row.license_name, row.license_url))
      throw new HttpError(409, "No derivatives (ND) license: the game copy is a modified version");
    if (row.origin === "REAL" && data.rights_confirmed !== true && row.rights_confirmed !== 1)
      throw new HttpError(409, "Confirm you have checked the photo’s rights and license");
    const result = await env.DB.prepare(`UPDATE images SET status='approved',approved_at=?,rights_confirmed=CASE WHEN origin='REAL' THEN 1 ELSE rights_confirmed END,
      revision=revision+1,updated_at=? WHERE id=? AND status='new' AND copy_key IS NOT NULL`).bind(stamp, stamp, row.id).run();
    if (!result.meta.changes) throw new HttpError(409, "Image changed: reload");
  } else if (action === "publish") {
    if (row.status === "published") return;
    if (row.status !== "approved" || !row.copy_key) throw new HttpError(409, "Only approved images can be published");
    if (!cropOf(row)) throw new HttpError(409, "Recreate the game copy in 4:5 before publishing");
    if (row.origin === "REAL" && isNoDerivatives(row.license_name, row.license_url)) throw new HttpError(409, "No derivatives (ND) license: excluded from the game");
    if (!env.QUARANTINE || !env.IMAGES) throw new HttpError(503, "Storage not configured");
    const file = await env.QUARANTINE.get(row.copy_key);
    if (!file) throw new HttpError(409, "Missing game copy");
    await env.IMAGES.put(row.copy_key, await file.arrayBuffer(), { httpMetadata: { contentType: GAME_COPY.mime } });
    const published = await env.DB.prepare("UPDATE images SET status='published',published_at=?,revision=revision+1,updated_at=? WHERE id=? AND status='approved'")
      .bind(stamp, stamp, row.id).run();
    if (!published.meta.changes && !await env.DB.prepare("SELECT 1 FROM images WHERE id=?").bind(row.id).first()) {
      await env.DB.prepare("INSERT INTO gallery_files_to_delete(bucket,object_key) VALUES('game',?)").bind(row.copy_key).run();
      await sweepGalleryFiles(env).catch(error => console.error("gallery file cleanup", error));
      throw new HttpError(404, "Image not found");
    }
    await reviveCopy(env, row.copy_key);
  } else if (action === "withdraw") {
    if (row.status !== "published") throw new HttpError(409, "Image is not published");
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
    await env.DB.prepare(`UPDATE images SET status=trashed_from,trashed_from=NULL,trashed_at=NULL,revision=revision+1,updated_at=? WHERE id=? AND status='trash'`)
      .bind(stamp, row.id).run();
  } else throw new HttpError(404, "Unknown action");
}

/** Group status choices reuse approval, publication and withdrawal, including their existing checks and game copies. */
async function setPhotoStatus(env: Env, row: Row, status: "approved" | "published", data: Record<string, unknown>) {
  if (row.status === status) return;
  if (row.status === "trash") throw new HttpError(409, "Restore the photo from Trash first");
  if (row.status === "new") {
    await transition(env, row, "approve", data);
    if (status === "approved") return;
    row = await find(env, row.id);
  }
  await transition(env, row, status === "approved" ? "withdraw" : "publish", data);
  const final = await env.DB.prepare("SELECT status FROM images WHERE id=?").bind(row.id).first<{ status: string }>();
  if (final?.status !== status) throw new HttpError(409, "Photo changed elsewhere. Try again.");
}

/** Deletes trashed images for good: every row (cascade) and every file. An image still in a game in progress waits in the
 * trash: deleting it would remove the rounds of that game. */
async function destroy(env: Env, ids: readonly string[]): Promise<{ deleted: number; postponed: number }> {
  if (!ids.length) return { deleted: 0, postponed: 0 };
  const playing = await gamesInPlay(env, ids);
  const blocked = new Set(playing.keys());
  const rows = (await env.DB.prepare(`SELECT id,original_key,copy_key FROM images WHERE status='trash'
    AND id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids.filter(i => !blocked.has(i)))).all<{ id: string; original_key: string; copy_key: string | null }>()).results;
  const postponed = ids.filter(i => blocked.has(i)).length;
  if (!rows.length) return { deleted: 0, postponed };
  const temporary = (await env.DB.prepare(`SELECT a.candidate_key FROM slop_attempts a JOIN slop_processes p ON p.id=a.process_id
    WHERE p.image_id IN (SELECT value FROM json_each(?1)) AND a.candidate_key IS NOT NULL`)
    .bind(JSON.stringify(rows.map(r=>r.id))).all<{candidate_key:string}>()).results;
  for (const a of temporary) await env.QUARANTINE?.delete(a.candidate_key);
  await env.DB.prepare("DELETE FROM images WHERE status='trash' AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(rows.map(r => r.id))).run();
  const keys = rows.flatMap(r => [r.original_key, ...(r.copy_key ? [r.copy_key] : [])]);
  for (let i = 0; i < keys.length; i += 1000) await env.QUARANTINE?.delete(keys.slice(i, i + 1000));
  const copies = rows.flatMap(r => r.copy_key ? [r.copy_key] : []);
  for (let i = 0; i < copies.length; i += 1000) await env.IMAGES?.delete(copies.slice(i, i + 1000));
  await sweepRetired(env);
  await sweepGalleryFiles(env).catch(error => console.error("pipeline cleanup",error));
  return { deleted: rows.length, postponed };
}

/** The list: status, origin, text in identifier/title/description/prompt, batch, copy to redo, gallery. */
async function list(env: Env, url: URL) {
  const status = url.searchParams.get("status") || "library", originFilter = url.searchParams.get("origin") || "all";
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const gallery = url.searchParams.get("gallery") || "";
  const paged = url.searchParams.has("offset");
  const offset = Number(url.searchParams.get("offset"));
  const sort = url.searchParams.get("sort") || "added", order = url.searchParams.get("order") || "desc";
  const batch = url.searchParams.get("batch") || "";
  if (url.searchParams.has("group")) throw new HttpError(400, "Group filtering is no longer available");
  if (["tag", "tags", "match", "incomplete"].some(key => url.searchParams.has(key))) throw new HttpError(400, "Tags are no longer available: filter by text, status or origin");
  if (!["library", "new", "approved", "published", "trash"].includes(status) || !["all", "REAL", "SLOP"].includes(originFilter)
    || (batch && !/^[\w-]{1,64}$/.test(batch)) || (gallery && !/^[\w-]{1,64}$/.test(gallery))) throw new HttpError(400, "Invalid filter");
  if (paged && (!gallery || !Number.isSafeInteger(offset) || offset < 0 || !["added", "views", "accuracy"].includes(sort) || !["asc", "desc"].includes(order)))
    throw new HttpError(400, "Invalid page");
  const where = [status === "library" ? "status<>'trash'" : "status=?1", "(?2='all' OR origin=?2)",
    "(?3='' OR id LIKE '%'||?3||'%' COLLATE NOCASE OR title LIKE '%'||?3||'%' COLLATE NOCASE OR description LIKE '%'||?3||'%' COLLATE NOCASE OR prompt LIKE '%'||?3||'%' COLLATE NOCASE)", "(?4='' OR generation_batch=?4)",
    `(?5=0 OR COALESCE(json_extract(copy_crop,'$.format'),'')<>'4:5')`, gallery ? "gallery_id=?6" : "?6=''"].join(" AND ");
  await sweepRetired(env);
  const limit = 72;
  const sortKey = sort === "views" ? currentCopyViews : sort === "accuracy" ? `1.0*${currentCopyCorrect}/NULLIF(${currentCopyViews},0)` : "created_at";
  const ordering = paged ? `${sortKey} ${order === "asc" ? "ASC" : "DESC"} NULLS LAST,created_at DESC,id LIMIT ?7 OFFSET ?8` : "updated_at DESC,id LIMIT 500";
  const rows = (await env.DB.prepare(`SELECT * FROM images i WHERE ${where} ORDER BY ${ordering}`)
    .bind(status, originFilter, q, batch, url.searchParams.get("redo_copy") === "1" ? 1 : 0,
      gallery, ...(paged ? [limit + 1, offset] : [])).all<Row>()).results;
  const next = paged && rows.length > limit ? offset + limit : null;
  if (next !== null) rows.pop();
  const more = await extras(env, rows);
  const countQuery = `SELECT status,origin,count(*) AS n,sum(origin='REAL' AND status<>'trash' AND visual_description IS NULL) AS undescribed FROM images i`;
  const counts = (await (gallery
    ? env.DB.prepare(countQuery + " WHERE gallery_id=? GROUP BY status,origin").bind(gallery)
    : env.DB.prepare(countQuery + " GROUP BY status,origin")).all<{ status: string; origin: string; n: number; undescribed: number }>()).results;
  const undescribed = counts.reduce((total, count) => total + count.undescribed, 0);
  return json({ items: rows.map(r => view(r, more.get(r.id))), counts: counts.map(({ status, origin, n }) => ({ status, origin, n })),
    undescribed, ...(paged ? {next} : {}) });
}

/** Distribution of the approved and published images: REAL and SLOP, approved and published. Free. */
async function distribution(env: Env) {
  const totals = (await env.DB.prepare(`SELECT origin,status,count(*) AS n FROM images WHERE status IN ('approved','published')
    GROUP BY origin,status`).all<{ origin: Origin; status: "approved" | "published"; n: number }>()).results;
  const count = (origin: Origin, state: string) => totals.find(t => t.origin === origin && t.status === state)?.n || 0;
  return {
    totals: { REAL: { approved: count("REAL", "approved"), published: count("REAL", "published") },
      SLOP: { approved: count("SLOP", "approved"), published: count("SLOP", "published") } },
  };
}

/** Legacy direct regeneration is refused: all new SLOP must pass the editorial process. */
async function regenerate(env: Env, row: Row, data: Record<string, unknown>) {
  void env; void row; void data;
  throw new HttpError(409, "Regeneration requires a new gallery pipeline job with confirmation of the maximum paid calls");
}

export async function library(request: Request, env: Env, path: string): Promise<Response> {
  const url = new URL(request.url);
  if (path === base && request.method === "GET") return list(env, url);
  const gallery = /^\/api\/admin\/library\/galleries\/([\w-]{1,64})$/.exec(path);
  if (gallery && request.method === "DELETE") return json(await removeGallery(env, gallery[1], await body(request, 1000)));
  if (path === base + "/galleries" || path.startsWith(base + "/galleries/"))
    return json(await galleryRoute(env, request.method, path.slice((base + "/galleries").length).replace(/^\//, ""), ["POST", "PATCH"].includes(request.method) ? await body(request, 40_000) : {}));
  const candidate = /^\/api\/admin\/library\/slop\/batches\/([\w-]{1,64})\/candidate\/([\w-]{1,64})$/.exec(path);
  if (candidate && request.method === "GET") return candidateFile(env, candidate[1], candidate[2]);
  if (path === base + "/distribution" && request.method === "GET") return json(await distribution(env));
  if (path === base + "/undescribed-reals" && request.method === "GET") return json(await undescribedReals(env, url.searchParams.get("gallery")));
  if (path === base + "/contexts" || path === base + "/contexts/restore")
    return json(await contextRoute(env, request.method, path.endsWith("/restore"), request.method === "POST" ? await body(request, 20_000) : {}));
  if (path === base + "/models") return json(await modelsRoute(env, request.method, request.method === "PUT" ? await body(request, 500) : {}));
  if (path === base + "/settings") return json(await settingsRoute(env, request.method, request.method === "PUT" ? await body(request, 500) : {}));
  if (path === base + "/stats" && request.method === "GET") return json(await stats(env, url.searchParams.get("period") || "30"));
  if (path.startsWith(base + "/slop/")) return json(await slopRoute(env, request.method, path.slice((base + "/slop/").length), request.method === "POST" || request.method === "PUT" ? await body(request, 320_000) : {}, url.searchParams.get("gallery") || ""));
  const idea = /^\/api\/admin\/library\/ideas\/([\w-]{1,64})$/.exec(path);
  if (idea) {
    const result = await ideaRoute(env, request.method, idea[1], request.method === "PATCH" ? await body(request, 4000) : request.method === "DELETE" ? await body(request, 100).catch(() => ({})) : {});
    return json(await viewOf(env, result.image_id));
  }
  if (path === base + "/upload" && request.method === "POST") {
    const params = url.searchParams;
    const kind = origin(params.get("origin"));
    return json(await create(env, { origin: kind, gallery_id: await galleryId(env, params.get("gallery_id")), title: params.get("title") || "", bytes: await request.arrayBuffer(),
      description: params.get("description") || "", prompt: params.get("prompt") || "", model: params.get("model") || "" }), 201);
  }
  if (path === base + "/commons" && request.method === "POST") {
    const data = await body(request, 2000);
    if (Object.keys(data).some(key => !["url", "gallery_id"].includes(key)) || typeof data.url !== "string") throw new HttpError(400, "Commons link required");
    const gallery = await galleryId(env, data.gallery_id);
    const file = await commonsFile(data.url);
    if (isNoDerivatives(file.license_name, file.license_url))
      throw new HttpError(409, `License ${file.license_name || "no derivatives"}: the game copy is a modified version`);
    return json(await create(env, { origin: "REAL", gallery_id: gallery, bytes: file.bytes, title: file.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").slice(0, 200),
      description: file.description.slice(0, 1000), source_url: file.source_url, author: file.author.slice(0, 300),
      license_name: file.license_name, license_url: /^https:\/\//.test(file.license_url) ? file.license_url : "" }), 201);
  }
  if (path === base + "/commons/search" && request.method === "GET")
    return json(await browseCommonsSearch(url.searchParams.get("q") || "", url.searchParams.get("offset") || "", url.searchParams.get("sort") || "relevance"));
  if (path === base + "/commons/category" && request.method === "GET")
    return json(await browseCommonsCategory(url.searchParams.get("name") || "", url.searchParams.get("cont") || ""));
  if (path === base + "/trash/empty" && request.method === "POST") {
    const gallery = url.searchParams.has("gallery") ? await galleryId(env, url.searchParams.get("gallery")) : "";
    const ids = (await env.DB.prepare("SELECT id FROM images WHERE status='trash' AND (?1='' OR gallery_id=?1)").bind(gallery).all<{ id: string }>()).results.map(r => r.id);
    return json(await destroy(env, ids));
  }
  if (path === base + "/bulk" && request.method === "POST") {
    const data = await body(request, 40_000);
    const ids = Array.isArray(data.ids) ? [...new Set(data.ids.map(String))].map(imageId) : [];
    if (!ids.length || ids.length > 500) throw new HttpError(400, "Selection empty or larger than 500 images");
    const action = String(data.action);
    if (action === "delete") return json(await destroy(env, ids));
    const gallery = action === "gallery" ? await galleryId(env, data.gallery_id) : null;
    const done: string[] = [], failed: { id: string; error: string }[] = [];
    for (const target of ids) {
      try {
        const row = await find(env, target);
        if (gallery) await assignGallery(env, row, gallery);
        else if (action === "set-approved" || action === "set-published") {
          await setPhotoStatus(env, row, action === "set-approved" ? "approved" : "published", data);
        } else await transition(env, row, action, data);
        done.push(target);
      } catch (error) { failed.push({ id: target, error: error instanceof HttpError ? error.message : "Errore" }); }
    }
    return json({ done: done.length, failed });
  }
  const match = path.match(/^\/api\/admin\/library\/([\w-]{1,64})(?:\/(file|original|copy|approve|publish|withdraw|trash|restore|regenerate|metrics|ideas|description))?$/);
  if (!match) throw new HttpError(404, "Library API not found");
  const row = await find(env, match[1]);
  if (match[2] === "file" || match[2] === "original") {
    if (request.method !== "GET") throw new HttpError(405, "Method not allowed");
    const key = match[2] === "file" && row.copy_key ? row.copy_key : row.original_key;
    const file = await env.QUARANTINE?.get(key);
    if (!file) throw new HttpError(404, "File unavailable");
    return new Response(file.body, { headers: { "Content-Type": file.httpMetadata?.contentType || "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (match[2] === "metrics") {
    // Measures of an existing copy, made by the browser from that copy: free, any state, the copy must still be the same.
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
    const data = await body(request, 2000), metrics = validMetrics(data.metrics);
    if (Object.keys(data).some(key => key !== "metrics" && key !== "sha256") || !metrics || typeof data.sha256 !== "string") throw new HttpError(400, "Invalid measurements");
    const result = await env.DB.prepare("UPDATE images SET copy_metrics=? WHERE id=? AND copy_sha256=?").bind(JSON.stringify(metrics), row.id, data.sha256).run();
    if (!result.meta.changes) throw new HttpError(409, "Copy changed: measurements not saved");
    return json({ id: row.id, metrics });
  }
  if (match[2] === "ideas") {
    // Proposals of the SLOP wizard: written by the owner (free) or asked to the model, one confirmed paid call (specification
    // `generazione-slop`, section 2).
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
    const data = await body(request, 4000);
    if ("idea" in data) await ownIdea(env, row, data); else await proposeIdeas(env, row, data);
    return json(await viewOf(env, row.id), 201);
  }
  if (match[2] === "description") {
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
    await describeReal(env, row, await body(request, 1000));
    return json(await viewOf(env, row.id));
  }
  if (match[2] === "regenerate") {
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
    return json(await regenerate(env, row, await body(request, 20_000)));
  }
  if (match[2] === "copy") {
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
    return storeCopy(request, env, row);
  }
  if (match[2]) {
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
    await transition(env, row, match[2], await body(request, 1000));
    return json(await viewOf(env, row.id));
  }
  if (request.method === "GET") return json(await viewOf(env, row.id));
  if (request.method === "PATCH") return json(await edit(env, row, await body(request, 20_000)));
  if (request.method === "DELETE") {
    if (row.status !== "trash") throw new HttpError(409, "Permanent deletion is only available from Trash");
    const result = await destroy(env, [row.id]);
    if (result.postponed) throw new HttpError(409, "Image is in active games or generations: delete it when they finish");
    return json(result);
  }
  throw new HttpError(405, "Method not allowed");
}
