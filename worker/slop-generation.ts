/** Bounded full-image generation and evaluation with private attempts.
 * All paid steps are claimed before sending. Interrupted/uncertain steps are never automatically repeated. */
import { HttpError, id, type Env } from "./core";
import { create, viewOf } from "./library";
import { chosenModel, chosenQuality } from "./models";
import { currentContext } from "./model-context";
import type { Metrics } from "../shared/copy-treatment";
import { numberSettings } from "./app-settings";
import { generationSize, nearestFormat } from "../shared/game-copy";
import type { InspirationItem } from "../shared/slop-proposals";
import { validBrief, validEvaluation, DECISIONS, type Brief, type Evaluation, type OwnerAcceptance } from "../shared/editorial";
import { paid, PaidError, responseJson } from "./paid";
import { IMAGE_MARK, jsonWithImage } from "./image-body";
import { imageMime } from "../shared/image-format";
import { imageGeometry } from "../shared/image-geometry";
import { runnerView } from "./slop-runner";
import { GALLERY_PIPELINE, type GalleryBatch, type GallerySnapshot } from "./slop-gallery";

const now = () => new Date().toISOString();
const parse = <T>(s: string | null, fallback: T): T => { try { return s ? JSON.parse(s) as T : fallback; } catch { return fallback; } };
/** `source_tags` and `copy_style` only in processes prepared before the tags were retired (1.50.0). */
interface Snapshot { max_generation_attempts: number; editorial_tolerance: number; text_model: string; image_model: string; quality: string; source_tags?: unknown; width?: number; height?: number; target_metrics?: Metrics | null; copy_style?: {color?: string}; mode?: "manual" | "gallery" }
interface Batch extends GalleryBatch { origin: string; slots: string; prompts_status: string; prompts_error: string; pipeline_version: number; loop_settings: string; created_at: string; updated_at: string; runner: string | null; runner_status: string | null; runner_updated: string | null }
interface Process { id: string; batch_id: string; slot: number; image_id: string | null; state: string; brief: string | null; brief_hash: string | null; premise: string | null; prompt: string; snapshot: string; attempts: number; error: string; updated_at: string }
interface Attempt { id: string; process_id: string; number: number; prompt: string; status: string; candidate_key: string | null; evaluation: string | null }
export const itemsOf = (row: { slots: string }): InspirationItem[] => parse<unknown[]>(row.slots, []).filter((i): i is InspirationItem =>
  !!i && typeof (i as InspirationItem).title === "string");
