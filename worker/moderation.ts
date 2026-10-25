import {
  body,
  hash,
  HttpError,
  id,
  json,
  type Env,
  type ImageRow,
} from "./core";
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
  if (path === "/api/admin/images" && request.method === "GET") {
    const filter =
      new URL(request.url).searchParams.get("status") || "in-review";
    return json(
      (
        await env.DB.prepare(
          "SELECT i.*,s.page_url AS source_url,s.evidence,l.url AS license_url FROM images i LEFT JOIN sources s ON s.id=i.source_id LEFT JOIN licenses l ON l.id=i.license_id WHERE i.status=? ORDER BY i.created_at DESC LIMIT 100",
        )
          .bind(filter)
          .all()
      ).results,
    );
  }
  if (path === "/api/admin/import" && request.method === "POST") {
    const data = await body(request);
    const uid = id();
    const source = id();
    const license = id();
    if (!["REAL", "AI"].includes(String(data.type)))
      throw new HttpError(400, "Tipo immagine non valido");
    const type = String(data.type);
    const title = text(data, "title", 300);
    const author = text(data, "author", 300);
    const explanation = text(data, "explanation");
    const evidence = text(data, "evidence");
    const licenseUrl = data.license_url
      ? url(text(data, "license_url", 500))
      : "";
    const sourceUrl = url(text(data, "source_url", 1000));
    const provider = text(data, "provider", 100);
    const sourceId = text(data, "source_id", 300);
    const difficulty = String(data.difficulty || "medio");
    if (!["facile", "medio", "difficile"].includes(difficulty))
      throw new HttpError(400, "Difficoltà non valida");
    if (type === "AI" && data.owner_declaration !== true)
      throw new HttpError(400, "Dichiarazione del proprietario richiesta");
    const generationDate =
      type === "AI" ? text(data, "generation_date", 40) : null;
    if (generationDate && !/^\d{4}-\d{2}-\d{2}$/.test(generationDate))
      throw new HttpError(400, "Data di generazione YYYY-MM-DD richiesta");
    if (generationDate && Number.isNaN(Date.parse(generationDate)))
      throw new HttpError(400, "Data non valida");
    const model = type === "AI" ? text(data, "ai_model", 300) : null;
    const prompt = type === "AI" ? text(data, "ai_prompt", 8000) : null;
    const categories = Array.isArray(data.categories)
      ? data.categories.map(String).slice(0, 12)
      : [];
    if (!categories.length) throw new HttpError(400, "Categoria richiesta");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO sources VALUES(?,?,?,?,?)").bind(
        source,
        provider,
        sourceId,
        sourceUrl,
        evidence,
      ),
      env.DB.prepare("INSERT INTO licenses VALUES(?,?,?,?)").bind(
        license,
        String(data.license_name || "Da verificare").slice(0, 200),
        licenseUrl,
        "Obblighi da verificare editorialmente",
      ),
      env.DB.prepare(
        "INSERT INTO images(id,type,title,description,author,source_id,license_id,authenticity_evidence,r2_key,ai_model,ai_prompt,difficulty,status,sha256,explanation,demo,generation_date,owner_declaration) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'in-review','pending',?,0,?,?)",
      ).bind(
        uid,
        type,
        title,
        String(data.description || ""),
        author,
        source,
        license,
        evidence,
        id(),
        model,
        prompt,
        difficulty,
        explanation,
        generationDate,
        type === "AI" ? 1 : 0,
      ),
      ...categories.map((category) =>
        env.DB.prepare("INSERT INTO image_categories VALUES(?,?)").bind(
          uid,
          category,
        ),
      ),
    ]);
    return json(
      { id: uid, status: "in-review", upload: `/api/admin/assets/${uid}` },
      201,
    );
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
      await env.DB.prepare("UPDATE images SET sha256=? WHERE id=?")
        .bind(digest, image.id)
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
    const notes = text(data, "notes");
    const eventId = id();
    const audit = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO review_events SELECT ?,?,?,?,?,CURRENT_TIMESTAMP WHERE EXISTS(SELECT 1 FROM images WHERE id=? AND status='in-review')",
      ).bind(
        eventId,
        image.id,
        (await hash(env.ADMIN_TOKEN!)).slice(0, 12),
        decision,
        notes,
        image.id,
      ),
      env.DB.prepare(
        "UPDATE images SET status=?,difficulty=?,rights_verified_at=CURRENT_TIMESTAMP WHERE id=? AND status='in-review' AND EXISTS(SELECT 1 FROM review_events WHERE id=?)",
      ).bind(decision, difficulty, image.id, eventId),
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
