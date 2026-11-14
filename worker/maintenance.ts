/** Daily maintenance (spec `privacy-note-legali`, section 4), run by the Cron Trigger: deletes games older than 12 months
 * with their rounds, answers and events, expired rate limits and withdrawn copies no game uses any more. */
import { type Env } from "./core";
import { GAME_RETENTION_MS } from "../shared/legal";
import { sweepRetired } from "./in-play";

export async function maintenance(env: Env, now = Date.now()) {
  const games = await env.DB.prepare("DELETE FROM game_sessions WHERE created_at<?").bind(now - GAME_RETENTION_MS).run();
  await env.DB.prepare("DELETE FROM rate_limits WHERE resets_at<?").bind(now).run();
  const copies = await sweepRetired(env);
  return { games_deleted: games.meta.changes || 0, retired_copies_deleted: copies };
}