const confirmOnly = (data: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(data).some(k => !["confirm", ...allowed].includes(k))) throw new HttpError(400, "Unexpected fields");
  if (data.confirm !== true) throw new HttpError(400, "Confirm maximum paid calls");
};
async function load(env: Env, batchId: string) {
  const row = await env.DB.prepare("SELECT * FROM slop_batches WHERE id=?").bind(batchId).first<Batch>();
  if (!row) throw new HttpError(404, "Batch not found");
  return row;
}
function compatible(row: Batch) {
  if (row.pipeline_version !== GALLERY_PIPELINE) throw new HttpError(409, "Incompatible batch");
}
export async function loopSnapshot(env: Env): Promise<Snapshot> {
  const settings = await numberSettings(env), image_model = await chosenModel(env, "image_model");
  return { max_generation_attempts: settings.max_generation_attempts, editorial_tolerance: settings.editorial_tolerance,
    text_model: await chosenModel(env, "text_model"), image_model, quality: await chosenQuality(env) };
}
export async function processViews(env: Env, batchId: string) {
  // The request may have outlived its browser. A stale claim is uncertain, never permission to resend it.
  const stale = new Date(Date.now()-10*60_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE slop_processes SET state='uncertain',error='Operation interrupted: no calls repeated' WHERE batch_id=? AND state IN ('running','prompting') AND updated_at<?").bind(batchId,stale),
    env.DB.prepare("UPDATE paid_calls SET status='uncertain' WHERE status='pending' AND updated_at<? AND process_id IN (SELECT id FROM slop_processes WHERE batch_id=? AND state='uncertain')").bind(stale,batchId),
    env.DB.prepare("UPDATE slop_attempts SET status='uncertain' WHERE status IN ('pending','generated') AND updated_at<? AND process_id IN (SELECT id FROM slop_processes WHERE batch_id=? AND state='uncertain')").bind(stale,batchId),
  ]);
  const rows = (await env.DB.prepare("SELECT * FROM slop_processes WHERE batch_id=? ORDER BY slot").bind(batchId).all<Process>()).results;
  return Promise.all(rows.map(async p => {
    const attempts = (await env.DB.prepare("SELECT * FROM slop_attempts WHERE process_id=? ORDER BY number").bind(p.id).all<Attempt>()).results;
    const calls = await env.DB.prepare("SELECT count(*) AS n,coalesce(sum(kind='prompts'),0) AS prompts FROM paid_calls WHERE process_id=?").bind(p.id).first<{n: number; prompts: number}>();
    const {brief, brief_hash, ...row} = p;
    const snapshot = parse<Snapshot | null>(p.snapshot, null);
    return {...row, ...(snapshot?.mode === "gallery" ? {} : {brief: parse<Brief | null>(brief, null), brief_hash}),
      snapshot, calls: calls?.n || 0, prompt_calls: calls?.prompts || 0,
      attempts: attempts.map(a => ({ id: a.id, number: a.number, prompt: a.prompt, status: a.status,
        evaluation: parse<Evaluation | null>(a.evaluation, null), file: a.candidate_key ? `/api/admin/library/slop/batches/${batchId}/candidate/${a.id}` : null })) };
  }));
}
async function show(env: Env, batchId: string) {
  const processes = await processViews(env, batchId), row = await load(env, batchId);
  const ids = (await env.DB.prepare("SELECT id FROM images WHERE generation_batch=? AND gallery_id=? ORDER BY created_at,rowid")
    .bind(batchId, row.gallery_id).all<{id: string}>()).results;
  const config = parse<Snapshot | null>(row.loop_settings, null);
  const maxCalls = config && processes.reduce((total, p) => {
    const rendering = row.origin === "auto" && !p.premise ? 0 : 2 * config.max_generation_attempts;
    return total + p.prompt_calls + rendering;
  }, 0);
  return { origin: row.origin, id: row.id, items: itemsOf(row), gallery_id: row.gallery_id, processes, config,
    max_calls: maxCalls,
    prompts_status: row.prompts_status, prompts_error: row.prompts_error, created_at: row.created_at, updated_at: row.updated_at, runner: runnerView(row),
    images: await Promise.all(ids.map(i => viewOf(env, i.id))) };
}
const strings = {type: "array", maxItems: 30, items: {type: "string", maxLength: 3000}};
const evaluationSchema = { type: "object", additionalProperties: false,
  required: ["attempt_id", "decision", "critical_findings", "minor_findings", "editorial_constraints_met", "uncertainty_notes", "action_reason", "revised_prompt", "preserved_required", "preserved_exclusions"],
  properties: {attempt_id: {type: "string"}, decision: {type: "string", enum: [...DECISIONS]}, critical_findings: strings, minor_findings: strings,
    editorial_constraints_met: {type: "boolean"}, uncertainty_notes: strings, action_reason: {type: "string"}, revised_prompt: {type: "string"}, preserved_required: strings, preserved_exclusions: strings} };
