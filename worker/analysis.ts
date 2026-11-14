/** Paid analysis of an image (spec `libreria-immagini`, section 5): the chosen text model sees the game copy, title and
 * description (REAL) or prompt (SLOP) and the 300 most used tags by category, never the origin; it returns 5 to 15 tags by
 * category, which replace those of the image. Once per image, explicit confirmation, register of calls, uncertain outcomes never
 * resent; a «running» mark older than 10 minutes no longer blocks. */
import { HttpError, id, type Env } from "./core";
import { categoriesOf, tagStatements, viewOf, type Row } from "./library";
import { chosenModel } from "./models";
import { CATEGORIES, categoryError, isDecade, SINGLE, type Category } from "../shared/tag-categories";
import { checkTag, suggestTag } from "../shared/tags";
import { currentContext } from "./model-context";

const VOCABULARY = 300, MAX_TAGS = 40, TIMEOUT_MS = 60_000, STALE_MS = 10 * 60_000, MAX_OUTPUT_TOKENS = 2000;

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

/** The editable context (base and analysis parts) comes first; this technical line stays in the code. */
const OUTPUT = "Rispondi solo con JSON conforme allo schema: «tags» con un elenco per categoria (time: un decennio come «1970s», al massimo uno; format: al massimo uno; place; setting; event; people; object; other).";
const FORMAT = { type: "json_schema", name: "image_analysis", strict: true, schema: {
  type: "object", additionalProperties: false, required: ["tags"], properties: {
    tags: { type: "object", additionalProperties: false, required: [...CATEGORIES], properties: Object.fromEntries(CATEGORIES.map(c =>
      [c, { type: "array", items: { type: "string" }, maxItems: SINGLE.includes(c) ? 1 : 15 }])) },
  } } };

function outputText(value: Record<string, unknown>): string {
  const outputs = Array.isArray(value.output) ? value.output as Array<{ content?: Array<{ type?: string; text?: string }> }> : [];
  return outputs.flatMap(o => o.content || []).filter(c => c.type === "output_text" && typeof c.text === "string").map(c => c.text!).join("");
}
function base64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes); let binary = "";
  for (let i = 0; i < view.length; i += 8192) binary += String.fromCharCode(...view.subarray(i, i + 8192));
  return btoa(binary);
}
export interface Conflict { label: string; proposed: Category; existing: Category }
/** Model tags made conforming (ASCII form, refused words dropped), resolved through aliases and categorised. A decade is
 * always Time; Time accepts only decades. An existing tag keeps its category: a different proposal is a conflict. Only
 * the first Time and the first Format tag are kept. A plain list (older answers, tests) counts as «other». */
