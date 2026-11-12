/** Games in progress and the game copies they still need (docs/database-immagini.v1.0.1.md, section 4).
 * v1.1.0, 2026-11-12T09:00:00Z: PvP removed (migration 0043): only single-player games. v1.0.0, 2026-11-11T09:30:00Z. Owner decision of 2026-11-11: an edit to a published photo takes effect only after every
 * game that includes it has ended. Rounds and challenges record the caption and copy they serve (migration 0041), so
 * edits never reach a game already started; here the copy itself is kept in the game bucket while a game may need it.
 * A game is «in progress» while it is preparing or active and started less than IN_PLAY_MAX_MS ago: a training game
 * left open has no deadline, and without this limit it would hold a withdrawn file for ever. */
import { type Env } from "./core";

export const IN_PLAY_MAX_MS = 24 * 3_600_000;

/** Copy keys and images used by games in progress. */
const IN_PLAY = `SELECT r.image_id,r.copy_key,r.session_id AS game FROM game_rounds r JOIN game_sessions s ON s.id=r.session_id
  WHERE s.phase IN ('preparing','active') AND s.created_at>?1 AND r.copy_key IS NOT NULL`;
const since = () => Date.now() - IN_PLAY_MAX_MS;

/** Number of games in progress that include each image (any of its copies). */
export async function gamesInPlay(env: Env, ids: readonly string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = (await env.DB.prepare(`SELECT image_id,count(DISTINCT game) AS n FROM (${IN_PLAY})
    WHERE image_id IN (SELECT value FROM json_each(?2)) GROUP BY image_id`).bind(since(), JSON.stringify(ids)).all<{ image_id: string; n: number }>()).results;
  return new Map(rows.map(r => [r.image_id, r.n]));
}

/** Takes a copy out of the game bucket, at once if no game in progress uses it, otherwise when the last one ends. */
export async function retireCopy(env: Env, copyKey: string, imageId: string) {
  const used = await env.DB.prepare(`SELECT 1 AS used FROM (${IN_PLAY}) WHERE copy_key=?2 LIMIT 1`).bind(since(), copyKey).first();
  if (used) {
    await env.DB.prepare("INSERT INTO retired_copies(copy_key,image_id,retired_at) VALUES(?,?,?) ON CONFLICT(copy_key) DO NOTHING")
      .bind(copyKey, imageId, new Date().toISOString()).run();
    return false;
  }
  await env.IMAGES?.delete(copyKey);
  return true;
}

/** A copy published again is live: it no longer waits for deletion. */
export async function reviveCopy(env: Env, copyKey: string) {
  await env.DB.prepare("DELETE FROM retired_copies WHERE copy_key=?").bind(copyKey).run();
}

/** Deletes the retired copies that no game in progress and no published image uses any more. */
export async function sweepRetired(env: Env): Promise<number> {
  const free = (await env.DB.prepare(`SELECT copy_key FROM retired_copies WHERE copy_key NOT IN (SELECT copy_key FROM (${IN_PLAY}))
    AND copy_key NOT IN (SELECT copy_key FROM images WHERE status='published' AND copy_key IS NOT NULL) LIMIT 500`).bind(since())
    .all<{ copy_key: string }>()).results.map(r => r.copy_key);
  if (!free.length) return 0;
  await env.IMAGES?.delete(free);
  await env.DB.prepare("DELETE FROM retired_copies WHERE copy_key IN (SELECT value FROM json_each(?))").bind(JSON.stringify(free)).run();
  return free.length;
}

/** Views and correct classifications of each image, counted on its current copy only. */
export async function statsOf(env: Env, ids: readonly string[]): Promise<Map<string, { views: number; correct: number }>> {
  if (!ids.length) return new Map();
  const rows = (await env.DB.prepare(`SELECT i.id,
    (SELECT count(*) FROM game_rounds r WHERE r.image_id=i.id AND r.copy_key=i.copy_key AND r.presented_at IS NOT NULL) AS views,
    (SELECT count(*) FROM game_rounds r JOIN answers a ON a.round_id=r.id WHERE r.image_id=i.id AND r.copy_key=i.copy_key AND a.correct=1) AS correct
    FROM images i WHERE i.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<{ id: string; views: number; correct: number }>()).results;
  return new Map(rows.map(r => [r.id, { views: r.views, correct: r.correct }]));
}
