/** Confirmed analysis of the whole image, REAL or SLOP: its original, never the 4:5 crop (decisions of the owner of 2026-11-15).
 * A REAL returns tags and the private description in one atomic result; a SLOP returns tags only.
 * Contexts never mention synthetic images. Claims and uncertain results prevent automatic paid retries. */
import { descriptionSchema, realDescription } from "../shared/editorial";
import { HttpError, id, type Env } from "./core";
import { categoriesOf, tagRowsOf, tagStatements, viewOf, type Row } from "./library";
import { chosenModel } from "./models";
import { CATEGORIES, categoryError, COLORS, forcedCategory, MEDIA, SINGLE, VISUAL, type Category } from "../shared/tag-categories";
import { checkTag, suggestTag } from "../shared/tags";
import { imageMime } from "../shared/image-format";
import { IMAGE_MARK, jsonWithImage } from "./image-body";
import { currentContext } from "./model-context";

const VOCABULARY = 300, MAX_TAGS = 40, TIMEOUT_MS = 60_000, STALE_MS = 10 * 60_000;
/** The cap covers the reasoning of the model too: 2000 tokens cut one answer in ten of the first automatic batch («Risposta del
 * modello non leggibile», paid and lost). */
const MAX_OUTPUT_TOKENS = 8000;

export async function analysisStatus(env: Env) {
  const model = await chosenModel(env, "text_model");
  const calls = await env.DB.prepare(`SELECT count(*) AS total,coalesce(sum(status='uncertain'),0) AS uncertain,
    coalesce(sum(input_tokens),0) AS input_tokens,coalesce(sum(output_tokens),0) AS output_tokens FROM paid_calls
    WHERE created_at>=?`).bind(new Date(Date.now() - 30 * 86_400_000).toISOString())
    .first<{ total: number; uncertain: number; input_tokens: number; output_tokens: number }>();
  return { enabled: !!env.OPENAI_API_KEY, reason: env.OPENAI_API_KEY ? "" : "Chiave OpenAI mancante", model,
    calls_30_days: calls || { total: 0, uncertain: 0, input_tokens: 0, output_tokens: 0 },
    note: "Il limite di spesa che conta è quello impostato sul progetto OpenAI (platform.openai.com)." };
}

/** The editable context (base and analysis parts) comes first; these technical lines stay in the code. */
const VISUAL_RULE = "Giudica genere, colore e supporto soltanto da ciò che si vede nell'immagine, mai dal titolo, dalla descrizione o da altro testo.";
const OUTPUT = "Rispondi solo con JSON conforme allo schema: «tags» con un elenco per categoria (time: un decennio come «1970s», al massimo uno; " +
  "genre: il tipo di fotografia, uno; color: uno dalla lista; medium: che cosa è materialmente l'immagine, uno dalla lista; place; setting; " +
  "event; people; object; other). " + VISUAL_RULE;
const COMPLETE_OUTPUT = "Rispondi solo con JSON conforme allo schema: «tags» con genre (il tipo di fotografia), color e medium (che cosa è " +
  "materialmente l'immagine), uno ciascuno. " + VISUAL_RULE;
const itemsOf = (c: Category) => c === "color" ? { type: "string", enum: [...COLORS] } : c === "medium" ? { type: "string", enum: [...MEDIA] } : { type: "string" };
const schemaFor = (categories: readonly Category[], describe = false) => ({ type: "json_schema", name: "image_analysis", strict: true, schema: {
  type: "object", additionalProperties: false, required: describe ? ["tags", "real_description"] : ["tags"], properties: {
    ...(describe ? { real_description: descriptionSchema } : {}),
    tags: { type: "object", additionalProperties: false, required: [...categories], properties: Object.fromEntries(categories.map(c =>
      [c, { type: "array", items: itemsOf(c), ...(VISUAL.includes(c) ? { minItems: 1 } : {}), maxItems: SINGLE.includes(c) ? 1 : 15 }])) },
  } } });
const FORMAT = schemaFor(CATEGORIES), REAL_FORMAT = schemaFor(CATEGORIES, true), COMPLETE_FORMAT = schemaFor(VISUAL);

function outputText(value: Record<string, unknown>): string {
  const outputs = Array.isArray(value.output) ? value.output as Array<{ content?: Array<{ type?: string; text?: string }> }> : [];
  return outputs.flatMap(o => o.content || []).filter(c => c.type === "output_text" && typeof c.text === "string").map(c => c.text!).join("");
}
export interface Conflict { label: string; proposed: Category; existing: Category }
/** Model tags made conforming (ASCII form, refused words dropped), resolved through aliases and categorised. A decade is
 * always Time; Time accepts only decades. An existing tag keeps its category: a different proposal is a conflict. Only
 * the first tag of each single-tag category is kept. A plain list (older answers, tests) counts as «other». */
