/** Automatic generation with separate proposal and image confirmations. */
import { HttpError, type Env } from "./core";
import { MAX_BATCH } from "../shared/slop-proposals";
import { loopSnapshot, processViews } from "./slop-generation";
import { catalogCounts } from "./slop-references";
import { galleries } from "./galleries";
import { previewGallery, prepareGallery, galleryReview, confirmGallery, cancelGallery, expireGalleryBatches, type GalleryBatch } from "./slop-gallery";
import { runnerView, startRun } from "./slop-runner";

interface AutoRow extends GalleryBatch {
  prompts_status: string; prompts_error: string; auto_status: string;
  auto_size: number; created_at: string; updated_at: string;
}
const parse = <T>(value: string | null, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const now = () => new Date().toISOString();

/** The open automatic batch, after closing it if it is in review and every image has been decided. */
async function openBatch(env: Env): Promise<AutoRow | null> {
  await expireGalleryBatches(env);
  const row = await env.DB.prepare("SELECT * FROM slop_batches WHERE origin='auto' AND auto_status IN ('running','review') LIMIT 1").first<AutoRow>();
  if (!row || row.auto_status !== "review") return row;
  const pending = await env.DB.prepare("SELECT count(*) AS n FROM images WHERE generation_batch=? AND status='new'").bind(row.id).first<{ n: number }>();
  const unresolved = await env.DB.prepare("SELECT count(*) AS n FROM slop_processes WHERE batch_id=? AND state IN ('review_needed','uncertain','failed','exhausted','running','prompting','retry','ready','draft')").bind(row.id).first<{n:number}>();
  if (pending?.n || unresolved?.n) return row;
  await env.DB.prepare("UPDATE slop_batches SET auto_status='closed',updated_at=? WHERE id=? AND auto_status='review'").bind(now(), row.id).run();
  return null;
}

async function batchView(env: Env, row: AutoRow) {
  const images = (await env.DB.prepare(`SELECT id,status,generation_slot,copy_key,analysis_status FROM images WHERE generation_batch=?
    ORDER BY created_at,rowid`).bind(row.id).all<{ id: string; status: string; generation_slot: string | null; copy_key: string | null; analysis_status: string }>()).results;
  const processes = await processViews(env, row.id);
  return { id: row.id, gallery_id: row.gallery_id, size: row.auto_size, status: row.auto_status, prompts_status: row.prompts_status,
    prompts_error: row.prompts_error, slots: row.auto_size, attempted: processes.filter(p => p.attempts.length).map(p => p.slot),
    config: parse(row.loop_settings, null), processes,
    gallery_review: row.gallery_review,
    proposal_review: row.gallery_review === "pending" ? await galleryReview(env, row) : null,
    created_at: row.created_at, updated_at: row.updated_at, runner: runnerView(row),
    images: images.map(i => ({ id: i.id, status: i.status, index: parse<{ index?: number }>(i.generation_slot, {}).index ?? null,
      copy: !!i.copy_key, analysis: i.analysis_status })),
    undecided: images.filter(i => i.status === "new").length };
}

export async function autoState(env: Env) {
  const expired = await expireGalleryBatches(env);
  const [open, counts, list] = await Promise.all([openBatch(env), catalogCounts(env), galleries(env)]);
  return { max_batch: MAX_BATCH, galleries: list, paid_calls: !!env.OPENAI_API_KEY, expired: !!expired,
    balance: {real: counts.real, slop: counts.slop, pending: counts.pending, missing: Math.max(0, counts.real - counts.slop - counts.pending)},
    config: await loopSnapshot(env), batch: open ? await batchView(env, open) : null };
}

/** POST auto/resume {confirm}: a batch whose runner died (or that ran in the browser before 1.31.0), or one in review that still has
 * REAL to generate (a run that ended early), goes on from where it stopped, within the maximum confirmed at its start; claimed or
 * uncertain steps are never resent. */
async function resume(env: Env, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => key !== "confirm" && key !== "batch") || data.confirm !== true) throw new HttpError(400, "Conferma la ripresa del batch");
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  const row = await openBatch(env);
  if (!row || (data.batch !== undefined && data.batch !== row.id)) throw new HttpError(409, "Nessun batch automatico da riprendere");
  await processViews(env, row.id);  // settles claims left by a dead request first
  const preparing = row.gallery_review === "pending";
  if (preparing && (await galleryReview(env, row)).invalid) throw new HttpError(409, "Galleria o REAL modificate: annulla ed estrai di nuovo");
  const states = preparing ? "'draft'" : "'ready','retry'";
  const left = await env.DB.prepare(`SELECT count(*) AS n FROM slop_processes WHERE batch_id=? AND state IN (${states})`).bind(row.id).first<{ n: number }>();
  if (!left?.n) throw new HttpError(409, "Nessuna SLOP da generare in questo batch");
  await env.DB.prepare("UPDATE slop_batches SET auto_status='running',updated_at=? WHERE id=? AND auto_status IN ('running','review')").bind(now(), row.id).run();
  await startRun(env, row.id, preparing ? "proposals" : "images");
  return autoState(env);
}

