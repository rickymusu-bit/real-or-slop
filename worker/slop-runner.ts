/** The SLOP loop on Cloudflare (spec `generazione-slop`, section 6): a Workflow writes the briefs and runs the attempts (generation
 * and evaluation) one REAL at a time, then analyses the tags of an accepted SLOP. The browser only starts it, after the owner's
 * confirmation of the maximum, and follows it: closing the dashboard or a phone that changes app no longer stops anything.
 * Every paid step keeps its own claim (writePrompts, generateImage, analyze): a step that Cloudflare runs again after an
 * interruption finds the claim and sends nothing, so no paid call is ever repeated; such a step ends uncertain, as before. */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { HttpError, type Env } from "./core";
import { generateImage, writePrompts } from "./slop-generation";
import { analyze } from "./analysis";
import { find } from "./library";

export type Phase = "briefs" | "images" | "all";
export interface RunParams { batchId: string; phase: Phase }
/** A runner silent for longer than this is considered dead: the batch can be resumed (one step lasts at most a few minutes). */
export const RUNNER_STALE_MS = 15 * 60_000;
const now = () => new Date().toISOString();
/** Paid steps are never retried by Cloudflare: an error ends that REAL, the others go on. */
const ONCE = { retries: { limit: 0, delay: "1 second" as const }, timeout: "10 minutes" as const };

interface Outcome { ok: boolean; error?: string; account?: boolean; id?: string | null; state?: string }
async function attempt(work: () => Promise<Partial<Outcome>>): Promise<Outcome> {
  try { return { ok: true, ...(await work()) }; }
  catch (error) { const text = error instanceof Error ? error.message : String(error); return { ok: false, error: text.slice(0, 300), account: /OpenAI:/.test(text) }; }
}

/** Starts the runner of a batch, unless one is alive. The claim on the batch row comes first: two clicks start one runner. */
export async function startRun(env: Env, batchId: string, phase: Phase) {
  if (!env.SLOP_RUNNER) throw new HttpError(503, "Esecuzione sul server non configurata");
  const runner = `${batchId}-${phase}-${Date.now()}`, stamp = now(), stale = new Date(Date.now() - RUNNER_STALE_MS).toISOString();
  const claim = await env.DB.prepare(`UPDATE slop_batches SET runner=?,runner_status='running',runner_updated=? WHERE id=?
    AND (runner_status IS NULL OR runner_status NOT IN ('running','stopping') OR runner_updated<?)`).bind(runner, stamp, batchId, stale).run();
  if (!claim.meta.changes) throw new HttpError(409, "La generazione di questo batch è già in corso sul server");
  try { await env.SLOP_RUNNER.create({ id: runner, params: { batchId, phase } }); }
  catch (error) {
    await env.DB.prepare("UPDATE slop_batches SET runner_status='failed',runner_updated=? WHERE id=? AND runner=?").bind(now(), batchId, runner).run();
    throw new HttpError(503, "Avvio sul server non riuscito: " + (error instanceof Error ? error.message : String(error)).slice(0, 200));
  }
  return runner;
}
/** What the dashboard shows of the runner: alive means running (or finishing the step in progress after «Interrompi», «stopping»)
 * with a step in the last fifteen minutes. */
export function runnerView(row: { runner?: string | null; runner_status?: string | null; runner_updated?: string | null }) {
  if (!row.runner) return null;
  const alive = (row.runner_status === "running" || row.runner_status === "stopping") && !!row.runner_updated && Date.parse(row.runner_updated) > Date.now() - RUNNER_STALE_MS;
  return { id: row.runner, status: row.runner_status, updated_at: row.runner_updated, alive };
}

