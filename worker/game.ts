import {
  body,
  catalog,
  hash,
  HttpError,
  id,
  json,
  rateLimit,
  type Env,
  type ImageRow,
} from "./core";
import { media, privateMedia } from "./storage";
import { mediaProtocol, preparationTtlMs } from "../shared/preloading";
import { curatedSample } from "./sampling";
export { curatedSample } from "./sampling";
export function settings(data: Record<string, unknown>) {
  const mode = data.mode;
  if (mode !== "training" && mode !== "timed")
    throw new HttpError(400, "Modalità non valida");
  const count = data.count ?? 10;
  const duration = data.duration ?? 60;
  if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 50)
    throw new HttpError(400, "Numero domande da 1 a 50");
  if (![60, 120, 180].includes(Number(duration)))
    throw new HttpError(400, "Durata non valida");
  const categories = Array.isArray(data.categories)
    ? data.categories.map(String).slice(0, 30)
    : [];
  return {
    mode,
    count: Number(count),
    duration: Number(duration),
    categories,
  };
}
export async function filteredCatalog(
  env: Env,
  filters: { categories: string[] },
) {
  let rows = await catalog(env);
  const demo = env.DATA_MODE === "demo" ? 1 : 0;
  const [assignments, metadata] = await Promise.all([
    env.DB.prepare("SELECT ic.image_id,ic.category_id FROM image_categories ic JOIN images i ON i.id=ic.image_id WHERE i.id IN (SELECT image_id FROM published_images) AND i.demo=?")
      .bind(demo).all<{ image_id: string; category_id: string }>(),
    env.DB.prepare("SELECT c.image_id,c.subject_kind,c.image_medium,c.composition,c.period_bucket,c.country_or_region,c.perceived_plausibility FROM image_curation c JOIN images i ON i.id=c.image_id WHERE i.id IN (SELECT image_id FROM published_images) AND i.demo=?")
      .bind(demo).all<{ image_id: string; subject_kind: string | null; image_medium: string | null; composition: string | null; period_bucket: string | null; country_or_region: string | null; perceived_plausibility: string | null }>(),
  ]);
  const categories = new Map<string, string[]>();
  for (const assignment of assignments.results) {
    const list = categories.get(assignment.image_id) || [];
    list.push(assignment.category_id);
    categories.set(assignment.image_id, list);
  }
  if (filters.categories.length)
    rows = rows.filter((row) => categories.get(row.id)?.some((category) => filters.categories.includes(category)));
  const tags = new Map(metadata.results.map((row) => [row.image_id, row]));
  return rows.map((row) => ({ ...row, categories: categories.get(row.id) || [], curation: tags.get(row.id) || null }));
}
function cookie(request: Request) {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((i) => i.trim())
    .find((i) => i.startsWith("ros_owner="))
    ?.slice(10);
}
export async function owner(request: Request) {
  const value = cookie(request);
  if (!value) throw new HttpError(401, "Sessione anonima non disponibile");
  return hash(value);
}
interface Session {
  id: string; owner_hash: string; mode: string; expires_at: number | null;
  created_at: number; completed: number; protocol_version: number;
  phase: "preparing" | "active" | "completed" | "invalidated";
  duration_seconds: number | null; started_at: number | null;
  preparation_expires_at: number | null; invalid_reason: string | null;
}
async function owned(request: Request, env: Env, sid: string) {
  const s = await env.DB.prepare("SELECT * FROM game_sessions WHERE id=?")
    .bind(sid)
    .first<Session>();
  if (!s || s.owner_hash !== (await owner(request)))
    throw new HttpError(404, "Sessione non trovata");
  return s;
}
export const reveal = (i: ImageRow) => ({
  answer: i.type,
  explanation: i.explanation,
  title: i.title,
  author: i.author,
  source: i.source_url || null,
  license: i.license_name || "Fixture originale",
  licenseUrl: i.license_url || null,
  demo: !!i.demo,
});
const joinedImage =
  "SELECT i.*,s.page_url AS source_url,l.name AS license_name,l.url AS license_url FROM images i LEFT JOIN sources s ON s.id=i.source_id LEFT JOIN licenses l ON l.id=i.license_id";
