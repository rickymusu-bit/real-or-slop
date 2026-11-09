import {
  body,
  catalog,
  GAME_IMAGE,
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
  const roundSeconds = data.roundSeconds ?? 20;
  if (!Number.isInteger(count) || Number(count) < 1 || Number(count) > 50)
    throw new HttpError(400, "Numero domande da 1 a 50");
  if (!Number.isInteger(roundSeconds) || ![10, 20, 30].includes(Number(roundSeconds)))
    throw new HttpError(400, "Tempo per immagine: 10, 20 o 30 secondi");
  const categories = Array.isArray(data.categories)
    ? data.categories.map(String).slice(0, 30)
    : [];
  return {
    mode,
    count: Number(count),
    roundSeconds: Number(roundSeconds),
    categories,
  };
}
/** Published library images. Categories are gone with the old catalog; the filter is kept for the API shape
 * and matches tags when given (docs/libreria-immagini.v1.1.0.md). */
export async function filteredCatalog(env: Env, filters: { categories: string[] }) {
  const rows = await catalog(env);
  if (!filters.categories.length) return rows;
  const tagged = new Set((await env.DB.prepare(`SELECT it.image_id FROM image_tags it JOIN tags t ON t.id=it.tag_id
    WHERE t.label IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(filters.categories)).all<{ image_id: string }>()).results.map(r => r.image_id));
  return rows.filter(row => tagged.has(row.id));
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
  timing_mode: "legacy" | "unlimited" | "per-image"; round_seconds: number | null;
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
  caption: i.caption || null,
});
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
  if (s.phase === "active" && s.timing_mode === "per-image") {
    await env.DB.batch([
      env.DB.prepare("UPDATE game_rounds SET timed_out=1 WHERE session_id=? AND expires_at<=? AND timed_out=0 AND NOT EXISTS(SELECT 1 FROM answers WHERE round_id=game_rounds.id) AND EXISTS(SELECT 1 FROM game_sessions WHERE id=? AND phase='active' AND completed=0)").bind(s.id, now, s.id),
      env.DB.prepare("UPDATE game_sessions SET phase='completed',completed=1 WHERE id=? AND phase='active' AND NOT EXISTS(SELECT 1 FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL AND r.timed_out=0)").bind(s.id, s.id),
    ]);
    s = await refresh(env, s);
  }
  if (s.phase === "preparing" && now >= (s.preparation_expires_at || 0))
    return invalidate(env, s, "preparation_expired", "preparation_expired");
  if (s.phase === "active" && s.expires_at && now >= s.expires_at) {
    await env.DB.prepare("UPDATE game_sessions SET phase='completed',completed=1 WHERE id=? AND phase='active'").bind(s.id).run();
    return refresh(env, s);
  }
  return s;
}
/** The round as the player sees it: the image and its caption, never the origin. */
const neutralRound = (sid: string, round: { id: string; position: number; caption?: string | null }) => ({
  id: round.id, number: round.position + 1, image: `/api/sessions/${sid}/media/${round.id}`,
  alt: "Immagine da osservare per rispondere alla domanda", caption: round.caption || "",
});
async function state(env: Env, s: Session) {
  const now = Date.now();
  s = await settleSession(env, s);
  const results = (await env.DB.prepare("SELECT a.correct,a.choice,a.elapsed_ms,r.position,r.id AS round_id FROM answers a JOIN game_rounds r ON r.id=a.round_id WHERE r.session_id=? ORDER BY r.position")
    .bind(s.id).all<{ correct: number; choice: string; elapsed_ms: number; position: number; round_id: string }>()).results;
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM game_rounds WHERE session_id=?").bind(s.id).first<{ n: number }>())!.n;
  const timeouts = (await env.DB.prepare("SELECT COUNT(*) AS n FROM game_rounds WHERE session_id=? AND timed_out=1").bind(s.id).first<{ n: number }>())!.n;
  if (results.length + timeouts === total && s.phase === "active") {
    await env.DB.prepare("UPDATE game_sessions SET completed=1,phase='completed' WHERE id=? AND phase='active'").bind(s.id).run();
  }
  s = await settleSession(env, await refresh(env, s));
  const done = s.phase === "completed" || s.phase === "invalidated";
  let question = null;
  let roundExpiresAt: number | null = null;
  if (s.phase === "active") {
    const round = await env.DB.prepare("SELECT r.id,r.position,r.presented_at,r.expires_at,i.caption FROM game_rounds r JOIN images i ON i.id=r.image_id LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL AND r.timed_out=0 ORDER BY r.position LIMIT 1")
      .bind(s.id).first<{ id: string; position: number; presented_at: number | null; expires_at: number | null; caption: string }>();
    if (round) {
      // Legacy assignments keep their original presentation/timing semantics.
      if (s.protocol_version === 1) await env.DB.prepare("UPDATE game_rounds SET presented_at=COALESCE(presented_at,?) WHERE id=?").bind(now, round.id).run();
      question = neutralRound(s.id, round);
      roundExpiresAt = round.expires_at;
    }
  }
  const credits = s.phase === "completed" ? (await env.DB.prepare(`SELECT i.*,COALESCE(a.correct,0) AS correct,r.timed_out FROM game_rounds r
    LEFT JOIN answers a ON a.round_id=r.id JOIN (${GAME_IMAGE}) i ON i.id=r.image_id WHERE r.session_id=? ORDER BY r.position`)
    .bind(s.id).all<ImageRow & { correct: number; timed_out: number }>()).results.map(image => ({ ...reveal(image), correct: !!image.correct, timedOut: !!image.timed_out })) : [];
  return json({ id: s.id, mode: s.mode, demo: false, protocolVersion: s.protocol_version,
    phase: s.phase, invalidReason: s.invalid_reason, preparationExpiresAt: s.preparation_expires_at,
    serverNow: Date.now(), expiresAt: s.timing_mode === "per-image" ? roundExpiresAt : s.expires_at, startedAt: s.started_at, done, total,
    timingMode: s.timing_mode, roundSeconds: s.round_seconds, timedOut: timeouts,
    answered: results.length + timeouts, score: s.phase === "invalidated" ? 0 : results.filter(i => i.correct).length * 100,
    elapsedMs: results.reduce((n, r) => n + r.elapsed_ms, 0) + timeouts * (s.round_seconds || 0) * 1000, question, credits });
}
export async function game(request: Request, env: Env, path: string) {
  if (path === "/api/sessions" && request.method === "POST") {
    const config = settings(await body(request));
    const token = cookie(request) || id() + id(), key = await hash(token);
    await rateLimit(env, "create:" + (await hash(request.headers.get("CF-Connecting-IP") || "local")), 20);
    const sample = curatedSample(await filteredCatalog(env, config), config.count);
    if (!sample.images.length) throw new HttpError(409, "Catalogo approvato insufficiente per garantire una partita con questi filtri.");
    const now = Date.now(), sid = id(), protocol = config.mode === "timed" ? 2 : mediaProtocol(env.PRELOAD_PROTOCOL);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO game_sessions(id,mode,created_at,expires_at,owner_hash,protocol_version,phase,duration_seconds,preparation_expires_at,timing_mode,round_seconds) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .bind(sid, config.mode, now, null, key, protocol, config.mode === "timed" ? "preparing" : "active", null, config.mode === "timed" ? now + preparationTtlMs : null, config.mode === "timed" ? "per-image" : "unlimited", config.mode === "timed" ? config.roundSeconds : null),
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
    const rows = s.phase === "preparing" || s.phase === "active" ? (await env.DB.prepare(`SELECT r.id,r.position,i.caption FROM game_rounds r JOIN images i ON i.id=r.image_id LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL AND r.timed_out=0 ORDER BY r.position ${s.timing_mode === "per-image" ? "LIMIT 1" : s.mode === "training" || s.protocol_version === 1 ? "LIMIT 3" : "LIMIT 50"}`).bind(s.id).all<{ id: string; position: number }>()).results : [];
    return json({ id: s.id, phase: s.phase, images: rows.map(r => neutralRound(s.id, r)) });
  }
  if (match[2] === "start" && request.method === "POST") {
    if (s.mode !== "timed") throw new HttpError(409, "Questa modalità non richiede avvio separato");
    if (s.phase === "active") return state(env, s); // Retried starts never extend a deadline.
    if (s.phase !== "preparing") throw new HttpError(410, "Preparazione terminata o partita conclusa");
    const data = await body(request);
    const ids = (await env.DB.prepare(`SELECT id FROM game_rounds WHERE session_id=? ORDER BY position ${s.timing_mode === "per-image" ? "LIMIT 1" : ""}`).bind(s.id).all<{ id: string }>()).results.map(r => r.id);
    if (data.prepared !== true || !Array.isArray(data.roundIds) || data.roundIds.length !== ids.length || new Set(data.roundIds).size !== ids.length || ids.some(rid => !(data.roundIds as unknown[]).includes(rid)))
      throw new HttpError(409, "Confermare la preparazione di tutte le immagini assegnate");
    const now = Date.now(), eventId = id();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO media_events(id,session_id,kind,reason,created_at) SELECT ?,?,'started','all_media_prepared',? WHERE EXISTS(SELECT 1 FROM game_sessions WHERE id=? AND phase='preparing' AND preparation_expires_at>?)").bind(eventId, s.id, now, s.id, now),
      env.DB.prepare("UPDATE game_sessions SET phase='active',started_at=?,expires_at=?+duration_seconds*1000 WHERE id=? AND EXISTS(SELECT 1 FROM media_events WHERE id=?)").bind(now, now, s.id, eventId),
      env.DB.prepare("UPDATE game_rounds SET presented_at=COALESCE(presented_at,?),expires_at=CASE WHEN expires_at IS NULL AND ?='per-image' THEN ?+?*1000 ELSE expires_at END WHERE session_id=? AND position=0 AND EXISTS(SELECT 1 FROM media_events WHERE id=?)").bind(now, s.timing_mode, now, s.round_seconds, s.id, eventId),
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
    const now = Date.now();
    const changed = await env.DB.prepare(`UPDATE game_rounds SET expires_at=CASE WHEN presented_at IS NULL AND ?='per-image' THEN ?+?*1000 ELSE expires_at END,presented_at=COALESCE(presented_at,?) WHERE id=? AND session_id=? AND timed_out=0 AND NOT EXISTS(SELECT 1 FROM answers WHERE round_id=?) AND NOT EXISTS(SELECT 1 FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND r.position<game_rounds.position AND a.round_id IS NULL AND r.timed_out=0) AND EXISTS(SELECT 1 FROM game_sessions WHERE id=? AND phase='active' AND completed=0 AND (expires_at IS NULL OR expires_at>?))`)
      .bind(s.timing_mode, now, s.round_seconds, now, rid, s.id, rid, s.id, s.id, now).run();
    if (!changed.meta.changes) throw new HttpError(409, "Domanda non attiva");
    return state(env, await refresh(env, s));
  }
  if (match[2] === "media" && request.method === "GET") {
    const round = await env.DB.prepare("SELECT r.id,r.position,r.image_id,r.presented_at FROM game_rounds r WHERE r.id=? AND r.session_id=?").bind(match[3], s.id).first<{ id: string; position: number; image_id: string; presented_at: number | null }>();
    if (!round) throw new HttpError(404, "Immagine non assegnata");
    if (s.timing_mode === "per-image" && !round.presented_at) {
      const current = await env.DB.prepare("SELECT r.id FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL AND r.timed_out=0 ORDER BY r.position LIMIT 1").bind(s.id).first<{ id: string }>();
      if (!current || current.id !== round.id) throw new HttpError(404, "Immagine non ancora disponibile");
    }
    if (!round.presented_at) {
      if (s.protocol_version === 1 || !["preparing", "active"].includes(s.phase)) throw new HttpError(404, "Immagine non disponibile");
      if (s.mode === "training") {
        const next = (await env.DB.prepare("SELECT r.id FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL AND r.timed_out=0 ORDER BY r.position LIMIT 3").bind(s.id).all<{ id: string }>()).results;
        if (!next.some(r => r.id === round.id)) throw new HttpError(404, "Immagine fuori dalla finestra assegnata");
      }
    }
    const image = await env.DB.prepare(GAME_IMAGE + " WHERE id=? AND status='published' AND copy_key IS NOT NULL").bind(round.image_id).first<ImageRow>();
    if (!image) throw new HttpError(404, "Immagine non disponibile");
    return privateMedia(await media(env, image), "Cookie");
  }
  if (match[2] === "answer" && request.method === "POST") {
    const data = await body(request);
    if (!["REAL", "AI"].includes(String(data.choice))) throw new HttpError(400, "Risposta non valida");
    const rid = String(data.roundId);
    const round = await env.DB.prepare("SELECT image_id,position,presented_at,expires_at,timed_out FROM game_rounds WHERE id=? AND session_id=?").bind(rid, s.id).first<{ image_id: string; position: number; presented_at: number | null; expires_at: number | null; timed_out: number }>();
    if (!round?.presented_at) throw new HttpError(409, "Domanda non attiva: preparare prima l'immagine");
    const image = await env.DB.prepare(GAME_IMAGE + " WHERE id=?").bind(round.image_id).first<ImageRow>();
    if (!image) throw new HttpError(404, "Immagine non disponibile");
    const previous = await env.DB.prepare("SELECT choice,correct FROM answers WHERE round_id=?").bind(rid).first<{ choice: string; correct: number }>();
    if (previous) {
      if (previous.choice !== data.choice) throw new HttpError(409, "Risposta già consegnata");
      return json({ ...reveal(image), correct: !!previous.correct, replayed: true, serverNow: Date.now(), expiresAt: s.expires_at });
    }
    const now = Date.now();
    if (round.timed_out || (round.expires_at && now >= round.expires_at)) throw new HttpError(410, "Tempo per questa immagine scaduto");
    if (s.phase !== "active" || s.completed || (s.expires_at && now >= s.expires_at)) throw new HttpError(s.phase === "preparing" ? 409 : 410, "Partita non attiva o tempo scaduto");
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO answers(round_id,choice,correct,answered_at,elapsed_ms) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM game_sessions WHERE id=? AND phase='active' AND completed=0 AND (expires_at IS NULL OR expires_at>?)) AND NOT EXISTS(SELECT 1 FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND r.position<? AND a.round_id IS NULL AND r.timed_out=0) AND EXISTS(SELECT 1 FROM game_rounds WHERE id=? AND timed_out=0 AND (expires_at IS NULL OR expires_at>?)) ON CONFLICT(round_id) DO NOTHING`)
      .bind(rid, data.choice, image.type === data.choice ? 1 : 0, now, Math.max(0, now - round.presented_at), s.id, now, s.id, round.position, rid, now),
      env.DB.prepare("UPDATE game_sessions SET phase='completed',completed=1 WHERE id=? AND phase='active' AND NOT EXISTS(SELECT 1 FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL AND r.timed_out=0)").bind(s.id, s.id),
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