export class SlopBatchWorkflow extends WorkflowEntrypoint<Env, RunParams> {
  async run(event: Readonly<WorkflowEvent<RunParams>>, step: WorkflowStep) {
    const env = this.env, { batchId, phase } = event.payload, runner = event.instanceId;
    /** Before every paid step: still this batch's runner, still wanted (an automatic batch stopped by the owner ends here). */
    const live = (name: string) => step.do(name, async () => {
      const row = await env.DB.prepare("SELECT runner,runner_status,origin,auto_status FROM slop_batches WHERE id=?").bind(batchId)
        .first<{ runner: string; runner_status: string; origin: string; auto_status: string }>();
      if (!row || row.runner !== runner || row.runner_status !== "running" || (row.origin === "auto" && row.auto_status !== "running")) return false;
      await env.DB.prepare("UPDATE slop_batches SET runner_updated=? WHERE id=? AND runner=?").bind(now(), batchId, runner).run();
      return true;
    });
    /** A paid step that the platform itself stops (CPU limit, eviction) throws: that REAL ends there (its claim turns uncertain
     * after ten minutes), the others go on. Only a problem of the OpenAI account stops the whole run. */
    const safely = async (name: string, work: () => Promise<Outcome>): Promise<Outcome> => {
      try { return await step.do(name, ONCE, work); }
      catch (error) { return { ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 300) }; }
    };
    let outcome = "done", reason = "";
    try {
      if (phase !== "images") {
        const drafts = await step.do("drafts", async () => (await env.DB.prepare("SELECT slot FROM slop_processes WHERE batch_id=? AND state='draft' ORDER BY slot")
          .bind(batchId).all<{ slot: number }>()).results.map(r => r.slot));
        for (const slot of drafts) {
          if (!await live(`live-brief-${slot}`)) { outcome = "stopped"; return; }
          const result = await safely(`brief-${slot}`, () => attempt(async () => { await writePrompts(env, batchId, { confirm: true, index: slot }); return {}; }));
          if (result.account) { outcome = "failed"; reason = result.error || ""; return; }
        }
      }
      if (phase === "briefs") return;
      const work = await step.do("work", async () => {
        const batch = await env.DB.prepare("SELECT loop_settings FROM slop_batches WHERE id=?").bind(batchId).first<{ loop_settings: string | null }>();
        const config = JSON.parse(batch?.loop_settings || "{}") as { quality?: string; max_generation_attempts?: number };
        const slots = (await env.DB.prepare("SELECT slot FROM slop_processes WHERE batch_id=? AND state IN ('ready','retry') ORDER BY slot")
          .bind(batchId).all<{ slot: number }>()).results.map(r => r.slot);
        return { slots, quality: config.quality || "", max: config.max_generation_attempts || 1 };
      });
      for (const slot of work.slots) {
        for (let n = 0; n < work.max; n++) {
          if (!await live(`live-${slot}-${n}`)) { outcome = "stopped"; return; }
          const result = await safely(`attempt-${slot}-${n}`, () => attempt(async () => {
            const done = await generateImage(env, batchId, { confirm: true, index: slot, quality: work.quality }) as { id?: string; process?: { state: string } };
            return { id: done.id ?? null, state: done.process?.state };
          }));
          if (result.account) { outcome = "failed"; reason = result.error || ""; return; }
          if (result.id) {
            // Tags of the accepted SLOP, from its whole original: one paid call, claimed like any analysis. Its game copy is made
            // in the owner's browser at the review (owner decision of 2026-11-16).
            await safely(`tags-${slot}`, () => attempt(async () => { await analyze(env, await find(env, result.id!), { confirm: true }); return {}; }));
            break;
          }
          if (!result.ok || result.state !== "retry") break;
        }
      }
    } catch (error) {
      outcome = "failed"; reason = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    } finally {
      await step.do("end", async () => {
        await env.DB.prepare("UPDATE slop_batches SET runner_status=?,runner_updated=?,prompts_error=CASE WHEN ?<>'' THEN ? ELSE prompts_error END WHERE id=? AND runner=?")
          .bind(outcome, now(), reason, reason.slice(0, 500), batchId, runner).run();
        // An automatic batch that ran to the end (or met an account problem) waits for the owner's decisions.
        if (phase === "all" && outcome !== "stopped")
          await env.DB.prepare("UPDATE slop_batches SET auto_status='review',updated_at=? WHERE id=? AND origin='auto' AND auto_status='running'").bind(now(), batchId).run();
        return outcome;
      });
    }
  }
}
