/** Editorial SLOP pipeline: one textual brief per REAL, bounded full-image evaluation loop, private attempts.
 * All paid steps are claimed before sending. Interrupted/uncertain steps are never automatically repeated. */
import { HttpError, id, type Env } from "./core";
import { create, viewOf, find, tagRowsOf } from "./library";
import { chosenModel, chosenQuality } from "./models";
import { currentContext, PIPELINE } from "./model-context";
import { numberSettings } from "./app-settings";
import { generationSize, nearestFormat, type Format } from "../shared/game-copy";
import { MAX_BATCH, type TwinItem } from "../shared/twins";
import { briefSchema, realDescription, validBrief, validEvaluation, DECISIONS, type Brief, type Evaluation } from "../shared/editorial";
import { byCategory, twinItems } from "./twins";
import { paid, PaidError, responseJson } from "./paid";
import { IMAGE_MARK, jsonWithImage } from "./image-body";
import { imageMime } from "../shared/image-format";
import { imageGeometry } from "../shared/image-geometry";

const now = () => new Date().toISOString();
const parse = <T>(s: string | null, fallback: T): T => { try { return s ? JSON.parse(s) as T : fallback; } catch { return fallback; } };
interface Snapshot { max_generation_attempts: number; editorial_tolerance: number; text_model: string; image_model: string; quality: string }
interface Batch { id: string; slots: string; prompts: string; prompts_status: string; prompts_error: string; pipeline_version: number; loop_settings: string; created_at: string; updated_at: string }
interface Process { id: string; batch_id: string; slot: number; source_id: string; image_id: string | null; state: string; brief: string | null; brief_hash: string | null; prompt: string; snapshot: string; attempts: number; error: string; updated_at: string }
interface Attempt { id: string; process_id: string; number: number; prompt: string; status: string; candidate_key: string | null; evaluation: string | null }
export interface PromptEntry { prompt: string; used: string[]; brief?: Brief; format?: Format }
export const itemsOf = (row: { slots: string }): TwinItem[] => parse<unknown[]>(row.slots, []).filter((i): i is TwinItem =>
  !!i && typeof (i as TwinItem).source === "string" && Array.isArray((i as TwinItem).tags));
const confirmOnly = (data: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(data).some(k => !["confirm", ...allowed].includes(k))) throw new HttpError(400, "Campi non previsti");
  if (data.confirm !== true) throw new HttpError(400, "Conferma il massimo delle chiamate a pagamento");
};
async function load(env: Env, batchId: string) {
  const row = await env.DB.prepare("SELECT * FROM slop_batches WHERE id=?").bind(batchId).first<Batch>();
  if (!row) throw new HttpError(404, "Batch inesistente");
  return row;
}
function compatible(row: Batch) {
  if (row.pipeline_version !== 2) throw new HttpError(409, "Batch precedente: sola revisione. Per generare avvia un nuovo processo e conferma le chiamate");
}
export async function loopSnapshot(env: Env): Promise<Snapshot> {
  const settings = await numberSettings(env), image_model = await chosenModel(env, "image_model");
  return { max_generation_attempts: settings.max_generation_attempts, editorial_tolerance: settings.editorial_tolerance,
    text_model: await chosenModel(env, "text_model"), image_model, quality: await chosenQuality(env) };
}
/** The brief status of a batch follows its processes: some still to write → none; at least one usable → done; else failed.
 * A brief that ended uncertain or failed never blocks the others (each REAL is written by its own request). */
const settleBatch = (env: Env, batchId: string, error: string) => env.DB.prepare(`UPDATE slop_batches SET prompts_status=CASE
    WHEN EXISTS(SELECT 1 FROM slop_processes WHERE batch_id=?1 AND state IN ('draft','prompting')) THEN 'none'
    WHEN EXISTS(SELECT 1 FROM slop_processes WHERE batch_id=?1 AND state NOT IN ('failed','uncertain','closed')) THEN 'done'
    ELSE 'failed' END, prompts_error=?2, updated_at=?3 WHERE id=?1`).bind(batchId, error.slice(0, 500), now());