/** Stop (owner) or finish (every image sent): no more calls; the images wait for the owner's decisions. */
async function settle(env: Env, batch: unknown) {
  if (batch !== undefined && typeof batch !== "string") throw new HttpError(400, "Batch non valido");
  const result = await env.DB.prepare("UPDATE slop_batches SET auto_status='review',updated_at=? WHERE origin='auto' AND auto_status='running' AND gallery_review IS NOT 'pending' AND (?2 IS NULL OR id=?2)").bind(now(), batch ?? null).run();
  if (!result.meta.changes) throw new HttpError(409, "Nessun batch automatico in generazione");
  return autoState(env);
}

export async function autoRoute(env: Env, method: string, rest: string, data: Record<string, unknown>) {
  if (rest === "" && method === "GET") return autoState(env);
  if (method !== "POST") throw new HttpError(405, "Metodo non consentito");
  if (rest === "preview" || rest === "prepare") {
    if (await openBatch(env)) throw new HttpError(409, "C’è già un batch automatico aperto");
    if (rest === "preview") return previewGallery(env, data);
    const batchId = await prepareGallery(env, data);
    await startRun(env, batchId, "proposals");
    return autoState(env);
  }
  if (rest === "start" || rest === "cancel") {
    const batch = await openBatch(env);
    if (!batch || data.batch !== batch.id || batch.gallery_review !== "pending") throw new HttpError(409, "Proposte già decise o scadute");
    if (rest === "cancel") {
      if (Object.keys(data).some(key => key !== "batch")) throw new HttpError(400, "Campi non previsti");
      await cancelGallery(env, batch.id);
    } else {
      await confirmGallery(env, batch, data);
      await startRun(env, batch.id, "images");
    }
    return autoState(env);
  }
  if (rest === "resume") return resume(env, data);
  if (rest === "close") {
    if (Object.keys(data).some(key => key !== "batch")) throw new HttpError(400, "Campi non previsti");
    const row = await openBatch(env);
    if (!row || row.auto_status !== "review" || (data.batch !== undefined && data.batch !== row.id)) throw new HttpError(409, "Prima interrompi o termina la generazione");
    if (runnerView(row)?.alive) throw new HttpError(409, "Attendi la fine del passo in corso sul server");
    const pending = await env.DB.prepare("SELECT count(*) AS n FROM images WHERE generation_batch=? AND status='new'").bind(row.id).first<{n:number}>();
    if (pending?.n) throw new HttpError(409, "Decidi prima le immagini nuove del batch");
    await env.DB.prepare("UPDATE slop_processes SET state='closed',updated_at=? WHERE batch_id=? AND image_id IS NULL AND state IN ('draft','ready','retry')").bind(now(), row.id).run();
    await env.DB.prepare("UPDATE slop_batches SET auto_status='closed',updated_at=? WHERE id=?").bind(now(),row.id).run();
    return autoState(env);
  }
  if (rest === "stop" || rest === "finish") {
    if (Object.keys(data).some(key => key !== "batch")) throw new HttpError(400, "Campi non previsti");
    return settle(env, data.batch);
  }
  throw new HttpError(404, "API dei batch automatici inesistente");
}

/** Ids of the automatic batches, kept out of the studio's list of recent batches. */
export async function autoBatchIds(env: Env): Promise<Set<string>> {
  return new Set((await env.DB.prepare("SELECT id FROM slop_batches WHERE origin='auto'").all<{ id: string }>()).results.map(r => r.id));
}

/** Automatic batches are inspectable from the studio, with their controls in the automatic section. */
export async function guardBatch(env: Env, method: string, rest: string) {
  const [batchId] = rest.split("/");
  if (method === "GET" || !batchId || !/^[\w-]{1,64}$/.test(batchId)) return;
  const row = await env.DB.prepare("SELECT origin FROM slop_batches WHERE id=?").bind(batchId).first<{origin: string}>();
  if (row?.origin === "auto") throw new HttpError(409, "Il batch si gestisce dalla modalità automatica");
}
