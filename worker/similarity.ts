import { body, hash, HttpError, id, json, type Env } from "./core";
import { privateMedia } from "./storage";
import { syncReviewInbox } from "./review-inbox";
import { compareSameOrigin, sameOrigin, defaultSimilarityThreshold, normalizedEmbedding, similarityIndexVersion, similarityVersion, type SimilarityFeature } from "../shared/similarity";

const base = "/api/admin/similarity";
interface Asset { id: string; sha256: string; origin: string; title: string; media_key: string; store: string; status: string; categories: string; indexed: number; cached: number }
interface FeatureRow extends Asset { dhash: string; embedding_json: string }
interface Pair { id: string; a: string; b: string; a_sha256: string; b_sha256: string; revision: number; decision: string; reason: string; cosine: number; distance: number }
// Legacy cross-origin rows remain in the audit archive but cannot be listed,
// reviewed, counted, or applied to a game under the corrected policy.
const currentPairs = `(SELECT p.* FROM similarity_current_pairs p JOIN similarity_assets x ON x.id=p.a JOIN similarity_assets y ON y.id=p.b WHERE x.origin=y.origin)`;
const selectAssets = `SELECT a.*,
 (SELECT json_group_array(category_id) FROM similarity_asset_categories c WHERE c.asset_id=a.id) AS categories,
 EXISTS(SELECT 1 FROM similarity_indexed_assets x WHERE x.asset_id=a.id AND x.sha256=a.sha256 AND x.model=?) AS indexed,
 EXISTS(SELECT 1 FROM similarity_features f WHERE f.sha256=a.sha256 AND f.model=?) AS cached FROM similarity_assets a`;
const visible = (a: Asset) => ({ id: a.id, sha256: a.sha256, origin: a.origin, title: a.title, status: a.status,
  categories: JSON.parse(a.categories || "[]") as string[], indexed: !!a.indexed, cached: !!a.cached, image: `${base}/assets/${encodeURIComponent(a.id)}/image` });
