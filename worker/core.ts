export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  DATA_MODE: string;
  PRELOAD_PROTOCOL?: string;
  IMAGES?: R2Bucket;
  QUARANTINE?: R2Bucket;
  ADMIN_TOKEN?: string;
  ENABLE_EDITORIAL_PAID?: string;
  ENABLE_EDITORIAL_V2_EXPERIMENTS?: string;
  ENABLE_EDITORIAL_V2_PAID?: string;
  EDITORIAL_V2_EVALUATION_USD?: string;
  EDITORIAL_V2_GENERATION_USD?: string;
  EDITORIAL_V2_RUN_USD?: string;
  EDITORIAL_V2_DAILY_USD?: string;
  EDITORIAL_V2_TOTAL_USD?: string;
  EDITORIAL_V2_MAX_EVALUATIONS?: string;
  EDITORIAL_V2_MAX_GENERATIONS?: string;
  EDITORIAL_EVALUATION_USD?: string;
  EDITORIAL_GENERATION_USD?: string;
  EDITORIAL_BATCH_EVALUATION_USD?: string;
  EDITORIAL_BATCH_GENERATION_USD?: string;
  EDITORIAL_RUN_USD?: string;
  EDITORIAL_DAILY_USD?: string;
  EDITORIAL_TOTAL_USD?: string;
  EDITORIAL_MAX_EVALUATIONS?: string;
  EDITORIAL_MAX_GENERATIONS?: string;
  EDITORIAL_MAX_REGENERATIONS?: string;
  ROOMS?: DurableObjectNamespace;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export const id = () => crypto.randomUUID();
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export async function body(request: Request, max = 20000): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length") || 0) > max)
    throw new HttpError(413, "Richiesta troppo grande");
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "Richiesta troppo grande");
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw new HttpError(400, "JSON non valido");
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new HttpError(403, "Origine non consentita");
}
export async function admin(request: Request, env: Env) {
  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 32)
    throw new HttpError(503, "Amministrazione non configurata");
  let token =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  if (token.startsWith("Basic ")) {
    try {
      token = atob(token.slice(6)).split(":").slice(1).join(":");
    } catch {
      token = "";
    }
  }
  if ((await hash(token)) !== (await hash(env.ADMIN_TOKEN)))
    throw new HttpError(401, "Accesso amministratore richiesto");
}
export async function rateLimit(env: Env, key: string, max = 30) {
  const now = Date.now();
  await env.DB.prepare("DELETE FROM rate_limits WHERE resets_at < ?")
    .bind(now)
    .run();
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits(key,count,resets_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(key, now + 60000)
    .first<{ count: number }>();
  if (row && row.count > max)
    throw new HttpError(429, "Troppe richieste. Riprova tra un minuto.");
}
export interface ImageRow {
  id: string;
  type: "REAL" | "AI";
  title: string;
  description: string;
  author: string;
  explanation: string;
  r2_key: string;
  demo: number;
  source_url?: string;
  license_name?: string;
  license_url?: string;
  game_caption?: string | null;
  caption_revision?: number | null;
  caption_context_fictional?: number | null;
}
export async function catalog(env: Env) {
  return (
    await env.DB.prepare(
      "SELECT i.*,c.game_caption,c.revision AS caption_revision,c.fictional AS caption_context_fictional FROM images i JOIN published_images p ON p.image_id=i.id LEFT JOIN editorial_public_captions c ON c.image_id=i.id WHERE i.status='approved' AND i.demo=? AND (NOT EXISTS(SELECT 1 FROM editorial_game_bindings b WHERE b.image_id=i.id) OR EXISTS(SELECT 1 FROM editorial_game_bindings b JOIN editorial_review_inbox q ON q.id=b.candidate_id WHERE b.image_id=i.id AND q.status='approved'))",
    )
      .bind(env.DATA_MODE === "demo" ? 1 : 0)
      .all<ImageRow & { status: string; sha256: string; perceptual_hash: string | null }>()
  ).results;
}
export function demoSvg(key: string) {
  const hue =
    (Array.from(key).reduce((sum, c) => sum + c.charCodeAt(0), 0) % 50) + 175;
  const pattern = Array.from(
    { length: 9 },
    (_, i) =>
      `<path d="M ${i * 110 - 180} 600 L ${i * 110 + 80} ${100 + (i % 3) * 90} L ${i * 110 + 240} 600 Z" fill="hsl(${hue + i * 3} 28% ${22 + i * 3}%)"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="hsl(${hue} 30% 70%)"/><stop offset="1" stop-color="#e6d6af"/></linearGradient></defs><path fill="url(#s)" d="M0 0h1200v800H0z"/><circle cx="880" cy="170" r="66" fill="#f4ddaa"/>${pattern}<path fill="#152f36" d="M0 560 Q200 460 450 590 T1200 510v290H0z"/><path fill="#43727b" d="M0 650Q250 550 570 670T1200 610v190H0z"/><path d="M510 640L700 800H350z" fill="#b3c6bd" opacity=".6"/></svg>`;
}
