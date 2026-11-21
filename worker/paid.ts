/** One recorded request, never retried. The caller persists a claim before invoking this helper. */
import { HttpError, id, type Env } from "./core";
export class PaidError extends HttpError {
  constructor(message: string, public outcome: "failed" | "uncertain") { super(502, message); }
}
export async function paid(env: Env, kind: "analysis" | "prompts" | "images" | "evaluation", model: string, body: unknown,
  links: { process?: string; attempt?: string; image?: string; request?: string } = {}): Promise<Record<string, unknown>> {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  const callId = links.request ?? id(), stamp = new Date().toISOString();
  const claim = await env.DB.prepare(`INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at,process_id,attempt_id,image_id)
    VALUES(?,?,?,'pending',?,?,?,?,?) ON CONFLICT(id) DO NOTHING`).bind(callId, kind, model, stamp, stamp, links.process ?? null, links.attempt ?? null, links.image ?? null).run();
  if (!claim.meta.changes) throw new HttpError(409, "Richiesta già registrata: nessuna chiamata ripetuta");
  const settle = (status: string, usage: { input_tokens?: number; output_tokens?: number } = {}) =>
    env.DB.prepare("UPDATE paid_calls SET status=?,input_tokens=?,output_tokens=?,updated_at=? WHERE id=?")
      .bind(status, usage.input_tokens ?? null, usage.output_tokens ?? null, new Date().toISOString(), callId).run();
  let response: Response;
  try {
    response = await fetch((env.OPENAI_BASE_URL || "https://api.openai.com/v1/") + (kind === "images" ? "images/generations" : "responses"), {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(120_000),
      // A body already encoded (an image inside, see image-body.ts) goes as it is.
      headers: { Authorization: "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" }, body: body instanceof Uint8Array ? body : JSON.stringify(body),
    });
  } catch {
    await settle("uncertain");
    throw new PaidError("Esito incerto: la chiamata potrebbe essere stata addebitata. Non è stata ripetuta", "uncertain");
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: { code?: string; type?: string } };
    const code = detail.error?.code || detail.error?.type || "";
    const outcome = response.status >= 400 && response.status < 500 ? "failed" : "uncertain";
    await settle(outcome);
    throw new PaidError(response.status === 401 || response.status === 403 || response.status === 429
      ? "OpenAI: chiave, credito o limite di richieste. Controlla platform.openai.com"
      : /moderation|safety|content_policy/.test(code) ? "Il generatore ha rifiutato il prompt per le sue regole d'uso"
        : outcome === "uncertain" ? "Esito incerto del modello: non ripetuto automaticamente" : `Il modello ha rifiutato la richiesta (${response.status})`, outcome);
  }
  let payload: Record<string, unknown>;
  try { payload = await response.json() as Record<string, unknown>; }
  catch { await settle("uncertain"); throw new PaidError("Risposta interrotta: esito incerto, non ripetuto", "uncertain"); }
  await settle("completed", (payload.usage || {}) as { input_tokens?: number; output_tokens?: number });
  return payload;
}
export function responseJson(payload: Record<string, unknown>): unknown {
  const output = payload.output as { content?: { type?: string; text?: string }[] }[] | undefined;
  try { return JSON.parse((output || []).flatMap(o => o.content || []).filter(c => c.type === "output_text").map(c => c.text || "").join("")); }
  catch { throw new HttpError(502, "Risposta del modello non leggibile"); }
}
