export { GameRoom } from "./room";
import { game, stats } from "./game";
import { moderation } from "./moderation";
import { admin, HttpError, json, sameOrigin, type Env } from "./core";
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method !== "GET") sameOrigin(request);
      if (url.pathname === "/api/health")
        return json({ name: "Real or Slop", demo: env.DATA_MODE === "demo" });
      if (url.pathname === "/api/categories")
        return json(
          (
            await env.DB.prepare(
              "SELECT * FROM categories ORDER BY rowid",
            ).all()
          ).results,
        );
      if (
        url.pathname.startsWith("/api/admin") ||
        url.pathname.startsWith("/admin")
      ) {
        await admin(request, env);
        if (url.pathname === "/api/admin/stats") return await stats(env);
        if (url.pathname.startsWith("/api/admin/"))
          return await moderation(request, env, url.pathname);
        if (url.pathname === "/api/admin") return json({ configured: true });
      }
      if (
        url.pathname === "/api/rooms" ||
        url.pathname.startsWith("/api/rooms/")
      )
        throw new HttpError(503, "PvP temporaneamente sospeso");
      if (
        url.pathname === "/api/sessions" ||
        url.pathname.startsWith("/api/sessions/")
      )
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
