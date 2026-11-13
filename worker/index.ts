/** Router. 2026-11-12T09:00:00Z: one game mode with levels and a leaderboard (docs/gioco-a-livelli.v1.0.0.md); PvP removed. */
import { game } from "./game.v2.3.0";
import { adminLeaderboard, publicLeaderboard } from "./leaderboard.v1.1.0";
import { library } from "./library.v1.18.0";
import { admin, body, HttpError, json, sameOrigin, type Env } from "./core";
import { maintenance } from "./maintenance.v1.0.0";
export default {
  /** Daily Cron Trigger (wrangler.jsonc): games older than 12 months and other expired rows go (docs/privacy-note-legali.v1.0.0.md). */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(maintenance(env).then(result => console.log("maintenance", JSON.stringify(result))));
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method !== "GET") sameOrigin(request);
      if (url.pathname === "/api/health") return json({ name: "Real or Slop" });
      if (url.pathname.startsWith("/api/admin") || url.pathname.startsWith("/admin")) {
        await admin(request, env);
        if (url.pathname === "/api/admin/library" || url.pathname.startsWith("/api/admin/library/"))
          return await library(request, env, url.pathname);
        if (url.pathname === "/api/admin/leaderboard" || url.pathname.startsWith("/api/admin/leaderboard/"))
          return await adminLeaderboard(request, env, url.pathname, request.method === "POST" ? await body(request, 1000) : {});
        if (url.pathname === "/api/admin") return json({ configured: true });
        if (url.pathname.startsWith("/api/admin/")) throw new HttpError(404, "API inesistente");
      }
      if (url.pathname === "/api/leaderboard" && request.method === "GET") return json(await publicLeaderboard(env));
      if (url.pathname === "/api/levels" || url.pathname === "/api/sessions" || url.pathname.startsWith("/api/sessions/"))
        return await game(request, env, url.pathname);
      if (url.pathname.startsWith("/api/"))
        throw new HttpError(404, "API inesistente");
      return env.ASSETS.fetch(request);
    } catch (error) {
      const response = json(
        {
          error:
            error instanceof HttpError ? error.message : "Errore del server",
        },
        error instanceof HttpError ? error.status : 500,
      );
      if (error instanceof HttpError && error.status === 401)
        response.headers.set(
          "WWW-Authenticate",
          'Basic realm="Real or Slop Admin", charset="UTF-8"',
        );
      return response;
    }
  },
};
