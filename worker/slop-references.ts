/** Catalogue counts used by SLOP generation and statistics. */
import { type Env } from "./core";

/** Catalogue counts for the dashboard and statistics. */
export async function catalogCounts(env: Env) {
  const row = await env.DB.prepare(`SELECT
    coalesce(sum(origin='REAL' AND status IN ('approved','published')),0) AS real,
    coalesce(sum(origin='SLOP' AND status IN ('approved','published')),0) AS slop,
    coalesce(sum(origin='SLOP' AND status='new'),0) AS pending
    FROM images`).first<{ real: number; slop: number; pending: number }>();
  return row || { real: 0, slop: 0, pending: 0 };
}
