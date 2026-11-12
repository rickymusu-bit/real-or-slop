/** Automatic SLOP batches on proposal (docs/proposta-generazione-slop.v2.0.0.md). v1.0.0, 2026-11-12T21:00:00Z.
 * GET /slop/auto: the open automatic batch with its progress, otherwise the current proposal (free, a read of the database).
 * POST /slop/auto/start {tag, size, confirm}: checks the proposal again, draws the slots and opens the batch (no paid call here:
 * prompts, images and analysis go through the studio routes, guarded by guardBatch). POST /slop/auto/ignore {tag}.
 * POST /slop/auto/stop and /slop/auto/finish: the batch stops generating and waits for the owner's decisions.
 * A batch is open while «running» or «review»; it closes when it is in review and none of its images is still new.
 * guardBatch: on an automatic batch the slots and prompts are not edited, prompts are written once, and each slot goes to the
 * generator at most once (recorded before the call), so a batch picked up again never resends a call. */
import { HttpError, type Env } from "./core";
import { numberSettings } from "./app-settings.v1.1.0";
import { AUTO_MAX_BATCH, proposal, spreadPercent, type Proposal, type TagCount } from "../shared/slop-auto.v1.0.0";
import { extractSlots, type Slot, type TaggedImage } from "../shared/slot-extraction.v1.0.0";
import { IMAGE_MODELS } from "../shared/models.v1.0.0";
import { chosenModel } from "./models.v1.1.0";

