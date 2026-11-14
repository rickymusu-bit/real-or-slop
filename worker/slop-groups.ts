/** Groups of the SLOP balance read from the library (spec `generazione-slop`, section 2), for the studio, the automatic
 * batches and the statistics. */
import type { Env } from "./core";
import { groupCounts, groupKey, type GroupCount } from "../shared/slop-groups";
import { validMetrics, type Metrics } from "../shared/copy-treatment";

/** Counts per group: a new SLOP not analysed yet counts in the group it was generated for. */
export async function groups(env: Env): Promise<GroupCount[]> {
  const rows = (await env.DB.prepare(`SELECT i.origin,i.status,i.analysis_status,i.generation_group,
    (SELECT t.label FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=i.id AND t.category='genre' LIMIT 1) AS genre,
    (SELECT t.label FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=i.id AND t.category='time' LIMIT 1) AS time
    FROM images i WHERE i.status<>'trash'`).all<{ origin: "REAL" | "SLOP"; status: string; analysis_status: string; generation_group: string | null;
      genre: string | null; time: string | null }>()).results;
  return groupCounts(rows.map(r => ({ origin: r.origin, status: r.status,
    group: r.genre && r.time ? groupKey(r.genre, r.time) : r.origin === "SLOP" && r.status === "new" && r.analysis_status !== "done" ? r.generation_group : null })));
}


const MEASURES = ["long", "noise", "sharpness", "contrast", "saturation"] as const;
type Measure = typeof MEASURES[number];
/** Mean measures of the published copies of REAL and SLOP, for the groups that have published SLOP; a warning when a mean of the
 * SLOP differs from the REAL one by more than 25%. */
export async function groupMeasures(env: Env) {
  const rows = (await env.DB.prepare(`SELECT i.origin,i.copy_metrics,
    (SELECT t.label FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=i.id AND t.category='genre' LIMIT 1) AS genre,
    (SELECT t.label FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=i.id AND t.category='time' LIMIT 1) AS time
    FROM images i WHERE i.status='published' AND i.copy_metrics IS NOT NULL`).all<{ origin: "REAL" | "SLOP"; copy_metrics: string; genre: string | null; time: string | null }>()).results;
  const byGroup = new Map<string, { REAL: Metrics[]; SLOP: Metrics[] }>();
  for (const row of rows) {
    if (!row.genre || !row.time) continue;
    let metrics: Metrics | null = null;
    try { metrics = validMetrics(JSON.parse(row.copy_metrics)); } catch { /* unreadable */ }
    if (!metrics) continue;
    const key = groupKey(row.genre, row.time), entry = byGroup.get(key) || { REAL: [], SLOP: [] };
    entry[row.origin].push(metrics); byGroup.set(key, entry);
  }
  const mean = (list: Metrics[], m: Measure) => list.length ? Math.round(list.reduce((n, x) => n + x[m], 0) / list.length * 100) / 100 : null;
  return [...byGroup].filter(([, e]) => e.SLOP.length && e.REAL.length).sort(([a], [b]) => a.localeCompare(b)).map(([group, e]) => {
    const real = Object.fromEntries(MEASURES.map(m => [m, mean(e.REAL, m)])) as Record<Measure, number | null>;
    const slop = Object.fromEntries(MEASURES.map(m => [m, mean(e.SLOP, m)])) as Record<Measure, number | null>;
    const diverging = MEASURES.filter(m => real[m] !== null && slop[m] !== null && Math.abs(slop[m]! - real[m]!) > 0.25 * Math.max(Math.abs(real[m]!), 1e-6));
    return { group, real_count: e.REAL.length, slop_count: e.SLOP.length, real, slop, diverging };
  });
}
