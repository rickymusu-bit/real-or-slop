import {
  body,
  hash,
  HttpError,
  id,
  json,
  rateLimit,
  sameOrigin,
  type Env,
  type ImageRow,
} from "./core";
import { curatedSample, filteredCatalog, reveal, settings } from "./game";
import { media } from "./storage";
interface Player {
  id: string;
  tokenHash: string;
  nickname: string;
  score: number;
  elapsedMs: number;
  answer: { choice: string; at: number } | null;
  ready: boolean;
  left: boolean;
  window: number;
  requests: number;
}
interface RoomState {
  code: string;
  challengeId: string;
  warnings: string[];
  phase: "lobby" | "playing" | "reveal" | "finished" | "abandoned";
  players: Player[];
  images: ImageRow[];
  round: number;
  roundSeconds: number;
  deadline: number;
  startedAt: number;
  createdAt: number;
  expiresAt: number;
  history: {
    image: ImageRow;
    answers: {
      playerId: string;
      choice: string;
      correct: boolean;
      elapsedMs: number;
    }[];
  }[];
}
const nickname = (value: unknown) => {
  const text = String(value || "Giocatore").trim();
  if (!/^[\p{L}\p{N} _-]{1,24}$/u.test(text))
    throw new HttpError(
      400,
      "Nickname: 1–24 lettere o numeri, senza dati personali",
    );
  return text;
};
export function roomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(bytes, (b) => alphabet[b % 32]).join("");
}
export async function rooms(request: Request, env: Env, path: string) {
  if (!env.ROOMS) throw new HttpError(503, "PvP non configurato");
  if (path === "/api/rooms" && request.method === "POST") {
    await rateLimit(
      env,
      "room:" +
        (await hash(request.headers.get("CF-Connecting-IP") || "local")),
      8,
    );
    const code = roomCode();
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(
      new Request(new URL("/create", request.url), {
        method: "POST",
        body: JSON.stringify({ ...(await body(request)), code }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  const match = path.match(
    /^\/api\/rooms\/([A-HJ-NP-Z2-9]{12})(?:\/(join|state|action|ws|media))?$/,
  );
  if (!match) throw new HttpError(404, "Stanza non trovata");
  if (match[2] === "join")
    await rateLimit(
      env,
      "join:" +
        (await hash(request.headers.get("CF-Connecting-IP") || "local")),
      20,
    );
  const url = new URL(request.url);
  url.pathname = "/" + (match[2] || "state");
  return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(
    new Request(url, request),
  );
}
export class GameRoom {
  private room: RoomState | undefined;
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {
    ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get<RoomState>("room");
    });
  }
  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        return await this.handle(request);
      } catch (e) {
        return json(
          {
            error:
              e instanceof HttpError
                ? e.message
                : "Stanza temporaneamente non disponibile",
          },
          e instanceof HttpError ? e.status : 503,
        );
      }
    });
  }
  private async save() {
    await this.ctx.storage.put("room", this.room!);
  }
  private async authenticate(request: Request) {
    const token =
      request.headers.get("Authorization")?.replace(/^Bearer /, "") ||
      request.headers
        .get("Sec-WebSocket-Protocol")
        ?.split(",")
        .map((i) => i.trim())
        .find((i) => i !== "ros") ||
      "";
    const digest = await hash(token);
    const p = this.room?.players.find((p) => p.tokenHash === digest);
    if (!p) throw new HttpError(401, "Accesso stanza richiesto");
    return p;
  }
  private playerLimit(p: Player) {
    const now = Date.now();
    if (now - p.window > 60000) {
      p.window = now;
      p.requests = 0;
    }
    p.requests++;
    if (p.requests > 120)
      throw new HttpError(
        429,
        "Troppe richieste alla stanza. Attendi un minuto.",
      );
  }
  private view(p: Player) {
    const r = this.room!;
    return {
      code: r.code,
      warnings: r.warnings,
      you: p.id,
      phase: r.phase,
      round: r.round + 1,
      total: r.images.length,
      demo: this.env.DATA_MODE === "demo",
      serverNow: Date.now(),
      deadline: r.deadline,
      players: r.players.map((i) => ({
        id: i.id,
        nickname: i.nickname,
        score: i.score,
        elapsedMs: i.elapsedMs,
        answered: !!i.answer,
        ready: i.ready,
        left: i.left,
      })),
      question:
        r.phase === "playing"
          ? {
              image: "/api/rooms/" + r.code + "/media",
              alt: "Immagine del round condiviso",
            }
          : null,
      reveal:
        r.phase === "reveal" || r.phase === "finished"
          ? {
              ...reveal(r.images[r.round]),
              correct: p.answer?.choice === r.images[r.round].type,
            }
          : null,
      history:
        r.phase === "finished"
          ? r.history.map((h) => ({ ...reveal(h.image), answers: h.answers }))
          : [],
    };
  }
  private broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        const attachment = ws.deserializeAttachment() as { pid: string };
        const player = this.room?.players.find((p) => p.id === attachment.pid);
        if (player) ws.send(JSON.stringify(this.view(player)));
      } catch {
        ws.close(1011, "Riconnetti");
      }
    }
  }
  private async settle() {
    const r = this.room!;
    if (r.phase === "finished" || r.phase === "abandoned") return;
    if (Date.now() >= r.expiresAt) {
      r.phase = "abandoned";
      await this.save();
      this.broadcast();
      await this.ctx.storage.deleteAlarm();
      return;
    }
    if (
      r.phase === "playing" &&
      (Date.now() >= r.deadline || r.players.every((p) => p.answer))
    ) {
      const next = structuredClone(r);
      const image = next.images[next.round];
      const answers = next.players.map((p) => {
        const correct = p.answer?.choice === image.type;
        const elapsedMs = p.answer
          ? Math.max(0, p.answer.at - next.startedAt)
          : next.roundSeconds * 1000;
        p.score += correct ? 100 : 0;
        p.elapsedMs += elapsedMs;
        return {
          playerId: p.id,
          choice: p.answer?.choice || "TIMEOUT",
          correct,
          elapsedMs,
        };
      });
      next.history.push({ image, answers });
      next.phase =
        next.round === next.images.length - 1 ? "finished" : "reveal";
      for (const p of next.players) p.ready = false;
      // Cross-store retries are safe: unique audit keys, absolute scores, then persist the next actor snapshot.
      await this.env.DB.batch([
        ...answers.map((a) =>
          this.env.DB.prepare(
            "INSERT INTO challenge_answers(challenge_id,player_id,round,image_id,choice,correct,elapsed_ms) VALUES(?,?,?,?,?,?,?) ON CONFLICT(challenge_id,player_id,round) DO NOTHING",
          ).bind(
            next.challengeId,
            a.playerId,
            next.round,
            image.id,
            a.choice,
            a.correct ? 1 : 0,
            a.elapsedMs,
          ),
        ),
        ...next.players.map((p) =>
          this.env.DB.prepare(
            "UPDATE challenge_players SET score=?,elapsed_ms=? WHERE challenge_id=? AND player_id=?",
          ).bind(p.score, p.elapsedMs, next.challengeId, p.id),
        ),
        ...(next.phase === "finished"
          ? [
              this.env.DB.prepare(
                "UPDATE challenges SET completed_at=? WHERE id=?",
              ).bind(Date.now(), next.challengeId),
            ]
          : []),
      ]);
      await this.ctx.storage.put("room", next);
      this.room = next;
      if (next.phase === "finished") await this.ctx.storage.deleteAlarm();
      else await this.ctx.storage.setAlarm(next.expiresAt);
      this.broadcast();
    }
  }
  private async begin() {
    const r = this.room!;
    r.phase = "playing";
    r.startedAt = Date.now();
    r.deadline = r.startedAt + r.roundSeconds * 1000;
    for (const p of r.players) {
      p.answer = null;
      p.ready = false;
    }
    await this.ctx.storage.setAlarm(r.deadline);
  }
  private async action(p: Player, data: Record<string, unknown>) {
    await this.settle();
    const r = this.room!;
    p = r.players.find((i) => i.id === p.id)!;
    this.playerLimit(p);
    if (p.left) throw new HttpError(409, "Hai abbandonato la stanza");
    if (data.action === "leave") {
      p.left = true;
      r.phase = "abandoned";
      await this.ctx.storage.deleteAlarm();
    } else if (data.action === "start") {
      if (p !== r.players[0] || r.phase !== "lobby" || r.players.length !== 2)
        throw new HttpError(409, "Servono due giocatori e l’avvio dell’host");
      await this.begin();
    } else if (data.action === "answer") {
      // The round number is part of the idempotency key; stale packets cannot answer a later round.
      if (Number(data.round) !== r.round + 1)
        throw new HttpError(409, "Round non attivo");
      if (!["REAL", "AI"].includes(String(data.choice)))
        throw new HttpError(400, "Risposta non valida");
      if (p.answer) {
        if (p.answer.choice !== data.choice)
          throw new HttpError(409, "Risposta già consegnata");
        return;
      }
      if (r.phase !== "playing" || Date.now() >= r.deadline)
        throw new HttpError(410, "Tempo scaduto o round concluso");
      p.answer = { choice: String(data.choice), at: Date.now() };
      await this.save();
      await this.settle();
    } else if (data.action === "next") {
      if (r.phase !== "reveal") throw new HttpError(409, "Round non concluso");
      p.ready = true;
      if (r.players.every((i) => i.ready)) {
        r.round++;
        await this.begin();
      }
    } else throw new HttpError(400, "Azione non valida");
    await this.save();
    this.broadcast();
  }
  private async handle(request: Request) {
    const path = new URL(request.url).pathname;
    if (path === "/create" && request.method === "POST") {
      if (this.room) throw new HttpError(409, "Stanza già esistente");
      const data = await body(request);
      const config = settings({
        ...data,
        mode: "training",
        count: data.count || 5,
      });
      const rows = await filteredCatalog(this.env, config);
      const sample = curatedSample(rows, config.count);
      const selected = sample.images;
      if (!selected.length)
        throw new HttpError(409, "Catalogo approvato insufficiente per garantire questa sfida");
      const images: ImageRow[] = [];
      for (const image of selected) {
        const full = await this.env.DB.prepare(
          "SELECT i.*,s.page_url AS source_url,l.name AS license_name,l.url AS license_url FROM images i LEFT JOIN sources s ON s.id=i.source_id LEFT JOIN licenses l ON l.id=i.license_id WHERE i.id=?",
        )
          .bind(image.id)
          .first<ImageRow>();
        if (full) images.push(full);
      }
      const seconds = Number(data.roundSeconds || 20);
      if (![10, 20, 30].includes(seconds))
        throw new HttpError(400, "Tempo per round non valido");
      const token = id() + id();
      const player: Player = {
        id: id(),
        tokenHash: await hash(token),
        nickname: nickname(data.nickname || "Giocatore 1"),
        score: 0,
        elapsedMs: 0,
        answer: null,
        ready: false,
        left: false,
        window: Date.now(),
        requests: 0,
      };
      this.room = {
        code: String(data.code),
        challengeId: id(),
        warnings: sample.warnings,
        phase: "lobby",
        players: [player],
        images,
        round: 0,
        roundSeconds: seconds,
        deadline: 0,
        startedAt: 0,
        createdAt: Date.now(),
        expiresAt: Date.now() + 30 * 60000,
        history: [],
      };
      await this.env.DB.batch([
        this.env.DB.prepare(
          "INSERT INTO players(id,nickname) VALUES(?,?)",
        ).bind(player.id, player.nickname),
        this.env.DB.prepare(
          "INSERT INTO challenges(id,created_at,settings) VALUES(?,?,?)",
        ).bind(
          this.room.challengeId,
          Date.now(),
          JSON.stringify({
            ...config,
            roundSeconds: seconds,
            demo: this.env.DATA_MODE === "demo",
          }),
        ),
        this.env.DB.prepare(
          "INSERT INTO challenge_players(challenge_id,player_id) VALUES(?,?)",
        ).bind(this.room.challengeId, player.id),
      ]);
      await this.save();
      await this.ctx.storage.setAlarm(this.room.expiresAt);
      return json(
        {
          code: this.room.code,
          token,
          warnings: sample.warnings,
        },
        201,
      );
    }
    if (!this.room) throw new HttpError(404, "Stanza non trovata");
    await this.settle();
    if (path === "/join" && request.method === "POST") {
      if (this.room.phase !== "lobby" || this.room.players.length >= 2)
        throw new HttpError(409, "Stanza piena o partita già iniziata");
      const data = await body(request);
      const token = id() + id();
      const p: Player = {
        id: id(),
        tokenHash: await hash(token),
        nickname: nickname(data.nickname || "Giocatore 2"),
        score: 0,
        elapsedMs: 0,
        answer: null,
        ready: false,
        left: false,
        window: Date.now(),
        requests: 0,
      };
      await this.env.DB.batch([
        this.env.DB.prepare(
          "INSERT INTO players(id,nickname) VALUES(?,?)",
        ).bind(p.id, p.nickname),
        this.env.DB.prepare(
          "INSERT INTO challenge_players(challenge_id,player_id) VALUES(?,?)",
        ).bind(this.room.challengeId, p.id),
      ]);
      this.room.players.push(p);
      await this.save();
      this.broadcast();
      return json({ code: this.room.code, token }, 201);
    }
    const p = await this.authenticate(request);
    this.playerLimit(p);
    if (path === "/state" && request.method === "GET") {
      await this.save();
      return json(this.view(p));
    }
    if (path === "/media" && request.method === "GET") {
      if (this.room.phase !== "playing")
        throw new HttpError(404, "Immagine non attiva");
      return media(this.env, this.room.images[this.room.round]);
    }
    if (path === "/action" && request.method === "POST") {
      await this.action(p, await body(request));
      return json(this.view(p));
    }
    if (path === "/ws" && request.headers.get("Upgrade") === "websocket") {
      sameOrigin(request);
      if (this.ctx.getWebSockets(p.id).length >= 2)
        throw new HttpError(
          429,
          "Troppi collegamenti: chiudi le altre finestre",
        );
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, [p.id]);
      server.serializeAttachment({ pid: p.id });
      server.send(JSON.stringify(this.view(p)));
      return new Response(null, {
        status: 101,
        webSocket: client,
        headers: { "Sec-WebSocket-Protocol": "ros" },
      });
    }
    throw new HttpError(405, "Metodo stanza non consentito");
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    await this.ctx.blockConcurrencyWhile(async () => {
      try {
        if (typeof message !== "string" || message.length > 2000)
          throw new HttpError(413, "Messaggio troppo grande");
        const attachment = ws.deserializeAttachment() as { pid: string };
        const p = this.room?.players.find((p) => p.id === attachment.pid);
        if (!p) throw new HttpError(401, "Accesso richiesto");
        await this.action(p, JSON.parse(message));
      } catch (e) {
        ws.send(
          JSON.stringify({
            error: e instanceof HttpError ? e.message : "Messaggio non valido",
          }),
        );
      }
    });
  }
  webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code === 1006 ? 1000 : code, reason);
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.room) await this.settle();
    });
  }
}