async function cleanTags(env: Env, raw: unknown) {
  const byCategory: Partial<Record<Category, unknown>> = Array.isArray(raw) ? { other: raw } : raw && typeof raw === "object" ? raw as Record<Category, unknown> : {};
  const proposed = new Map<string, Category>();
  for (const category of CATEGORIES) {
    const items = byCategory[category];
    for (const item of Array.isArray(items) ? items : []) {
      if (typeof item !== "string") continue;
      const checked = checkTag(checkTag(item).ok ? item.trim() : suggestTag(item));
      if (!checked.ok || proposed.has(checked.tag)) continue;
      const fitted: Category = forcedCategory(checked.tag) ?? category;
      if (!categoryError(checked.tag, fitted)) proposed.set(checked.tag, fitted);
    }
  }
  const aliases = new Map((await env.DB.prepare(`SELECT a.alias,t.label FROM tag_aliases a JOIN tags t ON t.id=a.tag_id
    WHERE a.alias IN (SELECT value FROM json_each(?))`).bind(JSON.stringify([...proposed.keys()])).all<{ alias: string; label: string }>()).results.map(r => [r.alias, r.label]));
  const resolved = new Map<string, Category>();
  for (const [label, category] of proposed) if (!resolved.has(aliases.get(label) || label)) resolved.set(aliases.get(label) || label, category);
  const existing = await categoriesOf(env, [...resolved.keys()]);
  const categories = new Map<string, Category>(), conflicts: Conflict[] = [], single = new Set<Category>();
  for (const [label, wanted] of resolved) {
    const category = existing.get(label) ?? wanted;
    if (existing.has(label) && category !== wanted) conflicts.push({ label, proposed: wanted, existing: category });
    if (SINGLE.includes(category)) { if (single.has(category)) continue; single.add(category); }
    categories.set(label, category);
  }
  return { categories, conflicts };
}

type Usage = { input_tokens?: number; output_tokens?: number };
type Outcome = { kind: "ok"; result: { tags?: unknown; real_description?: unknown }; usage: Usage } | { kind: "uncertain" | "failed" | "unreadable"; message: string; usage?: Usage };

async function vocabularyText(env: Env, categories: readonly Category[]) {
  const used = (await env.DB.prepare(`SELECT t.label,t.category FROM tags t JOIN image_tags it ON it.tag_id=t.id GROUP BY t.id
    ORDER BY count(*) DESC,t.label LIMIT ?`).bind(VOCABULARY).all<{ label: string; category: Category }>()).results;
  return categories.map(c => [c, used.filter(t => t.category === c).map(t => t.label)] as const).filter(([, list]) => list.length)
    .map(([c, list]) => c + ": " + list.join(", ")).join("\n");
}
const contextOf = (row: Row) => [row.origin === "REAL" && row.title && "Title: " + row.title, row.description && "Description: " + row.description,
  row.commons_description && "Original Commons context: " + row.commons_description, row.prompt && "Description: " + row.prompt].filter(Boolean).join("\n");

