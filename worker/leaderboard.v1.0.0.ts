/** Leaderboard (docs/gioco-a-livelli.v1.0.0.md, section 5). v1.0.0, 2026-11-12T09:00:00Z.
 * Owner decisions of 2026-11-12: a nickname asked at the end of a concluded game, checked for indecent words; the level shown in the
 * leaderboard; a game code to screenshot, which proves who played. The code is shown once; only its SHA-256 is stored. The public
 * leaderboard shows, for the last 7 days and for all time, the best entry of each player (anonymous game cookie), first 10.
 * The owner checks a code and hides or shows an entry from the dashboard. */
import { hash, HttpError, id, json, type Env } from "./core";
import { CODE_ALPHABET, cleanNickname, formatCode, isCode, LEVELS, nicknameError, normaliseCode, scoreOf, type Level } from "../shared/levels.v1.0.0";
import { outcomes, type Session } from "./game.v2.0.0";

const TOP = 10, WEEK_MS = 7 * 86_400_000;
interface Entry { id: string; nickname: string; level: Level; score: number; photos: number; balanced_accuracy: number; hidden: number; created_at: string }

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  // 256 is not a multiple of 31: values from 248 up are drawn again, so that every character is equally likely.
  return [...bytes].map(b => { let v = b; while (v >= 248) v = crypto.getRandomValues(new Uint8Array(1))[0]; return CODE_ALPHABET[v % CODE_ALPHABET.length]; }).join("");
}

/** POST /api/sessions/:id/leaderboard {nickname}: enters a concluded game once; returns the code, shown only now. */
export async function enter(env: Env, s: Session, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => key !== "nickname")) throw new HttpError(400, "Campi non previsti");
  if (s.phase !== "completed" || !s.level) throw new HttpError(409, "Solo una partita conclusa entra in classifica");
  const problem = nicknameError(data.nickname);
  if (problem) throw new HttpError(400, problem);
  const result = scoreOf(await outcomes(env, s.id));
  if (!result.photos || result.photos !== LEVELS[s.level].photos) throw new HttpError(409, "Partita incompleta: nessun punteggio");
  const code = newCode();
  try {
    await env.DB.prepare(`INSERT INTO leaderboard(id,session_id,owner_hash,nickname,level,score,photos,balanced_accuracy,code_hash,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id(), s.id, s.owner_hash, cleanNickname(String(data.nickname)), s.level, result.score, result.photos,
      result.balanced_accuracy, await hash(code), new Date().toISOString()).run();
  } catch { throw new HttpError(409, "Questa partita è già in classifica"); }
  return { code: formatCode(code), score: result.score, level: s.level, nickname: cleanNickname(String(data.nickname)) };
}

/** The best visible entry of each player since a date, first 10. */
async function best(env: Env, since: string) {
  const rows = (await env.DB.prepare(`SELECT l.nickname,l.level,l.score,l.created_at FROM leaderboard l WHERE l.hidden=0 AND l.created_at>=?1
    AND NOT EXISTS(SELECT 1 FROM leaderboard b WHERE b.owner_hash=l.owner_hash AND b.hidden=0 AND b.created_at>=?1 AND b.id<>l.id
      AND (b.score>l.score OR (b.score=l.score AND (b.created_at<l.created_at OR (b.created_at=l.created_at AND b.id<l.id)))))
    ORDER BY l.score DESC,l.created_at LIMIT ?2`).bind(since, TOP).all<Pick<Entry, "nickname" | "level" | "score" | "created_at">>()).results;
  return rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname, level: r.level, level_label: LEVELS[r.level].label, score: r.score, date: r.created_at.slice(0, 10) }));
}
export async function publicLeaderboard(env: Env) {
  return { week: await best(env, new Date(Date.now() - WEEK_MS).toISOString()), all: await best(env, "") };
}

/** /api/admin/leaderboard: GET ?code= to check a code, GET for the last 50 entries; POST /:id {hidden} hides or shows one. */
export async function adminLeaderboard(request: Request, env: Env, path: string, data: Record<string, unknown>) {
  const url = new URL(request.url), base = "/api/admin/leaderboard";
  const view = (e: Entry) => ({ id: e.id, nickname: e.nickname, level: e.level, level_label: LEVELS[e.level].label, score: e.score, photos: e.photos,
    balanced_accuracy: e.balanced_accuracy, hidden: e.hidden === 1, created_at: e.created_at });
  if (path === base && request.method === "GET") {
    const code = url.searchParams.get("code");
    if (code !== null) {
      if (!isCode(code)) throw new HttpError(400, "Codice non valido: 10 caratteri, come ABCD-EFGH-JK");
      const entry = await env.DB.prepare("SELECT * FROM leaderboard WHERE code_hash=?").bind(await hash(normaliseCode(code))).first<Entry>();
      return json({ found: !!entry, entry: entry ? view(entry) : null });
    }
    const rows = (await env.DB.prepare("SELECT * FROM leaderboard ORDER BY created_at DESC LIMIT 50").all<Entry>()).results;
    return json({ entries: rows.map(view) });
  }
  const match = path.match(/^\/api\/admin\/leaderboard\/([\w-]{1,64})$/);
  if (match && request.method === "POST") {
    if (typeof data.hidden !== "boolean" || Object.keys(data).length !== 1) throw new HttpError(400, "Indica hidden: true o false");
    const result = await env.DB.prepare("UPDATE leaderboard SET hidden=? WHERE id=?").bind(data.hidden ? 1 : 0, match[1]).run();
    if (!result.meta.changes) throw new HttpError(404, "Voce inesistente");
    return json({ id: match[1], hidden: data.hidden });
  }
  throw new HttpError(404, "API della classifica inesistente");
}
