/** Image analysis by the vision model: tags and caption (docs/libreria-immagini.v1.2.0.md, phase 2).
 * v1.0.0, 2026-11-09T19:30:00Z. Paid: the owner confirms the configured cost, the call is reserved against the total
 * cap before it is sent, and an uncertain outcome is never resent automatically. Same instructions for REAL and SLOP:
 * the model is never told the origin, so the style of the caption cannot become a clue. */
import { HttpError, id, type Env } from "./core";
import { find, resolveAliases, tagsOf, tagStatements, viewOf, type Row } from "./library.v1.0.0";
import { checkTag, suggestTag } from "../shared/tags.v2.0.0";

const VOCABULARY = 300, MAX_TAGS = 40, TIMEOUT_MS = 60_000, STALE_MS = 10 * 60_000;
interface Config { enabled: boolean; model: string; callUsd: number; totalUsd: number; reason: string }
function config(env: Env): Config {
  const callUsd = Number(env.ANALYSIS_CALL_USD), totalUsd = Number(env.ANALYSIS_TOTAL_USD), model = env.ANALYSIS_MODEL || "";
  const reason = env.ANALYSIS_ENABLED !== "true" ? "Analisi non attivata" : !env.OPENAI_API_KEY ? "Chiave OpenAI mancante"
    : !model ? "Modello non configurato" : !(callUsd > 0) || !(totalUsd > 0) ? "Costo per analisi o tetto di spesa non configurati" : "";
  return { enabled: !reason, model, callUsd, totalUsd, reason };
}
async function spent(env: Env): Promise<number> {
  return (await env.DB.prepare("SELECT coalesce(sum(reserved_usd),0) AS usd FROM spend WHERE status<>'failed'").first<{ usd: number }>())?.usd || 0;
}
export async function analysisStatus(env: Env) {
  const c = config(env), used = await spent(env);
  return { enabled: c.enabled, reason: c.reason, model: c.model, call_usd: c.callUsd || 0, total_usd: c.totalUsd || 0,
    spent_usd: Math.round(used * 1e6) / 1e6, remaining_usd: Math.max(0, Math.round(((c.totalUsd || 0) - used) * 1e6) / 1e6),
    note: "Importi riservati per chiamata secondo la configurazione: stime prudenziali, non fatturazione verificata." };
}

