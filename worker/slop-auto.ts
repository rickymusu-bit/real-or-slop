/** Automatic editorial batches: confirmed snapshots, one open batch, per-photo persistent loops, manual review.
 * Legacy batches remain inspectable; no incompatible paid resume. */
import { HttpError, type Env } from "./core";
import { numberSettings } from "./app-settings";
import { IGNORE_KEY, MAX_BATCH, proposal, spreadPercent, type Proposal } from "../shared/twins";
import { initializeBatch, loopSnapshot, processViews, itemsOf } from "./slop-generation";
import { realRows, twinCounts, twinItems } from "./twins";

interface AutoRow {
  id: string; slots: string; prompts_status: string; prompts_error: string; auto_status: string;
  auto_size: number; auto_snapshot: string; auto_attempted: string; pipeline_version: number; loop_settings: string; created_at: string; updated_at: string;
}
const parse = <T>(value: string | null, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const now = () => new Date().toISOString();

/** The open automatic batch, after closing it if it is in review and every image has been decided. */
async function openBatch(env: Env): Promise<AutoRow | null> {
  const row = await env.DB.prepare("SELECT * FROM slop_batches WHERE origin='auto' AND auto_status IN ('running','review') LIMIT 1").first<AutoRow>();
  if (!row || row.auto_status !== "review") return row;
  const pending = await env.DB.prepare("SELECT count(*) AS n FROM images WHERE generation_batch=? AND status='new'").bind(row.id).first<{ n: number }>();
  const unresolved = await env.DB.prepare("SELECT count(*) AS n FROM slop_processes WHERE batch_id=? AND state IN ('review_needed','uncertain','failed','exhausted','running','prompting','retry')").bind(row.id).first<{n:number}>();
  if (pending?.n || unresolved?.n) return row;
  await env.DB.prepare("UPDATE slop_batches SET auto_status='closed',updated_at=? WHERE id=? AND auto_status='review'").bind(now(), row.id).run();
  return null;
}

async function batchView(env: Env, row: AutoRow) {
  const images = (await env.DB.prepare(`SELECT id,status,generation_slot,copy_key,analysis_status FROM images WHERE generation_batch=?
    ORDER BY created_at,rowid`).bind(row.id).all<{ id: string; status: string; generation_slot: string | null; copy_key: string | null; analysis_status: string }>()).results;
  const processes = await processViews(env, row.id);
  // Reading the processes may have settled a stuck brief claim: the batch fields shown must be the current ones.
  const fresh = await env.DB.prepare("SELECT prompts_status,prompts_error,updated_at FROM slop_batches WHERE id=?").bind(row.id)
    .first<{ prompts_status: string; prompts_error: string; updated_at: string }>();
  if (fresh) Object.assign(row, fresh);
  // A batch drawn before the twins holds slots of tags: its size is the one recorded at its start.
  return { id: row.id, size: row.auto_size, status: row.auto_status, prompts_status: row.prompts_status,
    prompts_error: row.prompts_error, slots: itemsOf(row).length || row.auto_size, attempted: row.pipeline_version === 2 ? processes.filter(p=>p.attempts.length).map(p=>p.slot) : parse<number[]>(row.auto_attempted, []),
    pipeline_version: row.pipeline_version, config: parse(row.loop_settings, null), processes,
    snapshot: parse<Proposal | null>(row.auto_snapshot, null), created_at: row.created_at, updated_at: row.updated_at,
    images: images.map(i => ({ id: i.id, status: i.status, index: parse<{ index?: number }>(i.generation_slot, {}).index ?? null,
      copy: !!i.copy_key, analysis: i.analysis_status })),
    undecided: images.filter(i => i.status === "new").length };
}

async function current(env: Env) {
  const [v, open, counts] = [await numberSettings(env), await openBatch(env), await twinCounts(env)];
  const ignored = await env.DB.prepare("SELECT spread_percent FROM slop_proposal_ignored WHERE tag=?").bind(IGNORE_KEY).first<{ spread_percent: number }>();
  const result = proposal({ ...counts, sectionMin: v.slop_section_min_real, thresholdPercent: v.slop_auto_threshold_percent,
    enabled: v.slop_auto_enabled === 1, openBatch: !!open, ignoredAt: ignored?.spread_percent ?? null });
  return { v, open, counts, ...result };
}

export async function autoState(env: Env) {
  const { v, open, proposal: next, reason } = await current(env);
  return { enabled: v.slop_auto_enabled === 1, threshold_percent: v.slop_auto_threshold_percent, max_batch: MAX_BATCH, paid_calls: !!env.OPENAI_API_KEY,
    config: await loopSnapshot(env), batch: open ? await batchView(env, open) : null, proposal: next, reason };
}

/** The REAL of a batch: among those waiting for a twin, at random, so that a batch does not follow the order of loading. */
function draw<T>(list: T[], count: number): T[] {
  const pool = [...list], out: T[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}
async function start(env: Env, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => !["size", "confirm", "config"].includes(key))) throw new HttpError(400, "Campi non previsti");
  if (data.confirm !== true) throw new HttpError(400, "Conferma le chiamate a pagamento del batch");
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  const snapshot = await loopSnapshot(env);
  if (data.config !== undefined && Object.entries(snapshot).some(([key,value]) => !data.config || (data.config as Record<string,unknown>)[key] !== value)) throw new HttpError(409, "Configurazione cambiata: controlla e conferma il nuovo tetto di chiamate");
  const { open, proposal: next } = await current(env);
  if (open) throw new HttpError(409, "C'è già un batch automatico aperto: nessuna chiamata inviata");
  if (!next || next.size !== data.size)
    throw new HttpError(409, "La proposta è cambiata nel frattempo: nessun batch avviato. Controlla la nuova proposta");
  const waiting = (await realRows(env)).filter(r => !r.twin && r.described).map(r => r.id);
  if (waiting.length < next.size) throw new HttpError(409, "Descrizioni REAL mancanti: completale manualmente o autorizza l'analisi nel Database");
  const items = await twinItems(env, draw(waiting, next.size)), stamp = now(), batchId = crypto.randomUUID();
  try {
    await env.DB.prepare(`INSERT INTO slop_batches(id,theme,slots,created_at,updated_at,origin,auto_tag,auto_status,auto_size,auto_snapshot)
      VALUES(?,'[]',?,?,?,'auto',?,'running',?,?)`).bind(batchId, JSON.stringify(items), stamp, stamp, IGNORE_KEY, items.length, JSON.stringify(next)).run();
  } catch { throw new HttpError(409, "C'è già un batch automatico aperto: nessuna chiamata inviata"); }
  await initializeBatch(env, batchId, items, snapshot);
  return autoState(env);
}

