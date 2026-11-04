import { prepareCandidate } from "./review-preparation";
import { preferences } from "./preferences";
import { preferenceOrder, preferenceVersion } from "../shared/editorial-preferences";
import { editorial } from "./editorial";
import { prepareImport } from "./import";
import { slopStudio } from "./slop";
import {
  body,
  hash,
  HttpError,
  id,
  json,
  type Env,
  type ImageRow,
} from "./core";
import { curation } from "./curation";
import type { CurationRecord } from "../shared/curation";
import { recognizedLicense } from "../shared/licenses";
import { reviewInbox } from "./review-inbox";
function text(data: Record<string, unknown>, key: string, max = 4000) {
  const v = data[key];
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw new HttpError(400, `Campo richiesto o non valido: ${key}`);
  return v.trim();
}
function url(value: string) {
  if (!value.startsWith("https://"))
    throw new HttpError(400, "URL HTTPS richiesto");
  return value;
}
function referencePhoto(row: Record<string, unknown>) {
  return row.reference_id ? { id: String(row.reference_id), title: String(row.reference_title || "Fotografia sorgente"), source_url: String(row.reference_source_url || "") } : null;
}
export async function moderation(request: Request, env: Env, path: string) {
  if (path === "/api/admin/review-inbox" || path.startsWith("/api/admin/review-inbox/")) return reviewInbox(request, env, path);
  if (path.startsWith("/api/admin/editorial/")) return editorial(request, env, path);
  if (path === "/api/admin/slop" || path.startsWith("/api/admin/slop/")) return slopStudio(request, env, path);
  if (path === "/api/admin/review-queue" && request.method === "GET") {
    const [rows, counts, model] = await Promise.all([
      env.DB.prepare("SELECT p.image_id,p.token,p.snapshot_json,p.features_json,r.id AS reference_id,r.source_url AS reference_source_url,json_extract(r.metadata_json,'$.title') AS reference_title FROM editorial_preparations p JOIN images i ON i.id=p.image_id LEFT JOIN editorial_attempts a ON a.image_id=i.id LEFT JOIN reference_photos r ON r.id=a.reference_id AND r.role='SLOP' WHERE p.ready=1 AND i.status='in-review' ORDER BY i.created_at,i.id LIMIT 100").all<{ image_id: string; token: string; snapshot_json: string; features_json: string; reference_id: string | null; reference_title: string | null; reference_source_url: string | null }>(),
      env.DB.prepare("SELECT (SELECT count(*) FROM images WHERE status='in-review') AS pending,(SELECT count(*) FROM editorial_batch_runs WHERE status IN ('active','paused')) AS processing").first<{ pending: number; processing: number }>(),
      preferences(env),
    ]);
    const items = rows.results.map(row => ({ id: row.image_id, token: row.token, reference: referencePhoto(row), features: JSON.parse(row.features_json) as string[], details: JSON.parse(row.snapshot_json) as Record<string, unknown>, image: `/api/admin/assets/${encodeURIComponent(row.image_id)}` }));
    return json({ processing: counts?.processing || 0, images: preferenceOrder(items, model), ready: items.length, preparing: Math.max(0, (counts?.pending || 0) - items.length) });
  }
  const curationPath = path.match(/^\/api\/admin\/images\/([\w-]+)\/curation$/);
  if (curationPath) return curation(request, env, curationPath[1]);
  if (path === "/api/admin/images" && request.method === "GET") {
    const filter =
      new URL(request.url).searchParams.get("status") || "in-review";
    const items = (
      await env.DB.prepare(
        "SELECT i.*,s.page_url AS source_url,s.evidence,l.url AS license_url,p.id AS studio_plan_id,pub.published_at,er.evaluation_json AS editorial_evaluation,r.id AS reference_id,r.source_url AS reference_source_url,json_extract(r.metadata_json,'$.title') AS reference_title FROM images i LEFT JOIN sources s ON s.id=i.source_id LEFT JOIN licenses l ON l.id=i.license_id LEFT JOIN slop_plans p ON p.image_id=i.id LEFT JOIN published_images pub ON pub.image_id=i.id LEFT JOIN editorial_image_reviews er ON er.image_id=i.id LEFT JOIN editorial_attempts a ON a.image_id=i.id LEFT JOIN reference_photos r ON r.id=a.reference_id AND r.role='SLOP' WHERE i.status=? ORDER BY i.created_at DESC LIMIT 100",
      )
        .bind(filter)
        .all()
    ).results;
    if (!items.length) return json([]);
    const records = (
      await env.DB.prepare(
        `SELECT * FROM image_curation WHERE image_id IN (${items.map(() => "?").join(",")})`,
      ).bind(...items.map((item) => String(item.id))).all<CurationRecord>()
    ).results;
    const byImage = new Map(records.map((record) => [record.image_id, record]));
    return json(items.map((item) => ({
      ...item,
      reference: referencePhoto(item),
      curation: byImage.get(String(item.id)) || null,
    })));
  }
  if (path === "/api/admin/import" && request.method === "POST") {
    const data = await body(request);
    const prepared = prepareImport(env, data);
    const checksum = data.file_sha256;
    if (checksum !== undefined && (typeof checksum !== "string" || !/^[0-9a-f]{64}$/.test(checksum)))
      throw new HttpError(400, "SHA-256 del file non valido");
    const existing = async () => {
      const image = await env.DB.prepare(
        "SELECT i.id,i.type,i.status,i.sha256,i.r2_key,s.page_url FROM images i JOIN sources s ON s.id=i.source_id WHERE s.provider=? AND s.source_id=?",
      ).bind(String(data.provider).trim(), String(data.source_id).trim())
        .first<{ id: string; type: string; status: string; sha256: string; r2_key: string; page_url: string }>();
      if (!image) return null;
      if (image.type !== data.type || image.page_url !== String(data.source_url).trim() || (image.sha256 !== "pending" && image.sha256 !== checksum))
        throw new HttpError(409, "Fonte già importata con tipo, URL o file differente");
      const original = await env.QUARANTINE?.head(`originals/${image.id}`);
      const uploaded = image.sha256 !== "pending" && Boolean(await env.QUARANTINE?.head(image.r2_key));
      return json({ id: image.id, status: image.status, sha256: image.sha256, uploaded,
        original_sha256: original?.customMetadata?.sha256 || null, already_imported: true,
        upload: `/api/admin/assets/${image.id}` });
    };
    // Direct batch imports may resume after losing the POST response or failing
    // an upload. Existing metadata/review decisions are never overwritten.
    if (checksum) {
      const response = await existing();
      if (response) return response;
      if (await env.DB.prepare("SELECT id FROM images WHERE sha256=?").bind(checksum).first())
        throw new HttpError(409, "File già presente nel catalogo con un’altra fonte");
    }
    try {
      await env.DB.batch(prepared.statements);
    } catch (error) {
      // A concurrent import can win the unique provider/source constraint.
      if (checksum) {
        const response = await existing();
        if (response) return response;
      }
      if (error instanceof Error && /reference|queue limit/i.test(error.message)) throw new HttpError(409, "Fonte riservata alla generazione SLOP o coda privata piena");
      throw error;
    }
    return json({ id: prepared.id, status: "in-review", upload: `/api/admin/assets/${prepared.id}` }, 201);
  }
  if (path === "/api/admin/import" && request.method === "GET")
    return json({ direct_import: 1, attempt_media_archive: Boolean(env.QUARANTINE), original_archive: true, quarantine_configured: Boolean(env.QUARANTINE), images_configured: Boolean(env.IMAGES) });
  const asset = path.match(/^\/api\/admin\/(assets|originals)\/([\w-]+)$/);
  if (asset) {
    const original = asset[1] === "originals";
    const image = await env.DB.prepare("SELECT * FROM images WHERE id=?")
      .bind(asset[2])
      .first<ImageRow>();
    if (!image) throw new HttpError(404, "Immagine non trovata");
    if (!env.QUARANTINE)
      throw new HttpError(503, "Quarantena privata non configurata");
    const key = original ? `originals/${image.id}` : image.r2_key;
    if (request.method === "GET") {
      const object = await env.QUARANTINE.get(key);
      if (!object) throw new HttpError(404, "File non caricato");
      return new Response(object.body, {
        headers: {
          "Content-Type": object.httpMetadata?.contentType || "image/webp",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (request.method === "PUT") {
      if (
        !["candidate", "in-review"].includes(
          (image as ImageRow & { status: string }).status,
        )
      )
        throw new HttpError(409, "Immagine già revisionata");
      const perceptualHash = request.headers.get("X-Perceptual-Hash");
      if (perceptualHash !== null && !/^[0-9a-f]{16}$/i.test(perceptualHash))
        throw new HttpError(400, "dHash richiesto in 16 caratteri esadecimali");
      if (Number(request.headers.get("content-length") || 0) > 12000000)
        throw new HttpError(413, "File troppo grande");
      const buffer = await request.arrayBuffer();
      if (buffer.byteLength > 12000000)
        throw new HttpError(413, "File troppo grande");
      const b = new Uint8Array(buffer);
      const mime =
        b[0] === 255 && b[1] === 216
          ? "image/jpeg"
          : b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71
            ? "image/png"
            : String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
                String.fromCharCode(...b.slice(8, 12)) === "WEBP"
              ? "image/webp"
              : null;
      if (!mime) throw new HttpError(415, "Usare JPEG, PNG o WebP");
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
      )
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      if (original) {
        const existing = await env.QUARANTINE.head(key);
        if (existing) {
          if (existing.customMetadata?.sha256 !== digest)
            throw new HttpError(409, "Originale già archiviato con contenuto differente");
          return json({ uploaded: true, sha256: digest, already_archived: true });
        }
        const stored = await env.QUARANTINE.put(key, buffer, {
          httpMetadata: { contentType: mime }, customMetadata: { sha256: digest },
          onlyIf: { etagDoesNotMatch: "*" },
        });
        if (!stored && (await env.QUARANTINE.head(key))?.customMetadata?.sha256 !== digest)
          throw new HttpError(409, "Originale archiviato da un’altra importazione");
        return json({ uploaded: true, sha256: digest });
      }
      const duplicate = await env.DB.prepare(
        "SELECT id FROM images WHERE sha256=? AND id<>?",
      )
        .bind(digest, image.id)
        .first();
      if (duplicate) throw new HttpError(409, "File duplicato");
      await env.QUARANTINE.put(image.r2_key, buffer, {
        httpMetadata: { contentType: mime },
      });
      // The trusted reviewer may supply the offline pipeline's dHash for these
      // bytes. A replacement without it must clear any previous fingerprint.
      await env.DB.prepare("UPDATE images SET sha256=?,perceptual_hash=? WHERE id=?")
        .bind(digest, perceptualHash?.toLowerCase() || null, image.id)
        .run();
      return json({ uploaded: true });
    }
  }
  const review = path.match(/^\/api\/admin\/(?:review|visual-review)\/([\w-]+)$/);
  if (review && request.method === "POST") {
    const data = await body(request);
    const quick = path.includes("/visual-review/");
    if (quick && Object.keys(data).some(key => !["decision", "token"].includes(key))) throw new HttpError(400, "La revisione visiva accetta soltanto decisione e scheda preparata");
    const decision = String(data.decision);
    if (!["approved", "rejected"].includes(decision))
      throw new HttpError(400, "Decisione non valida");
    const image = await env.DB.prepare(
      "SELECT i.*,l.url AS license_url FROM images i LEFT JOIN licenses l ON l.id=i.license_id WHERE i.id=?",
    )
      .bind(review[1])
      .first<
        ImageRow & { status: string; license_url: string; sha256: string }
      >();
    if (!image) throw new HttpError(404, "Immagine non trovata");
    if (image.status !== "in-review")
      throw new HttpError(409, "Decisione già registrata");
    const prepared = quick ? await prepareCandidate(env, image.id) : null;
    if (prepared && (!prepared.ready || data.token !== prepared.token)) throw new HttpError(409, "Candidata aggiornata o non pronta: ricaricare la coda");
    const categories = Array.isArray(data.categories)
      ? data.categories.map(String).slice(0, 12)
      : [];
    const verifiedLicense = data.license_url
      ? text(data, "license_url", 500)
      : image.license_url;
    const license = recognizedLicense(verifiedLicense);
    const licenseUrl = license?.url || (data.license_url ? url(verifiedLicense) : verifiedLicense);
    if (data.notes !== undefined && (typeof data.notes !== "string" || data.notes.length > 4000)) throw new HttpError(400, "Nota non valida");
    const notes = String(data.notes ?? "").trim();
    const explanation = data.explanation === undefined ? image.explanation : text(data, "explanation");
    const auditNotes = prepared ? JSON.stringify({ interface: "visual", preparation_token: prepared.token, prepared_snapshot: prepared.snapshot }) : explanation === image.explanation ? notes : JSON.stringify({ notes, changes: { explanation: { before: image.explanation, after: explanation } } });
    if (decision === "approved") {
      if (
        !license ||
        (!quick && data.rights_confirmed !== true) ||
        (!quick && data.authenticity_confirmed !== true)
      )
        throw new HttpError(
          400,
          "Confermare diritti e autenticità/invenzione; licenza compatibile richiesta",
        );
      if (image.sha256 === "pending" || !env.QUARANTINE || !env.IMAGES)
        throw new HttpError(409, "File o storage mancanti");
      const object = await env.QUARANTINE.get(image.r2_key);
      if (!object) throw new HttpError(409, "File quarantena mancante");
      if (prepared && object.etag !== prepared.snapshot.derivative_etag) throw new HttpError(409, "File aggiornato: ricaricare la coda");
      await env.IMAGES.put(image.r2_key, object.body, {
        httpMetadata: object.httpMetadata,
      });
    }
    const eventId = id();
    const audit = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO review_events SELECT ?,?,?,?,?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM images WHERE id=? AND status='in-review') AND (? IS NULL OR EXISTS(SELECT 1 FROM editorial_preparations WHERE image_id=? AND token=? AND ready=1))",
      ).bind(
        eventId,
        image.id,
        (await hash(env.ADMIN_TOKEN!)).slice(0, 12),
        decision,
        auditNotes,
        image.id,
        prepared?.token || null, image.id, prepared?.token || null,
      ),
      ...(prepared ? [env.DB.prepare("INSERT INTO editorial_feedback SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM review_events WHERE id=?)").bind(eventId, image.id, decision, JSON.stringify(prepared.features), prepared.token, preferenceVersion, new Date().toISOString(), eventId)] : []),
      env.DB.prepare(
        "UPDATE images SET status=?,explanation=?,rights_verified_at=CURRENT_TIMESTAMP WHERE id=? AND status='in-review' AND EXISTS(SELECT 1 FROM review_events WHERE id=?)",
      ).bind(decision, explanation, image.id, eventId),
      env.DB.prepare(
        "UPDATE licenses SET url=?,name=? WHERE id=(SELECT license_id FROM images WHERE id=?) AND EXISTS(SELECT 1 FROM review_events WHERE id=?)",
      ).bind(
        licenseUrl,
        license?.name || "Da verificare",
        image.id,
        eventId,
      ),
      ...(categories.length
        ? [
            env.DB.prepare(
              "DELETE FROM image_categories WHERE image_id=? AND EXISTS(SELECT 1 FROM review_events WHERE id=?)",
            ).bind(image.id, eventId),
            ...categories.map((c) =>
              env.DB.prepare(
                "INSERT INTO image_categories SELECT ?,? WHERE EXISTS(SELECT 1 FROM review_events WHERE id=?)",
              ).bind(image.id, c, eventId),
            ),
          ]
        : []),
    ]);
    if (!audit[0].meta.changes)
      throw new HttpError(409, "Decisione già registrata");
    return json({
      status: decision,
      scope:
        env.DATA_MODE === "demo"
          ? "local/demo: nessuna promozione in produzione"
          : "ambiente corrente",
    });
  }
  throw new HttpError(404, "API amministrativa inesistente");
}
