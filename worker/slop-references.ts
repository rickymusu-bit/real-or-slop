/** Catalogue counts and categories used by SLOP generation. */
import { type Env } from "./core";
import type { Tag } from "../shared/slop-proposals";
import type { Category } from "../shared/tag-categories";

/** Catalogue counts for the dashboard and statistics. */
export async function catalogCounts(env: Env) {
  const row = await env.DB.prepare(`SELECT
    coalesce(sum(origin='REAL' AND status IN ('approved','published')),0) AS real,
    coalesce(sum(origin='SLOP' AND status IN ('approved','published')),0) AS slop,
    coalesce(sum(origin='SLOP' AND status='new'),0) AS pending
    FROM images`).first<{ real: number; slop: number; pending: number }>();
  return row || { real: 0, slop: 0, pending: 0 };
}
/** Tags by category, as the text model reads them. */
export const byCategory = (tags: readonly Tag[]) => {
  const out: Partial<Record<Category, string[]>> = {};
  for (const t of tags) (out[t.category] ||= []).push(t.label);
  return out;
};