async function asset(env: Env, uid: string) {
  const row = await env.DB.prepare(selectAssets + " WHERE a.id=?").bind(similarityIndexVersion, similarityVersion, uid).first<Asset>();
  if (!row) throw new HttpError(404, "Immagine non trovata");
  return row;
}
async function file(env: Env, row: Asset) {
  const object = await (row.store === "IMAGES" ? env.IMAGES : env.QUARANTINE)?.get(row.media_key);
  if (!object) throw new HttpError(409, "File non disponibile per l’analisi");
  return object;
}
function validateFeature(data: Record<string, unknown>): SimilarityFeature {
  try {
    if (typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.sha256) ||
        typeof data.dhash !== "string" || !/^[a-f0-9]{16}$/.test(data.dhash) || data.model !== similarityVersion) throw Error();
    return { sha256: data.sha256, dhash: data.dhash, embedding: normalizedEmbedding(data.embedding) };
  } catch { throw new HttpError(400, "Impronta o versione del modello non valida"); }
}
export async function similarity(request: Request, env: Env, path: string): Promise<Response> {
  const url = new URL(request.url);
  if (path === base && request.method === "GET") {
    await syncReviewInbox(env);
    const counts = await env.DB.prepare(`SELECT count(*) AS total,
      sum(a.origin='REAL') AS real, sum(a.origin='AI') AS slop,
      sum(NOT EXISTS(SELECT 1 FROM similarity_indexed_assets x WHERE x.asset_id=a.id AND x.sha256=a.sha256 AND x.model=?)) AS pending,
      (SELECT count(*) FROM ${currentPairs} WHERE decision='pending') AS pairs,
      (SELECT count(*) FROM similarity_assets a WHERE NOT EXISTS(SELECT 1 FROM similarity_asset_categories c WHERE c.asset_id=a.id)) AS uncategorized
      FROM similarity_assets a`).bind(similarityIndexVersion).first();
    return json({ ...counts, model: similarityVersion, index_version: similarityIndexVersion, comparison_scope: "same_origin", threshold: defaultSimilarityThreshold });
  }
  if (path === base + "/assets" && request.method === "GET") {
    await syncReviewInbox(env);
    const after = url.searchParams.get("after") || "", category = url.searchParams.get("category") || "", origin = url.searchParams.get("origin") || "all";
    if (!["all", "REAL", "AI"].includes(origin)) throw new HttpError(400, "Origine non valida");
    const rows = await env.DB.prepare(selectAssets + ` WHERE a.id>? AND (?='all' OR a.origin=?) AND (?='' OR EXISTS(SELECT 1 FROM similarity_asset_categories c WHERE c.asset_id=a.id AND c.category_id=?)) ORDER BY a.id LIMIT 100`)
      .bind(similarityIndexVersion, similarityVersion, after, origin, origin, category, category).all<Asset>();
    return json({ assets: rows.results.map(visible), next: rows.results.length === 100 ? rows.results.at(-1)!.id : null });
  }
  const image = path.match(/^\/api\/admin\/similarity\/assets\/([\w-]+)\/(image|features|categories)$/);
  if (image) {
    const row = await asset(env, image[1]);
    if (image[2] === "image" && request.method === "GET") {
      const object = await file(env, row);
      return privateMedia(new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/webp", "X-Content-Type-Options": "nosniff" } }), "Authorization");
    }
    if (image[2] === "categories" && request.method === "POST") {
      const data = await body(request);
      if (data.sha256 !== row.sha256 || !Array.isArray(data.categories) || data.categories.length > 30 || data.categories.some(x => typeof x !== "string")) throw new HttpError(400, "Categorie non valide");
      const known = (await env.DB.prepare("SELECT id FROM categories").all<{ id: string }>()).results.map(x => x.id);
      if (data.categories.some(x => !known.includes(x))) throw new HttpError(400, "Categoria inesistente");
      await env.DB.batch([env.DB.prepare("DELETE FROM similarity_categories WHERE asset_id=?").bind(row.id),
        ...[...new Set(data.categories as string[])].map(category => env.DB.prepare("INSERT INTO similarity_categories VALUES(?,?)").bind(row.id, category))]);
      return json({ saved: true });
    }
    if (image[2] === "features" && request.method === "POST") {
      const data = await body(request, 30_000);
      if (data.sha256 !== row.sha256 || data.model !== similarityVersion) throw new HttpError(409, "Immagine cambiata: ricaricare prima dell’analisi");
      let stored = await env.DB.prepare("SELECT dhash,embedding_json FROM similarity_features WHERE sha256=? AND model=?").bind(row.sha256, similarityVersion).first<{ dhash: string; embedding_json: string }>();
      if (!stored) {
        const feature = validateFeature(data), object = await file(env, row);
        if (object.size > 12_000_000) throw new HttpError(413, "Immagine troppo grande");
        const actual = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await object.arrayBuffer()))].map(x => x.toString(16).padStart(2, "0")).join("");
        if (actual !== row.sha256) throw new HttpError(409, "Il file non corrisponde all’impronta archiviata");
        await env.DB.prepare("INSERT INTO similarity_features VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING")
          .bind(row.sha256, similarityVersion, feature.dhash, JSON.stringify(feature.embedding), new Date().toISOString()).run();
        stored = (await env.DB.prepare("SELECT dhash,embedding_json FROM similarity_features WHERE sha256=? AND model=?").bind(row.sha256, similarityVersion).first<{ dhash: string; embedding_json: string }>())!;
      }
      const own = { origin: row.origin, sha256: row.sha256, dhash: stored.dhash, embedding: JSON.parse(stored.embedding_json) as number[] };
      let after = "", matches = 0;
      // Page the corpus: bounded memory, no silently truncated comparison set.
      while (true) {
        const others = await env.DB.prepare(`SELECT a.id,a.sha256,a.origin,f.dhash,f.embedding_json FROM similarity_assets a JOIN similarity_features f ON f.sha256=a.sha256 AND f.model=? WHERE a.origin=? AND a.id!=? AND a.id>? ORDER BY a.id LIMIT 100`)
          .bind(similarityVersion, row.origin, row.id, after).all<FeatureRow>();
        const statements: D1PreparedStatement[] = [];
        for (const other of others.results) {
          const result = compareSameOrigin(own, { origin: other.origin, sha256: other.sha256, dhash: other.dhash, embedding: JSON.parse(other.embedding_json) as number[] });
          if (!result?.reason) continue;
          const [a, b] = row.id < other.id ? [row, other] : [other, row];
          statements.push(env.DB.prepare(`INSERT INTO similarity_pairs(id,a,b,a_sha256,b_sha256,model,reason,cosine,distance,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(a,b,a_sha256,b_sha256,model) DO NOTHING`)
            .bind(await hash(JSON.stringify([a.id, b.id, a.sha256, b.sha256, similarityVersion])), a.id, b.id, a.sha256, b.sha256, similarityVersion, result.reason, result.cosine, result.distance, new Date().toISOString()));
          matches++;
        }
        if (statements.length) await env.DB.batch(statements);
        if (others.results.length < 100) break;
        after = others.results.at(-1)!.id;
      }
      // This also rechecks new identities whose bytes already had a fingerprint.
      await env.DB.prepare("INSERT INTO similarity_indexed_assets VALUES(?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET sha256=excluded.sha256,model=excluded.model,indexed_at=excluded.indexed_at")
        .bind(row.id, row.sha256, similarityIndexVersion, new Date().toISOString()).run();
      return json({ indexed: true, matches });
    }
  }
  if (path === base + "/pairs" && request.method === "GET") {
    const decision = url.searchParams.get("decision") || "pending", category = url.searchParams.get("category") || "", origin = url.searchParams.get("origin") || "all";
    const offset = Number(url.searchParams.get("offset") || 0);
    if (!["pending", "different", "same_scene", "prefer_a", "prefer_b", "all"].includes(decision) || !["all", "REAL", "AI"].includes(origin) || !Number.isSafeInteger(offset) || offset < 0) throw new HttpError(400, "Filtro non valido");
    const where = ` WHERE (?='all' OR p.decision=?) AND (?='all' OR EXISTS(SELECT 1 FROM similarity_assets a WHERE a.id=p.a AND a.origin=?)) AND (?='' OR EXISTS(SELECT 1 FROM similarity_asset_categories c WHERE c.asset_id IN(p.a,p.b) AND c.category_id=?))`;
    const args = [decision, decision, origin, origin, category, category];
    const [rows, total] = await Promise.all([
      env.DB.prepare(`SELECT p.* FROM ${currentPairs} p` + where + " ORDER BY CASE p.reason WHEN 'exact' THEN 0 WHEN 'perceptual' THEN 1 ELSE 2 END,p.cosine DESC,p.id LIMIT 20 OFFSET ?").bind(...args, offset).all<Pair>(),
      env.DB.prepare(`SELECT count(*) AS total FROM ${currentPairs} p` + where).bind(...args).first<{ total: number }>(),
    ]);
    const pairs = [];
    for (const pair of rows.results) pairs.push({ ...pair, left: visible(await asset(env, pair.a)), right: visible(await asset(env, pair.b)) });
    return json({ pairs, total: total?.total || 0, offset });
  }
  if (path === base + "/pairs" && request.method === "POST") {
    const data = await body(request, 2000);
    if (typeof data.a !== "string" || typeof data.b !== "string" || data.a === data.b) throw new HttpError(400, "Seleziona due immagini diverse");
    const [a, b] = await Promise.all([asset(env, data.a < data.b ? data.a : data.b), asset(env, data.a < data.b ? data.b : data.a)]);
    if (!sameOrigin(a, b)) throw new HttpError(400, "Confronta REAL con REAL oppure SLOP con SLOP");
    const uid = await hash(JSON.stringify([a.id, b.id, a.sha256, b.sha256, similarityVersion]));
    await env.DB.prepare(`INSERT INTO similarity_pairs(id,a,b,a_sha256,b_sha256,model,reason,created_at) VALUES(?,?,?,?,?,?,'manual',?) ON CONFLICT DO NOTHING`)
      .bind(uid, a.id, b.id, a.sha256, b.sha256, similarityVersion, new Date().toISOString()).run();
    return json({ id: uid });
  }
  const pairPath = path.match(/^\/api\/admin\/similarity\/pairs\/([\w-]+)\/(decision|history)$/);
  if (pairPath) {
    const pair = await env.DB.prepare(`SELECT * FROM ${currentPairs} WHERE id=?`).bind(pairPath[1]).first<Pair>();
    if (!pair) throw new HttpError(404, "Coppia non disponibile o immagini cambiate");
    if (pairPath[2] === "history" && request.method === "GET") return json({ events: (await env.DB.prepare("SELECT decision,note,revision,created_at FROM similarity_events WHERE pair_id=? ORDER BY revision").bind(pair.id).all()).results });
    if (pairPath[2] === "decision" && request.method === "POST") {
      const data = await body(request, 5000);
      if (!["pending", "different", "same_scene", "prefer_a", "prefer_b"].includes(String(data.decision)) || data.revision !== pair.revision || data.a_sha256 !== pair.a_sha256 || data.b_sha256 !== pair.b_sha256 || typeof data.note !== "string" || data.note.length > 2000) throw new HttpError(409, "Coppia aggiornata: ricaricare prima di decidere");
      const event = id();
      try {
        const results = await env.DB.batch([
          env.DB.prepare(`INSERT INTO similarity_events SELECT ?,id,revision+1,?,a_sha256,b_sha256,?,?,? FROM ${currentPairs} WHERE id=? AND revision=? AND a_sha256=? AND b_sha256=?`)
            .bind(event, data.decision, (await hash(env.ADMIN_TOKEN!)).slice(0, 12), data.note, new Date().toISOString(), pair.id, pair.revision, pair.a_sha256, pair.b_sha256),
          env.DB.prepare("UPDATE similarity_pairs SET decision=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM similarity_events WHERE id=?)")
            .bind(data.decision, pair.id, pair.revision, event),
        ]);
        if (!results[1].meta.changes) throw new HttpError(409, "Decisione già aggiornata");
      } catch (error) {
        if (error instanceof HttpError) throw error;
        if (error instanceof Error && /UNIQUE/.test(error.message)) throw new HttpError(409, "Decisione già aggiornata");
        throw error;
      }
      return json({ saved: true, revision: pair.revision + 1 });
    }
  }
  throw new HttpError(405, "Metodo non consentito");
}
