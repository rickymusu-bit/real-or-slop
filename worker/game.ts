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
import { media } from "./storage";
export function shuffled<T>(rows: T[]): T[] {
  const out = [...rows];
  for (let i = out.length - 1; i > 0; i--) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [out[i], out[n]] = [out[n], out[i]];
  }
  return out;
}
export function balanced<T extends { type: string }>(rows: T[], count: number) {
  const a = shuffled(rows.filter((i) => i.type === "REAL"));
  const b = shuffled(rows.filter((i) => i.type === "AI"));
  const half = Math.floor(count / 2);
  const chosen = [...a.slice(0, half), ...b.slice(0, half)];
  const remaining = shuffled([...a.slice(half), ...b.slice(half)]);
  return shuffled([
    ...chosen,
    ...remaining.slice(0, Math.max(0, count - chosen.length)),
  ]);
}
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
  const difficulty = String(data.difficulty || "all");
  if (!["all", "facile", "medio", "difficile"].includes(difficulty))
    throw new HttpError(400, "Difficoltà non valida");
  const categories = Array.isArray(data.categories)
    ? data.categories.map(String).slice(0, 30)
    : [];
  return {
    mode,
    count: Number(count),
    duration: Number(duration),
    difficulty,
    categories,
  };
}
export async function filteredCatalog(
  env: Env,
  filters: { difficulty: string; categories: string[] },
) {
  let rows = await catalog(env);
  if (filters.difficulty !== "all")
    rows = rows.filter((i) => i.difficulty === filters.difficulty);
  if (filters.categories.length) {
    const assigned = (
      await env.DB.prepare(
        `SELECT DISTINCT image_id FROM image_categories WHERE category_id IN (${filters.categories.map(() => "?").join(",")})`,
      )
        .bind(...filters.categories)
        .all<{ image_id: string }>()
    ).results;
    const ids = new Set(assigned.map((i) => i.image_id));
    rows = rows.filter((i) => ids.has(i.id));
  }
  return rows;
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
  id: string;
  owner_hash: string;
  mode: string;
  expires_at: number | null;
  created_at: number;
  completed: number;
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
async function state(request: Request, env: Env, s: Session) {
  const now = Date.now();
  const results = (
    await env.DB.prepare(
      `SELECT a.correct,a.choice,a.elapsed_ms,r.position,r.id AS round_id FROM answers a JOIN game_rounds r ON r.id=a.round_id WHERE r.session_id=? ORDER BY r.position`,
    )
      .bind(s.id)
      .all<{
        correct: number;
        choice: string;
        elapsed_ms: number;
        position: number;
        round_id: string;
      }>()
  ).results;
  const total = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM game_rounds WHERE session_id=?",
  )
    .bind(s.id)
    .first<{ n: number }>();
  const done =
    !!s.completed ||
    (!!s.expires_at && now >= s.expires_at) ||
    results.length === total?.n;
  if (done && !s.completed)
    await env.DB.prepare("UPDATE game_sessions SET completed=1 WHERE id=?")
      .bind(s.id)
      .run();
  let question = null;
  if (!done) {
    const round = await env.DB.prepare(
      "SELECT r.id,r.position FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND a.round_id IS NULL ORDER BY r.position LIMIT 1",
    )
      .bind(s.id)
      .first<{ id: string; position: number }>();
    if (round) {
      await env.DB.prepare(
        "UPDATE game_rounds SET presented_at=COALESCE(presented_at,?) WHERE id=?",
      )
        .bind(now, round.id)
        .run();
      question = {
        id: round.id,
        number: round.position + 1,
        image: `/api/sessions/${s.id}/media/${round.id}`,
        alt: "Immagine da osservare per rispondere alla domanda",
      };
    }
  }
  const credits = [];
  if (done) {
    for (const r of results) {
      const image = await env.DB.prepare(
        `${joinedImage} WHERE i.id=(SELECT image_id FROM game_rounds WHERE id=?)`,
      )
        .bind(r.round_id)
        .first<ImageRow>();
      if (image) credits.push({ ...reveal(image), correct: !!r.correct });
    }
  }
  return json({
    id: s.id,
    mode: s.mode,
    demo: env.DATA_MODE === "demo",
    serverNow: now,
    expiresAt: s.expires_at,
    done,
    total: total?.n || 0,
    answered: results.length,
    score: results.filter((i) => i.correct).length * 100,
    elapsedMs: results.reduce((n, r) => n + r.elapsed_ms, 0),
    question,
    credits,
  });
}
export async function game(request: Request, env: Env, path: string) {
  if (path === "/api/sessions" && request.method === "POST") {
    const config = settings(await body(request));
    const token = cookie(request) || id() + id();
    const key = await hash(token);
    await rateLimit(
      env,
      "create:" +
        (await hash(request.headers.get("CF-Connecting-IP") || "local")),
      20,
    );
    const rows = await filteredCatalog(env, config);
    const selected = balanced(
      rows,
      config.mode === "timed" ? Math.min(rows.length, 50) : config.count,
    );
    if (!selected.length)
      throw new HttpError(
        409,
        "Nessuna immagine approvata per questi filtri. Prova tutte le categorie.",
      );
    const now = Date.now(),
      sid = id();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO game_sessions(id,mode,created_at,expires_at,owner_hash) VALUES(?,?,?,?,?)",
      ).bind(
        sid,
        config.mode,
        now,
        config.mode === "timed" ? now + config.duration * 1000 : null,
        key,
      ),
      ...selected.map((i, n) =>
        env.DB.prepare(
          "INSERT INTO game_rounds(id,session_id,image_id,position) VALUES(?,?,?,?)",
        ).bind(id(), sid, i.id, n),
      ),
    ]);
    const warnings = [];
    if (config.mode === "training" && selected.length < config.count)
      warnings.push("Catalogo insufficiente: numero di domande ridotto.");
    if (
      Math.abs(
        selected.filter((i) => i.type === "REAL").length -
          selected.filter((i) => i.type === "AI").length,
      ) > 1
    )
      warnings.push("Catalogo insufficiente per un bilanciamento 50/50.");
    const response = json({ id: sid, warnings }, 201);
    response.headers.set(
      "Set-Cookie",
      `ros_owner=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
    );
    return response;
  }
  const match = path.match(
    /^\/api\/sessions\/([\w-]+)(?:\/(answer|media)(?:\/([\w-]+))?)?$/,
  );
  if (!match) throw new HttpError(404, "API partita inesistente");
  const s = await owned(request, env, match[1]);
  if (!match[2] && request.method === "GET") return state(request, env, s);
  if (match[2] === "media" && request.method === "GET") {
    const round = await env.DB.prepare(
      "SELECT image_id,presented_at FROM game_rounds WHERE id=? AND session_id=?",
    )
      .bind(match[3], s.id)
      .first<{ image_id: string; presented_at: number | null }>();
    if (!round?.presented_at)
      throw new HttpError(404, "Immagine non assegnata");
    const image = await env.DB.prepare(
      "SELECT * FROM images WHERE id=? AND status='approved'",
    )
      .bind(round.image_id)
      .first<ImageRow>();
    if (!image) throw new HttpError(404, "Immagine non disponibile");
    return media(env, image);
  }
  if (match[2] === "answer" && request.method === "POST") {
    const data = await body(request);
    if (!["REAL", "AI"].includes(String(data.choice)))
      throw new HttpError(400, "Risposta non valida");
    const rid = String(data.roundId);
    const round = await env.DB.prepare(
      "SELECT * FROM game_rounds WHERE id=? AND session_id=?",
    )
      .bind(rid, s.id)
      .first<{
        id: string;
        image_id: string;
        position: number;
        presented_at: number | null;
      }>();
    if (!round?.presented_at) throw new HttpError(409, "Domanda non attiva");
    const image = await env.DB.prepare(`${joinedImage} WHERE i.id=?`)
      .bind(round.image_id)
      .first<ImageRow>();
    if (!image) throw new HttpError(404, "Immagine non disponibile");
    const previous = await env.DB.prepare(
      "SELECT choice,correct FROM answers WHERE round_id=?",
    )
      .bind(rid)
      .first<{ choice: string; correct: number }>();
    if (previous) {
      if (previous.choice !== data.choice)
        throw new HttpError(409, "Risposta già consegnata");
      return json({
        ...reveal(image),
        correct: !!previous.correct,
        replayed: true,
      });
    }
    const now = Date.now();
    if (s.completed || (s.expires_at && now >= s.expires_at))
      throw new HttpError(410, "Tempo scaduto");
    // Atomic SQL guards both ordering and duplicate/concurrent requests.
    await env.DB.prepare(
      `INSERT INTO answers(round_id,choice,correct,answered_at,elapsed_ms) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM game_rounds r LEFT JOIN answers a ON a.round_id=r.id WHERE r.session_id=? AND r.position<? AND a.round_id IS NULL) ON CONFLICT(round_id) DO NOTHING`,
    )
      .bind(
        rid,
        data.choice,
        image.type === data.choice ? 1 : 0,
        now,
        Math.max(0, now - round.presented_at),
        s.id,
        round.position,
      )
      .run();
    const saved = await env.DB.prepare(
      "SELECT choice,correct FROM answers WHERE round_id=?",
    )
      .bind(rid)
      .first<{ choice: string; correct: number }>();
    if (!saved || saved.choice !== data.choice)
      throw new HttpError(409, "Risposta già consegnata o domanda non attiva");
    return json({ ...reveal(image), correct: !!saved.correct });
  }
  throw new HttpError(405, "Metodo non consentito");
}
export async function stats(env: Env) {
  const images = (
    await env.DB.prepare(
      "SELECT i.id,i.difficulty,COUNT(a.image_id) AS sample,AVG(a.correct) AS accuracy FROM images i JOIN image_answer_statistics a ON a.image_id=i.id GROUP BY i.id HAVING COUNT(a.image_id)>=30",
    ).all<{
      id: string;
      difficulty: string;
      sample: number;
      accuracy: number;
    }>()
  ).results;
  const categories = (
    await env.DB.prepare(
      "SELECT c.id,c.name,COUNT(*) AS sample,AVG(a.correct) AS accuracy FROM categories c JOIN image_categories ic ON ic.category_id=c.id JOIN image_answer_statistics a ON a.image_id=ic.image_id GROUP BY c.id",
    ).all()
  ).results;
  return json({
    minimumSample: 30,
    images: images.map((i) => ({
      ...i,
      suggestedDifficulty:
        i.accuracy >= 0.8
          ? "facile"
          : i.accuracy >= 0.4
            ? "medio"
            : "difficile",
    })),
    categories,
    note: "Suggerimenti editoriali: nessun aggiornamento automatico. Categorie multiple possono contare la stessa risposta.",
  });
}
