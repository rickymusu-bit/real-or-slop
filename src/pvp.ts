import { api, content, escape } from "./main";
import { feedback, zoom, type Reveal } from "./play";
interface Connection {
  code: string;
  token: string;
}
interface RoomView {
  code: string;
  you: string;
  phase: string;
  warnings: string[];
  round: number;
  total: number;
  serverNow: number;
  deadline: number;
  players: {
    id: string;
    nickname: string;
    score: number;
    elapsedMs: number;
    answered: boolean;
    ready: boolean;
    left: boolean;
  }[];
  question: { image: string; alt: string } | null;
  reveal: Reveal | null;
  history: (Reveal & {
    answers: { playerId: string; correct: boolean; elapsedMs: number }[];
  })[];
  error?: string;
}
export let stopPvp = () => {};
export async function setupPvp() {
  stopPvp();
  content().innerHTML = `<section class="page narrow"><div class="eyebrow">UNA SFIDA, DUE SGUARDI · DEMO</div><h1>Chi ci vede meglio?</h1><p class="lead">Due giocatori. Le stesse immagini. La soluzione si svela quando entrambi rispondono o scade il tempo.</p>${sessionStorage.getItem("ros_room") ? '<button id="resume-room">Rientra nella tua stanza ↗</button>' : ""}<label for="nickname">Nickname (facoltativo, senza dati personali)</label><input id="nickname" maxlength="24" placeholder="Giocatore"><div class="form-grid"><form id="create-room"><h2>Crea una sfida</h2><label for="rounds">Round</label><input id="rounds" type="number" value="5" min="1" max="24"><label for="round-seconds">Tempo per round</label><select id="round-seconds"><option value="10">10 secondi</option><option value="20" selected>20 secondi</option><option value="30">30 secondi</option></select><label for="room-difficulty">Difficoltà</label><select id="room-difficulty"><option value="all">Tutte</option><option value="facile">Facile</option><option value="medio">Media</option><option value="difficile">Difficile</option></select><label for="room-categories">Categorie (selezione multipla)</label><select id="room-categories" multiple></select><p>100 punti per risposta corretta. A parità vince il minor tempo totale; nessuna risposta conta il tempo massimo.</p><button class="primary" type="submit">Crea stanza ↗</button></form><form id="join-room"><h2>Hai un codice?</h2><label for="room-code">Codice stanza</label><input id="room-code" autocomplete="off" maxlength="12" placeholder="12 caratteri" style="text-transform:uppercase"><p>Chiedi il codice all’amico che ha creato la stanza. Le stanze scadono dopo 30 minuti.</p><button type="submit">Entra nella stanza ↗</button></form></div><p id="room-error" class="error" role="alert" hidden></p></section>`;
  document.querySelector("#resume-room")?.addEventListener("click", () => {
    try {
      void connect(JSON.parse(sessionStorage.getItem("ros_room")!));
    } catch {
      sessionStorage.removeItem("ros_room");
    }
  });
  const formElement = document.querySelector<HTMLFormElement>("#create-room")!;
  try {
    const categories =
      await api<{ id: string; name: string; parent_id: string | null }[]>(
        "/categories",
      );
    if (!formElement.isConnected) return;
    document.querySelector("#room-categories")!.innerHTML = categories
      .map(
        (c) =>
          `<option value="${escape(c.id)}">${c.parent_id ? "↳ " : ""}${escape(c.name)}</option>`,
      )
      .join("");
  } catch {
    /* Creation without filters remains usable. */
  }
  if (!formElement.isConnected) return;
  const form = async (event: Event, join: boolean) => {
    event.preventDefault();
    const button = (
      event.target as HTMLFormElement
    ).querySelector<HTMLButtonElement>("button")!;
    button.disabled = true;
    try {
      const nick = document.querySelector<HTMLInputElement>("#nickname")!.value;
      const code = document
        .querySelector<HTMLInputElement>("#room-code")!
        .value.trim()
        .toUpperCase();
      const result = await api<Connection>(
        join ? "/rooms/" + code + "/join" : "/rooms",
        {
          method: "POST",
          body: JSON.stringify({
            nickname: nick,
            count: Number(
              document.querySelector<HTMLInputElement>("#rounds")!.value,
            ),
            roundSeconds: Number(
              document.querySelector<HTMLSelectElement>("#round-seconds")!
                .value,
            ),
            difficulty:
              document.querySelector<HTMLSelectElement>("#room-difficulty")!
                .value,
            categories: Array.from(
              document.querySelector<HTMLSelectElement>("#room-categories")!
                .selectedOptions,
            ).map((o) => o.value),
          }),
        },
      );
      if (!formElement.isConnected) return;
      sessionStorage.setItem("ros_room", JSON.stringify(result));
      await connect(result);
    } catch (e) {
      if (!formElement.isConnected) return;
      const error = document.querySelector<HTMLElement>("#room-error")!;
      error.hidden = false;
      error.textContent = String(e);
      button.disabled = false;
    }
  };
  document
    .querySelector("#create-room")!
    .addEventListener("submit", (e) => void form(e, false));
  document
    .querySelector("#join-room")!
    .addEventListener("submit", (e) => void form(e, true));
}
async function connect(c: Connection) {
  stopPvp();
  let active = true,
    terminal = false,
    drawVersion = 0,
    socket: WebSocket | undefined,
    poll: ReturnType<typeof setInterval> | undefined,
    retry: ReturnType<typeof setTimeout> | undefined,
    clock: ReturnType<typeof setInterval> | undefined,
    blobUrl = "",
    imageKey = "",
    pending = false;
  const headers = { Authorization: "Bearer " + c.token };
  stopPvp = () => {
    active = false;
    socket?.close();
    if (poll) clearInterval(poll);
    if (retry) clearTimeout(retry);
    if (clock) clearInterval(clock);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    document.removeEventListener("keydown", key);
  };
  const key = (e: KeyboardEvent) => {
    if (
      ["INPUT", "SELECT", "TEXTAREA"].includes(
        (e.target as HTMLElement).tagName,
      )
    )
      return;
    const choice =
      e.key.toLowerCase() === "r"
        ? "REAL"
        : e.key.toLowerCase() === "i"
          ? "AI"
          : null;
    if (choice)
      document
        .querySelector<HTMLButtonElement>(`[data-pvp-choice=${choice}]`)
        ?.click();
  };
  document.addEventListener("keydown", key);
  const action = async (
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (pending) return;
    pending = true;
    try {
      const next = await api<RoomView>("/rooms/" + c.code + "/action", {
        method: "POST",
        headers,
        body: JSON.stringify({ action, ...extra }),
      });
      if (active) await draw(next);
    } catch (e) {
      const error = document.querySelector("#pvp-error");
      if (error) error.textContent = String(e);
    } finally {
      pending = false;
    }
  };
  const load = async () => {
    try {
      const next = await api<RoomView>("/rooms/" + c.code + "/state", {
        headers,
      });
      if (active) await draw(next);
    } catch (e) {
      if (!active) return;
      content().innerHTML = `<section class="page narrow"><h1>Riconnessione.</h1><p>${escape(e)}</p><p>La partita resta sul server. Non chiudere questa scheda.</p><button id="reconnect-room">Riprova</button><a class="button" href="/pvp">Torna alle stanze</a></section>`;
      document
        .querySelector("#reconnect-room")!
        .addEventListener("click", () => void load());
    }
  };
  const draw = async (v: RoomView) => {
    if (!active) return;
    const version = ++drawVersion;
    if (v.error) {
      document
        .querySelector("#pvp-error")
        ?.replaceChildren(document.createTextNode(v.error));
      return;
    }
    if (clock) clearInterval(clock);
    const me = v.players.find((p) => p.id === v.you)!;
    const ranking = [...v.players].sort(
      (a, b) => b.score - a.score || a.elapsedMs - b.elapsedMs,
    );
    const title =
      v.phase === "lobby"
        ? "Uno sguardo sta arrivando."
        : v.phase === "finished"
          ? ranking[0].score === ranking[1].score &&
            ranking[0].elapsedMs === ranking[1].elapsedMs
            ? "Sguardi alla pari."
            : `${escape(ranking[0].nickname)} vince!`
          : v.phase === "abandoned"
            ? "La stanza è terminata."
            : `Round ${v.round} di ${v.total}`;
    content().innerHTML = `<section class="${v.phase === "lobby" || v.phase === "finished" || v.phase === "abandoned" ? "page narrow" : "play"}"><div class="play-top"><span>PVP · DEMO SINTETICA</span><strong id="pvp-clock"></strong></div><h2>${title}</h2>${v.warnings?.length ? `<p role="status">${escape(v.warnings.join(" "))}</p>` : ""}<div class="status">${v.players.map((p) => `${escape(p.nickname)}: ${p.score} pt · ${(p.elapsedMs / 1000).toFixed(1)} s ${p.left ? "(uscito)" : p.answered ? "✓" : ""}`).join(" &nbsp; / &nbsp; ")}</div>${v.phase === "lobby" ? `<p>Condividi questo codice con un amico:</p><div class="room-code">${escape(v.code)}</div><p>Apri due schede o browser e inserisci lo stesso codice. Stanza privata per 2 persone.</p>${v.players.length === 2 && v.players[0].id === v.you ? '<button id="pvp-start" class="primary">Inizia la sfida ↗</button>' : "<p>In attesa del secondo giocatore e dell’avvio dell’host…</p>"}` : ""}${v.question ? `<img class="play-image" src="${escape(blobUrl)}" alt="${escape(v.question.alt)}" role="button" tabindex="0" aria-label="Ingrandisci l’immagine"><div class="choices"><button data-pvp-choice="REAL" ${me.answered ? "disabled" : ""}>Reale · R</button><button data-pvp-choice="AI" ${me.answered ? "disabled" : ""}>Generata con IA · I</button></div>${me.answered ? '<p role="status">Risposta ricevuta. Attendiamo l’altro giocatore o la scadenza.</p>' : ""}` : ""}${v.reveal ? `<div class="feedback">${feedback(v.reveal)}${v.phase === "reveal" ? `<button id="pvp-next" class="primary" ${me.ready ? "disabled" : ""}>${me.ready ? "In attesa dell’amico…" : "Prossimo round ↗"}</button>` : ""}</div>` : ""}${v.phase === "finished" ? `<h2>Fonti e crediti</h2>${v.history.map((r) => `<div class="feedback"><p>${escape(r.title)}</p><p>${escape(r.explanation)}</p><p>${escape(r.author)} · ${escape(r.license)}</p></div>`).join("")}<a class="button" href="/pvp">Nuova sfida ↗</a>` : ""}${v.phase === "abandoned" ? '<p>Un giocatore ha abbandonato oppure la stanza è scaduta. Nessun risultato viene aggiunto a classifiche pubbliche.</p><a class="button" href="/pvp">Crea una nuova sfida ↗</a>' : ""}<div id="pvp-error" class="error" role="alert" hidden></div>${!["finished", "abandoned"].includes(v.phase) ? '<button id="pvp-leave" class="secondary">Abbandona stanza</button>' : ""}<p class="status" id="connection-status">${socket?.readyState === WebSocket.OPEN ? "Connessione in tempo reale" : "Sincronizzazione HTTP · riconnessione in corso"}</p></section>`;
    const error = document.querySelector<HTMLElement>("#pvp-error")!;
    error.hidden = false;
    document
      .querySelector("#pvp-start")
      ?.addEventListener("click", () => void action("start"));
    document
      .querySelector("#pvp-next")
      ?.addEventListener("click", () => void action("next"));
    document
      .querySelector("#pvp-leave")
      ?.addEventListener("click", () => void action("leave"));
    document.querySelectorAll<HTMLButtonElement>("[data-pvp-choice]").forEach(
      (b) =>
        (b.onclick = () => {
          document
            .querySelectorAll<HTMLButtonElement>("[data-pvp-choice]")
            .forEach((btn) => (btn.disabled = true));
          void action("answer", {
            round: v.round,
            choice: b.dataset.pvpChoice,
          });
        }),
    );
    if (v.question) {
      zoom();
      document
        .querySelector(".play-image")!
        .addEventListener("keydown", (e) => {
          if ((e as KeyboardEvent).key === "Enter")
            (e.target as HTMLElement).click();
        });
      const nextKey = v.code + ":" + v.round;
      if (imageKey !== nextKey) {
        imageKey = nextKey;
        try {
          const r = await fetch(v.question.image, { headers });
          if (!r.ok) throw Error("Immagine non disponibile");
          const url = URL.createObjectURL(await r.blob());
          if (!active || imageKey !== nextKey) {
            URL.revokeObjectURL(url);
            return;
          }
          if (blobUrl) URL.revokeObjectURL(blobUrl);
          blobUrl = url;
          const img = document.querySelector<HTMLImageElement>(".play-image");
          if (img) img.src = url;
        } catch (e) {
          error.textContent = String(e);
          imageKey = "";
        }
      }
    }
    if (version !== drawVersion) return;
    if (v.phase === "playing") {
      const offset = v.serverNow - Date.now();
      const tick = () => {
        const n = Math.max(
          0,
          Math.ceil((v.deadline - Date.now() - offset) / 1000),
        );
        const el = document.querySelector("#pvp-clock");
        if (el) el.textContent = n + " s";
        if (n === 0) {
          if (clock) clearInterval(clock);
          document
            .querySelectorAll<HTMLButtonElement>("[data-pvp-choice]")
            .forEach((b) => (b.disabled = true));
          void load();
        }
      };
      clock = setInterval(tick, 250);
      tick();
    }
    if (["finished", "abandoned"].includes(v.phase)) {
      terminal = true;
      sessionStorage.removeItem("ros_room");
      if (poll) clearInterval(poll);
      if (retry) clearTimeout(retry);
      socket?.close();
    }
  };
  const openSocket = () => {
    if (!active || terminal) return;
    socket = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/rooms/${c.code}/ws`,
      ["ros", c.token],
    );
    socket.onopen = () => {
      if (poll) {
        clearInterval(poll);
        poll = undefined;
      }
      const el = document.querySelector("#connection-status");
      if (el) el.textContent = "Connessione in tempo reale";
    };
    socket.onmessage = (e) => {
      try {
        void draw(JSON.parse(e.data));
      } catch {
        /* A subsequent state request repairs interrupted updates. */
      }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      if (!active || terminal) return;
      if (!poll) poll = setInterval(() => void load(), 2500);
      retry = setTimeout(openSocket, 4000);
    };
  };
  await load();
  if (active) openSocket();
}
