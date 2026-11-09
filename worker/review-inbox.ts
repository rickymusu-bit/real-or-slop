import { body, hash, HttpError, id, json, type Env } from "./core";
import { hasTags, photoTags, tagsFor, TAGGED } from "./tags.v1.0.0";
import { bulkRejectedDeletion } from "./review-bulk-delete";
import { queueFiles, releaseFiles } from "./review-files.v1.0.0";
import { cleanImage } from "../shared/media-clean.v1.0.0";
import { imageDimensions } from "../shared/image-dimensions.v1.0.0";
import { imageGeometry } from "../shared/image-geometry.v1.0.0";
import { GAME_COPY, GAME_COPY_RECIPE, gameCopyDimensions } from "../shared/game-copy.v1.0.0";

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
    if (!["pending", "approved", "rejected", "all", "untagged"].includes(state) || !["REAL", "AI", "all"].includes(origin) || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new HttpError(400, "Filtro della coda non valido");
    // "untagged": every non-rejected photo without an active tag, published ones included (spec lotti 1.4.2, 4.3).
    const where = state === "untagged" ? `q.status<>'rejected' AND NOT ${TAGGED} AND ? IS NOT NULL AND ? IS NOT NULL AND (?='all' OR q.origin=?)`
      : "(?='all' OR q.status=?) AND (?='all' OR q.origin=?)", args = [state, state, origin, origin];
    const [rows, counts, untagged, total] = await Promise.all([
      env.DB.prepare(`SELECT q.*,p.id AS partner_id,p.origin AS partner_origin,
        a.cycle_id,a.image_id AS catalog_id,EXISTS(SELECT 1 FROM published_images pub WHERE pub.image_id=a.image_id) AS cycle_published,
        (SELECT note FROM editorial_review_inbox_events e WHERE e.image_id=q.id ORDER BY revision DESC LIMIT 1) AS note
        FROM editorial_review_effective_images q LEFT JOIN editorial_cycle_admissions a ON a.id=(
          SELECT id FROM editorial_cycle_admissions WHERE inbox_id=q.id ORDER BY review_revision DESC LIMIT 1)
        LEFT JOIN editorial_review_effective_images p ON p.id=(
          SELECT id FROM editorial_review_effective_images WHERE pair_key=q.pair_key AND origin<>q.origin ORDER BY created_at,id LIMIT 1)
        WHERE ${where} ORDER BY q.created_at DESC,q.id LIMIT 50 OFFSET ?`).bind(...args, offset).all<InboxRow>(),
      env.DB.prepare("SELECT status,origin,count(*) AS count FROM editorial_review_inbox GROUP BY status,origin").all(),
      env.DB.prepare(`SELECT count(*) AS count FROM editorial_review_inbox q WHERE q.status<>'rejected' AND NOT ${TAGGED}`).first<{ count: number }>(),
      env.DB.prepare(`SELECT count(*) AS count FROM editorial_review_inbox q WHERE ${where}`).bind(...args).first<{ count: number }>(),
    ]);
    const tags = await tagsFor(env, rows.results.map(row => row.id));
    return json({ images: rows.results.map(row => ({ id: row.id, origin: row.origin, sha256: row.sha256, revision: row.revision, tags: tags.get(row.id) || [],
      status: row.status, details: JSON.parse(row.metadata_json) as unknown, note: ownerNote(row.note || "").note,
      rejection_reason: ownerNote(row.note || "").reason, image: `${base}/${row.id}/image?v=${row.sha256.slice(0, 16)}`,
      source_sha256: row.source_sha256,
      publication: row.catalog_id ? { image_id:row.catalog_id, cycle_id:row.cycle_id, published:Boolean(row.cycle_published) } : null,
      partner: row.partner_id ? { id: row.partner_id, origin: row.partner_origin, image: `${base}/${row.partner_id}/image` } : null })),
      total: total?.count || 0, counts: counts.results, untagged: untagged?.count || 0, offset, limit: 50, publication_available: false });
  }
  const match = path.match(/^\/api\/admin\/review-inbox\/([\w-]+)(?:\/(image|decision|history|tags|game-copy))?$/);
  if (!match) throw new HttpError(404, "Coda di revisione inesistente");
  const row = await env.DB.prepare("SELECT * FROM editorial_review_effective_images WHERE id=?").bind(match[1]).first<InboxRow>();
  if (!row) throw new HttpError(404, "Immagine non trovata");
  if (!match[2] && request.method === "DELETE") {
    const data = await body(request, 1000);
    if (Object.keys(data).some(key => !["confirm_delete", "revision", "sha256"].includes(key)) ||
        data.confirm_delete !== true || data.revision !== row.revision || data.sha256 !== row.sha256 || row.status !== "rejected")
      throw new HttpError(409, "Puoi eliminare soltanto un'immagine rifiutata: verifica lo stato e conferma");
    const files = await queueFiles(env, [row.id]);
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
    const released = await releaseFiles(env, files);
    return json({ deleted: true, history_preserved: true, published: false, files_deleted: released.length });
  }
  if (match[2] === "image" && request.method === "GET") {
    const file = await env.QUARANTINE?.get(row.media_key);
    if (!file) throw new HttpError(404, "File archiviato non disponibile");
    return new Response(file.body, { headers: { "Content-Type": file.httpMetadata?.contentType || "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (match[2] === "tags") return photoTags(request, env, row);
  if (match[2] === "game-copy") return reviewGameCopy(request, env, row);
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
    const untaggedError = "Aggiungi almeno un tag prima di approvare: una foto con il solo «untagged» non si approva";
    if (data.decision === "approved" && !(await hasTags(env, row.id))) throw new HttpError(409, untaggedError);
    // The owner approves exactly what players will see: the uniform WebP game copy (docs/copie-di-gioco.v2.0.0.md).
    if (data.decision === "approved" && !(await hasGameCopy(env, row))) throw new HttpError(409, GAME_COPY_MISSING);
    const file = await env.QUARANTINE?.get(row.media_key);
    if (!file || file.size > 12_000_000) throw new HttpError(409, "File non disponibile per la revisione");
    if ([...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(x => x.toString(16).padStart(2, "0")).join("") !== row.sha256) throw new HttpError(409, "Il file è cambiato: revisione bloccata");
    const event = id(), now = new Date().toISOString();
    const result = await env.DB.batch([
      // The tag requirement is repeated inside the write, so a tag removed concurrently cannot slip through.
      env.DB.prepare(`INSERT INTO editorial_review_inbox_events SELECT ?,q.id,q.revision+1,?,?,?,?,? FROM editorial_review_effective_images q
        WHERE q.id=? AND q.revision=? AND q.sha256=? AND (?<>'approved' OR ${TAGGED})`)
        .bind(event, (await hash(env.ADMIN_TOKEN!)).slice(0, 12), data.decision, row.sha256,
          data.reason === undefined ? data.note : JSON.stringify({note:data.note,reason:data.reason}), now, row.id, row.revision, row.sha256, data.decision),
      env.DB.prepare("UPDATE editorial_review_inbox SET status=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM editorial_review_inbox_events WHERE id=?)")
        .bind(data.decision, row.id, row.revision, event),
    ]);
    if (!result[1].meta.changes) throw new HttpError(409, data.decision === "approved" && !(await hasTags(env, row.id)) ? untaggedError : "Decisione già aggiornata: ricaricare");
    return json({ saved: true, status: data.decision, revision: row.revision + 1, published: false });
  }
  throw new HttpError(405, "Metodo non consentito");
}

export const GAME_COPY_MISSING = "Prepara la copia di gioco prima di approvare: si approva ciò che vedranno i giocatori";
export async function hasGameCopy(env: Env, row: { id: string; source_sha256: string }): Promise<boolean> {
  return Boolean(await env.DB.prepare("SELECT 1 FROM editorial_review_game_copies WHERE inbox_id=? AND source_sha256=?")
    .bind(row.id, row.source_sha256).first());
}
/** POST /api/admin/review-inbox/:id/game-copy?source_sha256=: the WebP made in the owner's browser from the
 * file under review becomes the file shown, voted, admitted and served. The original stays as it is. */
async function reviewGameCopy(request: Request, env: Env, row: InboxRow): Promise<Response> {
  if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
  if (!env.QUARANTINE) throw new HttpError(503, "Storage non configurato");
  const asked = new URL(request.url).searchParams.get("source_sha256");
  const existing = await env.DB.prepare("SELECT sha256 FROM editorial_review_game_copies WHERE inbox_id=? AND source_sha256=?")
    .bind(row.id, row.source_sha256).first<{ sha256: string }>();
  // Asking with the source hash or with the copy's own hash both confirm the existing copy.
  if (existing && (asked === row.source_sha256 || asked === existing.sha256)) return json({ id: row.id, sha256: existing.sha256, already_prepared: true });
  if (asked !== row.source_sha256) throw new HttpError(409, "Immagine aggiornata: ricaricare la coda");
  if (row.status === "rejected") throw new HttpError(409, "Immagine rifiutata: nessuna copia di gioco");
  if (Number(request.headers.get("content-length") || 0) > GAME_COPY.maxBytes) throw new HttpError(413, "Copia di gioco oltre 4 MB");
  const upload = new Uint8Array(await request.arrayBuffer());
  if (!upload.length || upload.length > GAME_COPY.maxBytes) throw new HttpError(413, "Copia di gioco vuota o oltre 4 MB");
  let copy;
  try { copy = cleanImage(upload); } catch { throw new HttpError(415, "Copia di gioco non leggibile"); }
  if (copy.mime !== GAME_COPY.mime) throw new HttpError(415, "La copia di gioco deve essere WebP");
  // Before the copy exists, the effective file is the one under review: the copy must have its displayed shape.
  const source = await env.QUARANTINE.get(row.media_key);
  if (!source) throw new HttpError(409, "File in revisione non disponibile");
  const geometry = imageGeometry(new Uint8Array(await source.arrayBuffer()));
  const shown = { width: geometry.width ?? geometry.encoded_width, height: geometry.height ?? geometry.encoded_height };
  const expected = gameCopyDimensions(shown.width, shown.height), actual = imageDimensions(copy.bytes);
  if (actual.width !== expected.width || actual.height !== expected.height)
    throw new HttpError(409, `Dimensioni della copia ${actual.width}×${actual.height}, attese ${expected.width}×${expected.height}`);
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", copy.bytes))].map(x => x.toString(16).padStart(2, "0")).join("");
  const key = "game-copies/" + row.id + "/" + sha + ".webp";
  await env.QUARANTINE.put(key, copy.bytes, { httpMetadata: { contentType: GAME_COPY.mime }, customMetadata: { sha256: sha, source_sha256: row.source_sha256 } });
  await env.DB.prepare(`INSERT INTO editorial_review_game_copies(inbox_id,source_sha256,sha256,media_key,mime,width,height,bytes,recipe,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`)
    .bind(row.id, row.source_sha256, sha, key, GAME_COPY.mime, actual.width, actual.height, copy.bytes.length, GAME_COPY_RECIPE, new Date().toISOString()).run();
  const stored = await env.DB.prepare("SELECT sha256 FROM editorial_review_game_copies WHERE inbox_id=? AND source_sha256=?")
    .bind(row.id, row.source_sha256).first<{ sha256: string }>();
  if (!stored) throw new HttpError(409, "Copia di gioco non registrata: ricaricare la coda");
  return json({ id: row.id, sha256: stored.sha256, width: actual.width, height: actual.height, bytes: copy.bytes.length,
    already_prepared: stored.sha256 !== sha }, stored.sha256 === sha ? 201 : 200);
}