export async function processViews(env: Env, batchId: string) {
  // The request may have outlived its browser. A stale claim is uncertain, never permission to resend it.
  const stale = new Date(Date.now()-10*60_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE slop_processes SET state='uncertain',error='Operazione interrotta: nessuna chiamata ripetuta' WHERE batch_id=? AND state IN ('running','prompting') AND updated_at<?").bind(batchId,stale),
    env.DB.prepare("UPDATE paid_calls SET status='uncertain' WHERE status='pending' AND updated_at<? AND process_id IN (SELECT id FROM slop_processes WHERE batch_id=? AND state='uncertain')").bind(stale,batchId),
    env.DB.prepare("UPDATE slop_attempts SET status='uncertain' WHERE status IN ('pending','generated') AND updated_at<? AND process_id IN (SELECT id FROM slop_processes WHERE batch_id=? AND state='uncertain')").bind(stale,batchId),
  ]);
  // A brief request that died (the browser closed the connection, 2026-11-15) left the batch «running»: after ten minutes the
  // batch follows its processes again, and the remaining REAL can be written; the interrupted one stays uncertain.
  const stuck = await env.DB.prepare("SELECT 1 FROM slop_batches WHERE id=? AND prompts_status='running' AND updated_at<?").bind(batchId, stale).first();
  if (stuck) await settleBatch(env, batchId, "Scrittura di brief e prompt interrotta: nessuna chiamata ripetuta").run();
  const rows = (await env.DB.prepare("SELECT * FROM slop_processes WHERE batch_id=? ORDER BY slot").bind(batchId).all<Process>()).results;
  return Promise.all(rows.map(async p => {
    const attempts = (await env.DB.prepare("SELECT * FROM slop_attempts WHERE process_id=? ORDER BY number").bind(p.id).all<Attempt>()).results;
    const calls = await env.DB.prepare("SELECT count(*) AS n,coalesce(sum(kind='prompts'),0) AS prompts FROM paid_calls WHERE process_id=?").bind(p.id).first<{n: number; prompts: number}>();
    return { ...p, brief: parse<Brief | null>(p.brief, null), snapshot: parse<Snapshot | null>(p.snapshot, null), calls: calls?.n || 0, prompt_calls: calls?.prompts || 0,
      attempts: attempts.map(a => ({ id: a.id, number: a.number, prompt: a.prompt, status: a.status,
        evaluation: parse<Evaluation | null>(a.evaluation, null), file: a.candidate_key ? `/api/admin/library/slop/batches/${batchId}/candidate/${a.id}` : null })) };
  }));
}
async function show(env: Env, batchId: string) {
  const row = await load(env, batchId), processes = await processViews(env, batchId);
  const ids = (await env.DB.prepare("SELECT id FROM images WHERE generation_batch=? ORDER BY created_at,rowid").bind(batchId).all<{id: string}>()).results;
  const prompts: PromptEntry[] = row.pipeline_version === 2 ? processes.filter(p => p.prompt && p.brief).map(p => ({prompt: p.prompt, used: [], brief: p.brief!})) : parse(row.prompts, []);
  const config = parse<Snapshot | null>(row.loop_settings, null);
  return { id: row.id, items: itemsOf(row), prompts, processes, config, pipeline_version: row.pipeline_version,
    // Planned: one brief call, N generations, N evaluations and the tags after acceptance per REAL. Every confirmed rewrite of a
    // brief adds its call to the maximum, so the figure shown never falls below what was spent.
    max_calls: config ? processes.reduce((n, p) => n + Math.max(1, p.prompt_calls) + 1 + 2 * config.max_generation_attempts, 0) : null,
    prompts_status: row.prompts_status, prompts_error: row.prompts_error, created_at: row.created_at, updated_at: row.updated_at,
    images: await Promise.all(ids.map(i => viewOf(env, i.id))) };
}
export async function initializeBatch(env: Env, batchId: string, items: TwinItem[], snapshot: Snapshot) {
  const stamp = now();
  await env.DB.batch([env.DB.prepare("UPDATE slop_batches SET pipeline_version=2,loop_settings=? WHERE id=?").bind(JSON.stringify(snapshot), batchId),
    ...items.map((item, slot) => env.DB.prepare(`INSERT INTO slop_processes(id,batch_id,slot,source_id,snapshot,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
      .bind(id(), batchId, slot, item.source, JSON.stringify(snapshot), stamp, stamp))]);
}
async function createBatch(env: Env, data: Record<string, unknown>) {
  if (Object.keys(data).some(k => k !== "sources")) throw new HttpError(400, "Campi non previsti");
  const sources = Array.isArray(data.sources) ? [...new Set(data.sources)] : [];
  if (!sources.length || sources.length > MAX_BATCH || sources.some(s => typeof s !== "string" || !/^[\w-]{1,64}$/.test(s))) throw new HttpError(400, `Scegli da 1 a ${MAX_BATCH} REAL`);
  const items = await twinItems(env, sources as string[]);
  for (const item of items) if (!realDescription(parse((await find(env, item.source)).real_description, null)))
    throw new HttpError(409, `«${item.title}»: aggiungi la descrizione editoriale manualmente o autorizza un'analisi combinata nel Database`);
  const batchId = id(), stamp = now(), snapshot = await loopSnapshot(env);
  await env.DB.prepare("INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES(?,'[]',?,?,?)").bind(batchId, JSON.stringify(items), stamp, stamp).run();
  await initializeBatch(env, batchId, items, snapshot);
  return show(env, batchId);
}
async function editBatch(env: Env, batchId: string, data: Record<string, unknown>) {
  const batch = await load(env, batchId); compatible(batch);
  if (!Object.keys(data).length || Object.keys(data).some(k => !["prompts", "briefs"].includes(k))) throw new HttpError(400, "Campi non previsti");
  const processes = (await env.DB.prepare("SELECT * FROM slop_processes WHERE batch_id=? ORDER BY slot").bind(batchId).all<Process>()).results;
  if (processes.some(p => !["draft", "ready", "failed"].includes(p.state) || p.attempts)) throw new HttpError(409, "Brief congelato: avvia un nuovo processo per modificarlo");
  const prompts = data.prompts ?? processes.map(p => p.prompt), briefs = data.briefs ?? processes.map(p => parse(p.brief, null));
  if (!Array.isArray(prompts) || prompts.length !== processes.length || prompts.some(p => typeof p !== "string" || !p.trim() || p.length > 4000) ||
    !Array.isArray(briefs) || briefs.length !== processes.length || briefs.some(b => !validBrief(b))) throw new HttpError(400, "Un brief valido e un prompt per REAL");
  // Single batch claim prevents concurrent edits, prompt calls and loop starts.
  const claim = await env.DB.prepare("UPDATE slop_batches SET prompts_status='running' WHERE id=? AND prompts_status<>'running'").bind(batchId).run();
  if (!claim.meta.changes) throw new HttpError(409, "Batch occupato");
  try {
    const locked = await env.DB.prepare("SELECT count(*) AS n FROM slop_processes WHERE batch_id=? AND (attempts>0 OR state NOT IN ('draft','ready','failed'))").bind(batchId).first<{n: number}>();
    if (locked?.n) throw new HttpError(409, "Brief congelato: nuovo processo richiesto");
    await env.DB.batch(processes.map((p, i) => env.DB.prepare("UPDATE slop_processes SET prompt=?,brief=?,state='ready',updated_at=? WHERE id=? AND attempts=0")
      .bind(prompts[i].trim(), JSON.stringify(validBrief(briefs[i])), now(), p.id)));
  } finally { await env.DB.prepare("UPDATE slop_batches SET prompts_status='done',updated_at=? WHERE id=?").bind(now(), batchId).run(); }
  return show(env, batchId);
}
const PROMPT_RULE = `Write a new plausible photograph in English (600–1000 characters). Return a minimal editorial brief and prompt together.
Use ONLY the supplied saved description and tags as editorial context, not as a scene to imitate. No required visual resemblance or single changed element.
Separate required anchors, preferred, flexible and exclusions. Credibility takes priority over literal prompt details. Invent all people; never name or describe living people or people dead less than 50 years. Never attribute crimes to historical figures, celebrate regimes, or depict nudity outside artworks.
Concrete natural photographic technique and light, no cinematic clichés. Never compose for a later game crop. Do not choose a format.`;
async function writePrompts(env: Env, batchId: string, data: Record<string, unknown>) {
  confirmOnly(data, ["index"]);
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  const batch = await load(env, batchId); compatible(batch);
  const items = itemsOf(batch), index = data.index;
  if (index !== undefined && (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= items.length)) throw new HttpError(400, "Immagine inesistente");
  const wanted = (await env.DB.prepare("SELECT * FROM slop_processes WHERE batch_id=? ORDER BY slot").bind(batchId).all<Process>()).results.filter(p => index === undefined ? !p.prompt : p.slot === index);
  if (!wanted.length) throw new HttpError(409, "Brief e prompt già salvati");
  if (wanted.some(p => p.attempts || !["draft", "ready", "failed"].includes(p.state))) throw new HttpError(409, "Processo bloccato: nessuna chiamata ripetuta");
  const inputs = await Promise.all(wanted.map(async p => {
    const source = await find(env, p.source_id), description = realDescription(parse(source.real_description, null));
    if (!description) throw new HttpError(409, "Descrizione REAL mancante: nessun backfill automatico");
    if (!["approved","published"].includes(source.status)) throw new HttpError(409, "REAL non più approvata o pubblicata");
    return { description, tags: byCategory((await tagRowsOf(env, [source.id])).get(source.id) || []) };
  }));
  // Read before the claim: a refusal here costs nothing. A text written for the twin prompts would contradict the brief.
  const base = await currentContext(env, "base"), context = await currentContext(env, "slop_prompt");
  if (context.pipeline < PIPELINE) throw new HttpError(409, "Il contesto «Brief e prompt per le SLOP» in vigore è stato scritto per le SLOP gemelle: " +
    "salva nelle Impostazioni il testo proposto o uno tuo prima di scrivere brief e prompt. Nessuna chiamata inviata");
  const claim = await env.DB.prepare("UPDATE slop_batches SET prompts_status='running',prompts_error='',updated_at=? WHERE id=? AND prompts_status NOT IN ('running','editing','uncertain')").bind(now(), batchId).run();
  if (!claim.meta.changes) throw new HttpError(409, "Prompt già in scrittura o incerti: nessuna chiamata inviata");
  try {
    const failures: string[] = [];
    for (const [i, p] of wanted.entries()) {
      const marked = await env.DB.prepare("UPDATE slop_processes SET state='prompting',updated_at=? WHERE id=? AND attempts=0 AND state IN ('draft','ready','failed') AND EXISTS(SELECT 1 FROM images WHERE id=slop_processes.source_id AND status IN ('approved','published'))").bind(now(), p.id).run();
      if (!marked.meta.changes) throw new HttpError(409, "Processo occupato");
      try {
        const config = parse<Snapshot>(p.snapshot, {} as Snapshot);
        await env.DB.prepare("UPDATE slop_processes SET snapshot=? WHERE id=? AND state='prompting'")
          .bind(JSON.stringify({...config, source_description: inputs[i].description, source_tags: inputs[i].tags,
            base_context: base.id, prompt_context: context.id}), p.id).run();
        const payload = await paid(env, "prompts", config.text_model, { model: config.text_model,
          instructions: base.body + "\n\n" + context.body + "\n\n" + PROMPT_RULE, max_output_tokens: 16000,
          text: { format: { type: "json_schema", name: "slop_brief", strict: true, schema: { type: "object", additionalProperties: false,
            required: ["brief", "prompt"], properties: { brief: briefSchema, prompt: {type: "string", maxLength: 4000} } } } },
          input: [{role: "user", content: [{type: "input_text", text: JSON.stringify(inputs[i])}]}] }, {process: p.id});
        const result = responseJson(payload) as { brief?: unknown; prompt?: unknown }, brief = validBrief(result.brief);
        if (!brief || typeof result.prompt !== "string" || !result.prompt.trim() || result.prompt.length > 4000) throw new HttpError(502, "Brief o prompt non validi");
        await env.DB.prepare("UPDATE slop_processes SET state='ready',brief=?,prompt=?,error='',updated_at=? WHERE id=?")
          .bind(JSON.stringify(brief), result.prompt.trim(), now(), p.id).run();
      } catch (e) {
        await env.DB.prepare("UPDATE slop_processes SET state=?,error=?,updated_at=? WHERE id=?").bind(e instanceof PaidError && e.outcome === "uncertain" ? "uncertain" : "failed", String(e).slice(0, 500), now(), p.id).run();
        if (index !== undefined || /OpenAI:/.test(String(e))) throw e;
        failures.push(String(e));
      }
    }
    await settleBatch(env, batchId, failures.join("; ")).run();
  } catch (e) {
    await settleBatch(env, batchId, String(e)).run(); throw e;
  }
  return show(env, batchId);
}
const strings = {type: "array", maxItems: 30, items: {type: "string", maxLength: 3000}};
const evaluationSchema = { type: "object", additionalProperties: false,
  required: ["attempt_id", "decision", "critical_findings", "minor_findings", "editorial_constraints_met", "uncertainty_notes", "action_reason", "revised_prompt", "preserved_required", "preserved_exclusions"],
  properties: {attempt_id: {type: "string"}, decision: {type: "string", enum: [...DECISIONS]}, critical_findings: strings, minor_findings: strings,
    editorial_constraints_met: {type: "boolean"}, uncertainty_notes: strings, action_reason: {type: "string"}, revised_prompt: {type: "string"}, preserved_required: strings, preserved_exclusions: strings} };
/** The part of the evaluator's instructions that the code enforces, after the editable context «slop_evaluation». */
const EVALUATE_RULE = `Evaluate the ENTIRE unprocessed generated photograph. Choose accept, retry_same_prompt, revise_prompt, replan_scene or review_needed; for uncertainty choose review_needed. Critical defects are never accepted at any tolerance. Tolerance 0 accepts no minor defects: with only minor defects choose retry_same_prompt or revise_prompt, never review_needed; 1 accepts subtle photographically plausible imperfections; 2 tolerates minor defects only while credibility holds. If revising or replanning, give the revised prompt in this same response and copy every required anchor and exclusion of the brief verbatim into preserved_required and preserved_exclusions. Never compose for a later crop.`;
async function hash(brief: Brief) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(brief))))].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function materialize(env: Env, p: Process, batch: Batch, bytes: Uint8Array, evaluation: Evaluation) {
  // Reuse a saved accepted result if the Worker was interrupted after inserting the library row.
  const existing = await env.DB.prepare("SELECT id FROM images WHERE generation_batch=? AND json_extract(generation_slot,'$.process')=?").bind(batch.id, p.id).first<{id: string}>();
  const config = parse<Snapshot>(p.snapshot, {} as Snapshot), item = itemsOf(batch)[p.slot];
  const image = existing ? await viewOf(env, existing.id) : await create(env, { origin: "SLOP", title: ("Da REAL: " + item.title).slice(0, 200),
    bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, prompt: p.prompt, model: config.image_model,
    generation: {batch: batch.id, source: p.source_id, quality: config.quality,
      slot: {index: p.slot, source: p.source_id, sample: p.source_id, tags: item.tags, process: p.id, brief: parse(p.brief, null), brief_hash: p.brief_hash, evaluation, attempts: p.attempts}} });
  await env.DB.prepare("UPDATE slop_processes SET image_id=?,state='accepted',updated_at=? WHERE id=?").bind(image.id, now(), p.id).run();
  return {...image, process: {id: p.id, state: "accepted", attempts: p.attempts}};
}
async function generateImage(env: Env, batchId: string, data: Record<string, unknown>) {
  confirmOnly(data, ["index", "quality"]);
  if (!env.OPENAI_API_KEY || !env.QUARANTINE) throw new HttpError(503, "Chiave OpenAI o quarantena mancante");
  const batch = await load(env, batchId); compatible(batch);
  if (batch.prompts_status !== "done") throw new HttpError(409, "Prima completa brief e prompt del batch");
  const p = await env.DB.prepare("SELECT * FROM slop_processes WHERE batch_id=? AND slot=?").bind(batchId, typeof data.index === "number" ? data.index : -1).first<Process>();
  if (!p) throw new HttpError(400, "Immagine inesistente");
  const config = parse<Snapshot>(p.snapshot, {} as Snapshot), brief = validBrief(parse(p.brief, null));
  if (data.quality !== config.quality) throw new HttpError(400, "La qualità è congelata nel preventivo del processo");
  if (p.image_id) return {...await viewOf(env, p.image_id), process: {id: p.id, state: p.state, attempts: p.attempts}};
  if (!["ready", "retry"].includes(p.state) || !brief) throw new HttpError(409, `Processo ${p.state}: nessuna chiamata ripetuta; serve revisione o un nuovo processo`);
  if (p.attempts >= config.max_generation_attempts) throw new HttpError(409, "Tentativi esauriti");
  const source = await find(env, p.source_id);
  if (!["approved", "published"].includes(source.status)) throw new HttpError(409, "REAL non più approvata o pubblicata");
  const live = await env.DB.prepare("SELECT id FROM images WHERE generation_source=? AND status IN ('new','approved','published')").bind(p.source_id).first();
  if (live) throw new HttpError(409, "La REAL ha già una SLOP attiva");
  const briefHash = await hash(brief);
  if (p.brief_hash && p.brief_hash !== briefHash) throw new HttpError(409, "Brief modificato dopo l'avvio");
  // Read before the attempt is claimed: a failure here costs nothing.
  const [base, context] = [await currentContext(env, "base"), await currentContext(env, "slop_evaluation")];
  let marked;
  try { marked = await env.DB.prepare("UPDATE slop_processes SET state='running',brief_hash=?,attempts=attempts+1,updated_at=? WHERE id=? AND state=? AND attempts=? AND EXISTS(SELECT 1 FROM slop_batches WHERE id=? AND prompts_status='done') AND EXISTS(SELECT 1 FROM images WHERE id=slop_processes.source_id AND status IN ('approved','published')) AND NOT EXISTS(SELECT 1 FROM images s WHERE s.generation_source=slop_processes.source_id AND s.status IN ('new','approved','published'))")
    .bind(briefHash, now(), p.id, p.state, p.attempts, batchId).run(); }
  catch { throw new HttpError(409, "Un altro processo sta usando questa REAL"); }
  if (!marked.meta.changes) throw new HttpError(409, "Tentativo già inviato: nessuna chiamata ripetuta");
  p.attempts++; p.brief_hash = briefHash;
  const attemptId = id(), key = `slop-temporary/${p.id}/${attemptId}`, stamp = now();
  await env.DB.prepare("INSERT INTO slop_attempts(id,process_id,number,prompt,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind(attemptId, p.id, p.attempts, p.prompt, stamp, stamp).run();
  try {
    const size = generationSize(config.image_model, nearestFormat(source.width, source.height));
    const payload = await paid(env, "images", config.image_model, {model: config.image_model, prompt: p.prompt, n: 1, size, quality: config.quality}, {process: p.id, attempt: attemptId});
    const encoded = (payload.data as {b64_json?: string}[] | undefined)?.[0]?.b64_json;
    if (!encoded) throw new HttpError(502, "Risposta del generatore non leggibile");
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)), mime = imageMime(bytes);
    if (!mime || bytes.length > 12_000_000) throw new HttpError(502, "Immagine generata non valida");
    const geometry = imageGeometry(bytes);
    if ((geometry.width ?? geometry.encoded_width) * (geometry.height ?? geometry.encoded_height) > 32_000_000) throw new HttpError(502, "Immagine oltre 32 megapixel");
    await env.QUARANTINE.put(key, bytes, {httpMetadata: {contentType: mime}});
    await env.DB.prepare("UPDATE slop_attempts SET candidate_key=?,status='generated',updated_at=? WHERE id=?").bind(key, now(), attemptId).run();
    const liveBatch = await env.DB.prepare("SELECT origin,auto_status FROM slop_batches WHERE id=?").bind(batchId).first<{origin:string;auto_status:string}>();
    if (liveBatch?.origin === "auto" && liveBatch.auto_status !== "running") {
      await env.DB.prepare("UPDATE slop_processes SET state='review_needed',error='Interrotto prima della valutazione',updated_at=? WHERE id=?").bind(now(),p.id).run();
      return {process:{id:p.id,state:"review_needed",attempts:p.attempts}};
    }
    const evaluationPayload = await paid(env, "evaluation", config.text_model, jsonWithImage({model: config.text_model,
      instructions: base.body + "\n\n" + context.body + "\n\n" + EVALUATE_RULE, max_output_tokens: 8000,
      text: {format: {type: "json_schema", name: "slop_evaluation", strict: true, schema: evaluationSchema}},
      input: [{role: "user", content: [{type: "input_text", text: JSON.stringify({attempt_id: attemptId, brief, prompt: p.prompt, tolerance: config.editorial_tolerance})},
        {type: "input_image", image_url: IMAGE_MARK}]}]}, bytes, mime), {process: p.id, attempt: attemptId});
    let evaluation = validEvaluation(responseJson(evaluationPayload), attemptId, brief);
    if (!evaluation) throw new HttpError(502, "Valutazione non valida: processo sospeso");
    // Tolerance 0 asks for fewer defects, so a candidate with minor ones consumes another attempt instead of stopping the loop;
    // when the attempts run out the process is exhausted and waits for the owner with every attempt.
    if (config.editorial_tolerance === 0 && evaluation.decision === "accept" && evaluation.minor_findings.length)
      evaluation = {...evaluation, decision: "retry_same_prompt", action_reason: (evaluation.action_reason + " Tolleranza 0: difetti minori, nuovo tentativo.").slice(0, 3000)};
    // The stored evaluation records the context versions it was made with.
    await env.DB.prepare("UPDATE slop_attempts SET status='completed',evaluation=?,updated_at=? WHERE id=?")
      .bind(JSON.stringify({...evaluation, contexts: {base: base.id, evaluation: context.id}}), now(), attemptId).run();
    if (evaluation.decision === "accept") return await materialize(env, p, batch, bytes, evaluation);
    const state = evaluation.decision === "review_needed" ? "review_needed" : p.attempts >= config.max_generation_attempts ? "exhausted" : "retry";
    const prompt = ["revise_prompt", "replan_scene"].includes(evaluation.decision) ? evaluation.revised_prompt.trim() : p.prompt;
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
export async function attention(env: Env) {
  const batches = (await env.DB.prepare(`SELECT DISTINCT p.batch_id,b.slots FROM slop_processes p JOIN slop_batches b ON b.id=p.batch_id
    WHERE p.state IN ('exhausted','review_needed','failed','uncertain') ORDER BY p.batch_id`).all<{batch_id: string; slots: string}>()).results;
  const out = [];
  for (const b of batches) {
    const items = itemsOf(b);
    for (const p of await processViews(env, b.batch_id))
      if ((ATTENTION as readonly string[]).includes(p.state)) out.push({...p, title: items[p.slot]?.title || "", source_id: p.source_id});
  }
  return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
/** POST processes/:id/close {}: the owner has seen a process without a SLOP. Its candidates follow the usual seven days. */
export async function closeProcess(env: Env, processId: string, data: Record<string, unknown>) {
  if (Object.keys(data).length) throw new HttpError(400, "Campi non previsti");
  const closed = await env.DB.prepare("UPDATE slop_processes SET state='closed',updated_at=? WHERE id=? AND state IN ('exhausted','review_needed','failed','uncertain')")
    .bind(now(), processId).run();
  if (!closed.meta.changes) throw new HttpError(409, "Processo inesistente o non da rivedere");
  return {attention: await attention(env)};
}
async function recent(env: Env) {
  const rows = (await env.DB.prepare(`SELECT b.id,b.slots,b.prompts_status,b.updated_at,(SELECT count(*) FROM images i WHERE i.generation_batch=b.id) AS images
    FROM slop_batches b ORDER BY b.updated_at DESC LIMIT 10`).all<Batch & {images: number}>()).results;
  return {batches: rows.map(r => ({id: r.id, count: itemsOf(r).length, prompts_status: r.prompts_status, images: r.images, updated_at: r.updated_at}))};
}
/** Authenticated private temporary preview. The main router handles this before JSON serialization. */
export async function candidateFile(env: Env, batchId: string, attemptId: string): Promise<Response> {
  const row = await env.DB.prepare("SELECT a.candidate_key FROM slop_attempts a JOIN slop_processes p ON p.id=a.process_id WHERE p.batch_id=? AND a.id=?").bind(batchId, attemptId).first<{candidate_key: string | null}>();
  const file = row?.candidate_key ? await env.QUARANTINE?.get(row.candidate_key) : null;
  if (!file) throw new HttpError(404, "Candidata non disponibile");
  return new Response(file.body, {headers: {"Content-Type": file.httpMetadata?.contentType || "image/png", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
}
export async function batchRoute(env: Env, method: string, rest: string, data: Record<string, unknown>) {
  if (!rest && method === "GET") return recent(env);
  if (!rest && method === "POST") return createBatch(env, data);
  const match = /^([\w-]{1,64})(?:\/(prompts|images))?$/.exec(rest);
  if (!match) throw new HttpError(404, "Batch inesistente");
  const [,batchId,action] = match;
  if (!action && method === "GET") return show(env, batchId);
  if (!action && method === "PUT") return editBatch(env, batchId, data);
  if (action === "prompts" && method === "POST") return writePrompts(env, batchId, data);
  if (action === "images" && method === "POST") return generateImage(env, batchId, data);
  throw new HttpError(405, "Metodo non consentito");
}
