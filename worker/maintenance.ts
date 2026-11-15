/** Daily maintenance (spec `privacy-note-legali`, section 4), run by the Cron Trigger: deletes games older than 12 months
 * with their rounds, answers and events, expired rate limits and withdrawn copies no game uses any more. */
import { type Env } from "./core";
import { GAME_RETENTION_MS } from "../shared/legal";
import { sweepRetired } from "./in-play";

export async function maintenance(env: Env, now = Date.now()) {
  const games = await env.DB.prepare("DELETE FROM game_sessions WHERE created_at<?").bind(now - GAME_RETENTION_MS).run();
  await env.DB.prepare("DELETE FROM rate_limits WHERE resets_at<?").bind(now).run();
  const copies = await sweepRetired(env);
  const interrupted = new Date(now - 10 * 60_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE slop_processes SET state='uncertain',error='Operazione interrotta: nessuna chiamata ripetuta' WHERE state IN ('running','prompting') AND updated_at<?").bind(interrupted),
    env.DB.prepare("UPDATE slop_attempts SET status='uncertain' WHERE status IN ('pending','generated') AND updated_at<?").bind(interrupted),
    env.DB.prepare("UPDATE paid_calls SET status='uncertain' WHERE status='pending' AND updated_at<?").bind(interrupted),
    env.DB.prepare("UPDATE images SET analysis_status='uncertain',analysis_error='Analisi interrotta: nessuna chiamata ripetuta' WHERE analysis_status='running' AND updated_at<?").bind(interrupted),
  ]);
  const cutoff = new Date(now - 7 * 86_400_000).toISOString();
  const temporary = (await env.DB.prepare(`SELECT a.id,a.candidate_key FROM slop_attempts a JOIN slop_processes p ON p.id=a.process_id
    WHERE a.updated_at<? AND p.state NOT IN ('running','prompting') AND a.candidate_key IS NOT NULL`).bind(cutoff).all<{id:string;candidate_key:string}>()).results;
  for (const a of temporary) {
    await env.QUARANTINE?.delete(a.candidate_key);
    await env.DB.prepare("UPDATE slop_attempts SET candidate_key=NULL WHERE id=?").bind(a.id).run();
  }
  await env.DB.prepare("DELETE FROM slop_processes WHERE updated_at<? AND image_id IS NULL AND state NOT IN ('running','prompting','retry','ready')").bind(cutoff).run();
  return { games_deleted: games.meta.changes || 0, retired_copies_deleted: copies };
}
