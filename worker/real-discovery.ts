import { body, hash, HttpError, json, type Env } from "./core";

/** Reservations only: this route cannot call a model, approve or publish. */
export async function realDiscovery(request: Request, env: Env): Promise<Response> {
  if (env.ENABLE_REAL_DISCOVERY_PAID !== "true") throw new HttpError(503, "Discovery REAL pagata non abilitata");
  if (request.method !== "POST") throw new HttpError(405, "Metodo non ammesso");
  const data = await body(request);
  if (Object.keys(data).sort().join(",") !== "fingerprint,model,run_id,stage" ||
      typeof data.run_id !== "string" || !/^[\w-]{1,100}$/.test(data.run_id) ||
      typeof data.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(data.fingerprint) ||
      !["strategies", "adaptation", "visual"].includes(String(data.stage)) ||
      typeof data.model !== "string" || !data.model.startsWith("gpt-6.1") || data.model !== env.REAL_DISCOVERY_MODEL)
    throw new HttpError(400, "Prenotazione discovery non valida");
  const [cost, runCap, dayCap, totalCap, maxCalls] = [env.REAL_DISCOVERY_CALL_USD, env.REAL_DISCOVERY_RUN_USD,
    env.REAL_DISCOVERY_DAILY_USD, env.REAL_DISCOVERY_TOTAL_USD, env.REAL_DISCOVERY_MAX_CALLS].map(Number);
  if (![cost, runCap, dayCap, totalCap, maxCalls].every(x => Number.isFinite(x) && x > 0) ||
      cost < .000001 || !Number.isInteger(maxCalls) || maxCalls > 2000)
    throw new HttpError(503, "Configurare modello, stima per chiamata e limiti discovery");
  const run = "real-" + data.run_id;
  const uid = "real-" + await hash([data.run_id, data.stage, data.model, data.fingerprint].join("\0"));
  const prior = await env.DB.prepare("SELECT reserved_usd FROM editorial_usage WHERE id=?").bind(uid).first<{ reserved_usd: number }>();
  if (prior) return json({ reserved_usd: prior.reserved_usd, already_reserved: true });
  const now = new Date().toISOString(), day = now.slice(0, 10);
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO editorial_usage
    SELECT ?,?,?,'evaluation',?,? WHERE
    round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage),0)+?,6)<=? AND
    round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage WHERE run_id=?),0)+?,6)<=? AND
    round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage WHERE day=?),0)+?,6)<=? AND
    (SELECT count(*) FROM editorial_usage WHERE run_id=?)<?`)
    .bind(uid, run, day, cost, now, cost, totalCap, run, cost, runCap, day, cost, dayCap, run, maxCalls).run();
  if (!result.meta.changes) {
    const raced = await env.DB.prepare("SELECT reserved_usd FROM editorial_usage WHERE id=?").bind(uid).first<{ reserved_usd: number }>();
    if (raced) return json({ reserved_usd: raced.reserved_usd, already_reserved: true });
    throw new HttpError(409, "Budget discovery o limite chiamate raggiunto");
  }
  return json({ reserved_usd: cost, already_reserved: false }, 201);
}
