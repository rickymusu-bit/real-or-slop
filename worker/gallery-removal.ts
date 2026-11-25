/** Atomic catalogue removal, with durable cleanup of the gallery's R2 objects. */
import { HttpError, type Env } from "./core";
import { IN_PLAY, since } from "./in-play";
import { RUNNER_STALE_MS } from "./slop-runner";

export async function sweepGalleryFiles(env: Env) {
  for (const [bucket, storage] of [["quarantine", env.QUARANTINE], ["game", env.IMAGES]] as const) {
    if (!storage) continue;
    const {results: rows} = await env.DB.prepare("SELECT id,object_key FROM gallery_files_to_delete WHERE bucket=? ORDER BY id LIMIT 500")
      .bind(bucket).all<{id: number; object_key: string}>();
    if (!rows.length) continue;
    await storage.delete([...new Set(rows.map(row => row.object_key))]);
    // A publisher can queue a new job for the same key after a concurrent gallery deletion.
    await env.DB.prepare("DELETE FROM gallery_files_to_delete WHERE id IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(rows.map(row => row.id))).run();
  }
}

export async function removeGallery(env: Env, id: string, data: Record<string, unknown>) {
  if (data.confirm !== true || Object.keys(data).some(key => key !== "confirm" && key !== "revision"))
    throw new HttpError(400, "Conferma l’eliminazione della galleria");
  const revision = data.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new HttpError(400, "Revisione della galleria non valida");

  const blockers = `SELECT
    EXISTS(SELECT 1 FROM (${IN_PLAY}) r JOIN images i ON i.id=r.image_id WHERE i.gallery_id=?2) AS playing,
    (EXISTS(SELECT 1 FROM slop_batches WHERE gallery_id=?2 AND runner_status IN ('running','stopping') AND runner_updated>?3)
     OR EXISTS(SELECT 1 FROM slop_processes p JOIN slop_batches b ON b.id=p.batch_id
       WHERE b.gallery_id=?2 AND p.state IN ('running','prompting') AND p.updated_at>?3) OR EXISTS(SELECT 1 FROM pipeline_jobs WHERE gallery_id=?2 AND state IN ('queued','dispatching','working','accepting'))) AS generating`;
  const args = [await since(env), id, new Date(Date.now() - RUNNER_STALE_MS).toISOString()] as const;
  // Check for active games and generation in the same statement as the deletion and its trigger.
  const result = await env.DB.prepare(`DELETE FROM galleries WHERE id=?2 AND revision=?4
    AND NOT EXISTS(SELECT 1 FROM (${blockers}) WHERE playing OR generating)`).bind(...args, revision).run();
  if (!result.meta.changes) {
    const current = await env.DB.prepare(`SELECT g.revision, b.* FROM galleries g CROSS JOIN (${blockers}) b WHERE g.id=?2`)
      .bind(...args).first<{revision: number; playing: number; generating: number}>();
    if (current) {
      if (current.revision === revision && current.playing) throw new HttpError(409, "Alcune foto sono in partite in corso. Riprova quando saranno finite.");
      if (current.revision === revision && current.generating) throw new HttpError(409, "La galleria ha una generazione in corso. Riprova quando sarà conclusa.");
      throw new HttpError(409, "Galleria modificata. Riapri il modulo.");
    }
  }
  // Daily maintenance retries any keys left in the queue.
  await sweepGalleryFiles(env).catch(error => console.error("gallery file cleanup", error));
  return { deleted: true };
}