async function cleanTags(env: Env, raw: unknown) {
  const byCategory: Partial<Record<Category, unknown>> = Array.isArray(raw) ? { other: raw } : raw && typeof raw === "object" ? raw as Record<Category, unknown> : {};
  const proposed = new Map<string, Category>();
  for (const category of CATEGORIES) {
    const items = byCategory[category];
    for (const item of Array.isArray(items) ? items : []) {
      if (typeof item !== "string") continue;
      const checked = checkTag(checkTag(item).ok ? item.trim() : suggestTag(item));
      if (!checked.ok || proposed.has(checked.tag)) continue;
      const fitted: Category = isDecade(checked.tag) ? "time" : category;
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

export async function analyze(env: Env, row: Row, data: Record<string, unknown>) {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  if (Object.keys(data).some(key => key !== "confirm") || data.confirm !== true)
    throw new HttpError(400, "Conferma la chiamata a pagamento");
  const model = await chosenModel(env, "text_model");
  if (row.status !== "new") throw new HttpError(409, "Si analizzano solo immagini nuove");
  if (row.analysis_status === "done") throw new HttpError(409, "Tag già generati per questa immagine: modificali o ripristinali, senza nuove chiamate");
  if (!row.copy_key) throw new HttpError(409, "Prepara prima la copia di gioco: il modello analizza ciò che vedrà il giocatore");
  // A «running» mark older than STALE_MS belongs to a Worker that died mid-call: its call stays recorded as pending.
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  if (row.analysis_status === "running" && row.updated_at > staleBefore) throw new HttpError(409, "Analisi già in corso");
  const copy = await env.QUARANTINE?.get(row.copy_key);
  if (!copy) throw new HttpError(409, "Copia di gioco non disponibile");
  const image = await copy.arrayBuffer();
  // Read before the call is recorded: a failure here costs nothing.
  const [baseContext, taskContext] = [await currentContext(env, "base"), await currentContext(env, "analysis")];
  const instructions = baseContext.body + "\n\n" + taskContext.body + "\n\n" + OUTPUT;
  const callId = id(), stamp = new Date().toISOString();
  // The «running» mark comes first: only the request that sets it records and sends the call.
  const marked = await env.DB.prepare(`UPDATE images SET analysis_status='running',analysis_error='',updated_at=? WHERE id=? AND status='new'
    AND analysis_status<>'done' AND (analysis_status<>'running' OR updated_at<=?)`).bind(stamp, row.id, staleBefore).run();
  if (!marked.meta.changes) throw new HttpError(409, "Immagine cambiata o già in analisi: nessuna chiamata inviata");
  await env.DB.prepare("INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at) VALUES(?,'analysis',?,'pending',?,?)")
    .bind(callId, model, stamp, stamp).run();
  const used = (await env.DB.prepare(`SELECT t.label,t.category FROM tags t JOIN image_tags it ON it.tag_id=t.id GROUP BY t.id
    ORDER BY count(*) DESC,t.label LIMIT ?`).bind(VOCABULARY).all<{ label: string; category: Category }>()).results;
  const vocabulary = CATEGORIES.map(c => [c, used.filter(t => t.category === c).map(t => t.label)] as const).filter(([, list]) => list.length)
    .map(([c, list]) => c + ": " + list.join(", "));
  const context = [row.title && "Title: " + row.title, row.description && "Description: " + row.description,
    row.prompt && "Description: " + row.prompt].filter(Boolean).join("\n");
  // The register keeps the outcome and the tokens reported.
  const settle = async (call: "completed" | "uncertain" | "failed", analysis: "done" | "uncertain" | "failed", error = "", tokens?: { input?: number; output?: number }) => {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE paid_calls SET status=?,input_tokens=?,output_tokens=?,updated_at=? WHERE id=?")
        .bind(call, tokens?.input ?? null, tokens?.output ?? null, now, callId),
      env.DB.prepare("UPDATE images SET analysis_status=?,analysis_error=?,analyzed_at=?,revision=revision+1,updated_at=? WHERE id=?")
        .bind(analysis, error.slice(0, 300), now, now, row.id),
    ]);
  };
  let response: Response;
  try {
    response = await fetch((env.OPENAI_BASE_URL || "https://api.openai.com/v1/") + "responses", {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model, instructions, text: { format: FORMAT }, max_output_tokens: MAX_OUTPUT_TOKENS, input: [{ role: "user", content: [
        { type: "input_text", text: `Existing vocabulary by category:\n${vocabulary.join("\n") || "(empty)"}\n${context || "No context."}` },
        { type: "input_image", image_url: "data:image/webp;base64," + base64(image) },
      ] }] }),
    });
  } catch {
    // Sent or not, we cannot know: recorded as uncertain, never resent automatically.
    await settle("uncertain", "uncertain", "Esito incerto: la chiamata potrebbe essere stata addebitata. Non è stata ripetuta.");
    throw new HttpError(502, "Esito incerto dell'analisi: non ripetuta automaticamente");
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
    await settle(failed ? "failed" : "uncertain", failed ? "failed" : "uncertain", message);
    throw new HttpError(502, message);
  }
  let result: { tags?: unknown }, usage: { input_tokens?: number; output_tokens?: number } = {};
  try {
    const payload = await response.json() as Record<string, unknown>;
    usage = (payload.usage || {}) as typeof usage;
    result = JSON.parse(outputText(payload)) as typeof result;
  } catch {
    await settle("completed", "failed", "Risposta del modello non leggibile", { input: usage.input_tokens, output: usage.output_tokens });
    throw new HttpError(502, "Risposta del modello non leggibile");
  }
  const tokens = { input: usage.input_tokens, output: usage.output_tokens };
  const { categories, conflicts } = await cleanTags(env, result.tags);
  const proposed = [...categories.keys()];
  // The generation replaces the tags the owner wrote; the generated ones are kept apart for restoring.
  const wanted = proposed.slice(0, MAX_TAGS);
  await env.DB.batch([
    env.DB.prepare(`UPDATE images SET generated_tags=?,analysis_base_context=?,analysis_task_context=?,updated_at=?
      WHERE id=? AND status='new'`).bind(JSON.stringify(wanted), baseContext.id, taskContext.id, new Date().toISOString(), row.id),
    ...tagStatements(env, row.id, wanted, { sql: "EXISTS(SELECT 1 FROM images WHERE id=? AND status='new')", values: [row.id] }, categories),
  ]);
  await settle("completed", "done", "", tokens);
  return { ...(await viewOf(env, row.id)), proposed_tags: proposed, tag_conflicts: conflicts };
}
