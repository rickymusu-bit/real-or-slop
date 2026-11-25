/** Dashboard «Statistiche» (spec `statistiche-impostazioni`, section 3): games now and open, games and answers of the
 * period, paid calls, balance of the catalogue with formats. Free: database reads only. */
import { HttpError, type Env } from "./core";
import { since as openSince } from "./in-play";
import { levels } from "./game";
import { catalogCounts } from "./slop-references";
import { LEVEL_IDS, scoreOf, type Level, type Outcome } from "../shared/levels";

const NOW_MS = 5 * 60_000, DAY_MS = 86_400_000;

export async function stats(env: Env, period: string) {
  if (!["7", "30", "all"].includes(period)) throw new HttpError(400, "Invalid period: 7, 30 or all");
  const now = Date.now(), fromMs = period === "all" ? 0 : now - Number(period) * DAY_MS, fromIso = new Date(fromMs).toISOString();

  const live = (await env.DB.prepare(`SELECT s.level,count(DISTINCT s.id) AS n FROM game_sessions s LEFT JOIN game_rounds r ON r.session_id=s.id
    LEFT JOIN answers a ON a.round_id=r.id WHERE s.mode='levels' AND s.phase IN ('preparing','active')
    AND (r.presented_at>=?1 OR a.answered_at>=?1 OR s.created_at>=?1) GROUP BY s.level`).bind(now - NOW_MS).all<{ level: Level; n: number }>()).results;
  const open = await env.DB.prepare("SELECT count(*) AS n FROM game_sessions WHERE phase IN ('preparing','active') AND created_at>?")
    .bind(await openSince(env)).first<{ n: number }>();

  const sessions = (await env.DB.prepare(`SELECT level,phase,count(*) AS n FROM game_sessions WHERE mode='levels' AND created_at>=? GROUP BY level,phase`)
    .bind(fromMs).all<{ level: Level; phase: string; n: number }>()).results;
  const rows = (await env.DB.prepare(`SELECT r.session_id,s.level,CASE i.origin WHEN 'SLOP' THEN 'AI' ELSE 'REAL' END AS answer,a.choice
    FROM game_rounds r JOIN game_sessions s ON s.id=r.session_id JOIN images i ON i.id=r.image_id LEFT JOIN answers a ON a.round_id=r.id
    WHERE s.mode='levels' AND s.phase='completed' AND s.created_at>=? ORDER BY r.session_id,r.position LIMIT 50000`).bind(fromMs)
    .all<{ session_id: string; level: Level } & Outcome>()).results;
  const bySession = new Map<string, { level: Level; outcomes: Outcome[] }>();
  for (const r of rows) {
    const entry = bySession.get(r.session_id) || { level: r.level, outcomes: [] };
    entry.outcomes.push({ answer: r.answer, choice: r.choice }); bySession.set(r.session_id, entry);
  }
  const games = LEVEL_IDS.map(level => {
    const count = (phase?: string) => sessions.filter(s => s.level === level && (!phase || s.phase === phase)).reduce((n, s) => n + s.n, 0);
    const scores = [...bySession.values()].filter(g => g.level === level).map(g => scoreOf(g.outcomes).score);
    return { level, started: count(), completed: count("completed"), invalidated: count("invalidated"), unfinished: count("active") + count("preparing"),
      mean_score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null };
  });
  const all = scoreOf([...bySession.values()].flatMap(g => g.outcomes));
  const entries = await env.DB.prepare("SELECT count(*) AS n,coalesce(sum(hidden),0) AS hidden FROM leaderboard WHERE created_at>=?").bind(fromIso)
    .first<{ n: number; hidden: number }>();

  const callTotals = (await env.DB.prepare(`SELECT kind,status,count(*) AS n,coalesce(sum(input_tokens),0) AS input_tokens,coalesce(sum(output_tokens),0) AS output_tokens
    FROM paid_calls WHERE created_at>=? GROUP BY kind,status`).bind(fromIso)
    .all<{ kind: string; status: string; n: number; input_tokens: number; output_tokens: number }>()).results;
  const calls = (await env.DB.prepare(`SELECT kind,model,status,input_tokens,output_tokens,created_at FROM paid_calls WHERE created_at>=?
    ORDER BY created_at DESC LIMIT 200`).bind(fromIso).all<{ kind: string; model: string; status: string; input_tokens: number | null; output_tokens: number | null; created_at: string }>()).results;

  const catalogue = (await env.DB.prepare(`SELECT origin,status,count(*) AS n FROM images WHERE status IN ('approved','published') GROUP BY origin,status`)
    .all<{ origin: "REAL" | "SLOP"; status: "approved" | "published"; n: number }>()).results;
  const count = (origin: string, status: string) => catalogue.find(c => c.origin === origin && c.status === status)?.n || 0;
  const published = count("REAL", "published") + count("SLOP", "published");
  const processes = (await env.DB.prepare("SELECT state,count(*) AS n,coalesce(sum(attempts),0) AS attempts FROM slop_processes WHERE created_at>=? GROUP BY state").bind(fromIso).all<{state:string;n:number;attempts:number}>()).results;
  const share = published ? count("REAL", "published") / published : null;

  return {
    period, generated_at: new Date(now).toISOString(),
    live: { now: live.reduce((n, l) => n + l.n, 0), by_level: Object.fromEntries(LEVEL_IDS.map(l => [l, live.find(x => x.level === l)?.n || 0])),
      open: open?.n || 0, window_minutes: NOW_MS / 60_000 },
    games, answers: { concluded_games: bySession.size, photos: all.photos, real: all.real, slop: all.slop, timed_out: all.timed_out,
      balanced_accuracy: all.photos ? all.balanced_accuracy : null }, leaderboard: { entries: entries?.n || 0, hidden: entries?.hidden || 0 },
    calls: { totals: callTotals, recent: calls }, processes,
    balance: { real: { approved: count("REAL", "approved"), published: count("REAL", "published") },
      slop: { approved: count("SLOP", "approved"), published: count("SLOP", "published") },
      real_share_published: share === null ? null : Math.round(share * 1000) / 1000,
      warning: share !== null && (share < 0.4 || share > 0.6), levels: (await levels(env)).levels.map(l => ({...l, label: ({facile:"Easy",medio:"Medium",difficile:"Hard",esperto:"Expert"})[l.id]})),
      balance: await catalogCounts(env) },
  };
}

