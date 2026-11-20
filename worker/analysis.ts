/** Confirmed analysis of the whole REAL: its original, never the 4:5 crop (decisions of the owner of 2026-11-15). It returns the
 * editorial description; tags were retired on 2026-11-20 and SLOP are no longer analysed (owner decision).
 * Contexts never mention synthetic images. Claims and uncertain results prevent automatic paid retries. */
import { descriptionSchema, realDescription } from "../shared/editorial";
import { HttpError, id, type Env } from "./core";
import { viewOf, type Row } from "./library";
import { chosenModel } from "./models";
import { imageMime } from "../shared/image-format";
import { IMAGE_MARK, jsonWithImage } from "./image-body";
import { currentContext } from "./model-context";

const TIMEOUT_MS = 60_000, STALE_MS = 10 * 60_000;
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
const OUTPUT = "Rispondi solo con JSON conforme allo schema. real_description: visible descrive solo elementi osservabili, " +
  "documented_context solo fatti documentati nel titolo e contesto Commons forniti; uncertainties segnala lacune o dettagli incerti. " +
  "Testo neutro, senza giudizi di autenticità; non inventare contesto.";
const FORMAT = { type: "json_schema", name: "image_analysis", strict: true, schema: {
  type: "object", additionalProperties: false, required: ["real_description"], properties: { real_description: descriptionSchema } } };

function outputText(value: Record<string, unknown>): string {
  const outputs = Array.isArray(value.output) ? value.output as Array<{ content?: Array<{ type?: string; text?: string }> }> : [];
  return outputs.flatMap(o => o.content || []).filter(c => c.type === "output_text" && typeof c.text === "string").map(c => c.text!).join("");
}

type Usage = { input_tokens?: number; output_tokens?: number };
type Outcome = { kind: "ok"; result: { real_description?: unknown }; usage: Usage } | { kind: "uncertain" | "failed" | "unreadable"; message: string; usage?: Usage };

const contextOf = (row: Row) => [row.title && "Title: " + row.title, row.description && "Description: " + row.description,
  row.commons_description && "Original Commons context: " + row.commons_description].filter(Boolean).join("\n");

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
    return { kind: "ok", result: JSON.parse(outputText(payload)) as { real_description?: unknown }, usage };
  } catch {
    return { kind: "unreadable", message: "Risposta del modello non leggibile", usage };
  }
}
async function recordCall(env: Env, model: string, row: Row) {
  const callId = id(), stamp = new Date().toISOString();
  await env.DB.prepare("INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at,image_id) VALUES(?,'analysis',?,'pending',?,?,?)")
    .bind(callId, model, stamp, stamp, row.id).run();
  return { callId, update: (call: "completed" | "uncertain" | "failed", usage?: Usage) =>
    env.DB.prepare("UPDATE paid_calls SET status=?,input_tokens=?,output_tokens=?,updated_at=? WHERE id=?")
      .bind(call, usage?.input_tokens ?? null, usage?.output_tokens ?? null, new Date().toISOString(), callId) };
}
interface Picture { bytes: ArrayBuffer; mime: string }
/** What the model sees: the whole original, so that the description covers the full picture and not the crop the player sees
 * (owner decisions of 2026-11-15). Pixels only: the model never reads file metadata. Read before any call. */
async function analysisImage(env: Env, row: Row): Promise<Picture> {
  const original = await env.QUARANTINE?.get(row.original_key);
  if (!original) throw new HttpError(409, "Originale non disponibile");
  const bytes = await original.arrayBuffer(), mime = imageMime(new Uint8Array(bytes));
  if (!mime) throw new HttpError(409, "Formato dell'originale non leggibile dal modello");
  return { bytes, mime };
}

export async function analyze(env: Env, row: Row, data: Record<string, unknown>) {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  if (Object.keys(data).some(k => !["confirm", "refresh_description", "repeat_uncertain", "reanalyze"].includes(k)) || data.confirm !== true ||
    (data.refresh_description !== undefined && data.refresh_description !== true) ||
    (data.repeat_uncertain !== undefined && data.repeat_uncertain !== true) ||
    (data.reanalyze !== undefined && (data.reanalyze !== true || data.refresh_description !== undefined)))
    throw new HttpError(400, "Conferma la chiamata a pagamento");
  if (row.origin !== "REAL") throw new HttpError(409, "Si analizzano solo le REAL: le SLOP non hanno tag né descrizione editoriale");
  const refresh = data.refresh_description === true && !row.real_description;
  const reanalyze = data.reanalyze === true;
  const model = await chosenModel(env, "text_model");
  if (row.status === "trash" || (row.status !== "new" && !(reanalyze && row.status === "approved") && !refresh))
    throw new HttpError(409, reanalyze ? "Dal dettaglio si analizzano foto nuove o approvate" : "Si analizzano solo immagini nuove");
  if (row.analysis_status === "done" && !refresh && !reanalyze)
    throw new HttpError(409, "Descrizione già generata per questa foto: per rifare l’analisi conferma dal dettaglio della foto");
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
  const instructions = baseContext.body + "\n\n" + taskContext.body + "\n\n" + OUTPUT;
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
  const text = contextOf(row) || "No context.";
  // The register keeps the outcome and the tokens reported.
  const settle = async (status: "completed" | "uncertain" | "failed", analysis: "done" | "uncertain" | "failed", error = "", usage?: Usage) => {
    const now = new Date().toISOString();
    await env.DB.batch([call.update(status, usage),
      env.DB.prepare("UPDATE images SET analysis_status=?,analysis_error=?,analyzed_at=?,revision=revision+1,updated_at=? WHERE id=?")
        .bind(analysis, error.slice(0, 300), now, now, row.id)]);
  };
  const outcome = await send(env, model, instructions, FORMAT, text, image);
  if (outcome.kind !== "ok") {
    const status = outcome.kind === "unreadable" ? "completed" : outcome.kind;
    await settle(status, outcome.kind === "uncertain" ? "uncertain" : "failed", outcome.message, outcome.usage);
    throw new HttpError(502, outcome.kind === "uncertain" ? "Esito incerto dell'analisi: non ripetuta automaticamente" : outcome.message);
  }
  const description = realDescription(outcome.result.real_description);
  if (!description) {
    await settle("completed", "failed", "Descrizione editoriale non valida", outcome.usage);
    throw new HttpError(502, "Descrizione editoriale non valida: nessun testo salvato");
  }
  const saved = JSON.stringify(description);
  await env.DB.batch([
    env.DB.prepare(`UPDATE images SET analysis_base_context=?,analysis_task_context=?,real_description=?,real_description_provenance=?,
      analysis_status='done',analysis_error='',analyzed_at=?,revision=revision+1,updated_at=? WHERE id=? AND analysis_status='running'`)
      .bind(baseContext.id, taskContext.id, saved,
        JSON.stringify({model, image: "original", original_sha256: row.original_sha256, revision: row.revision, at: stamp, generated: description}),
        stamp, new Date().toISOString(), row.id),
    call.update("completed", outcome.usage),
  ]);
  return viewOf(env, row.id);
}