/** One call to the text model with the image to analyse. Never throws for the call itself: the outcome says what happened. */
async function send(env: Env, model: string, instructions: string, format: unknown, text: string, image: Picture): Promise<Outcome> {
  let response: Response;
  try {
    response = await fetch((env.OPENAI_BASE_URL || "https://api.openai.com/v1/") + "responses", {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: jsonWithImage({ model, instructions, text: { format }, max_output_tokens: MAX_OUTPUT_TOKENS, input: [{ role: "user", content: [
        { type: "input_text", text },
        { type: "input_image", image_url: IMAGE_MARK },
      ] }] }, image.bytes, image.mime),
    });
  } catch {
    // Sent or not, we cannot know: recorded as uncertain, never resent automatically.
    return { kind: "uncertain", message: "Esito incerto: la chiamata potrebbe essere stata addebitata. Non è stata ripetuta." };
  }
  if (!response.ok) {
    // 4xx: refused before any work, not charged. Account problems (key, spend limit or credit on OpenAI, rate limit)
    // start with «OpenAI:» so that the dashboard stops a batch. 5xx: uncertain, kept as spent.
    const detail = await response.json().catch(() => ({})) as { error?: { code?: string; type?: string } };
    const code = String(detail.error?.code || detail.error?.type || "");
    const failed = response.status >= 400 && response.status < 500;
    const message = response.status === 401 || response.status === 403 ? "OpenAI: chiave rifiutata, nessun addebito"
      : response.status === 429 && /quota|spend_limit|billing/.test(code)
        ? "OpenAI: limite di spesa o credito esaurito sull'account OpenAI, nessun addebito. Controlla platform.openai.com"
        : response.status === 429 ? "OpenAI: troppe richieste, nessun addebito. Riprova fra qualche minuto"
          : failed ? `Il modello ha risposto ${response.status}${code ? " (" + code + ")" : ""}: nessun addebito previsto`
            : `Il modello ha risposto ${response.status}: esito incerto, la chiamata potrebbe essere stata addebitata. Non è stata ripetuta`;
    return { kind: failed ? "failed" : "uncertain", message };
  }
  let usage: Usage = {};
  try {
    const payload = await response.json() as Record<string, unknown>;
    usage = (payload.usage || {}) as Usage;
    return { kind: "ok", result: JSON.parse(outputText(payload)) as { tags?: unknown }, usage };
  } catch {
    return { kind: "unreadable", message: "Risposta del modello non leggibile", usage };
  }
}
async function recordCall(env: Env, model: string, row?: Row) {
  const callId = id(), stamp = new Date().toISOString();
  const process = row?.generation_slot ? (JSON.parse(row.generation_slot) as {process?: string}).process : null;
  await env.DB.prepare("INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at,image_id,process_id) VALUES(?,'analysis',?,'pending',?,?,?,(SELECT id FROM slop_processes WHERE id=?))")
    .bind(callId, model, stamp, stamp, row?.id ?? null, process ?? null).run();
  return { callId, update: (call: "completed" | "uncertain" | "failed", usage?: Usage) =>
    env.DB.prepare("UPDATE paid_calls SET status=?,input_tokens=?,output_tokens=?,updated_at=? WHERE id=?")
      .bind(call, usage?.input_tokens ?? null, usage?.output_tokens ?? null, new Date().toISOString(), callId) };
}
interface Picture { bytes: ArrayBuffer; mime: string }
/** What the model sees: the whole original, REAL or SLOP, so that tags and description cover the full picture and not the crop
 * the player sees (owner decisions of 2026-11-15). Pixels only: the model never reads file metadata. Read before any call. */
async function analysisImage(env: Env, row: Row): Promise<Picture> {
  const original = await env.QUARANTINE?.get(row.original_key);
  if (!original) throw new HttpError(409, "Originale non disponibile");
  const bytes = await original.arrayBuffer(), mime = imageMime(new Uint8Array(bytes));
  if (!mime) throw new HttpError(409, "Formato dell'originale non leggibile dal modello");
  return { bytes, mime };
}
const confirmed = (data: Record<string, unknown>) => {
  if (Object.keys(data).some(key => key !== "confirm") || data.confirm !== true) throw new HttpError(400, "Conferma la chiamata a pagamento");
};

