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
import { GAME_IMAGE } from "./core";
import { media, privateMedia } from "./storage";
import { mediaProtocol, roomPreparationTtlMs } from "../shared/preloading";
interface Player {
  id: string;
  tokenHash: string;
  nickname: string;
  score: number;
  elapsedMs: number;
  answer: { choice: string; at: number } | null;
  ready: boolean;
  mediaReady?: boolean;
  left: boolean;
  window: number;
  requests: number;
}
interface RoomState {
  code: string;
  revision?: number;
  challengeId: string;
  warnings: string[];
  phase: "lobby" | "preparing" | "playing" | "reveal" | "finished" | "abandoned" | "invalidated";
  protocolVersion?: number;
  preparationDeadline?: number;
  mediaKey?: string;
  invalidReason?: string;
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
    private now = () => Date.now(),
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
    this.room!.revision = (this.room!.revision || 0) + 1;
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
    const now = this.now();
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
      revision: r.revision || 0,
      warnings: r.warnings,
      you: p.id,
      phase: r.phase,
      round: r.round + 1,
      total: r.images.length,
      demo: false,
      serverNow: this.now(),
      deadline: r.deadline,
      protocolVersion: r.protocolVersion || 1,
      preparationDeadline: r.preparationDeadline || null,
      invalidReason: r.invalidReason || null,
      players: r.players.map((i) => ({
        id: i.id,
        nickname: i.nickname,
        score: r.phase === "invalidated" ? 0 : i.score,
        elapsedMs: r.phase === "invalidated" ? 0 : i.elapsedMs,
        answered: !!i.answer,
        ready: i.ready,
        mediaReady: !!i.mediaReady,
        left: i.left,
      })),
      question:
        (r.phase === "playing" || r.phase === "preparing")
          ? {
              image: "/api/rooms/" + r.code + "/media?key=" + (r.mediaKey || String(r.round + 1)),
              alt: "Immagine del round condiviso",
              caption: r.images[r.round]?.caption || "",
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
    if (["finished", "abandoned", "invalidated"].includes(r.phase)) return;
    if (this.now() >= r.expiresAt) {
      r.phase = "abandoned";
      await this.auditTerminal("abandoned", "room_expired");
      await this.save();
      this.broadcast();
      await this.ctx.storage.deleteAlarm();
      return;
    }
    if (r.phase === "preparing" && this.now() >= (r.preparationDeadline || 0)) {
      await this.invalidateRoom("preparation_timeout");
      return;
    }
    if (
      r.phase === "playing" &&
      (this.now() >= r.deadline || r.players.every((p) => p.answer))
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
                "UPDATE challenges SET completed_at=?,outcome='completed' WHERE id=? AND outcome='active'",
              ).bind(this.now(), next.challengeId),
            ]
          : []),
      ]);
      next.revision = (next.revision || 0) + 1;
      await this.ctx.storage.put("room", next);
      this.room = next;
      if (next.phase === "finished") await this.ctx.storage.deleteAlarm();
      else await this.ctx.storage.setAlarm(next.expiresAt);
      this.broadcast();
    }
  }
  private async auditTerminal(kind: "abandoned" | "invalidated", reason: string) {
    const r = this.room!;
    await this.env.DB.batch([
      this.env.DB.prepare("INSERT INTO media_events(id,challenge_id,kind,reason,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM challenges WHERE id=? AND outcome='active') ON CONFLICT(id) DO NOTHING").bind(`${r.challengeId}:${kind}`, r.challengeId, kind, reason, this.now(), r.challengeId),
      this.env.DB.prepare("UPDATE challenges SET outcome=? WHERE id=? AND outcome='active'").bind(kind, r.challengeId),
    ]);
  }
  private async invalidateRoom(reason: string) {
    const r = this.room!;
    await this.auditTerminal("invalidated", reason);
    r.phase = "invalidated"; r.invalidReason = reason; r.deadline = 0;
    await this.save(); await this.ctx.storage.deleteAlarm(); this.broadcast();
  }
  private async activateRound() {
    const r = this.room!;
    r.phase = "playing"; r.startedAt = this.now(); r.deadline = r.startedAt + r.roundSeconds * 1000;
    await this.save(); await this.ctx.storage.setAlarm(r.deadline);
    await this.env.DB.prepare("INSERT INTO media_events(id,challenge_id,kind,reason,created_at) VALUES(?,?,'started','both_media_ready',?) ON CONFLICT(id) DO NOTHING")
      .bind(`${r.challengeId}:started:${r.round}`, r.challengeId, r.startedAt).run();
  }
  private async begin() {
    const r = this.room!;
    for (const p of r.players) { p.answer = null; p.ready = false; p.mediaReady = false; }
    if (r.protocolVersion !== 2) { await this.activateRound(); return; }
    r.phase = "preparing"; r.startedAt = 0; r.deadline = 0; r.mediaKey = id();
    r.preparationDeadline = Math.min(this.now() + roomPreparationTtlMs, r.expiresAt);
    await this.save(); await this.ctx.storage.setAlarm(r.preparationDeadline);
  }
  private async action(p: Player, data: Record<string, unknown>) {
    await this.settle();
    const r = this.room!;
    p = r.players.find((i) => i.id === p.id)!;
    this.playerLimit(p);
    if (data.action === "leave" && ["finished", "abandoned", "invalidated"].includes(r.phase)) return;
    if (p.left) throw new HttpError(409, "Hai abbandonato la stanza");
    if (data.action === "leave") {
      p.left = true;
      r.phase = "abandoned";
      await this.auditTerminal("abandoned", "player_left");
      await this.ctx.storage.deleteAlarm();
    } else if (data.action === "start") {
      if (p !== r.players[0] || r.players.length !== 2) throw new HttpError(409, "Servono due giocatori e l’avvio dell’host");
      if (r.phase === "lobby") await this.begin();
      else if (!["preparing", "playing"].includes(r.phase)) throw new HttpError(409, "Sfida già avviata");
    } else if (data.action === "media-ready") {
      if (Number(data.round) !== r.round + 1 || r.protocolVersion !== 2) throw new HttpError(409, "Round non attivo");
      if (r.phase === "playing" && p.mediaReady) return;
      if (r.phase !== "preparing") throw new HttpError(410, "Preparazione terminata");
      p.mediaReady = true;
      if (r.players.every(i => i.mediaReady && !i.left)) await this.activateRound();
    } else if (data.action === "media-failed") {
      if (Number(data.round) !== r.round + 1 || !["preparing", "playing"].includes(r.phase)) throw new HttpError(409, "Round non attivo");
      await this.invalidateRoom("media_unavailable");
      return;
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
      if (r.phase !== "playing" || this.now() >= r.deadline)
        throw new HttpError(410, "Tempo scaduto o round concluso");
      p.answer = { choice: String(data.choice), at: this.now() };
      await this.save();
      await this.settle();
    } else if (data.action === "next") {
      if (r.phase !== "reveal" || (r.protocolVersion === 2 && Number(data.round) !== r.round + 1)) throw new HttpError(409, "Round non concluso o richiesta obsoleta");
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
      const full = (await this.env.DB.prepare(`${GAME_IMAGE} WHERE id IN (${selected.map(() => "?").join(",")})`)
        .bind(...selected.map(image => image.id)).all<ImageRow>()).results;
      const byId = new Map(full.map(image => [image.id, image]));
      if (selected.some(image => !byId.has(image.id))) throw new HttpError(409, "Catalogo modificato durante l'assegnazione: riprovare");
      const images = selected.map(image => byId.get(image.id)!);
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
        window: this.now(),
        requests: 0,
      };
      this.room = {
        code: String(data.code),
        challengeId: id(),
        warnings: sample.warnings,
        phase: "lobby",
        protocolVersion: mediaProtocol(this.env.PRELOAD_PROTOCOL),
        players: [player],
        images,
        round: 0,
        roundSeconds: seconds,
        deadline: 0,
        startedAt: 0,
        createdAt: this.now(),
        expiresAt: this.now() + 30 * 60000,
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
          this.now(),
          JSON.stringify({
            ...config,
            roundSeconds: seconds,
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
        window: this.now(),
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
      if (!["preparing", "playing"].includes(this.room.phase) || p.left) throw new HttpError(404, "Immagine non attiva");
      const key = new URL(request.url).searchParams.get("key");
      if ((this.room.protocolVersion === 2 && key !== this.room.mediaKey) || (key !== null && key !== (this.room.mediaKey || String(this.room.round + 1)))) throw new HttpError(404, "Immagine non assegnata a questo round");
      const response = await media(this.env, this.room.images[this.room.round]);
      return key ? privateMedia(response, "Authorization") : response;
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
    ws.close(code === 1006 || code === 1005 ? 1000 : code, reason);
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.room) await this.settle();
    });
  }
}