/** The part of the evaluator's instructions that the code enforces, after the editable context «slop_evaluation». */
const EVALUATE_RULE = `Evaluate the ENTIRE unprocessed generated photograph. Choose accept, retry_same_prompt, revise_prompt, replan_scene or review_needed; choose review_needed only for a concrete doubt about something visible in the image that you cannot settle (for example a landmark or a sign that may contradict the place); facts that pixels alone can never verify (exact place, date, identity, whether the people are invented) are not a reason for review_needed: write them in uncertainty_notes and decide on the visible evidence. Never judge, and never ask in a revised prompt for, fidelity to the real appearance of a named building or place: a plausible building of that kind, style, period and region meets the anchor; a difference from the real one is neither a defect nor a reason for review_needed, nor makes editorial_constraints_met false. Critical defects are never accepted at any tolerance. Tolerance 0 accepts no minor defects: with only minor defects choose retry_same_prompt or revise_prompt, never review_needed; 1 accepts subtle photographically plausible imperfections; 2 tolerates minor defects only while credibility holds. If revising or replanning, give the revised prompt in this same response and copy every required anchor and exclusion of the brief verbatim into preserved_required and preserved_exclusions. Composition preferences are optional: never reject or request another attempt solely for placement or gaze; when revising retain the preference only if natural. Never compose for a later crop.`;
const GALLERY_EVALUATE_RULE = `Evaluate the ENTIRE unprocessed generated photograph. Use the approved premise, the idea it develops and the approved prompt as editorial constraints. Ignore references to a legacy brief in the general instructions. Judge photographic credibility first. Critical defects or missing required editorial constraints prevent acceptance. Assess visible evidence: whether landmarks, geography and event cues are recognizable when the instructions require them and whether the invented fact, when the premise states one, is clearly visible; for objects the photograph itself may be the fake. Annotate uncertainty about exact date, identity or historicity without treating facts unprovable from pixels as defects. Respect the content rules. No later crop. Do not replan the scene or change the invented fact or the real anchors. If a correction is appropriate, choose revise_prompt and return a short English photographic correction to append to the approved prompt verbatim. In preserved_required repeat the entire approved premise verbatim; return preserved_exclusions as an empty array. Choose review_needed when visual evidence cannot settle a concrete doubt. Tolerance 0 accepts no minor defects; at 1 accept only subtle photographic imperfections; at 2 accept minor defects only where credibility holds.`;
const constraintsOf = (p: Process) => p.premise ? {required: [p.premise], exclusions: []} : validBrief(parse(p.brief, null));
async function hash(editorial: unknown) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(editorial))))].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function materialize(env: Env, p: Process, batch: Batch, bytes: Uint8Array, evaluation: Evaluation, acceptance?: OwnerAcceptance) {
  // Reuse a saved accepted result if the Worker was interrupted after inserting the library row.
  const existing = await env.DB.prepare("SELECT id FROM images WHERE generation_batch=? AND json_extract(generation_slot,'$.process')=?").bind(batch.id, p.id).first<{id: string}>();
  const config = parse<Snapshot>(p.snapshot, {} as Snapshot);
  const image = existing ? await viewOf(env, existing.id) : await create(env, { origin: "SLOP",
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, prompt: p.prompt, model: config.image_model,
    gallery_id: batch.gallery_id,
    generation: {batch: batch.id, quality: config.quality,
      slot: {index: p.slot, target_metrics: config.target_metrics || null, process: p.id, ...(p.premise ? {} : {brief: parse(p.brief, null), brief_hash: p.brief_hash}), evaluation, ...(acceptance ? {acceptance} : {}), attempts: p.attempts}} });
  await env.DB.prepare(`UPDATE images SET slop_source_id=(SELECT s.source_id FROM slop_gallery_sources s
    JOIN images r ON r.id=s.source_id AND r.origin='REAL' WHERE s.process_id=?) WHERE id=? AND slop_source_id IS NULL`)
    .bind(p.id, image.id).run();
  await env.DB.prepare("UPDATE slop_processes SET image_id=?,state='accepted',updated_at=? WHERE id=?").bind(image.id, now(), p.id).run();
  return {...image, process: {id: p.id, state: "accepted", attempts: p.attempts}};
}
/** One attempt of a REAL. The game copy of an accepted SLOP is made later in the owner's browser (spec `copie-di-gioco`). */
export async function generateImage(env: Env, batchId: string, data: Record<string, unknown>, runner?: string) {
  confirmOnly(data, ["index", "quality"]);
  if (!env.OPENAI_API_KEY || !env.QUARANTINE) throw new HttpError(503, "Missing OpenAI key or quarantine");
  const batch = await load(env, batchId); compatible(batch);
  const gallery = batch.origin === "auto" ? JSON.parse(batch.auto_snapshot) as GallerySnapshot : null;
  if (gallery && (batch.gallery_review !== "confirmed" || !runner || batch.runner !== runner)) throw new HttpError(409, "Confirm gallery proposals first");
  if (batch.prompts_status !== "done") throw new HttpError(409, "Complete batch preparation first");
  const p = await env.DB.prepare("SELECT * FROM slop_processes WHERE batch_id=? AND slot=?").bind(batchId, typeof data.index === "number" ? data.index : -1).first<Process>();
  if (!p) throw new HttpError(400, "Image not found");
  const config = parse<Snapshot>(p.snapshot, {} as Snapshot), constraints = constraintsOf(p);
  if (data.quality !== config.quality) throw new HttpError(400, "Quality is frozen in the job snapshot");
  if (p.image_id) return {...await viewOf(env, p.image_id), process: {id: p.id, state: p.state, attempts: p.attempts}};
  if (!["ready", "retry"].includes(p.state) || !constraints) throw new HttpError(409, `Processo ${p.state}: no calls repeated; review or start a new process`);
  if (p.attempts >= config.max_generation_attempts) throw new HttpError(409, "Attempts exhausted");
  const approvedPrompt = gallery && p.attempts
    ? (await env.DB.prepare("SELECT prompt FROM slop_attempts WHERE process_id=? AND number=1").bind(p.id).first<{prompt: string}>())?.prompt
    : p.prompt;
  if (!approvedPrompt) throw new HttpError(409, "Approved prompt unavailable");
  const briefHash = await hash(gallery ? {premise: p.premise, gallery: gallery.gallery, prompt: approvedPrompt} : constraints);
  if (p.brief_hash && p.brief_hash !== briefHash) throw new HttpError(409, "Brief changed after starting");
  // Read before the attempt is claimed: a failure here costs nothing.
  const [base, context] = gallery ? [gallery.base, gallery.evaluation] : await Promise.all([currentContext(env, "base"), currentContext(env, "slop_evaluation")]);
  let marked;
  try { marked = await env.DB.prepare(`UPDATE slop_processes SET state='running',brief_hash=?,attempts=attempts+1,updated_at=?
    WHERE id=? AND state=? AND attempts=? AND prompt=? AND brief IS ? AND EXISTS(SELECT 1 FROM slop_batches WHERE id=? AND prompts_status='done'
      AND (gallery_review IS NULL OR (gallery_review='confirmed' AND auto_status='running' AND runner=? AND runner_status='running')))`)
    .bind(briefHash, now(), p.id, p.state, p.attempts, p.prompt, p.brief, batchId, runner ?? null).run(); }
  catch { throw new HttpError(409, "Cannot claim process"); }
  if (!marked.meta.changes) throw new HttpError(409, "Attempt already sent: no calls repeated");
  p.attempts++; p.brief_hash = briefHash;
  const attemptId = id(), key = `slop-temporary/${p.id}/${attemptId}`, stamp = now();
  await env.DB.prepare("INSERT INTO slop_attempts(id,process_id,number,prompt,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind(attemptId, p.id, p.attempts, p.prompt, stamp, stamp).run();
  try {
    const size = generationSize(config.image_model, nearestFormat(config.width || 1024, config.height || 1024));
    const sentPrompt = config.mode === "manual" ? p.prompt + "\n\nEditorial context (do not render labels): " +
      JSON.stringify({brief: constraints}) : p.prompt;
    const payload = await paid(env, "images", config.image_model, {model: config.image_model, prompt: sentPrompt, n: 1, size, quality: config.quality}, {process: p.id, attempt: attemptId});
    const encoded = (payload.data as {b64_json?: string}[] | undefined)?.[0]?.b64_json;
    if (!encoded) throw new HttpError(502, "Unreadable generator response");
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)), mime = imageMime(bytes);
    if (!mime || bytes.length > 12_000_000) throw new HttpError(502, "Invalid generated image");
    const geometry = imageGeometry(bytes);
    if ((geometry.width ?? geometry.encoded_width) * (geometry.height ?? geometry.encoded_height) > 32_000_000) throw new HttpError(502, "Image exceeds 32 megapixels");
    await env.QUARANTINE.put(key, bytes, {httpMetadata: {contentType: mime}});
    await env.DB.prepare("UPDATE slop_attempts SET candidate_key=?,status='generated',updated_at=? WHERE id=?").bind(key, now(), attemptId).run();
    const liveBatch = await env.DB.prepare("SELECT origin,auto_status FROM slop_batches WHERE id=?").bind(batchId).first<{origin:string;auto_status:string}>();
    if (liveBatch?.origin === "auto" && liveBatch.auto_status !== "running") {
      await env.DB.prepare("UPDATE slop_processes SET state='review_needed',error='Stopped before evaluation',updated_at=? WHERE id=?").bind(now(),p.id).run();
      return {process:{id:p.id,state:"review_needed",attempts:p.attempts}};
    }
    const inputs = gallery ? {attempt_id: attemptId, premise: p.premise, approved_prompt: approvedPrompt, prompt: p.prompt,
      gallery: {title: gallery.gallery.title, description: gallery.gallery.description},
      // The idea the SLOP develops, while its process is open (specification `generazione-slop`, section 2).
      idea: (await env.DB.prepare("SELECT i.idea,i.genre,i.changes FROM slop_gallery_sources s JOIN real_ideas i ON i.id=s.idea_id WHERE s.process_id=?")
        .bind(p.id).first<{idea: string; genre: string; changes: string}>()) ?? null,
      tolerance: config.editorial_tolerance}
      : {attempt_id: attemptId, brief: constraints, prompt: p.prompt, composition_preference: null, tolerance: config.editorial_tolerance};
    const revisedPrompt = (correction: string) => gallery ? approvedPrompt + "\n\n" + correction : correction;
    const evaluationPayload = await paid(env, "evaluation", config.text_model, jsonWithImage({model: config.text_model,
      instructions: base.body + "\n\n" + context.body + "\n\n" + (gallery ? GALLERY_EVALUATE_RULE : EVALUATE_RULE) + " Write all generated reasoning, findings and uncertainty notes in English, overriding conflicting saved context. Keep required source quotes verbatim.", max_output_tokens: 8000,
      text: {format: {type: "json_schema", name: "slop_evaluation", strict: true, schema: evaluationSchema}},
      input: [{role: "user", content: [{type: "input_text", text: JSON.stringify(inputs)},
        {type: "input_image", image_url: IMAGE_MARK}]}]}, bytes, mime), {process: p.id, attempt: attemptId});
    let evaluation = validEvaluation(responseJson(evaluationPayload), attemptId, constraints);
    if (!evaluation) throw new HttpError(502, "Invalid evaluation: process paused");
    if (gallery && (evaluation.decision === "replan_scene" ||
        (evaluation.decision === "revise_prompt" && revisedPrompt(evaluation.revised_prompt.trim()).length > 4000)))
      evaluation = {...evaluation, decision: "review_needed"};
    // Tolerance 0 asks for fewer defects, so a candidate with minor ones consumes another attempt instead of stopping the loop;
    // when the attempts run out the process is exhausted and waits for the owner with every attempt.
    if (config.editorial_tolerance === 0 && evaluation.decision === "accept" && evaluation.minor_findings.length)
      evaluation = {...evaluation, decision: "retry_same_prompt", action_reason: (evaluation.action_reason + " Tolerance 0: minor defects, new attempt.").slice(0, 3000)};
    // The stored evaluation records the context versions it was made with.
    await env.DB.prepare("UPDATE slop_attempts SET status='completed',evaluation=?,updated_at=? WHERE id=?")
      .bind(JSON.stringify({...evaluation, contexts: {base: base.id, evaluation: context.id}}), now(), attemptId).run();
    if (evaluation.decision === "accept") return await materialize(env, p, batch, bytes, evaluation);
    const state = evaluation.decision === "review_needed" ? "review_needed" : p.attempts >= config.max_generation_attempts ? "exhausted" : "retry";
    const prompt = ["revise_prompt", "replan_scene"].includes(evaluation.decision) ? revisedPrompt(evaluation.revised_prompt.trim()) : p.prompt;
    await env.DB.prepare("UPDATE slop_processes SET state=?,prompt=?,updated_at=? WHERE id=?").bind(state, prompt, now(), p.id).run();
    return {process: {id: p.id, state, attempts: p.attempts, evaluation}};
  } catch (e) {
    const state = e instanceof PaidError && e.outcome === "uncertain" ? "uncertain" : "failed";
    await env.DB.batch([env.DB.prepare("UPDATE slop_processes SET state=?,error=?,updated_at=? WHERE id=?").bind(state, String(e).slice(0, 500), now(), p.id),
      env.DB.prepare("UPDATE slop_attempts SET status=?,updated_at=? WHERE id=? AND status<>'completed'").bind(state, now(), attemptId)]);
    throw e;
  }
}
/** Processes that ended without a SLOP: exhausted attempts, a review requested by the evaluator, a failure or an uncertain outcome.
 * They are exceptional and wait for the owner, with every attempt (whole candidate, prompt, evaluation), until closed. */
