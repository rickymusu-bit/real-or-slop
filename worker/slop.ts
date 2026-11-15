/** SLOP studio routes (spec `generazione-slop`): the REAL waiting for a twin, the counts, batches and the automatic batches. */
import { HttpError, type Env } from "./core";
import { batchRoute } from "./slop-generation";
import { autoRoute, guardBatch } from "./slop-auto";
import { MAX_BATCH } from "../shared/twins";
import { realRows, twinCounts } from "./twins";
import { groups } from "./slop-groups";
import { numberSettings } from "./app-settings";

/** GET /slop/state: thresholds, counts, the REAL without a live twin (oldest first) and, for the Database filter, the groups. */
async function state(env: Env) {
  const [settings, counts, all] = [await numberSettings(env), await twinCounts(env), await realRows(env)];
  const slop = await env.DB.prepare("SELECT count(*) AS n FROM images WHERE origin='SLOP' AND status IN ('approved','published')").first<{ n: number }>();
  return { thresholds: { section: settings.slop_section_min_real, max_batch: MAX_BATCH },
    real_total: counts.real, slop_total: slop?.n || 0, twinned: counts.twinned,
    waiting: all.filter(r => !r.twin).map(r => ({ id: r.id, title: r.title, tags: r.tags, measured: r.measured, described: r.described, file: `/api/admin/library/${r.id}/file` })),
    groups: (await groups(env)).map(g => ({ ...g, spread: g.real - g.slop })) };
}

export async function slopRoute(env: Env, method: string, path: string, data: Record<string, unknown>) {
  if (path === "state" && method === "GET") return state(env);
  if (path === "auto" || path.startsWith("auto/")) return autoRoute(env, method, path.slice("auto".length).replace(/^\//, ""), data);
  if (path === "batches" || path.startsWith("batches/")) {
    const rest = path.slice("batches".length).replace(/^\//, "");
    if (rest === "" && method === "POST" && (await twinCounts(env)).real < (await numberSettings(env)).slop_section_min_real)
      throw new HttpError(409, `Servono almeno ${(await numberSettings(env)).slop_section_min_real} REAL approvate o pubblicate`);
    await guardBatch(env, method, rest, data);
    const result = await batchRoute(env, method, rest, data);
    return result;
  }
  throw new HttpError(404, "API dello studio SLOP inesistente");
}
