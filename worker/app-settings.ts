/** Numeric settings of the dashboard: SLOP proposals, attempt limits, tolerance, hours of an open game and REAL whose Commons source
 * is checked each night (0 pauses the check).
 * A missing row is the default of the code (spec `statistiche-impostazioni`, section 2). */
import { HttpError, type Env } from "./core";

export const LIMITS = {
  max_generation_attempts: { min: 1, max: 5, default: 3 },
  editorial_tolerance: { min: 0, max: 2, default: 1 },
  open_game_hours: { min: 1, max: 168, default: 24 },
  commons_checks_per_night: { min: 0, max: 500, default: 50 },
} as const;
export type NumberSetting = keyof typeof LIMITS;
const KEYS = Object.keys(LIMITS) as NumberSetting[];

export async function numberSettings(env: Env): Promise<Record<NumberSetting, number>> {
  const rows = (await env.DB.prepare("SELECT key,value FROM app_settings WHERE key IN (SELECT value FROM json_each(?))").bind(JSON.stringify(KEYS))
    .all<{ key: NumberSetting; value: string }>()).results;
  const out = Object.fromEntries(KEYS.map(k => [k, LIMITS[k].default])) as Record<NumberSetting, number>;
  for (const row of rows) {
    const n = Number(row.value), limit = LIMITS[row.key];
    if (limit && Number.isInteger(n) && n >= limit.min && n <= limit.max) out[row.key] = n;
  }
  return out;
}
export async function numberSetting(env: Env, key: NumberSetting) { return (await numberSettings(env))[key]; }

/** GET /settings; PUT /settings accepts only keys in LIMITS. */
export async function settingsRoute(env: Env, method: string, data: Record<string, unknown>) {
  const view = async () => ({ values: await numberSettings(env), limits: LIMITS });
  if (method === "GET") return view();
  if (method !== "PUT") throw new HttpError(405, "Metodo non consentito");
  const keys = Object.keys(data);
  if (!keys.length || keys.some(k => !(KEYS as string[]).includes(k))) throw new HttpError(400, "Campi non previsti");
  const stamp = new Date().toISOString(), writes = [];
  for (const key of keys as NumberSetting[]) {
    const value = data[key], limit = LIMITS[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < limit.min || value > limit.max)
      throw new HttpError(400, `Valore da ${limit.min} a ${limit.max}`);
    writes.push(env.DB.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .bind(key, String(value), stamp));
  }
  await env.DB.batch(writes);
  return view();
}

