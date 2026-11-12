/** Daily maintenance (docs/privacy-note-legali.v1.0.0.md, section 4). v1.0.0, 2026-11-12T19:00:00Z.
 * Run by the Cron Trigger of wrangler.jsonc. Games older than 12 months are deleted with their rounds, answers and events (cascade):
 * the privacy notice promises it. The leaderboard keeps its entries (nickname, level, score, date, hash of the game code) until the
 * player asks for their removal. Expired rate limits and retired game copies no game needs are cleaned too. */
import { type Env } from "./core";
import { GAME_RETENTION_MS } from "../shared/legal.v1.0.0";
import { sweepRetired } from "./in-play.v1.2.0";

export async function maintenance(env: Env, now = Date.now()) {
  const games = await env.DB.prepare("DELETE FROM game_sessions WHERE created_at<?").bind(now - GAME_RETENTION_MS).run();
  await env.DB.prepare("DELETE FROM rate_limits WHERE resets_at<?").bind(now).run();
  const copies = await sweepRetired(env);
  return { games_deleted: games.meta.changes || 0, retired_copies_deleted: copies };
}
