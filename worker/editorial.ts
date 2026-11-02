import { prepareCandidate } from "./review-preparation";
import { preferences } from "./preferences";
import { body, hash, HttpError, id, json, type Env } from "./core";
import { httpsUrl, importText } from "./import";
import { recognizedLicense } from "../shared/licenses";
import { publishedDiagnostics } from "./publication";

function hex(data: Record<string, unknown>, key: string, length: number) {
  const value = importText(data, key, length);
  if (!new RegExp(`^[0-9a-f]{${length}}$`).test(value)) throw new HttpError(400, "Impronta non valida");
  return value;
}
export async function editorial(request: Request, env: Env, path: string): Promise<Response> {
  const base = "/api/admin/editorial";
  if (path === base + "/preferences" && request.method === "GET") return json(await preferences(env));
  if (path === base + "/prepare" && request.method === "POST") {
    const data = await body(request);
    return json(await prepareCandidate(env, importText(data, "image_id", 100)));
  }
  if (path === base + "/controls") {
    if (request.method === "PUT") {
      const data = await body(request);
      if (!Number.isInteger(data.queue_limit) || Number(data.queue_limit)<1 || Number(data.queue_limit)>1000) throw new HttpError(400,"Limite coda da 1 a 1000");
      await env.DB.prepare("UPDATE editorial_controls SET queue_limit=? WHERE id=1").bind(data.queue_limit).run();
    }
    return json(await env.DB.prepare("SELECT queue_limit FROM editorial_controls WHERE id=1").first());
  }
  if (path === base + "/state" && request.method === "GET") {
    const references = (await env.DB.prepare("SELECT * FROM reference_photos ORDER BY created_at,id").all()).results;
    const inventory = (await env.DB.prepare("SELECT i.id,i.type,i.sha256,i.perceptual_hash,s.provider,s.source_id,s.page_url AS source_url FROM images i LEFT JOIN sources s ON s.id=i.source_id").all()).results;
    const queue = await env.DB.prepare("SELECT count(*) AS count FROM images WHERE status IN ('candidate','in-review','approved') AND id NOT IN (SELECT image_id FROM published_images)").first();
    const attempts = (await env.DB.prepare("SELECT id,reference_id,image_id FROM editorial_attempts").all()).results;
    return json({ references, inventory, queue, attempts, preferences: await preferences(env), diagnostics: await publishedDiagnostics(env) });
  }
  if (path === base + "/budget" && request.method === "POST") {
    if (env.ENABLE_EDITORIAL_PAID !== "true") throw new HttpError(503, "Chiamate a pagamento non abilitate sul server");
    const data = await body(request);
    const kind = String(data.kind), run = importText(data, "run_id", 100), debitId = importText(data, "id", 100);
    if (!["evaluation", "generation", "regeneration"].includes(kind)) throw new HttpError(400, "Tipo di chiamata non valido");
    const number = (value: string | undefined, fallback: number) => {
      const n = value === undefined ? fallback : Number(value);
      if (!Number.isFinite(n) || n <= 0) throw new HttpError(503, "Budget server non configurato");
      return n;
    };
    // Explicit conservative upper bounds, supplied by the operator for the
    // selected models/parameters. Reservations are never refunded on errors.
    const cost = number(kind === "evaluation" ? env.EDITORIAL_EVALUATION_USD : env.EDITORIAL_GENERATION_USD, 0);
    const runCap = number(env.EDITORIAL_RUN_USD, 0), dailyCap = number(env.EDITORIAL_DAILY_USD, 0);
    const evaluations = number(env.EDITORIAL_MAX_EVALUATIONS, 60), generations = number(env.EDITORIAL_MAX_GENERATIONS, 20), regenerations = number(env.EDITORIAL_MAX_REGENERATIONS, 10);
    const now = new Date().toISOString(), day = now.slice(0, 10);
    const result = await env.DB.prepare(`INSERT INTO editorial_usage(id,run_id,day,kind,reserved_usd,created_at)
      SELECT ?,?,?,?,?,? WHERE
      COALESCE((SELECT sum(reserved_usd) FROM editorial_usage WHERE run_id=?),0)+?<=? AND
      COALESCE((SELECT sum(reserved_usd) FROM editorial_usage WHERE day=?),0)+?<=? AND
      (SELECT count(*) FROM editorial_usage WHERE run_id=? AND kind='evaluation')+(?='evaluation')<=? AND
      (SELECT count(*) FROM editorial_usage WHERE run_id=? AND kind IN ('generation','regeneration'))+(?!='evaluation')<=? AND
      (SELECT count(*) FROM editorial_usage WHERE run_id=? AND kind='regeneration')+(?='regeneration')<=?
      ON CONFLICT(id) DO NOTHING`).bind(debitId, run, day, kind, cost, now, run, cost, runCap, day, cost, dailyCap, run, kind, evaluations, run, kind, generations, run, kind, regenerations).run();
    if (!result.meta.changes) throw new HttpError(409, "Budget o limite di chiamate raggiunto; prenotazione già usata");
    return json({ reserved_usd: cost, day });
  }
  if (path === base + "/references" && request.method === "POST") {
    const data = await body(request, 500000);
    if (!Array.isArray(data.photos) || !data.photos.length || data.photos.length > 20) throw new HttpError(400, "Lotto da 1 a 20 fotografie richiesto");
    const batch = importText(data, "batch_id", 100), now = new Date().toISOString();
    const rows = data.photos as Record<string, unknown>[];
    const cutoff = Math.ceil(rows.length / 2);
    const statements = rows.map((row, index) => {
      const role = index < cutoff ? "REAL" : "SLOP";
      if (row.rank !== index + 1 || row.role !== role) throw new HttpError(400, "Assegnazione incompatibile con la classifica unica");
      const metadata = row.metadata as Record<string, unknown>;
      const evaluation = row.evaluation as Record<string, unknown>;
      if (!metadata || metadata.type !== "REAL" || !evaluation || typeof evaluation.score !== "number" || evaluation.score < 0 || evaluation.score > 100 || !String(evaluation.reason || "").trim()) throw new HttpError(400, "Metadati e valutazione richiesti");
      if (index && Number((rows[index-1].evaluation as Record<string, unknown>).score) < evaluation.score) throw new HttpError(400, "Classifica non ordinata");
      const license = recognizedLicense(metadata.license_url);
      if (!license || (role === "SLOP" && license.name.includes("ND"))) throw new HttpError(400, "Diritti della sorgente non compatibili con la reinterpretazione");
      return env.DB.prepare("INSERT INTO reference_photos VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(importText(row, "id", 100), importText(metadata, "provider", 100), importText(metadata, "source_id", 300), httpsUrl(importText(metadata, "source_url", 1000)), hex(row, "original_sha256", 64), hex(row, "file_sha256", 64), hex(row, "perceptual_hash", 16), role, batch, row.rank, JSON.stringify(metadata), JSON.stringify(evaluation), now);
    });
    try { await env.DB.batch(statements); }
    catch { throw new HttpError(409, "Lotto già registrato, duplicato o in conflitto con REAL: ricaricare lo stato"); }
    return json({ registered: rows.length }, 201);
  }
  const media = path.match(/^\/api\/admin\/editorial\/references\/([\w-]+)\/(original|preview)$/);
  if (media) {
    const row = await env.DB.prepare("SELECT * FROM reference_photos WHERE id=?").bind(media[1]).first<{ id: string; original_sha256: string; file_sha256: string }>();
    if (!row) throw new HttpError(404, "Sorgente non trovata");
    if (!env.QUARANTINE) throw new HttpError(503, "Quarantena mancante");
    const key = media[2] === "original" ? `originals/reference-${row.id}` : `references/${row.id}`;
    if (request.method === "GET") {
      const object = await env.QUARANTINE.get(key);
      if (!object) throw new HttpError(404, "File sorgente mancante");
      return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    if (request.method === "PUT") {
      if (Number(request.headers.get("Content-Length")) > 12000000) throw new HttpError(413, "File troppo grande");
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 12000000) throw new HttpError(413, "Dimensione non valida");
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2,"0")).join("");
      if (digest !== (media[2] === "original" ? row.original_sha256 : row.file_sha256)) throw new HttpError(409, "Impronta sorgente diversa dal registro");
      const b = new Uint8Array(bytes);
      const mime = b[0] === 255 && b[1] === 216 ? "image/jpeg" : b[0] === 137 && b[1] === 80 ? "image/png" : String.fromCharCode(...b.slice(0,4)) === "RIFF" && String.fromCharCode(...b.slice(8,12)) === "WEBP" ? "image/webp" : null;
      if (!mime) throw new HttpError(415, "Formato sorgente non valido");
      await env.QUARANTINE.put(key, bytes, { httpMetadata: { contentType: mime }, onlyIf: { etagDoesNotMatch: "*" } });
      return json({ archived: true });
    }
  }
  if (path === base + "/attempts" && request.method === "POST") {
    const data = await body(request, 100000);
    const uid = importText(data, "id", 100), reference = importText(data, "reference_id", 100);
    const prior = await env.DB.prepare("SELECT reference_id,image_id,dossier_json FROM editorial_attempts WHERE id=?").bind(uid).first<{ reference_id: string; image_id: string | null; dossier_json: string }>();
    if (prior) {
      if (prior.reference_id !== reference || prior.image_id !== (data.image_id ? String(data.image_id) : null) || prior.dossier_json !== JSON.stringify(data.dossier)) throw new HttpError(409,"Tentativo già archiviato con provenienza differente");
      if (prior.image_id) await prepareCandidate(env, prior.image_id);
      return json({ saved: true, already_saved: true });
    }
    const row = await env.DB.prepare("SELECT role FROM reference_photos WHERE id=?").bind(reference).first<{ role: string }>();
    if (!row || row.role !== "SLOP") throw new HttpError(400, "Sorgente SLOP richiesta");
    const dossier = data.dossier as Record<string, unknown>;
    if (!dossier || typeof dossier !== "object" || !dossier.timestamp || !dossier.status) throw new HttpError(400, "Dossier richiesto");
    const imageId = data.image_id ? String(data.image_id) : null;
    if (imageId && (!dossier.prompt || !dossier.model || !dossier.sha256 || !dossier.evaluation || dossier.status !== "accepted")) throw new HttpError(400, "Provenienza completa richiesta");
    if (imageId && !await env.DB.prepare("SELECT id FROM images WHERE id=? AND type='AI' AND ai_prompt=? AND ai_model=? AND sha256=? AND status='in-review'").bind(imageId, String(dossier.prompt), String(dossier.model), String(dossier.sha256)).first()) throw new HttpError(409, "Il dossier non corrisponde al file importato");
    await env.DB.prepare("INSERT INTO editorial_attempts VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(uid, reference, imageId, JSON.stringify(dossier), new Date().toISOString()).run();
    if (imageId) await prepareCandidate(env, imageId);
    return json({ saved: true });
  }
  if (path === base + "/reviews" && request.method === "POST") {
    const data = await body(request);
    const imageId = importText(data,"image_id",100), reference = importText(data,"reference_id",100);
    const photo = await env.DB.prepare("SELECT r.evaluation_json FROM reference_photos r JOIN images i ON i.type='REAL' AND i.sha256=r.file_sha256 JOIN sources s ON s.id=i.source_id AND s.provider=r.provider AND s.source_id=r.source_id WHERE r.id=? AND r.role='REAL' AND i.id=?").bind(reference,imageId).first<{ evaluation_json: string }>();
    if (!photo) throw new HttpError(400,"Candidata REAL e riferimento richiesti");
    await env.DB.prepare("INSERT INTO editorial_image_reviews VALUES(?,?,?,?) ON CONFLICT(image_id) DO NOTHING").bind(imageId,reference,photo.evaluation_json,new Date().toISOString()).run();
    await prepareCandidate(env, imageId);
    return json({ saved: true });
  }
  if (path === base + "/dossiers" && request.method === "GET") {
    const references = (await env.DB.prepare("SELECT * FROM reference_photos ORDER BY created_at DESC LIMIT 100").all()).results;
    const attempts = (await env.DB.prepare("SELECT a.*,i.status,p.published_at FROM editorial_attempts a LEFT JOIN images i ON i.id=a.image_id LEFT JOIN published_images p ON p.image_id=a.image_id ORDER BY a.created_at DESC LIMIT 300").all()).results;
    return json({ references, attempts });
  }
  if (path === base + "/publish" && request.method === "POST") {
    const data = await body(request);
    if (data.confirm !== true) throw new HttpError(400, "Conferma di pubblicazione richiesta");
    const uid = id(), now = new Date().toISOString();
    // Selection and insertion execute as ONE SQLite statement. The trigger
    // validates the full resulting catalog and inserts all members atomically.
    const result = await env.DB.prepare(`WITH waiting AS (
      SELECT i.id,i.type,i.demo,row_number() OVER(PARTITION BY i.demo,i.type ORDER BY i.created_at,i.id) AS n
      FROM images i WHERE i.status='approved' AND i.sha256!='pending' AND NOT EXISTS(SELECT 1 FROM published_images p WHERE p.image_id=i.id)
      AND (i.demo=1 OR EXISTS(SELECT 1 FROM review_events e WHERE e.image_id=i.id AND e.decision='approved'))
    ), capacities AS (SELECT demo,min(r,a) AS cap FROM (SELECT demo,sum(type='REAL') AS r,sum(type='AI') AS a FROM waiting GROUP BY demo))
    INSERT INTO publication_batches SELECT ?,json_group_array(w.id),?,? FROM waiting w JOIN capacities c ON c.demo=w.demo WHERE w.n<=c.cap HAVING count(*)>0`)
      .bind(uid, (await hash(env.ADMIN_TOKEN!)).slice(0,12), now).run();
    return json({ published: result.meta.changes > 0, batch_id: result.meta.changes ? uid : null, diagnostics: await publishedDiagnostics(env) });
  }
  throw new HttpError(404, "API editoriale inesistente");
}
