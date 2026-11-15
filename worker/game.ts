/** The level game (spec `gioco-a-livelli`). The server draws the lot (REAL or SLOP by a coin at each position) and serves
 * one photo at a time; the countdown starts when the browser shows the photo and stops when the answer arrives; the server checks
 * the answer at once. A photo whose time runs out counts as not recognised. Only a game played to its last photo is concluded and has
 * a score. After the end: description and credits of each REAL, prompt of each SLOP. Rounds keep the copy they started with. */
import { body, GAME_IMAGE, hash, HttpError, id, json, rateLimit, type Env, type ImageRow } from "./core";
import { media, privateMedia } from "./storage";
import { preparationTtlMs } from "../shared/preloading";
import { curatedSample } from "./sampling";
import { separateTwins } from "../shared/twins";
import { isLevel, LEVEL_IDS, LEVELS, scoreOf, type Level, type Outcome } from "../shared/levels";
import { enter } from "./leaderboard";

/** An answer sent in time but arriving shortly after the deadline (network) still counts. */
export const GRACE_MS = 500;

interface Session {
  id: string; owner_hash: string; mode: string; level: Level | null; created_at: number; completed: number;
  phase: "preparing" | "active" | "completed" | "invalidated"; started_at: number | null; preparation_expires_at: number | null;
  invalid_reason: string | null; round_seconds: number | null;
}

/** Published images available to the game, by origin. */
async function catalog(env: Env) {
  return (await env.DB.prepare(GAME_IMAGE + " WHERE status='published' AND copy_key IS NOT NULL AND json_extract(copy_crop,'$.format')='4:5'").all<ImageRow>()).results
    .map(row => ({ ...row, status: "approved" }));
}
/** A level is playable when every position can be either origin: at least as many REAL and as many SLOP as its photos. */
export async function levels(env: Env) {
  const rows = (await env.DB.prepare("SELECT origin,count(*) AS n FROM images WHERE status='published' AND copy_key IS NOT NULL AND json_extract(copy_crop,'$.format')='4:5' GROUP BY origin")
    .all<{ origin: string; n: number }>()).results;
  const real = rows.find(r => r.origin === "REAL")?.n || 0, slop = rows.find(r => r.origin === "SLOP")?.n || 0;
  return { levels: LEVEL_IDS.map(level => ({ id: level, ...LEVELS[level], available: real >= LEVELS[level].photos && slop >= LEVELS[level].photos })) };
}

const cookie = (request: Request) => request.headers.get("Cookie")?.split(";").map(i => i.trim()).find(i => i.startsWith("ros_owner="))?.slice(10);
export async function owner(request: Request) {
  const value = cookie(request);
  if (!value) throw new HttpError(401, "Sessione anonima non disponibile");
  return hash(value);
}
async function owned(request: Request, env: Env, sid: string) {
  const s = await env.DB.prepare("SELECT * FROM game_sessions WHERE id=?").bind(sid).first<Session>();
  if (!s || s.owner_hash !== (await owner(request)) || s.mode !== "levels") throw new HttpError(404, "Partita non trovata");
  return s;
}
const refresh = async (env: Env, s: Session) => (await env.DB.prepare("SELECT * FROM game_sessions WHERE id=?").bind(s.id).first<Session>())!;

/** Rounds past their deadline become timed out; a game with every round answered or timed out is concluded. */
async function settle(env: Env, s: Session) {
  const now = Date.now();
  if (s.phase === "active") {
    await env.DB.batch([
      env.DB.prepare(`UPDATE game_rounds SET timed_out=1 WHERE session_id=? AND expires_at+?<=? AND timed_out=0
        AND NOT EXISTS(SELECT 1 FROM answers WHERE round_id=game_rounds.id)`).bind(s.id, GRACE_MS, now),
      env.DB.prepare(`UPDATE game_sessions SET phase='completed',completed=1 WHERE id=? AND phase='active' AND NOT EXISTS(SELECT 1 FROM game_rounds r
        LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL AND r.timed_out=0)`).bind(s.id, s.id),
    ]);
    s = await refresh(env, s);
  }
  if (s.phase === "preparing" && now >= (s.preparation_expires_at || 0)) {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO media_events(id,session_id,kind,reason,created_at) VALUES(?,?,'preparation_expired','preparation_expired',?)").bind(id(), s.id, now),
      env.DB.prepare("UPDATE game_sessions SET phase='invalidated',invalid_reason='preparation_expired' WHERE id=? AND phase='preparing'").bind(s.id),
    ]);
    s = await refresh(env, s);
  }
  return s;
}

