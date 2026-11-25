/** Daily maintenance (spec `privacy-note-legali`, section 4), run by the Cron Trigger: deletes games older than 12 months
 * with their rounds, answers and events, expired rate limits and withdrawn copies no game uses any more; checks the Commons
 * sources of fifty REAL (spec `libreria-immagini`, section 9). */
import { type Env } from "./core";
import { GAME_RETENTION_MS } from "../shared/legal";
import { expireGalleryBatches } from "./slop-gallery";
import { sweepRetired } from "./in-play";
import { sweepGalleryFiles } from "./gallery-removal";
import { checkCommonsSources } from "./commons-check";

export async function maintenance(env: Env, now = Date.now()) {
  await expireGalleryBatches(env, now);
  const games = await env.DB.prepare("DELETE FROM game_sessions WHERE created_at<?").bind(now - GAME_RETENTION_MS).run();
  await env.DB.prepare("DELETE FROM rate_limits WHERE resets_at<?").bind(now).run();
  await env.DB.prepare("UPDATE pipeline_jobs SET state='attention',error='Richiesta interrotta o esito incerto: nessuna ripetizione automatica' WHERE state IN ('dispatching','working','accepting') AND updated_at<?")
    .bind(new Date(now - 15 * 60_000).toISOString()).run();
  const copies = await sweepRetired(env);
  await sweepGalleryFiles(env).catch(error => console.error("gallery file cleanup", error));
  const interrupted = new Date(now - 10 * 60_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE slop_processes SET state='uncertain',error='Operazione interrotta: nessuna chiamata ripetuta' WHERE state IN ('running','prompting') AND updated_at<?").bind(interrupted),
    env.DB.prepare("UPDATE slop_attempts SET status='uncertain' WHERE status IN ('pending','generated') AND updated_at<?").bind(interrupted),
    env.DB.prepare("UPDATE paid_calls SET status='uncertain' WHERE status='pending' AND updated_at<?").bind(interrupted),
  ]);
  const cutoff = new Date(now - 7 * 86_400_000).toISOString();
  // Candidates stay while a process is open or waits for the owner (no SLOP: every attempt stays visible until closed);
  // seven days after an acceptance or a closing they go.
  const temporary = (await env.DB.prepare(`SELECT a.id,a.candidate_key FROM slop_attempts a JOIN slop_processes p ON p.id=a.process_id
    WHERE p.updated_at<? AND p.state IN ('accepted','closed') AND a.candidate_key IS NOT NULL`).bind(cutoff).all<{id:string;candidate_key:string}>()).results;
  for (const a of temporary) {
    await env.QUARANTINE?.delete(a.candidate_key);
    await env.DB.prepare("UPDATE slop_attempts SET candidate_key=NULL WHERE id=?").bind(a.id).run();
  }
  await env.DB.prepare("DELETE FROM slop_processes WHERE updated_at<? AND image_id IS NULL AND state IN ('closed','draft')").bind(cutoff).run();
  // Last, and never in the way of the rest: a failure of Commons leaves the photos due for the next night.
  const sources = await checkCommonsSources(env, now).catch(error => ({ skipped: error instanceof Error ? error.message : String(error) }));
  return { games_deleted: games.meta.changes || 0, retired_copies_deleted: copies, commons_sources: sources };
}
