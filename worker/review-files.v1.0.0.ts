/** R2 files of the review queue (docs/spazio-file.v1.0.0.md). v1.0.0, 2026-11-09T13:00:00Z.
 * A definitive deletion of rejected photos also removes their files, but only those created by the
 * owner-first intake (uploads, Commons, SLOP generations, game copies) and no longer referenced by
 * any remaining photo. Legacy archives keep their files, as AGENTS.md requires. */
import type { Env } from "./core";

const OWNED = ["owner-proposals/", "editorial-intelligence/", "workspace-slop/", "game-copies/"];

/** Every file of these queue photos: shown file, original and game copy. Read before deleting the rows. */
export async function queueFiles(env: Env, ids: readonly string[]): Promise<string[]> {
  if (!ids.length) return [];
  const list = JSON.stringify(ids);
  const rows = await env.DB.prepare(`SELECT i.media_key AS k FROM editorial_review_inbox i WHERE i.id IN (SELECT value FROM json_each(?1))
    UNION SELECT json_extract(i.metadata_json,'$.original_key') FROM editorial_review_inbox i WHERE i.id IN (SELECT value FROM json_each(?1))
    UNION SELECT g.media_key FROM editorial_review_game_copies g WHERE g.inbox_id IN (SELECT value FROM json_each(?1))`)
    .bind(list).all<{ k: string | null }>();
  return rows.results.map(row => row.k).filter((key): key is string => typeof key === "string" && OWNED.some(prefix => key.startsWith(prefix)));
}

/** Deletes the given files that no remaining queue photo uses. Returns the deleted keys. */
export async function releaseFiles(env: Env, keys: readonly string[]): Promise<string[]> {
  if (!keys.length || !env.QUARANTINE) return [];
  const rows = await env.DB.prepare(`SELECT value AS k FROM json_each(?) WHERE
    NOT EXISTS(SELECT 1 FROM editorial_review_inbox i WHERE i.media_key=value OR json_extract(i.metadata_json,'$.original_key')=value)
    AND NOT EXISTS(SELECT 1 FROM editorial_review_game_copies g JOIN editorial_review_inbox i ON i.id=g.inbox_id WHERE g.media_key=value)
    AND NOT EXISTS(SELECT 1 FROM images WHERE r2_key=value)`).bind(JSON.stringify([...new Set(keys)])).all<{ k: string }>();
  const free = rows.results.map(row => row.k);
  for (let i = 0; i < free.length; i += 1000) await env.QUARANTINE.delete(free.slice(i, i + 1000));
  return free;
}

/** Private files of an admitted image: the original and the approved file stay in the queue's quarantine,
 * the catalog keeps only the game file. Images admitted before this change still have their own copies. */
export async function admittedFile(env: Env, imageId: string, kind: "original" | "approved"): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT q.media_key,json_extract(q.metadata_json,'$.original_key') AS original_key
    FROM editorial_cycle_admissions a JOIN editorial_review_effective_images q ON q.id=a.inbox_id
    WHERE a.image_id=? ORDER BY a.created_at DESC LIMIT 1`).bind(imageId).first<{ media_key: string; original_key: string | null }>();
  return row ? (kind === "original" ? row.original_key : row.media_key) : null;
}

/** The single photo ?1, at revision ?3, is rejected and marked as deleted by the current request. */
export const MARKED_SINGLE = `EXISTS(SELECT 1 FROM editorial_review_inbox q JOIN editorial_review_deleted_images d ON d.image_id=q.id
  AND d.revision=q.revision AND d.sha256=q.sha256 WHERE q.id=?1 AND q.revision=?3 AND q.status='rejected')`;
/** Snapshot of the proposals of the photos listed by `ids` (SQL yielding inbox ids, using ?1), deleted at ?2.
 * Uploads point to their photo; Commons links through their acquisition (docs/spazio-file.v1.1.0.md). */
export function deleteProposalSnapshot(ids: string, guard = MARKED_SINGLE): string {
  return `INSERT INTO editorial_deleted_photo_proposals(proposal_id,inbox_id,topic_id,kind,source_url,note,proposed_at,deleted_at)
    SELECT p.id,COALESCE(p.inbox_id,a.inbox_id),p.topic_id,p.kind,p.source_url,p.note,p.created_at,?2
    FROM editorial_workspace_proposals p LEFT JOIN editorial_workspace_acquisitions a ON a.proposal_id=p.id
    WHERE COALESCE(p.inbox_id,a.inbox_id) IN (${ids}) AND ${guard.replace("q.id=?1", "q.id=COALESCE(p.inbox_id,a.inbox_id)")}`;
}