export interface AutoDeps { realImages: (env: Env) => Promise<TaggedImage[]>; spreadMap: (env: Env) => Promise<Map<string, number>> }
interface AutoRow {
  id: string; theme: string; slots: string; prompts_status: string; prompts_error: string; auto_tag: string; auto_status: string;
  auto_size: number; auto_snapshot: string; auto_attempted: string; created_at: string; updated_at: string;
}
const DONE = "status IN ('approved','published')";
const parse = <T>(value: string | null, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
const now = () => new Date().toISOString();

/** n_real and n_slop among approved and published images; n_new among the new SLOP, with the tags of the analysis or, before
 * the analysis, the theme of the slot. Images in the trash never count. */
async function counts(env: Env): Promise<{ tags: TagCount[]; realTotal: number }> {
  const done = (await env.DB.prepare(`SELECT t.label,sum(i.origin='REAL') AS real,sum(i.origin='SLOP') AS slop FROM tags t
    JOIN image_tags it ON it.tag_id=t.id JOIN images i ON i.id=it.image_id WHERE i.${DONE} GROUP BY t.id`).all<{ label: string; real: number; slop: number }>()).results;
  const fresh = (await env.DB.prepare(`SELECT label,count(DISTINCT image_id) AS n FROM (
      SELECT i.id AS image_id,t.label AS label FROM images i JOIN image_tags it ON it.image_id=i.id JOIN tags t ON t.id=it.tag_id
        WHERE i.origin='SLOP' AND i.status='new'
      UNION
      SELECT i.id,j.value FROM images i,json_each(i.generation_slot,'$.theme') j WHERE i.origin='SLOP' AND i.status='new'
        AND i.generation_slot IS NOT NULL AND json_valid(i.generation_slot) AND NOT EXISTS (SELECT 1 FROM image_tags it WHERE it.image_id=i.id)
    ) GROUP BY label`).all<{ label: string; n: number }>()).results;
  const freshOf = new Map(fresh.map(r => [r.label, r.n]));
  const total = await env.DB.prepare(`SELECT count(*) AS n FROM images WHERE origin='REAL' AND ${DONE}`).first<{ n: number }>();
  return { tags: done.map(r => ({ label: r.label, real: r.real, slop: r.slop, fresh: freshOf.get(r.label) || 0 })), realTotal: total?.n || 0 };
}

/** The open automatic batch, after closing it if it is in review and every image has been decided. */
async function openBatch(env: Env): Promise<AutoRow | null> {
  const row = await env.DB.prepare("SELECT * FROM slop_batches WHERE origin='auto' AND auto_status IN ('running','review') LIMIT 1").first<AutoRow>();
  if (!row || row.auto_status !== "review") return row;
  const pending = await env.DB.prepare("SELECT count(*) AS n FROM images WHERE generation_batch=? AND status='new'").bind(row.id).first<{ n: number }>();
  if (pending?.n) return row;
  await env.DB.prepare("UPDATE slop_batches SET auto_status='closed',updated_at=? WHERE id=? AND auto_status='review'").bind(now(), row.id).run();
  return null;
}

async function batchView(env: Env, row: AutoRow) {
  const images = (await env.DB.prepare(`SELECT id,status,generation_slot,copy_key,analysis_status FROM images WHERE generation_batch=?
    ORDER BY created_at,rowid`).bind(row.id).all<{ id: string; status: string; generation_slot: string | null; copy_key: string | null; analysis_status: string }>()).results;
  return { id: row.id, tag: row.auto_tag, size: row.auto_size, status: row.auto_status, prompts_status: row.prompts_status,
    prompts_error: row.prompts_error, slots: parse<Slot[]>(row.slots, []).length, attempted: parse<number[]>(row.auto_attempted, []),
    snapshot: parse<Proposal | null>(row.auto_snapshot, null), created_at: row.created_at, updated_at: row.updated_at,
    images: images.map(i => ({ id: i.id, status: i.status, index: parse<{ index?: number }>(i.generation_slot, {}).index ?? null,
      copy: !!i.copy_key, analysis: i.analysis_status })),
    undecided: images.filter(i => i.status === "new").length };
}

async function settings(env: Env) {
  const v = await numberSettings(env);
  return { enabled: v.slop_auto_enabled === 1, threshold: v.slop_auto_threshold_percent, section: v.slop_section_min_real, theme: v.slop_theme_min_real };
}
async function ignoredTags(env: Env) {
  const rows = (await env.DB.prepare("SELECT tag,spread_percent FROM slop_proposal_ignored").all<{ tag: string; spread_percent: number }>()).results;
  return new Map(rows.map(r => [r.tag, r.spread_percent]));
}
async function current(env: Env) {
  const [s, open, c, ignored] = [await settings(env), await openBatch(env), await counts(env), await ignoredTags(env)];
  const result = proposal({ tags: c.tags, realTotal: c.realTotal, sectionMin: s.section, themeMin: s.theme, thresholdPercent: s.threshold,
    enabled: s.enabled, openBatch: !!open, ignored });
  return { s, open, ...result };
}

export async function autoState(env: Env) {
  const { s, open, proposal: next, reason } = await current(env);
  return { enabled: s.enabled, threshold_percent: s.threshold, max_batch: AUTO_MAX_BATCH, paid_calls: !!env.OPENAI_API_KEY,
    batch: open ? await batchView(env, open) : null, proposal: next, reason };
}

async function start(env: Env, data: Record<string, unknown>, deps: AutoDeps) {
  if (Object.keys(data).some(key => !["tag", "size", "confirm"].includes(key))) throw new HttpError(400, "Campi non previsti");
  if (data.confirm !== true) throw new HttpError(400, "Conferma le chiamate a pagamento del batch");
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  const { open, proposal: next } = await current(env);
  if (open) throw new HttpError(409, "C'è già un batch automatico aperto: nessuna chiamata inviata");
  if (!next || next.tag !== data.tag || next.size !== data.size)
    throw new HttpError(409, "La proposta è cambiata nel frattempo: nessun batch avviato. Controlla la nuova proposta");
  const { slots } = extractSlots({ images: await deps.realImages(env), spread: await deps.spreadMap(env), theme: [next.tag], count: next.size });
  const stamp = now(), batchId = crypto.randomUUID();
  try {
    await env.DB.prepare(`INSERT INTO slop_batches(id,theme,slots,created_at,updated_at,origin,auto_tag,auto_status,auto_size,auto_snapshot)
      VALUES(?,?,?,?,?,'auto',?,'running',?,?)`).bind(batchId, JSON.stringify([next.tag]), JSON.stringify(slots), stamp, stamp,
      next.tag, slots.length, JSON.stringify(next)).run();
  } catch { throw new HttpError(409, "C'è già un batch automatico aperto: nessuna chiamata inviata"); }
  return autoState(env);
}

async function ignore(env: Env, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => key !== "tag") || typeof data.tag !== "string" || !data.tag) throw new HttpError(400, "Indica il tag");
  const row = (await counts(env)).tags.find(t => t.label === data.tag);
  const percent = row ? spreadPercent(row.real, row.slop) : null;
  if (percent === null) throw new HttpError(404, "Tag senza REAL approvate o pubblicate");
  await env.DB.prepare(`INSERT INTO slop_proposal_ignored(tag,spread_percent,created_at) VALUES(?,?,?)
    ON CONFLICT(tag) DO UPDATE SET spread_percent=excluded.spread_percent,created_at=excluded.created_at`).bind(data.tag, percent, now()).run();
  return autoState(env);
}