export const ATTENTION = ["exhausted", "review_needed", "failed", "uncertain"] as const;
export async function attention(env: Env, gallery = "") {
  const batches = (await env.DB.prepare(`SELECT DISTINCT p.batch_id,b.slots FROM slop_processes p JOIN slop_batches b ON b.id=p.batch_id
    WHERE p.state IN ('exhausted','review_needed','failed','uncertain') AND (b.gallery_review IS NULL OR b.gallery_review='confirmed')
    AND (?1='' OR b.gallery_id=?1) ORDER BY p.batch_id`).bind(gallery).all<{batch_id: string; slots: string}>()).results;
  const out = [];
  for (const b of batches) {
    const items = itemsOf(b);
    for (const p of await processViews(env, b.batch_id))
      if ((ATTENTION as readonly string[]).includes(p.state)) out.push({...p, title: items[p.slot]?.title || ""});
  }
  return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
/** POST processes/:id/close {}: the owner has seen a process without a SLOP. Its candidates follow the usual seven days. */
export async function closeProcess(env: Env, processId: string, data: Record<string, unknown>) {
  if (Object.keys(data).length) throw new HttpError(400, "Unexpected fields");
  const closed = await env.DB.prepare("UPDATE slop_processes SET state='closed',updated_at=? WHERE id=? AND state IN ('exhausted','review_needed','failed','uncertain') AND EXISTS(SELECT 1 FROM slop_batches b WHERE b.id=slop_processes.batch_id AND (b.gallery_review IS NULL OR b.gallery_review='confirmed'))")
    .bind(now(), processId).run();
  if (!closed.meta.changes) throw new HttpError(409, "Process not found or not awaiting review");
  return {attention: await attention(env)};
}
/** The owner may accept a completed, evaluated candidate of a stopped process despite any findings.
 * Original evaluation and owner acceptance stay separate; accepting is free (no tag analysis since 1.50.0). */
export async function acceptProcess(env: Env, processId: string, data: Record<string, unknown>) {
  confirmOnly(data, ["attempt"]);
  if (!env.QUARANTINE) throw new HttpError(503, "Missing quarantine");
  const p = await env.DB.prepare("SELECT * FROM slop_processes WHERE id=?").bind(processId).first<Process>();
  if (!p || !(ATTENTION as readonly string[]).includes(p.state) || p.image_id) throw new HttpError(409, "Process not found, already decided or still in progress");
  const a = await env.DB.prepare("SELECT * FROM slop_attempts WHERE id=? AND process_id=?").bind(typeof data.attempt === "string" ? data.attempt : "", p.id).first<Attempt>();
  const constraints = constraintsOf(p);
  const evaluation = parse<Evaluation | null>(a?.evaluation ?? null, null);
  if (!a || a.status !== "completed" || !a.candidate_key || !constraints || !evaluation || !validEvaluation(evaluation, a.id, constraints)) throw new HttpError(409, "Attempt has no evaluated candidate");
  const batch = await load(env, p.batch_id);
  if (batch.origin === "auto" && batch.gallery_review !== "confirmed") throw new HttpError(409, "Unconfirmed proposals");
  const claimed = await env.DB.prepare("UPDATE slop_processes SET state='running',updated_at=? WHERE id=? AND state=? AND image_id IS NULL")
    .bind(now(), p.id, p.state).run().catch(() => ({meta: {changes: 0}}));
  if (!claimed.meta.changes) throw new HttpError(409, "Process already decided");
  let image;
  try {
    const file = await env.QUARANTINE.get(a.candidate_key);
    if (!file) throw new HttpError(404, "Candidate no longer available");
    const bytes = new Uint8Array(await file.arrayBuffer());
    image = await materialize(env, {...p, prompt: a.prompt}, batch, bytes, evaluation, {by: "owner", attempt: a.id, at: now()});
  } catch (e) {
    await env.DB.prepare("UPDATE slop_processes SET state=?,updated_at=? WHERE id=? AND state='running' AND image_id IS NULL").bind(p.state, now(), p.id).run();
    throw e;
  }
  return {image: {id: image.id}, attention: await attention(env)};
}
/** Authenticated private temporary preview. The main router handles this before JSON serialization. */
export async function candidateFile(env: Env, batchId: string, attemptId: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT a.candidate_key FROM slop_attempts a JOIN slop_processes p ON p.id=a.process_id WHERE p.batch_id=? AND a.id=?").bind(batchId, attemptId).first<{candidate_key: string | null}>();
  const file = row?.candidate_key ? await env.QUARANTINE?.get(row.candidate_key) : null;
  if (!file) throw new HttpError(404, "Candidate unavailable");
  return new Response(file.body, {headers: {"Content-Type": file.httpMetadata?.contentType || "image/png", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
}
/** GET batches/:id: a batch with its processes, attempts and images, for the review in the SLOP wizard. The manual generation was
 * retired on 2026-11-22 (owner decision): batches are created and driven only by the wizard (auto/...). */
export async function batchRoute(env: Env, method: string, rest: string) {
  if (method !== "GET" || !/^[\w-]{1,64}$/.test(rest)) throw new HttpError(404, "Batch not found");
  return show(env, rest);
}

