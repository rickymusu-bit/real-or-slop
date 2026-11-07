import { body, hash, HttpError, id, json, type Env } from "./core";
import { bulkRejectedDeletion } from "./review-bulk-delete";

interface InboxRow {
  id: string; origin: string; sha256: string; source_sha256: string; media_key: string; metadata_json: string;
  status: string; revision: number; pair_key: string | null; created_at: string;
  partner_id?: string | null; partner_origin?: string; note?: string | null;
  cycle_id?: string; catalog_id?: string; cycle_published?: number;
}
const base = "/api/admin/review-inbox";
function ownerNote(value: string) {
  try { const parsed = JSON.parse(value) as {note?:unknown;reason?:unknown}; if (typeof parsed.note === "string" && typeof parsed.reason === "string") return {note:parsed.note,reason:parsed.reason}; } catch { /* historical plain notes */ }
  return {note:value,reason:"editorial"};
}

// Read the old archives without changing scores, source roles, reviews or images.
// Low model scores and previous human refusals do not exclude a picture here.
export async function syncReviewInbox(env: Env) {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at)
      SELECT 'image-'||i.id,i.type,i.sha256,i.r2_key,
        json_object('title',i.title,'author',i.author,'source_url',s.page_url,'license_url',l.url,
          'previous_decision',i.status,'source_kind','image','source_id',i.id),i.created_at
      FROM images i LEFT JOIN sources s ON s.id=i.source_id LEFT JOIN licenses l ON l.id=i.license_id
      WHERE i.demo=0 AND i.sha256<>'pending' AND i.status IN ('candidate','in-review','rejected')
        AND NOT EXISTS(SELECT 1 FROM published_images p WHERE p.image_id=i.id)
      ON CONFLICT DO NOTHING`),
    env.DB.prepare(`INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at)
      SELECT 'reference-'||r.id,'REAL',r.file_sha256,'references/'||r.id,
        json_object('title',json_extract(r.metadata_json,'$.title'),'author',json_extract(r.metadata_json,'$.author'),
          'source_url',r.source_url,'license_url',json_extract(r.metadata_json,'$.license_url'),
          'previous_decision','archiviata','source_kind','reference','source_id',r.id,
          'previous_assessment',json(r.evaluation_json),'provenance',json(r.metadata_json)),r.created_at
      FROM reference_photos r WHERE NOT EXISTS(SELECT 1 FROM images i WHERE i.sha256=r.file_sha256 AND i.status='approved')
      ON CONFLICT DO NOTHING`),
    env.DB.prepare(`INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at)
      SELECT 'attempt-'||a.id,'AI',m.sha256,m.r2_key,
        json_object('title','Generazione SLOP archiviata','source_kind','attempt','source_id',a.id,
          'previous_decision',COALESCE(i.status,json_extract(a.dossier_json,'$.status')),
          'previous_assessment',json_extract(a.dossier_json,'$.evaluation'),'provenance',json(a.dossier_json)),a.created_at
      FROM editorial_attempts a JOIN editorial_attempt_media m ON m.attempt_id=a.id AND m.kind='preview'
      LEFT JOIN images i ON i.id=a.image_id WHERE COALESCE(i.status,'')<>'approved'
      ON CONFLICT DO NOTHING`),
    env.DB.prepare(`INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,pair_key,created_at)
      SELECT 'v2-'||c.id,c.origin,c.preview_sha256,'editorial-v2/'||c.run_id||'/'||c.preview_sha256,
        json_object('title',COALESCE(json_extract(c.dossier_json,'$.provenance.idea'),'Immagine dello studio'),
          'source_kind','v2','source_id',c.id,'previous_decision',c.review_state,
          'author',json_extract(c.dossier_json,'$.provenance.author'),
          'source_url',json_extract(c.dossier_json,'$.provenance.source_url'),
          'license_url',json_extract(c.dossier_json,'$.provenance.license_url'),
          'provenance',json(c.dossier_json)),
        json_extract(c.dossier_json,'$.brief_id'),c.created_at
      FROM editorial_v2_candidates c WHERE c.review_state<>'approved'
      ON CONFLICT DO NOTHING`),
  ]);
}

export async function reviewInbox(request: Request, env: Env, path: string): Promise<Response> {
  const url = new URL(request.url);
  if (path === base + "/delete-rejected") return bulkRejectedDeletion(request, env);
  if (path === base && request.method === "GET") {
    await syncReviewInbox(env);
    const state = url.searchParams.get("state") || "pending", origin = url.searchParams.get("origin") || "all";
    const offset = Number(url.searchParams.get("offset") || 0);
    if (!["pending", "approved", "rejected", "all"].includes(state) || !["REAL", "AI", "all"].includes(origin) || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new HttpError(400, "Filtro della coda non valido");
    const where = "(?='all' OR q.status=?) AND (?='all' OR q.origin=?)", args = [state, state, origin, origin];
    const [rows, counts, total] = await Promise.all([
      env.DB.prepare(`SELECT q.*,p.id AS partner_id,p.origin AS partner_origin,
        a.cycle_id,a.image_id AS catalog_id,EXISTS(SELECT 1 FROM published_images pub WHERE pub.image_id=a.image_id) AS cycle_published,
        (SELECT note FROM editorial_review_inbox_events e WHERE e.image_id=q.id ORDER BY revision DESC LIMIT 1) AS note
        FROM editorial_review_effective_images q LEFT JOIN editorial_cycle_admissions a ON a.id=(
          SELECT id FROM editorial_cycle_admissions WHERE inbox_id=q.id ORDER BY review_revision DESC LIMIT 1)
        LEFT JOIN editorial_review_effective_images p ON p.id=(
          SELECT id FROM editorial_review_effective_images WHERE pair_key=q.pair_key AND origin<>q.origin ORDER BY created_at,id LIMIT 1)
        WHERE ${where} ORDER BY q.created_at DESC,q.id LIMIT 50 OFFSET ?`).bind(...args, offset).all<InboxRow>(),
      env.DB.prepare("SELECT status,origin,count(*) AS count FROM editorial_review_inbox GROUP BY status,origin").all(),
      env.DB.prepare(`SELECT count(*) AS count FROM editorial_review_inbox q WHERE ${where}`).bind(...args).first<{ count: number }>(),
    ]);
    return json({ images: rows.results.map(row => ({ id: row.id, origin: row.origin, sha256: row.sha256, revision: row.revision,
      status: row.status, details: JSON.parse(row.metadata_json) as unknown, note: ownerNote(row.note || "").note,
      rejection_reason: ownerNote(row.note || "").reason, image: `${base}/${row.id}/image`,
      publication: row.catalog_id ? { image_id:row.catalog_id, cycle_id:row.cycle_id, published:Boolean(row.cycle_published) } : null,
      partner: row.partner_id ? { id: row.partner_id, origin: row.partner_origin, image: `${base}/${row.partner_id}/image` } : null })),
      total: total?.count || 0, counts: counts.results, offset, limit: 50, publication_available: false });
  }
  const match = path.match(/^\/api\/admin\/review-inbox\/([\w-]+)(?:\/(image|decision|history))?$/);
  if (!match) throw new HttpError(404, "Coda di revisione inesistente");
  const row = await env.DB.prepare("SELECT * FROM editorial_review_effective_images WHERE id=?").bind(match[1]).first<InboxRow>();
  if (!row) throw new HttpError(404, "Immagine non trovata");
  if (!match[2] && request.method === "DELETE") {
    const data = await body(request, 1000);
    if (Object.keys(data).some(key => !["confirm_delete", "revision", "sha256"].includes(key)) ||
        data.confirm_delete !== true || data.revision !== row.revision || data.sha256 !== row.sha256 || row.status !== "rejected")
      throw new HttpError(409, "Puoi eliminare soltanto un'immagine rifiutata: verifica lo stato e conferma");
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO editorial_review_deleted_images
        SELECT id,origin,source_sha256,revision,?,? FROM editorial_review_effective_images WHERE id=? AND revision=? AND sha256=? AND status='rejected'`)
        .bind((await hash(env.ADMIN_TOKEN!)).slice(0, 12), new Date().toISOString(), row.id, row.revision, row.sha256),
      env.DB.prepare(`DELETE FROM editorial_review_inbox WHERE id=? AND revision=? AND status='rejected'
        AND EXISTS(SELECT 1 FROM editorial_review_deleted_images d WHERE d.image_id=editorial_review_inbox.id
          AND d.revision=editorial_review_inbox.revision AND d.sha256=editorial_review_inbox.sha256)`)
        .bind(row.id, row.revision),
    ]);
    if (!result[1].meta.changes) throw new HttpError(409, "Immagine aggiornata: ricaricare prima di eliminarla");
    return json({ deleted: true, history_preserved: true, published: false });
  }
  if (match[2] === "image" && request.method === "GET") {
    const file = await env.QUARANTINE?.get(row.media_key);
    if (!file) throw new HttpError(404, "File archiviato non disponibile");
    return new Response(file.body, { headers: { "Content-Type": file.httpMetadata?.contentType || "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (match[2] === "history" && request.method === "GET") return json({ previous: JSON.parse(row.metadata_json) as unknown,
    events: (await env.DB.prepare("SELECT decision,note,revision,image_sha256,created_at FROM editorial_review_inbox_events WHERE image_id=? ORDER BY revision").bind(row.id).all<{note:string}>()).results.map(e => ({...e,...ownerNote(e.note)})) });
  if (match[2] === "decision" && request.method === "POST") {
    if (await env.DB.prepare("SELECT 1 FROM editorial_cycle_admissions a JOIN published_images p ON p.image_id=a.image_id WHERE a.inbox_id=? LIMIT 1").bind(row.id).first())
      throw new HttpError(409, "Immagine pubblicata: il voto è conservato nello storico");
    const data = await body(request, 5000);
    if (Object.keys(data).some(key => !["decision", "revision", "sha256", "note", "reason"].includes(key)) ||
        !["approved", "rejected", "pending"].includes(String(data.decision)) || data.revision !== row.revision || data.sha256 !== row.sha256 ||
        (data.reason !== undefined && !["editorial","generation","technical","rights","provenance"].includes(String(data.reason))) ||
        typeof data.note !== "string" || data.note.length > 2000) throw new HttpError(409, "Immagine o revisione aggiornata: ricaricare la coda");
    const file = await env.QUARANTINE?.get(row.media_key);
    if (!file || file.size > 12_000_000) throw new HttpError(409, "File non disponibile per la revisione");
    if ([...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(x => x.toString(16).padStart(2, "0")).join("") !== row.sha256) throw new HttpError(409, "Il file è cambiato: revisione bloccata");
    const event = id(), now = new Date().toISOString();
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO editorial_review_inbox_events SELECT ?,id,revision+1,?,?,?,?,? FROM editorial_review_effective_images WHERE id=? AND revision=? AND sha256=?`)
        .bind(event, (await hash(env.ADMIN_TOKEN!)).slice(0, 12), data.decision, row.sha256,
          data.reason === undefined ? data.note : JSON.stringify({note:data.note,reason:data.reason}), now, row.id, row.revision, row.sha256),
      env.DB.prepare("UPDATE editorial_review_inbox SET status=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM editorial_review_inbox_events WHERE id=?)")
        .bind(data.decision, row.id, row.revision, event),
    ]);
    if (!result[1].meta.changes) throw new HttpError(409, "Decisione già aggiornata: ricaricare");
    return json({ saved: true, status: data.decision, revision: row.revision + 1, published: false });
  }
  throw new HttpError(405, "Metodo non consentito");
}
