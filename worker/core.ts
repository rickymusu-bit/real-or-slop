export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  PRELOAD_PROTOCOL?: string;
  IMAGES?: R2Bucket;
  QUARANTINE?: R2Bucket;
  ADMIN_TOKEN?: string;
  /** Paid image analysis (spec `libreria-immagini`): all required, otherwise analysis stays off. */
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  ANALYSIS_MODEL?: string;
  /** API of Wikimedia Commons for the nightly check of the REAL sources; only the tests set it (fake Commons). */
  COMMONS_API_URL?: string;
  /** The SLOP loop on Cloudflare (worker/slop-runner.ts, wrangler.jsonc «workflows»). */
  SLOP_RUNNER?: Workflow<{ batchId: string; phase: "images" | "proposals" }>;
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
/** A published library image as the game sees it (spec `libreria-immagini`). The game keeps its
 * REAL/AI vocabulary; r2_key is the approved game copy, served from the game bucket. */
export interface ImageRow {
  id: string;
  type: "REAL" | "AI";
  r2_key: string;
  sha256: string;
  status: string;
}
export const GAME_IMAGE = `SELECT id,CASE origin WHEN 'SLOP' THEN 'AI' ELSE 'REAL' END AS type,
  copy_key AS r2_key,copy_sha256 AS sha256,status FROM images`;
/** Published images with their game copy. The sampler's "approved" means eligible for play. */
export async function catalog(env: Env) {
  return (await env.DB.prepare(GAME_IMAGE + " WHERE status='published' AND copy_key IS NOT NULL").all<ImageRow>()).results
    .map(row => ({ ...row, status: "approved" }));
}
