/** Settings of the dashboard besides the models (docs/statistiche-impostazioni.v1.0.0.md, section 2). v1.1.0, 2026-11-12T21:00:00Z:
 * automatic SLOP proposals on (1) or off (0) and their threshold in percent of spread (docs/proposta-generazione-slop.v2.0.0.md,
 * section 8; migration 0045). v1.0.0, 2026-11-12T11:00:00Z.
 * Owner decision of 2026-11-12: Settings hold only commands. Here: the thresholds of the SLOP studio (REAL needed to open it and
 * per theme) and the longest time a game counts as open (it holds withdrawn copies). Stored in «app_settings» (migration 0044);
 * a missing row is the default. The default image quality lives with the model selectors (worker/models.v1.1.0.ts). */
import { HttpError, type Env } from "./core";
import { SECTION_MIN_REAL, THEME_MIN_REAL } from "../shared/slot-extraction.v1.0.0";
import { AUTO_DEFAULT_THRESHOLD } from "../shared/slop-auto.v1.0.0";

export const LIMITS = {
  slop_section_min_real: { min: 1, max: 1000, default: SECTION_MIN_REAL },
  slop_theme_min_real: { min: 1, max: 200, default: THEME_MIN_REAL },
  open_game_hours: { min: 1, max: 168, default: 24 },
  slop_auto_enabled: { min: 0, max: 1, default: 1 },
  slop_auto_threshold_percent: { min: 1, max: 100, default: AUTO_DEFAULT_THRESHOLD },
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

/** GET /settings; PUT /settings {slop_section_min_real?, slop_theme_min_real?, open_game_hours?, slop_auto_enabled?, slop_auto_threshold_percent?}. */
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