const INSTRUCTIONS = `You describe one image for a photo library.
Return JSON only, matching the schema.
tags: 5 to 15 short tags for what the image shows: subjects, objects, actions, setting, period, place.
- lowercase ASCII letters and digits, words joined by single hyphens, no spaces, no accents or diacritics;
- common nouns in English ("riot", "police-car"); proper nouns in their original language, transliterated to ASCII ("place-de-la-republique", "munchen");
- prefer a tag from the existing vocabulary when it fits; create a new one only when none does;
- never use tags about how the image was made or whether it is authentic (no "photo", "ai", "generated", "real", "fake", "render").
caption: one or two sentences in Italian, at most 160 characters, like the text that accompanies a picture in a news post or on social media:
place and date or period when plausible from the context, then what is happening. No authors, agencies, sources, licences, URLs or archive names;
never words such as "foto", "immagine", "generata", "IA". Do not invent names of people: use only names given in the context.`;
const FORMAT = { type: "json_schema", name: "image_analysis", strict: true, schema: {
  type: "object", additionalProperties: false, required: ["tags", "caption"], properties: {
    tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 15 },
    caption: { type: "string" },
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
/** Model tags made conforming (ASCII form, refused words dropped), then resolved through aliases. */
async function cleanTags(env: Env, raw: unknown[]): Promise<string[]> {
  const out = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const candidate = checkTag(item).ok ? item.trim() : suggestTag(item);
    const checked = checkTag(candidate);
    if (checked.ok) out.add(checked.tag);
  }
  return resolveAliases(env, [...out]);
}

export async function analyze(env: Env, row: Row, data: Record<string, unknown>) {
  const c = config(env);
  if (!c.enabled) throw new HttpError(503, c.reason);
  if (Object.keys(data).some(key => key !== "confirm_usd") || data.confirm_usd !== c.callUsd)
    throw new HttpError(400, `Conferma il costo dell'analisi: ${c.callUsd} $`);
  if (row.status !== "new") throw new HttpError(409, "Si analizzano solo immagini nuove");
  if (!row.copy_key) throw new HttpError(409, "Prepara prima la copia di gioco: il modello analizza ciò che vedrà il giocatore");
  // A «running» mark older than STALE_MS belongs to a Worker that died mid-call: its reservation stays counted.
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  if (row.analysis_status === "running" && row.updated_at > staleBefore) throw new HttpError(409, "Analisi già in corso");
  const copy = await env.QUARANTINE?.get(row.copy_key);
  if (!copy) throw new HttpError(409, "Copia di gioco non disponibile");
  const image = await copy.arrayBuffer();
  const spendId = id(), stamp = new Date().toISOString();
  // Reservation against the total cap and the «running» mark are one atomic write: no call without both.
  const reserved = await env.DB.batch([
    env.DB.prepare(`INSERT INTO spend(id,kind,model,reserved_usd,status,created_at,updated_at)
      SELECT ?,'analysis',?,?,'reserved',?,? WHERE (SELECT coalesce(sum(reserved_usd),0) FROM spend WHERE status<>'failed')+?<=?+1e-9`)
      .bind(spendId, c.model, c.callUsd, stamp, stamp, c.callUsd, c.totalUsd),
    env.DB.prepare(`UPDATE images SET analysis_status='running',analysis_error='',updated_at=? WHERE id=? AND status='new'
      AND (analysis_status<>'running' OR updated_at<=?) AND EXISTS(SELECT 1 FROM spend WHERE id=?)`).bind(stamp, row.id, staleBefore, spendId),
  ]);
  if (!reserved[0].meta.changes) throw new HttpError(409, "Tetto di spesa raggiunto: nessuna chiamata inviata");
  if (!reserved[1].meta.changes) {
    await env.DB.prepare("UPDATE spend SET status='failed',updated_at=? WHERE id=?").bind(new Date().toISOString(), spendId).run();
    throw new HttpError(409, "Immagine cambiata o già in analisi: nessuna chiamata inviata");
  }
  const vocabulary = (await env.DB.prepare(`SELECT t.label FROM tags t JOIN image_tags it ON it.tag_id=t.id GROUP BY t.id
    ORDER BY count(*) DESC,t.label LIMIT ?`).bind(VOCABULARY).all<{ label: string }>()).results.map(r => r.label);
  const context = [row.title && "Title: " + row.title, row.description && "Description: " + row.description,
    row.prompt && "Description: " + row.prompt].filter(Boolean).join("\n");
  const settle = async (spend: "completed" | "uncertain" | "failed", analysis: "done" | "uncertain" | "failed", error = "", tokens?: { input?: number; output?: number }) => {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE spend SET status=?,input_tokens=?,output_tokens=?,updated_at=? WHERE id=?")
        .bind(spend, tokens?.input ?? null, tokens?.output ?? null, now, spendId),
      env.DB.prepare("UPDATE images SET analysis_status=?,analysis_error=?,analyzed_at=?,revision=revision+1,updated_at=? WHERE id=?")
        .bind(analysis, error.slice(0, 300), now, now, row.id),
    ]);
  };
  let response: Response;
  try {
    response = await fetch((env.OPENAI_BASE_URL || "https://api.openai.com/v1/") + "responses", {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: c.model, instructions: INSTRUCTIONS, text: { format: FORMAT }, input: [{ role: "user", content: [
        { type: "input_text", text: `Existing vocabulary: ${vocabulary.join(", ") || "(empty)"}\n${context || "No context."}` },
        { type: "input_image", image_url: "data:image/webp;base64," + base64(image) },
      ] }] }),
    });
  } catch {
    // Sent or not, we cannot know: counted as spent, never resent automatically.
    await settle("uncertain", "uncertain", "Esito incerto: la chiamata potrebbe essere stata addebitata. Non è stata ripetuta.");
    throw new HttpError(502, "Esito incerto dell'analisi: non ripetuta automaticamente");
  }
  if (!response.ok) {
    const failed = response.status >= 400 && response.status < 500;
    await settle(failed ? "failed" : "uncertain", failed ? "failed" : "uncertain", `Il modello ha risposto ${response.status}` +
      (failed ? ": nessun addebito previsto." : ": esito incerto, la chiamata potrebbe essere stata addebitata. Non è stata ripetuta."));
    throw new HttpError(502, `Analisi non riuscita (HTTP ${response.status})`);
  }
  let result: { tags?: unknown; caption?: unknown }, usage: { input_tokens?: number; output_tokens?: number } = {};
  try {
    const payload = await response.json() as Record<string, unknown>;
    usage = (payload.usage || {}) as typeof usage;
    result = JSON.parse(outputText(payload)) as typeof result;
  } catch {
    await settle("completed", "failed", "Risposta del modello non leggibile");
    throw new HttpError(502, "Risposta del modello non leggibile");
  }
  const tokens = { input: usage.input_tokens, output: usage.output_tokens };
  const proposed = await cleanTags(env, Array.isArray(result.tags) ? result.tags : []);
  const caption = typeof result.caption === "string" ? result.caption.replace(/\s+/g, " ").trim().slice(0, 160) : "";
  // The model only adds: tags the owner already chose stay, and a caption the owner wrote is never replaced.
  const current = await find(env, row.id);
  const existing = (await tagsOf(env, [row.id])).get(row.id) || [];
  const wanted = [...new Set([...existing, ...proposed])].slice(0, MAX_TAGS);
  await env.DB.batch([
    env.DB.prepare("UPDATE images SET caption=CASE WHEN caption='' THEN ? ELSE caption END,updated_at=? WHERE id=? AND status='new'")
      .bind(caption, new Date().toISOString(), row.id),
    ...tagStatements(env, row.id, wanted, { sql: "EXISTS(SELECT 1 FROM images WHERE id=? AND status='new')", values: [current.id] }),
  ]);
  await settle("completed", "done", "", tokens);
  return { ...(await viewOf(env, row.id)), proposed_tags: proposed, proposed_caption: caption };
}