const round = (sid: string, r: { id: string; position: number }) => ({
  id: r.id, number: r.position + 1, image: `/api/sessions/${sid}/media/${r.id}`, alt: "Foto da classificare" });

interface Credit { id: string; position: number; type: "REAL" | "AI"; choice: "REAL" | "AI" | null; timed_out: number;
  title: string; description: string; author: string; source_url: string; license_name: string; license_url: string; prompt: string }
/** The game's photos after the end: the player's answer, the origin, description and source for a REAL, the prompt for a SLOP. */
async function credits(env: Env, sid: string) {
  const rows = (await env.DB.prepare(`SELECT r.id,r.position,CASE i.origin WHEN 'SLOP' THEN 'AI' ELSE 'REAL' END AS type,a.choice,r.timed_out,
    i.title,i.description,i.author,i.source_url,i.license_name,i.license_url,i.prompt
    FROM game_rounds r JOIN images i ON i.id=r.image_id LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? ORDER BY r.position`)
    .bind(sid).all<Credit>()).results;
  return rows.map(r => ({ number: r.position + 1, image: `/api/sessions/${sid}/media/${r.id}`, answer: r.type,
    choice: r.choice, correct: r.choice === r.type, timedOut: !!r.timed_out,
    // Licences such as CC BY and CC BY-SA ask to say that the work was changed: the game copy is cropped, scaled and re-encoded.
    ...(r.type === "REAL" ? { title: r.title, description: r.description || "", author: r.author, source: r.source_url || null, license: r.license_name, licenseUrl: r.license_url || null,
        changes: "Ritagliata, ridotta e ricompressa per il gioco" }
      : { prompt: r.prompt }) }));
}
export async function outcomes(env: Env, sid: string): Promise<Outcome[]> {
  return (await env.DB.prepare(`SELECT CASE i.origin WHEN 'SLOP' THEN 'AI' ELSE 'REAL' END AS answer,a.choice FROM game_rounds r
    JOIN images i ON i.id=r.image_id LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? ORDER BY r.position`).bind(sid).all<Outcome>()).results;
}

async function state(env: Env, s: Session) {
  s = await settle(env, s);
  const counts = (await env.DB.prepare(`SELECT count(*) AS total,coalesce(sum(r.timed_out),0) AS timed_out,count(a.round_id) AS answered,
    coalesce(sum(a.correct),0) AS right FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=?`).bind(s.id)
    .first<{ total: number; timed_out: number; answered: number; right: number }>())!;
  let question = null, expiresAt: number | null = null;
  if (s.phase === "active") {
    const next = await env.DB.prepare(`SELECT r.id,r.position,r.expires_at FROM game_rounds r JOIN images i ON i.id=r.image_id
      LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL AND r.timed_out=0 ORDER BY r.position LIMIT 1`)
      .bind(s.id).first<{ id: string; position: number; expires_at: number | null }>();
    if (next) { question = round(s.id, next); expiresAt = next.expires_at; }
  }
  const done = s.phase === "completed" || s.phase === "invalidated";
  const entered = s.phase === "completed" ? !!(await env.DB.prepare("SELECT 1 AS x FROM leaderboard WHERE session_id=?").bind(s.id).first()) : false;
  return json({ id: s.id, level: s.level, seconds: s.round_seconds, phase: s.phase, invalidReason: s.invalid_reason, done, serverNow: Date.now(),
    expiresAt, total: counts.total, answered: counts.answered + counts.timed_out, right: counts.right, timedOut: counts.timed_out, question,
    result: s.phase === "completed" ? scoreOf(await outcomes(env, s.id)) : null, entered,
    credits: s.phase === "completed" ? await credits(env, s.id) : [] });
}

