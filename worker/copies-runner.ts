/** «Rifai la copia di gioco» for a selection, on Cloudflare (owner decision of 2026-11-15: the browser is only an interface): a
 * Workflow remakes each copy in its own step (worker/copy-maker.ts), with the stored 4:5 crop or, for a copy of an earlier format,
 * the centred one. A published image is withdrawn first (the owner reviews the frame and publishes again). Free: no paid call. */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { HttpError, type Env } from "./core";
import { find, storeCopy, transition } from "./library";

export interface CopiesParams { ids: string[] }
const STEP = { retries: { limit: 1, delay: "5 seconds" as const }, timeout: "5 minutes" as const };

export async function startCopies(env: Env, ids: string[]) {
  if (!env.COPIES) throw new HttpError(503, "Esecuzione sul server non configurata");
  const job = `copies-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  await env.COPIES.create({ id: job, params: { ids } });
  return { job, count: ids.length };
}
/** State of a job for the dashboard: running, complete (with the outcome per image) or errored. */
export async function copiesStatus(env: Env, job: string) {
  if (!env.COPIES) throw new HttpError(503, "Esecuzione sul server non configurata");
  if (!/^copies-[\w-]{1,80}$/.test(job)) throw new HttpError(404, "Lavoro inesistente");
  const status = await (await env.COPIES.get(job)).status();
  return { job, status: status.status, output: status.output ?? null, error: status.error?.message ?? null };
}

export class CopiesWorkflow extends WorkflowEntrypoint<Env, CopiesParams> {
  async run(event: Readonly<WorkflowEvent<CopiesParams>>, step: WorkflowStep) {
    const env = this.env, done: string[] = [], failed: { id: string; error: string }[] = [];
    for (const id of event.payload.ids) {
      const result = await step.do(`copy-${id}`, STEP, async () => {
        try {
          let row = await find(env, id);
          if (row.status === "trash") return { ok: false, error: "nel cestino" };
          if (row.status === "published") { await transition(env, row, "withdraw", {}); row = await find(env, id); }
          await storeCopy(env, row, { force: true });
          return { ok: true, error: "" };
        } catch (error) { return { ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 200) }; }
      });
      if (result.ok) done.push(id); else failed.push({ id, error: result.error });
    }
    return { done: done.length, failed };
  }
}
