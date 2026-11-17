/** Independent SLOP catalogue and anonymous editorial inputs. */
import { HttpError, type Env } from "./core";
import { acceptProcess, attention, batchRoute, closeProcess } from "./slop-generation";
import { autoRoute, guardBatch } from "./slop-auto";
import { MAX_BATCH } from "../shared/slop-proposals";
import { realRows, catalogCounts } from "./slop-references";

/** Independent SLOP catalogue and anonymous editorial inputs. */
async function state(env: Env) {
  const [counts, all] = [await catalogCounts(env), await realRows(env)];
  const slop = await env.DB.prepare("SELECT count(*) AS n FROM images WHERE origin='SLOP' AND status IN ('approved','published')").first<{ n: number }>();
  return { thresholds: { section: 1, max_batch: MAX_BATCH },
    real_total: counts.real, slop_total: slop?.n || 0,
    waiting: all.filter(r => r.available).map(r => ({ id: r.id, title: r.title, tags: r.tags, measured: r.measured, described: r.described, file: `/api/admin/library/${r.id}/file` })),
    attention: await attention(env) };
}

export async function slopRoute(env: Env, method: string, path: string, data: Record<string, unknown>) {
  if (path === "state" && method === "GET") return state(env);
  if (path === "attention" && method === "GET") return {attention: await attention(env)};
  const closing = /^processes\/([\w-]{1,64})\/close$/.exec(path);
  if (closing && method === "POST") return closeProcess(env, closing[1], data);
  const accepting = /^processes\/([\w-]{1,64})\/accept$/.exec(path);
  if (accepting && method === "POST") return acceptProcess(env, accepting[1], data);
  if (path === "auto" || path.startsWith("auto/")) return autoRoute(env, method, path.slice("auto".length).replace(/^\//, ""), data);
  if (path === "batches" || path.startsWith("batches/")) {
    const rest = path.slice("batches".length).replace(/^\//, "");
    await guardBatch(env, method, rest, data);
    const result = await batchRoute(env, method, rest, data);
    return result;
  }
  throw new HttpError(404, "API dello studio SLOP inesistente");
}

