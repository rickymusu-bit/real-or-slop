import { body, hash, HttpError, id, json, type Env } from "./core";
import { queueFiles, releaseFiles } from "./review-files.v1.0.0";

type Origin = "all" | "REAL" | "AI";
interface RejectedImage { id: string; sha256: string; revision: number }
function originFilter(value: unknown): Origin {
  if (value !== "all" && value !== "REAL" && value !== "AI") throw new HttpError(400, "Filtro origine non valido");
  return value;
}
async function snapshot(env: Env, origin: Origin) {
  const rows = (await env.DB.prepare("SELECT id,sha256,revision FROM editorial_review_effective_images WHERE status='rejected' AND (?='all' OR origin=?) ORDER BY id")
    .bind(origin, origin).all<RejectedImage>()).results;
  return { rows, token: await hash(JSON.stringify({ operation: "delete-rejected-v1", origin, rows })) };
}

// The count guard executes inside the same transaction as registration/deletion.
// A concurrent approval or revision invalidates the whole confirmed selection.
export const insertRejectedDeletions = `INSERT INTO editorial_review_deleted_images
  SELECT q.id,q.origin,q.source_sha256,q.revision,?,?
  FROM editorial_review_effective_images q JOIN json_each(?) s
    ON q.id=json_extract(s.value,'$.id') AND q.revision=json_extract(s.value,'$.revision') AND q.sha256=json_extract(s.value,'$.sha256')
  WHERE q.status='rejected' AND (
    SELECT count(*) FROM editorial_review_effective_images v JOIN json_each(?) c
      ON v.id=json_extract(c.value,'$.id') AND v.revision=json_extract(c.value,'$.revision') AND v.sha256=json_extract(c.value,'$.sha256')
    WHERE v.status='rejected')=json_array_length(?)`;
export const deleteRejectedImages = `DELETE FROM editorial_review_inbox
  WHERE status='rejected' AND id IN (SELECT json_extract(value,'$.id') FROM json_each(?))
    AND EXISTS(SELECT 1 FROM editorial_review_deleted_images d WHERE d.image_id=editorial_review_inbox.id
      AND d.revision=editorial_review_inbox.revision AND d.sha256=editorial_review_inbox.sha256
      AND d.deleted_by=? AND d.deleted_at=?)`;

export async function bulkRejectedDeletion(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") {
    const origin = originFilter(new URL(request.url).searchParams.get("origin") || "all");
    const current = await snapshot(env, origin);
    return json({ origin, count: current.rows.length, snapshot_token: current.token });
  }
  if (request.method !== "DELETE") throw new HttpError(405, "Metodo non consentito");
  const data = await body(request, 1000);
  if (Object.keys(data).some(key => !["origin", "snapshot_token", "confirm_delete"].includes(key)) ||
      data.confirm_delete !== true || typeof data.snapshot_token !== "string" || !/^[a-f0-9]{64}$/.test(data.snapshot_token))
    throw new HttpError(400, "Conferma esplicita della selezione richiesta");
  const origin = originFilter(data.origin), current = await snapshot(env, origin);
  if (!current.rows.length || current.token !== data.snapshot_token) throw new HttpError(409, "Le rifiutate sono cambiate: aggiorna e conferma nuovamente");
  const selection = JSON.stringify(current.rows), now = new Date().toISOString();
  // Stable reviewer fingerprint plus a unique operation ID: only the marks
  // created by this exact request can authorize the second statement.
  const actor = (await hash(env.ADMIN_TOKEN!)).slice(0, 12) + ":" + id();
  const files = await queueFiles(env, current.rows.map(row => row.id));
  const result = await env.DB.batch([
    env.DB.prepare(insertRejectedDeletions).bind(actor, now, selection, selection, selection),
    env.DB.prepare(deleteRejectedImages).bind(selection, actor, now),
  ]);
  if (result[1].meta.changes !== current.rows.length) throw new HttpError(409, "La selezione è cambiata: nessuna immagine eliminata, aggiorna e riprova");
  const released = await releaseFiles(env, files);
  return json({ deleted: current.rows.length, origin, history_preserved: true, published: false, files_deleted: released.length });
}