export async function analyze(env: Env, row: Row, data: Record<string, unknown>) {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  if (Object.keys(data).some(k => !["confirm", "refresh_description", "repeat_uncertain", "reanalyze"].includes(k)) || data.confirm !== true ||
    (data.refresh_description !== undefined && data.refresh_description !== true) ||
    (data.repeat_uncertain !== undefined && data.repeat_uncertain !== true) ||
    (data.reanalyze !== undefined && (data.reanalyze !== true || data.refresh_description !== undefined)))
    throw new HttpError(400, "Conferma la chiamata a pagamento");
  const refresh = data.refresh_description === true && row.origin === "REAL" && !row.real_description;
  const reanalyze = data.reanalyze === true;
  const snapshot = row.generation_slot ? (JSON.parse(row.generation_slot) as {process?:string}).process : null;
  const process = snapshot ? await env.DB.prepare("SELECT snapshot FROM slop_processes WHERE id=?").bind(snapshot).first<{snapshot:string}>() : null;
  const model = process ? (JSON.parse(process.snapshot) as {text_model:string}).text_model : await chosenModel(env, "text_model");
  if (row.status === "trash" || (row.status !== "new" && !(reanalyze && row.status === "approved") && !refresh))
    throw new HttpError(409, reanalyze ? "Dal dettaglio si analizzano foto nuove o approvate" : "Si analizzano solo immagini nuove");
  if (row.analysis_status === "done" && !refresh && !reanalyze)
    throw new HttpError(409, "Tag già generati per questa immagine: per rifare l’analisi conferma dal dettaglio della foto");
  // A «running» mark older than STALE_MS belongs to a Worker that died mid-call. Like an uncertain outcome, it may have been charged:
  // the owner repeats it only by confirming that risk (repeat_uncertain), never automatically.
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  if (row.analysis_status === "running" && row.updated_at > staleBefore) throw new HttpError(409, "Analisi già in corso");
  const unsure = row.analysis_status === "uncertain" || row.analysis_status === "running";
  if (unsure && data.repeat_uncertain !== true)
    throw new HttpError(409, "L'analisi precedente ha un esito incerto e potrebbe essere già stata addebitata: ripetila solo confermando questo rischio");
  const image = await analysisImage(env, row);
  // Read before the call is recorded: a failure here costs nothing.
  const [baseContext, taskContext] = [await currentContext(env, "base"), await currentContext(env, "analysis")];
  const describe = row.origin === "REAL";
  const instructions = baseContext.body + "\n\n" + taskContext.body + "\n\n" + OUTPUT + (describe ?
    " Restituisci anche real_description: visible descrive solo elementi osservabili, documented_context solo fatti documentati nel titolo e contesto Commons forniti; uncertainties segnala lacune o dettagli incerti. Testo neutro, senza giudizi di autenticità; non inventare contesto." : "");
  const stamp = new Date().toISOString();
  // The «running» mark comes first: only the request that sets it records and sends the call.
  // Only one of two simultaneous confirmations sets the fresh mark: the other finds it running and sends nothing.
  const marked = await env.DB.prepare(`UPDATE images SET analysis_status='running',analysis_error='',updated_at=? WHERE id=? AND status=? AND revision=?
    AND (analysis_status<>'done' OR ?=1) AND (analysis_status NOT IN ('running','uncertain') OR ?=1)
    AND (analysis_status<>'running' OR updated_at<=?)`).bind(stamp, row.id, row.status, row.revision, refresh || reanalyze ? 1 : 0, unsure ? 1 : 0, staleBefore).run();
  if (!marked.meta.changes) throw new HttpError(409, "Immagine cambiata o già in analisi: nessuna chiamata inviata");
  // The call of an interrupted analysis stays in the register as uncertain, never as pending.
  if (unsure) await env.DB.prepare("UPDATE paid_calls SET status='uncertain',updated_at=? WHERE image_id=? AND kind='analysis' AND status='pending'")
    .bind(stamp, row.id).run();
  const call = await recordCall(env, model, row);
  const text = `Existing vocabulary by category:\n${await vocabularyText(env, CATEGORIES) || "(empty)"}\n${contextOf(row) || "No context."}`;
  // The register keeps the outcome and the tokens reported.
  const settle = async (status: "completed" | "uncertain" | "failed", analysis: "done" | "uncertain" | "failed", error = "", usage?: Usage) => {
    const now = new Date().toISOString();
    await env.DB.batch([call.update(status, usage),
      env.DB.prepare("UPDATE images SET analysis_status=?,analysis_error=?,analyzed_at=?,revision=revision+1,updated_at=? WHERE id=?")
        .bind(analysis, error.slice(0, 300), now, now, row.id)]);
  };
  const outcome = await send(env, model, instructions, describe ? REAL_FORMAT : FORMAT, text, image);
  if (outcome.kind !== "ok") {
    const status = outcome.kind === "unreadable" ? "completed" : outcome.kind;
    await settle(status, outcome.kind === "uncertain" ? "uncertain" : "failed", outcome.message, outcome.usage);
    throw new HttpError(502, outcome.kind === "uncertain" ? "Esito incerto dell'analisi: non ripetuta automaticamente" : outcome.message);
  }
  const description = describe ? realDescription(outcome.result.real_description) : null;
  if (describe && !description) {
    await settle("completed", "failed", "Descrizione editoriale non valida", outcome.usage);
    throw new HttpError(502, "Descrizione editoriale non valida: nessun tag o testo salvato");
  }
  const { categories, conflicts } = await cleanTags(env, outcome.result.tags);
  const proposed = [...categories.keys()];
  // The generation replaces the tags the owner wrote; the generated ones are kept apart for restoring.
  const wanted = proposed.slice(0, MAX_TAGS);
  if (row.status === "approved" && !wanted.length) {
    await settle("completed", "failed", "L'analisi non ha restituito tag validi", outcome.usage);
    throw new HttpError(502, "L'analisi non ha restituito tag validi. I tag esistenti sono stati conservati.");
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE images SET generated_tags=?,analysis_base_context=?,analysis_task_context=?,categories_completed_at=?,updated_at=?,
      real_description=CASE WHEN ? IS NULL THEN real_description ELSE ? END,
      real_description_provenance=CASE WHEN ? IS NULL THEN real_description_provenance ELSE ? END
      WHERE id=? AND analysis_status='running'`).bind(JSON.stringify(wanted), baseContext.id, taskContext.id, stamp, new Date().toISOString(),
        description ? JSON.stringify(description) : null, description ? JSON.stringify(description) : null,
        description ? JSON.stringify(description) : null, JSON.stringify({model, image: "original", original_sha256: row.original_sha256, revision: row.revision, at: stamp, generated: description}), row.id),
    call.update("completed", outcome.usage),
    ...tagStatements(env, row.id, wanted, { sql: "EXISTS(SELECT 1 FROM images WHERE id=? AND analysis_status='running')", values: [row.id] }, categories),
    env.DB.prepare("UPDATE images SET analysis_status='done',analysis_error='',analyzed_at=?,revision=revision+1 WHERE id=? AND analysis_status='running'").bind(stamp, row.id),
  ]);
  return { ...(await viewOf(env, row.id)), proposed_tags: proposed, tag_conflicts: conflicts };
}

/** Whether an image may receive the paid completion of Genre, Color and Medium (spec `libreria-immagini`, section 5). */
export function completable(row: Pick<Row, "status" | "analysis_status" | "categories_completed_at">, categories: Iterable<Category>): boolean {
  const have = new Set(categories);
  return row.status !== "trash" && row.analysis_status === "done" && !row.categories_completed_at && VISUAL.some(c => !have.has(c));
}

/** POST /:id/categories {confirm}: one paid call per image, ever, returns only Genre, Color and Medium, which replace the tags of
 * those three categories and leave the others. A published image stays published: players see nothing of the tags. The mark goes
 * first and stays on a sent call, whatever its outcome, except a refusal (4xx), which is not charged. */
export async function completeCategories(env: Env, row: Row, data: Record<string, unknown>) {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  confirmed(data);
  const current = (await tagRowsOf(env, [row.id])).get(row.id) || [];
  if (!completable(row, current.map(t => t.category)))
    throw new HttpError(409, row.categories_completed_at ? "Genere, Colore e Supporto già completati per questa immagine: nessuna chiamata inviata"
      : row.analysis_status !== "done" ? "Prima l'analisi dell'immagine" : row.status === "trash" ? "Immagine nel cestino" : "L'immagine ha già Genere, Colore e Supporto");
  const model = await chosenModel(env, "text_model"), image = await analysisImage(env, row);
  const [baseContext, taskContext] = [await currentContext(env, "base"), await currentContext(env, "analysis")];
  const instructions = baseContext.body + "\n\n" + taskContext.body + "\n\n" + COMPLETE_OUTPUT;
  const stamp = new Date().toISOString();
  const marked = await env.DB.prepare("UPDATE images SET categories_completed_at=? WHERE id=? AND categories_completed_at IS NULL AND status<>'trash'")
    .bind(stamp, row.id).run();
  if (!marked.meta.changes) throw new HttpError(409, "Completamento già inviato per questa immagine: nessuna chiamata ripetuta");
  const call = await recordCall(env, model, row);
  const text = `Existing vocabulary by category:\n${await vocabularyText(env, VISUAL) || "(empty)"}\n${contextOf(row) || "No context."}`;
  const outcome = await send(env, model, instructions, COMPLETE_FORMAT, text, image);
  if (outcome.kind !== "ok") {
    await env.DB.batch([call.update(outcome.kind === "unreadable" ? "completed" : outcome.kind, outcome.usage),
      ...(outcome.kind === "failed" ? [env.DB.prepare("UPDATE images SET categories_completed_at=NULL WHERE id=?").bind(row.id)] : [])]);
    throw new HttpError(502, outcome.kind === "uncertain" ? "Esito incerto del completamento: non ripetuto automaticamente" : outcome.message);
  }
  const raw = outcome.result.tags && typeof outcome.result.tags === "object" ? outcome.result.tags as Record<string, unknown> : {};
  const { categories, conflicts } = await cleanTags(env, Object.fromEntries(VISUAL.map(c => [c, raw[c]])));
  const added = [...categories].filter(([, c]) => VISUAL.includes(c)).map(([label]) => label);
  const kept = current.filter(t => !VISUAL.includes(t.category)).map(t => t.label);
  const wanted = [...new Set([...kept, ...added])].slice(0, MAX_TAGS);
  await env.DB.batch([call.update("completed", outcome.usage),
    ...tagStatements(env, row.id, wanted, { sql: "EXISTS(SELECT 1 FROM images WHERE id=? AND status<>'trash')", values: [row.id] },
      new Map([...categories].filter(([label]) => added.includes(label))))]);
  return { ...(await viewOf(env, row.id)), proposed_tags: added, tag_conflicts: conflicts };
}