async function refresh(env: Env, s: Session) {
  return (await env.DB.prepare("SELECT * FROM game_sessions WHERE id=?").bind(s.id).first<Session>())!;
}
async function invalidate(env: Env, s: Session, reason: string, kind = "invalidated") {
  const eventId = id(), now = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO media_events(id,session_id,kind,reason,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM game_sessions WHERE id=? AND phase IN ('preparing','active') AND completed=0 AND (?!='preparation_expired' OR (phase='preparing' AND preparation_expires_at<=?)))").bind(eventId, s.id, kind, reason, now, s.id, kind, now),
    env.DB.prepare("UPDATE game_sessions SET phase='invalidated',invalid_reason=? WHERE id=? AND EXISTS(SELECT 1 FROM media_events WHERE id=?)").bind(reason, s.id, eventId),
  ]);
  return refresh(env, s);
}
async function settleSession(env: Env, s: Session) {
  const now = Date.now();
  if (s.phase === "preparing" && now >= (s.preparation_expires_at || 0))
    return invalidate(env, s, "preparation_expired", "preparation_expired");
  if (s.phase === "active" && s.expires_at && now >= s.expires_at) {
    await env.DB.prepare("UPDATE game_sessions SET phase='completed',completed=1 WHERE id=? AND phase='active'").bind(s.id).run();
    return refresh(env, s);
  }
  return s;
}
const neutralRound = (sid: string, round: { id: string; position: number }) => ({
  id: round.id, number: round.position + 1, image: `/api/sessions/${sid}/media/${round.id}`,
  alt: "Immagine da osservare per rispondere alla domanda",
});
async function state(env: Env, s: Session) {
  const now = Date.now();
  const results = (await env.DB.prepare("SELECT a.correct,a.choice,a.elapsed_ms,r.position,r.id AS round_id FROM answers a JOIN game_rounds r ON r.id=a.round_id WHERE r.session_id=? ORDER BY r.position")
    .bind(s.id).all<{ correct: number; choice: string; elapsed_ms: number; position: number; round_id: string }>()).results;
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM game_rounds WHERE session_id=?").bind(s.id).first<{ n: number }>())!.n;
  if (results.length === total && s.phase === "active") {
    await env.DB.prepare("UPDATE game_sessions SET completed=1,phase='completed' WHERE id=? AND phase='active'").bind(s.id).run();
  }
  s = await settleSession(env, await refresh(env, s));
  const done = s.phase === "completed" || s.phase === "invalidated";
  let question = null;
  if (s.phase === "active") {
    const round = await env.DB.prepare("SELECT r.id,r.position,r.presented_at FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL ORDER BY r.position LIMIT 1")
      .bind(s.id).first<{ id: string; position: number; presented_at: number | null }>();
    if (round) {
      // Legacy assignments keep their original presentation/timing semantics.
      if (s.protocol_version === 1) await env.DB.prepare("UPDATE game_rounds SET presented_at=COALESCE(presented_at,?) WHERE id=?").bind(now, round.id).run();
      question = neutralRound(s.id, round);
    }
  }
  const credits = s.phase === "completed" ? (await env.DB.prepare("SELECT i.*,s.page_url AS source_url,l.name AS license_name,l.url AS license_url,a.correct FROM game_rounds r JOIN answers a ON a.round_id=r.id JOIN images i ON i.id=r.image_id LEFT JOIN sources s ON s.id=i.source_id LEFT JOIN licenses l ON l.id=i.license_id WHERE r.session_id=? ORDER BY r.position")
    .bind(s.id).all<ImageRow & { correct: number }>()).results.map(image => ({ ...reveal(image), correct: !!image.correct })) : [];
  return json({ id: s.id, mode: s.mode, demo: env.DATA_MODE === "demo", protocolVersion: s.protocol_version,
    phase: s.phase, invalidReason: s.invalid_reason, preparationExpiresAt: s.preparation_expires_at,
    serverNow: Date.now(), expiresAt: s.expires_at, startedAt: s.started_at, done, total,
    answered: results.length, score: s.phase === "invalidated" ? 0 : results.filter(i => i.correct).length * 100,
    elapsedMs: results.reduce((n, r) => n + r.elapsed_ms, 0), question, credits });
}
export async function game(request: Request, env: Env, path: string) {
  if (path === "/api/sessions" && request.method === "POST") {
    const config = settings(await body(request));
    const token = cookie(request) || id() + id(), key = await hash(token);
    await rateLimit(env, "create:" + (await hash(request.headers.get("CF-Connecting-IP") || "local")), 20);
    const sample = curatedSample(await filteredCatalog(env, config), config.mode === "timed" ? 50 : config.count);
    if (!sample.images.length) throw new HttpError(409, "Catalogo approvato insufficiente per garantire una partita con questi filtri.");
    const now = Date.now(), sid = id(), protocol = mediaProtocol(env.PRELOAD_PROTOCOL);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO game_sessions(id,mode,created_at,expires_at,owner_hash,protocol_version,phase,duration_seconds,preparation_expires_at) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(sid, config.mode, now, protocol === 1 && config.mode === "timed" ? now + config.duration * 1000 : null, key, protocol, protocol === 2 && config.mode === "timed" ? "preparing" : "active", config.mode === "timed" ? config.duration : null, protocol === 2 && config.mode === "timed" ? now + preparationTtlMs : null),
      env.DB.prepare("INSERT INTO game_rounds(id,session_id,image_id,position) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.imageId'),json_extract(value,'$.position') FROM json_each(?)")
        .bind(sid, JSON.stringify(sample.images.map((image, position) => ({ id: id(), imageId: image.id, position })))),
    ]);
    const response = json({ id: sid, warnings: sample.warnings }, 201);
    response.headers.set("Set-Cookie", `ros_owner=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
    return response;
  }
  const match = path.match(/^\/api\/sessions\/([\w-]+)(?:\/(answer|media|manifest|start|ready|invalidate|report)(?:\/([\w-]+))?)?$/);
  if (!match) throw new HttpError(404, "API partita inesistente");
  let s = await settleSession(env, await owned(request, env, match[1]));
  if (!match[2] && request.method === "GET") return state(env, s);
  if (match[2] === "manifest" && request.method === "GET") {
    const rows = s.phase === "preparing" || s.phase === "active" ? (await env.DB.prepare(`SELECT r.id,r.position FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL ORDER BY r.position ${s.mode === "training" || s.protocol_version === 1 ? "LIMIT 3" : "LIMIT 50"}`).bind(s.id).all<{ id: string; position: number }>()).results : [];
    return json({ id: s.id, phase: s.phase, images: rows.map(r => neutralRound(s.id, r)) });
  }
  if (match[2] === "start" && request.method === "POST") {
    if (s.mode !== "timed") throw new HttpError(409, "Questa modalità non richiede avvio separato");
    if (s.phase === "active") return state(env, s); // Retried starts never extend a deadline.
    if (s.phase !== "preparing") throw new HttpError(410, "Preparazione terminata o partita conclusa");
    const data = await body(request);
    const ids = (await env.DB.prepare("SELECT id FROM game_rounds WHERE session_id=? ORDER BY position").bind(s.id).all<{ id: string }>()).results.map(r => r.id);
    if (data.prepared !== true || !Array.isArray(data.roundIds) || data.roundIds.length !== ids.length || new Set(data.roundIds).size !== ids.length || ids.some(rid => !(data.roundIds as unknown[]).includes(rid)))
      throw new HttpError(409, "Confermare la preparazione di tutte le immagini assegnate");
    const now = Date.now(), eventId = id();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO media_events(id,session_id,kind,reason,created_at) SELECT ?,?,'started','all_media_prepared',? WHERE EXISTS(SELECT 1 FROM game_sessions WHERE id=? AND phase='preparing' AND preparation_expires_at>?)").bind(eventId, s.id, now, s.id, now),
      env.DB.prepare("UPDATE game_sessions SET phase='active',started_at=?,expires_at=?+duration_seconds*1000 WHERE id=? AND EXISTS(SELECT 1 FROM media_events WHERE id=?)").bind(now, now, s.id, eventId),
      env.DB.prepare("UPDATE game_rounds SET presented_at=COALESCE(presented_at,(SELECT started_at FROM game_sessions WHERE id=?)) WHERE session_id=? AND position=0 AND EXISTS(SELECT 1 FROM media_events WHERE id=?)").bind(s.id, s.id, eventId),
    ]);
    s = await settleSession(env, await refresh(env, s));
    if (s.phase !== "active") throw new HttpError(410, "Preparazione scaduta");
    return state(env, s);
  }
  if (match[2] === "report" && request.method === "POST") {
    const data = await body(request);
    if (data.reason !== "media_unavailable") throw new HttpError(400, "Motivo non valido");
    await rateLimit(env, "media-report:" + s.id, 10);
    await env.DB.prepare("INSERT INTO media_events(id,session_id,kind,reason,created_at) VALUES(?,?,'load_failed','media_unavailable',?)").bind(id(), s.id, Date.now()).run();
    return json({ recorded: true });
  }
  if (match[2] === "invalidate" && request.method === "POST") {
    const data = await body(request);
    if (data.reason !== "media_unavailable") throw new HttpError(400, "Motivo non valido");
    if (s.phase === "active" || s.phase === "preparing") s = await invalidate(env, s, "media_unavailable");
    return state(env, s);
  }
  if (match[2] === "ready" && request.method === "POST") {
    const data = await body(request), rid = String(data.roundId);
    if (s.phase !== "active") throw new HttpError(s.phase === "preparing" ? 409 : 410, "Partita non attiva");
    const changed = await env.DB.prepare(`UPDATE game_rounds SET presented_at=COALESCE(presented_at,?) WHERE id=? AND session_id=? AND NOT EXISTS(SELECT 1 FROM answers WHERE round_id=?) AND NOT EXISTS(SELECT 1 FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND r.position<game_rounds.position AND a.round_id IS NULL) AND EXISTS(SELECT 1 FROM game_sessions WHERE id=? AND phase='active' AND completed=0 AND (expires_at IS NULL OR expires_at>?))`)
      .bind(Date.now(), rid, s.id, rid, s.id, s.id, Date.now()).run();
    if (!changed.meta.changes) throw new HttpError(409, "Domanda non attiva");
    return state(env, await refresh(env, s));
  }
  if (match[2] === "media" && request.method === "GET") {
    const round = await env.DB.prepare("SELECT r.id,r.position,r.image_id,r.presented_at FROM game_rounds r WHERE r.id=? AND r.session_id=?").bind(match[3], s.id).first<{ id: string; position: number; image_id: string; presented_at: number | null }>();
    if (!round) throw new HttpError(404, "Immagine non assegnata");
    if (!round.presented_at) {
      if (s.protocol_version === 1 || !["preparing", "active"].includes(s.phase)) throw new HttpError(404, "Immagine non disponibile");
      if (s.mode === "training") {
        const next = (await env.DB.prepare("SELECT r.id FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL ORDER BY r.position LIMIT 3").bind(s.id).all<{ id: string }>()).results;
        if (!next.some(r => r.id === round.id)) throw new HttpError(404, "Immagine fuori dalla finestra assegnata");
      }
    }
    const image = await env.DB.prepare("SELECT * FROM images WHERE id=? AND status='approved'").bind(round.image_id).first<ImageRow>();
    if (!image) throw new HttpError(404, "Immagine non disponibile");
    return privateMedia(await media(env, image), "Cookie");
  }
  if (match[2] === "answer" && request.method === "POST") {
    const data = await body(request);
    if (!["REAL", "AI"].includes(String(data.choice))) throw new HttpError(400, "Risposta non valida");
    const rid = String(data.roundId);
    const round = await env.DB.prepare("SELECT image_id,position,presented_at FROM game_rounds WHERE id=? AND session_id=?").bind(rid, s.id).first<{ image_id: string; position: number; presented_at: number | null }>();
    if (!round?.presented_at) throw new HttpError(409, "Domanda non attiva: preparare prima l'immagine");
    const image = await env.DB.prepare(`${joinedImage} WHERE i.id=?`).bind(round.image_id).first<ImageRow>();
    if (!image) throw new HttpError(404, "Immagine non disponibile");
    const previous = await env.DB.prepare("SELECT choice,correct FROM answers WHERE round_id=?").bind(rid).first<{ choice: string; correct: number }>();
    if (previous) {
      if (previous.choice !== data.choice) throw new HttpError(409, "Risposta già consegnata");
      return json({ ...reveal(image), correct: !!previous.correct, replayed: true, serverNow: Date.now(), expiresAt: s.expires_at });
    }
    const now = Date.now();
    if (s.phase !== "active" || s.completed || (s.expires_at && now >= s.expires_at)) throw new HttpError(s.phase === "preparing" ? 409 : 410, "Partita non attiva o tempo scaduto");
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO answers(round_id,choice,correct,answered_at,elapsed_ms) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM game_sessions WHERE id=? AND phase='active' AND completed=0 AND (expires_at IS NULL OR expires_at>?)) AND NOT EXISTS(SELECT 1 FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND r.position<? AND a.round_id IS NULL) ON CONFLICT(round_id) DO NOTHING`)
      .bind(rid, data.choice, image.type === data.choice ? 1 : 0, now, Math.max(0, now - round.presented_at), s.id, now, s.id, round.position),
      env.DB.prepare("UPDATE game_sessions SET phase='completed',completed=1 WHERE id=? AND phase='active' AND NOT EXISTS(SELECT 1 FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL)").bind(s.id, s.id),
    ]);
    const saved = await env.DB.prepare("SELECT choice,correct FROM answers WHERE round_id=?").bind(rid).first<{ choice: string; correct: number }>();
    if (!saved) {
      s = await settleSession(env, await refresh(env, s));
      throw new HttpError(s.phase === "active" ? 409 : 410, "Partita non attiva o tempo scaduto");
    }
    if (saved.choice !== data.choice) throw new HttpError(409, "Risposta già consegnata");
    return json({ ...reveal(image), correct: !!saved.correct, serverNow: Date.now(), expiresAt: s.expires_at });
  }
  throw new HttpError(405, "Metodo non consentito");
}
export async function stats(env: Env) {
  const images = (await env.DB.prepare("SELECT i.id,COUNT(*) AS valid_answers,SUM(1-a.correct) AS incorrect_answers FROM images i JOIN image_answer_statistics a ON a.image_id=i.id GROUP BY i.id").all()).results;
  const categories = (await env.DB.prepare("SELECT c.id,c.name,COUNT(*) AS valid_answers,SUM(1-a.correct) AS incorrect_answers FROM categories c JOIN image_categories ic ON ic.category_id=c.id JOIN image_answer_statistics a ON a.image_id=ic.image_id GROUP BY c.id").all()).results;
  return json({ images, categories, note: "Conteggi descrittivi: nessun livello o classificazione. Il futuro error_rate richiederà controllo di numerosità, incertezza e risposte ripetute." });
}
