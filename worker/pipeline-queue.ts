/** Shared persistent queue for wizard phases and automatic observations at approval. */
import { HttpError, id, type Env } from "./core";
import { chosenModel } from "./models";
import { validProfile } from "../shared/pipeline";
import type { Row } from "./library";
const now = () => new Date().toISOString();
/** A REAL preparation of a gallery may run only while no other is acquired there: each one reads the dictionary
 * written by the previous one, so two calls never invent different names for the same new value. */
const PROFILE_FREE = (alias: string) => `(json_extract(${alias}.snapshot,'$.operation')<>'profile' OR NOT EXISTS(SELECT 1 FROM pipeline_jobs o
  WHERE o.gallery_id=${alias}.gallery_id AND o.state IN ('dispatching','working') AND json_extract(o.snapshot,'$.operation')='profile'))`;
export async function startPipeline(env: Env, jobId: string) {
  if (!env.SLOP_RUNNER) return;
  const claimed=await env.DB.prepare(`UPDATE pipeline_jobs SET state='dispatching',updated_at=? WHERE id=? AND state='queued'
    AND (SELECT count(*) FROM pipeline_jobs WHERE state IN ('dispatching','working'))<3 AND ${PROFILE_FREE("pipeline_jobs")}`).bind(now(),jobId).run();
  if(!claimed.meta.changes)return;
  try { await env.SLOP_RUNNER.create({ id: `pipeline-${id()}`, params: { batchId: jobId, phase: "pipeline" } }); }
  catch (error) { await env.DB.prepare("UPDATE pipeline_jobs SET state='failed',error=?,updated_at=? WHERE id=? AND state='dispatching'").bind("Failed to start: " + (error instanceof Error ? error.message : "Workflow unavailable").slice(0,200), now(), jobId).run(); }
}
export async function dispatchPipeline(env:Env) {
  // Only eligible jobs: queued preparations of a gallery that is already preparing never block other galleries or phases.
  const rows=(await env.DB.prepare(`SELECT id FROM pipeline_jobs q WHERE state='queued' AND ${PROFILE_FREE("q")} ORDER BY created_at,id LIMIT 3`).all<{id:string}>()).results;
  for(const row of rows)await startPipeline(env,row.id);
}
/** Free status reads and approved queued work share the same recovery path. Acquired calls are never resent. */
export async function recoverPipeline(env: Env) {
  await env.DB.prepare("UPDATE pipeline_jobs SET state='attention',error='Request interrupted or outcome uncertain: no automatic retry' WHERE state IN ('working','dispatching','accepting') AND updated_at<?")
    .bind(new Date(Date.now() - 15 * 60_000).toISOString()).run();
  await dispatchPipeline(env);
}

/** These statements run in the same transaction as approval. The claim outlives failed/removed jobs. */
export async function approvalObservation(env: Env, row: Row): Promise<D1PreparedStatement[]> {
  let cached: unknown = null;
  try { cached = JSON.parse(row.pipeline_slop_observation || "null"); } catch { /* Invalid cache is missing. */ }
  if (row.origin !== "SLOP" || validProfile(cached) || row.slop_observation_request) return [];
  if (!env.OPENAI_API_KEY || !env.SLOP_RUNNER || !env.QUARANTINE)
    throw new HttpError(503, "Automatic SLOP observation requires configured models, private storage and Workflow");
  const request = id(), stamp = now(), textModel = await chosenModel(env, "text_model");
  const snapshot = JSON.stringify({ operation: "observe", sourceRevision: row.revision + 1, textModel,
    imageModel: "", quality: "", settings: { rules: "", probabilities: {}, environment: "keep", novelty: 0 } });
  return [
    env.DB.prepare(`UPDATE images SET slop_observation_request=? WHERE id=? AND origin='SLOP' AND status='approved'
      AND revision=? AND slop_observation_request IS NULL AND pipeline_slop_observation IS ?`)
      .bind(request, row.id, row.revision + 1, row.pipeline_slop_observation ?? null),
    env.DB.prepare(`INSERT OR IGNORE INTO pipeline_jobs(id,gallery_id,source_id,state,snapshot,request,created_at,updated_at)
      SELECT ?,gallery_id,id,'queued',?,?,?,? FROM images WHERE id=? AND status='approved' AND revision=?
      AND slop_observation_request=? AND pipeline_slop_observation IS ?
      AND NOT EXISTS(SELECT 1 FROM pipeline_jobs WHERE source_id=images.id)`)
      .bind(`${request}-${row.id}`, snapshot, request, stamp, stamp, row.id, row.revision + 1, request, row.pipeline_slop_observation ?? null),
  ];
}
