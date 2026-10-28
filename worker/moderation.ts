import { parseDriveArchive } from "./drive";
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
const allowedLicenses = [
  "https://creativecommons.org/publicdomain/zero/1.0/",
  "https://creativecommons.org/publicdomain/mark/1.0/",
  "https://creativecommons.org/licenses/by/4.0/",
  "https://creativecommons.org/licenses/by-sa/4.0/",
];
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
export async function moderation(request: Request, env: Env, path: string) {
  if (path === "/api/admin/slop" || path.startsWith("/api/admin/slop/")) return slopStudio(request, env, path);
  const curationPath = path.match(/^\/api\/admin\/images\/([\w-]+)\/curation$/);
  if (curationPath) return curation(request, env, curationPath[1]);
  if (path === "/api/admin/images" && request.method === "GET") {
    const filter =
      new URL(request.url).searchParams.get("status") || "in-review";
    const items = (
      await env.DB.prepare(
        "SELECT i.*,s.page_url AS source_url,s.evidence,l.url AS license_url,p.id AS studio_plan_id,a.drive_file_id AS archive_drive_file_id,a.drive_manifest_id AS archive_drive_manifest_id FROM images i LEFT JOIN sources s ON s.id=i.source_id LEFT JOIN licenses l ON l.id=i.license_id LEFT JOIN slop_plans p ON p.image_id=i.id LEFT JOIN image_archives a ON a.image_id=i.id WHERE i.status=? ORDER BY i.created_at DESC LIMIT 100",
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
      curation: byImage.get(String(item.id)) || null,
    })));
  }
  if (path === "/api/admin/import" && request.method === "POST") {
    const data = await body(request);
    const archive = parseDriveArchive(data.drive_archive);
    if (archive) {
      const existing = await env.DB.prepare(
        "SELECT a.image_id AS id,a.original_sha256 AS sha256,i.status FROM image_archives a JOIN images i ON i.id=a.image_id WHERE a.drive_file_id=?",
      ).bind(archive.fileId).first<{ id: string; sha256: string; status: string }>();
      if (existing) {
        if (existing.sha256 !== archive.sha256)
          throw new HttpError(409, "Originale Drive modificato: revisione manuale richiesta");
        return json({ id: existing.id, status: existing.status, already_imported: true,
          upload: `/api/admin/assets/${existing.id}` });
      }
    }
    const prepared = prepareImport(env, data);
    const statements = [...prepared.statements];
    if (archive) statements.push(env.DB.prepare(
      "INSERT INTO image_archives(image_id,drive_file_id,drive_manifest_id,original_sha256) VALUES(?,?,?,?)",
    ).bind(prepared.id, archive.fileId, archive.manifestId, archive.sha256));
    // Candidate and provenance are inserted atomically; unique Drive IDs reject
    // parallel re-imports. Retrying afterwards returns the existing candidate.
    await env.DB.batch(statements);
    return json({ id: prepared.id, status: "in-review", upload: `/api/admin/assets/${prepared.id}` }, 201);
  }
  const asset = path.match(/^\/api\/admin\/assets\/([\w-]+)$/);
  if (asset) {
    const image = await env.DB.prepare("SELECT * FROM images WHERE id=?")
      .bind(asset[1])
      .first<ImageRow>();
    if (!image) throw new HttpError(404, "Immagine non trovata");
    if (!env.QUARANTINE)
      throw new HttpError(503, "Quarantena privata non configurata");
    if (request.method === "GET") {
      const object = await env.QUARANTINE.get(image.r2_key);
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
  const review = path.match(/^\/api\/admin\/review\/([\w-]+)$/);
  if (review && request.method === "POST") {
    const data = await body(request);
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
    const difficulty = String(data.difficulty || image.difficulty);
    if (!["facile", "medio", "difficile"].includes(difficulty))
      throw new HttpError(400, "Difficoltà non valida");
    const categories = Array.isArray(data.categories)
      ? data.categories.map(String).slice(0, 12)
      : [];
    const verifiedLicense = data.license_url
      ? url(text(data, "license_url", 500))
      : image.license_url;
    const notes = text(data, "notes");
    const explanation = data.explanation === undefined ? image.explanation : text(data, "explanation");
    const auditNotes = explanation === image.explanation ? notes : JSON.stringify({ notes, changes: { explanation: { before: image.explanation, after: explanation } } });
    if (decision === "approved") {
      if (
        !allowedLicenses.includes(verifiedLicense) ||
        data.rights_confirmed !== true ||
        data.authenticity_confirmed !== true
      )
        throw new HttpError(
          400,
          "Confermare diritti e autenticità/invenzione; licenza compatibile richiesta",
        );
      if (image.sha256 === "pending" || !env.QUARANTINE || !env.IMAGES)
        throw new HttpError(409, "File o storage mancanti");
      const object = await env.QUARANTINE.get(image.r2_key);
      if (!object) throw new HttpError(409, "File quarantena mancante");
      await env.IMAGES.put(image.r2_key, object.body, {
        httpMetadata: object.httpMetadata,
      });
    }
    const eventId = id();
    const audit = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO review_events SELECT ?,?,?,?,?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM images WHERE id=? AND status='in-review')",
      ).bind(
        eventId,
        image.id,
        (await hash(env.ADMIN_TOKEN!)).slice(0, 12),
        decision,
        auditNotes,
        image.id,
      ),
      env.DB.prepare(
        "UPDATE images SET status=?,difficulty=?,explanation=?,rights_verified_at=CURRENT_TIMESTAMP WHERE id=? AND status='in-review' AND EXISTS(SELECT 1 FROM review_events WHERE id=?)",
      ).bind(decision, difficulty, explanation, image.id, eventId),
      env.DB.prepare(
        "UPDATE licenses SET url=?,name=? WHERE id=(SELECT license_id FROM images WHERE id=?) AND EXISTS(SELECT 1 FROM review_events WHERE id=?)",
      ).bind(
        verifiedLicense,
        allowedLicenses.includes(verifiedLicense)
          ? ["CC0", "Public Domain Mark", "CC BY 4.0", "CC BY-SA 4.0"][
              allowedLicenses.indexOf(verifiedLicense)
            ]
          : "Da verificare",
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