async function ignore(env: Env, data: Record<string, unknown>) {
  if (Object.keys(data).length) throw new HttpError(400, "Campi non previsti");
  const counts = await twinCounts(env), percent = spreadPercent(counts.real, counts.twinned);
  if (percent === null) throw new HttpError(404, "Nessuna REAL approvata o pubblicata");
  await env.DB.prepare(`INSERT INTO slop_proposal_ignored(tag,spread_percent,created_at) VALUES(?,?,?)
    ON CONFLICT(tag) DO UPDATE SET spread_percent=excluded.spread_percent,created_at=excluded.created_at`).bind(IGNORE_KEY, percent, now()).run();
  return autoState(env);
}

/** Stop (owner) or finish (every image sent): no more calls; the images wait for the owner's decisions. */
async function settle(env: Env) {
  const result = await env.DB.prepare("UPDATE slop_batches SET auto_status='review',updated_at=? WHERE origin='auto' AND auto_status='running'").bind(now()).run();
  if (!result.meta.changes) throw new HttpError(409, "Nessun batch automatico in generazione");
  return autoState(env);
}

export async function autoRoute(env: Env, method: string, rest: string, data: Record<string, unknown>) {
  if (rest === "" && method === "GET") return autoState(env);
  if (method !== "POST") throw new HttpError(405, "Metodo non consentito");
  if (rest === "start") return start(env, data);
  if (rest === "ignore") return ignore(env, data);
  if (rest === "close") {
    if (Object.keys(data).length) throw new HttpError(400, "Campi non previsti");
    const row = await openBatch(env);
    if (!row || row.auto_status !== "review") throw new HttpError(409, "Prima interrompi o termina la generazione");
    const pending = await env.DB.prepare("SELECT count(*) AS n FROM images WHERE generation_batch=? AND status='new'").bind(row.id).first<{n:number}>();
    if (pending?.n) throw new HttpError(409, "Decidi prima le immagini nuove del batch");
    await env.DB.prepare("UPDATE slop_batches SET auto_status='closed',updated_at=? WHERE id=?").bind(now(),row.id).run();
    return autoState(env);
  }
  if (rest === "stop" || rest === "finish") {
    if (Object.keys(data).length) throw new HttpError(400, "Campi non previsti");
    return settle(env);
  }
  throw new HttpError(404, "API dei batch automatici inesistente");
}

/** Ids of the automatic batches, kept out of the studio's list of recent batches. */
export async function autoBatchIds(env: Env): Promise<Set<string>> {
  return new Set((await env.DB.prepare("SELECT id FROM slop_batches WHERE origin='auto'").all<{ id: string }>()).results.map(r => r.id));
}

/** Rules of the studio routes on an automatic batch; nothing to check on a batch of the studio. */
export async function guardBatch(env: Env, method: string, rest: string, data: Record<string, unknown>) {
  const [batchId, action] = rest.split("/");
  if (!batchId || !/^[\w-]{1,64}$/.test(batchId)) return;
  const row = await env.DB.prepare("SELECT origin,auto_status,prompts_status,slots,pipeline_version FROM slop_batches WHERE id=?").bind(batchId)
    .first<{ origin: string; auto_status: string; prompts_status: string; slots: string; pipeline_version: number }>();
  if (!row || row.origin !== "auto") return;
  if (method === "PUT") throw new HttpError(409, "I prompt di un batch automatico non si modificano");
  if (method !== "POST") return;
  if (row.pipeline_version !== 2) throw new HttpError(409, "Batch precedente: sola revisione; non si riprende automaticamente");
  if (row.auto_status !== "running") throw new HttpError(409, "Il batch automatico non è più in generazione: nessuna chiamata inviata");
  if (action === "prompts") {
    // One request per REAL (index), each written once: never a rewrite of a brief already written, failed or uncertain.
    const draft = typeof data.index === "number" && await env.DB.prepare("SELECT 1 FROM slop_processes WHERE batch_id=? AND slot=? AND state='draft'")
      .bind(batchId, data.index).first();
    if (row.prompts_status !== "none" || (data.index !== undefined && !draft))
      throw new HttpError(409, "I prompt di un batch automatico si scrivono una volta sola: nessuna chiamata inviata");
    return;
  }
  if (action === "images" && row.prompts_status !== "done") throw new HttpError(409, "Prima completa brief e prompt");
}