export async function game(request: Request, env: Env, path: string) {
  if (path === "/api/levels" && request.method === "GET") return json(await levels(env));
  if (path === "/api/sessions" && request.method === "POST") {
    const data = await body(request, 1000);
    if (Object.keys(data).some(key => key !== "level") || !isLevel(data.level)) throw new HttpError(400, "Livello non valido");
    const level = LEVELS[data.level];
    await rateLimit(env, "create:" + (await hash(request.headers.get("CF-Connecting-IP") || "local")), 20);
    const rows = await catalog(env);
    const real = rows.filter(r => r.type === "REAL").length, slop = rows.filter(r => r.type === "AI").length;
    if (real < level.photos || slop < level.photos)
      throw new HttpError(409, `Il catalogo non ha ancora abbastanza foto per il livello ${level.label}: ne servono almeno ${level.photos} REAL e ${level.photos} SLOP`);
    const drawn = curatedSample(rows, level.photos);
    if (drawn.images.length !== level.photos) throw new HttpError(409, "Catalogo insufficiente per questo livello");
    // A SLOP and the REAL it was written from never meet in a game (spec `gioco-a-livelli`): one of the two leaves for another photo
    // of the same origin, so the sequence of origins drawn by the sampler does not change.
    const twins = (await env.DB.prepare("SELECT id,generation_source FROM images WHERE status='published' AND origin='SLOP' AND generation_source IS NOT NULL")
      .all<{ id: string; generation_source: string }>()).results;
    const sample = { images: separateTwins(drawn.images, rows, new Map(twins.map(t => [t.id, t.generation_source]))) };
    const token = cookie(request) || id() + id(), key = await hash(token), now = Date.now(), sid = id();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO game_sessions(id,mode,level,created_at,owner_hash,protocol_version,phase,preparation_expires_at,timing_mode,round_seconds)
        VALUES(?,'levels',?,?,?,2,'preparing',?,'per-image',?)`).bind(sid, data.level, now, key, now + preparationTtlMs, level.seconds),
      // Each round keeps the copy it serves: later edits to the image never reach a game already started.
      env.DB.prepare(`INSERT INTO game_rounds(id,session_id,image_id,position,copy_key) SELECT json_extract(value,'$.id'),?,json_extract(value,'$.imageId'),
        json_extract(value,'$.position'),json_extract(value,'$.copyKey') FROM json_each(?)`)
        .bind(sid, JSON.stringify(sample.images.map((image, position) => ({ id: id(), imageId: image.id, position, copyKey: image.r2_key })))),
    ]);
    const response = json({ id: sid }, 201);
    response.headers.set("Set-Cookie", `ros_owner=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`);
    return response;
  }
  const match = path.match(/^\/api\/sessions\/([\w-]+)(?:\/(answer|media|manifest|start|ready|leaderboard)(?:\/([\w-]+))?)?$/);
  if (!match) throw new HttpError(404, "API partita inesistente");
  let s = await settle(env, await owned(request, env, match[1]));
  if (!match[2] && request.method === "GET") return state(env, s);
  if (match[2] === "manifest" && request.method === "GET") {
    // Only the photo whose turn it is: the browser never holds a photo before its countdown can start.
    const next = s.phase === "preparing" || s.phase === "active" ? await env.DB.prepare(`SELECT r.id,r.position FROM game_rounds r
      JOIN images i ON i.id=r.image_id LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL AND r.timed_out=0 ORDER BY r.position LIMIT 1`)
      .bind(s.id).first<{ id: string; position: number }>() : null;
    return json({ id: s.id, phase: s.phase, images: next ? [round(s.id, next)] : [] });
  }
  if (match[2] === "start" && request.method === "POST") {
    if (s.phase === "active") return state(env, s);
    if (s.phase !== "preparing") throw new HttpError(410, "Preparazione terminata o partita conclusa");
    const data = await body(request, 2000);
    const first = await env.DB.prepare("SELECT id FROM game_rounds WHERE session_id=? ORDER BY position LIMIT 1").bind(s.id).first<{ id: string }>();
    if (data.prepared !== true || !Array.isArray(data.roundIds) || data.roundIds.length !== 1 || data.roundIds[0] !== first?.id)
      throw new HttpError(409, "Confermare la preparazione della prima foto");
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO media_events(id,session_id,kind,reason,created_at) VALUES(?,?,'started','first_media_prepared',?)").bind(id(), s.id, now),
      env.DB.prepare("UPDATE game_sessions SET phase='active',started_at=? WHERE id=? AND phase='preparing' AND preparation_expires_at>?").bind(now, s.id, now),
    ]);
    s = await settle(env, await refresh(env, s));
    if (s.phase !== "active") throw new HttpError(410, "Preparazione scaduta");
    return state(env, s);
  }
  if (match[2] === "ready" && request.method === "POST") {
    // The browser shows the photo: its countdown starts now, once.
    const data = await body(request, 1000), rid = String(data.roundId), now = Date.now();
    if (s.phase !== "active") throw new HttpError(s.phase === "preparing" ? 409 : 410, "Partita non attiva");
    const changed = await env.DB.prepare(`UPDATE game_rounds SET presented_at=?,expires_at=?+?*1000 WHERE id=? AND session_id=? AND presented_at IS NULL
      AND timed_out=0 AND NOT EXISTS(SELECT 1 FROM answers WHERE round_id=game_rounds.id) AND NOT EXISTS(SELECT 1 FROM game_rounds r LEFT JOIN answers a
      ON a.round_id=r.id WHERE r.session_id=? AND r.position<game_rounds.position AND a.round_id IS NULL AND r.timed_out=0)`)
      .bind(now, now, s.round_seconds, rid, s.id, s.id).run();
    if (!changed.meta.changes) {
      const shown = await env.DB.prepare("SELECT presented_at FROM game_rounds WHERE id=? AND session_id=?").bind(rid, s.id).first<{ presented_at: number | null }>();
      if (!shown?.presented_at) throw new HttpError(409, "Foto non attiva");
    }
    return state(env, s);
  }
  if (match[2] === "media" && request.method === "GET") {
    const r = await env.DB.prepare("SELECT id,presented_at,copy_key FROM game_rounds WHERE id=? AND session_id=?").bind(match[3], s.id)
      .first<{ id: string; presented_at: number | null; copy_key: string | null }>();
    if (!r?.copy_key) throw new HttpError(404, "Foto non assegnata");
    if (!r.presented_at) {
      // A photo not yet shown: only the one whose turn it is, while the game is being played.
      if (s.phase !== "preparing" && s.phase !== "active") throw new HttpError(404, "Foto non disponibile");
      const current = await env.DB.prepare(`SELECT r.id FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL
        AND r.timed_out=0 ORDER BY r.position LIMIT 1`).bind(s.id).first<{ id: string }>();
      if (current?.id !== r.id) throw new HttpError(404, "Foto non ancora disponibile");
    }
    return privateMedia(await media(env, { r2_key: r.copy_key }), "Cookie");
  }
  if (match[2] === "answer" && request.method === "POST") {
    const data = await body(request, 1000);
    if (data.choice !== "REAL" && data.choice !== "AI") throw new HttpError(400, "Risposta non valida");
    const rid = String(data.roundId), now = Date.now();
    const r = await env.DB.prepare(`SELECT r.position,r.presented_at,r.expires_at,r.timed_out,CASE i.origin WHEN 'SLOP' THEN 'AI' ELSE 'REAL' END AS type
      FROM game_rounds r JOIN images i ON i.id=r.image_id WHERE r.id=? AND r.session_id=?`).bind(rid, s.id)
      .first<{ position: number; presented_at: number | null; expires_at: number | null; timed_out: number; type: "REAL" | "AI" }>();
    if (!r?.presented_at || !r.expires_at) throw new HttpError(409, "Foto non attiva: mostrala prima di rispondere");
    const previous = await env.DB.prepare("SELECT choice,correct FROM answers WHERE round_id=?").bind(rid).first<{ choice: string; correct: number }>();
    if (previous) {
      if (previous.choice !== data.choice) throw new HttpError(409, "Risposta già consegnata");
      return json({ correct: !!previous.correct, answer: r.type, replayed: true });
    }
    if (r.timed_out || now >= r.expires_at + GRACE_MS) throw new HttpError(410, "Tempo scaduto per questa foto");
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO answers(round_id,choice,correct,answered_at,elapsed_ms) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM game_sessions
        WHERE id=? AND phase='active') AND EXISTS(SELECT 1 FROM game_rounds WHERE id=? AND timed_out=0) ON CONFLICT(round_id) DO NOTHING`)
        .bind(rid, data.choice, data.choice === r.type ? 1 : 0, now, Math.max(0, Math.min(now, r.expires_at) - r.presented_at), s.id, rid),
      env.DB.prepare(`UPDATE game_sessions SET phase='completed',completed=1 WHERE id=? AND phase='active' AND NOT EXISTS(SELECT 1 FROM game_rounds r
        LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL AND r.timed_out=0)`).bind(s.id, s.id),
    ]);
    const saved = await env.DB.prepare("SELECT choice,correct FROM answers WHERE round_id=?").bind(rid).first<{ choice: string; correct: number }>();
    if (!saved) throw new HttpError(410, "Partita non attiva o tempo scaduto");
    if (saved.choice !== data.choice) throw new HttpError(409, "Risposta già consegnata");
    return json({ correct: !!saved.correct, answer: r.type });
  }
  if (match[2] === "leaderboard") {
    if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
    return json(await enter(env, s, await body(request, 1000)), 201);
  }
  throw new HttpError(405, "Metodo non consentito");
}
export type { Session };