/** Stop (owner) or finish (every slot sent): no more calls; the images wait for the owner's decisions. */
async function settle(env: Env) {
  const result = await env.DB.prepare("UPDATE slop_batches SET auto_status='review',updated_at=? WHERE origin='auto' AND auto_status='running'").bind(now()).run();
  if (!result.meta.changes) throw new HttpError(409, "Nessun batch automatico in generazione");
  return autoState(env);
}

export async function autoRoute(env: Env, method: string, rest: string, data: Record<string, unknown>, deps: AutoDeps) {
  if (rest === "" && method === "GET") return autoState(env);
  if (method !== "POST") throw new HttpError(405, "Metodo non consentito");
  if (rest === "start") return start(env, data, deps);
  if (rest === "ignore") return ignore(env, data);
  if (rest === "stop" || rest === "finish") {
    if (Object.keys(data).length) throw new HttpError(400, "Campi non previsti");
    return settle(env);
  }
  throw new HttpError(404, "API dei batch automatici inesistente");
}

/** Ids of the automatic batches, kept out of the studio's list of recent groups. */
export async function autoBatchIds(env: Env): Promise<Set<string>> {
  return new Set((await env.DB.prepare("SELECT id FROM slop_batches WHERE origin='auto'").all<{ id: string }>()).results.map(r => r.id));
}

/** Rules of the studio routes on an automatic batch; nothing to check on a group of the studio. */
export async function guardBatch(env: Env, method: string, rest: string, data: Record<string, unknown>) {
  const [batchId, action] = rest.split("/");
  if (!batchId || !/^[\w-]{1,64}$/.test(batchId)) return;
  const row = await env.DB.prepare("SELECT origin,auto_status,prompts_status,slots FROM slop_batches WHERE id=?").bind(batchId)
    .first<{ origin: string; auto_status: string; prompts_status: string; slots: string }>();
  if (!row || row.origin !== "auto") return;
  if (method === "PUT") throw new HttpError(409, "Slot e prompt di un batch automatico non si modificano");
  if (method !== "POST") return;
  if (row.auto_status !== "running") throw new HttpError(409, "Il batch automatico non è più in generazione: nessuna chiamata inviata");
  if (action === "prompts") {
    if (data.index !== undefined || row.prompts_status !== "none")
      throw new HttpError(409, "I prompt di un batch automatico si scrivono una volta sola: nessuna chiamata inviata");
    return;
  }
  if (action === "images") {
    const index = data.index, count = parse<Slot[]>(row.slots, []).length;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= count) throw new HttpError(400, "Slot inesistente");
    // Whatever the studio route would refuse is refused here first, so that a refused request never uses up the slot.
    if (data.confirm !== true || !env.OPENAI_API_KEY) return;
    if (row.prompts_status !== "done") throw new HttpError(409, "Prima i prompt del batch: nessuna chiamata inviata");
    const qualities = IMAGE_MODELS[await chosenModel(env, "image_model")] || [];
    if (typeof data.quality !== "string" || !qualities.includes(data.quality)) return;
    const marked = await env.DB.prepare(`UPDATE slop_batches SET auto_attempted=json_insert(auto_attempted,'$[#]',?1),updated_at=?2
      WHERE id=?3 AND auto_status='running' AND NOT EXISTS (SELECT 1 FROM json_each(slop_batches.auto_attempted) WHERE value=?1)`)
      .bind(index, now(), batchId).run();
    if (!marked.meta.changes) throw new HttpError(409, "Questo slot è già stato inviato al generatore: nessuna chiamata ripetuta");
  }
}
