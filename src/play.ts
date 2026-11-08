import { api, content, escape, publicDemo } from "./main";
import { safeUrl } from "./admin";
import { ImagePreloader } from "./preload";
import { serverCountdown } from "./clock";
import { protectGameMedia } from "./media-privacy";
export interface Reveal {
  serverNow?: number;
  expiresAt?: number | null;
  answer: string;
  correct: boolean;
  timedOut?: boolean;
  explanation: string;
  title: string;
  author: string;
  source: string | null;
  license: string;
  licenseUrl: string | null;
  demo: boolean;
}
interface Question {
  id: string;
  number: number;
  image: string;
  alt: string;
}
interface State {
  id: string;
  protocolVersion: number;
  phase: "preparing" | "active" | "completed" | "invalidated";
  invalidReason: string | null;
  mode: string;
  demo: boolean;
  serverNow: number;
  expiresAt: number | null;
  done: boolean;
  total: number;
  answered: number;
  score: number;
  elapsedMs: number;
  timingMode: "legacy" | "unlimited" | "per-image";
  roundSeconds: number | null;
  timedOut: number;
  question: Question | null;
  credits: Reveal[];
}
export let stopPlay = () => {};
export function zoom() {
  document.querySelector(".play-image")?.addEventListener("click", (event) => {
    const img = event.target as HTMLImageElement;
    const d = document.createElement("dialog");
    d.setAttribute("aria-label", "Immagine ingrandita");
    d.dataset.gameZoom = "";
    d.innerHTML = `<button autofocus>Chiudi ×</button><br><img data-game-media draggable="false" src="${escape(img.src)}" alt="${escape(img.alt)}">`;
    document.body.append(d);
    d.querySelector("button")!.onclick = () => d.close();
    d.addEventListener("close", () => { d.remove(); img.focus(); });
    d.showModal();
  });
  document.querySelector(".play-image")?.addEventListener("keydown", (event) => {
    const key = (event as KeyboardEvent).key;
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      (event.target as HTMLElement).click();
    }
  });
}
export const choices = (attribute: "data-choice" | "data-pvp-choice", disabled = false) =>
  `<div class="choices"><button ${attribute}="REAL" class="choice-real" aria-label="REAL, reale. Tasto R" ${disabled ? "disabled" : ""}><span>REAL</span><kbd aria-hidden="true">R</kbd></button><button ${attribute}="AI" class="choice-slop" aria-label="SLOP, generata con IA. Tasto I" ${disabled ? "disabled" : ""}><span>SLOP</span><kbd aria-hidden="true">I</kbd></button></div>`;
export const progress = (completed: number, total: number) =>
  `<progress class="round-progress" max="${total}" value="${completed}" aria-label="Immagini completate">${completed} / ${total}</progress>`;
export const feedback = (r: Reveal) =>
  `<h2>${r.timedOut ? "Tempo scaduto" : r.correct ? "✓ Risposta corretta" : "Un dettaglio ti è sfuggito"}</h2><p><strong>${r.answer === "REAL" ? "REAL · Reale" : "SLOP · Generata con IA"}</strong> · ${escape(r.title)}</p><p>${escape(r.explanation)}</p><p>${escape(r.author)} · ${r.licenseUrl ? `<a href="${safeUrl(r.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escape(r.license)}</a>` : escape(r.license)} ${r.source ? `· <a href="${safeUrl(r.source)}" target="_blank" rel="noopener noreferrer">Fonte</a>` : ""}</p>`;
export async function setupGame(mode: string) {
  stopPlay();
  const saved = sessionStorage.getItem("ros_" + mode);
  content().innerHTML = `<section class="page narrow"><div class="eyebrow">${publicDemo ? "DEMO SINTETICA · RISPOSTE SIMULATE" : "CATALOGO VERIFICATO"}</div><h1>${mode === "training" ? "Allena lo sguardo." : "Sfida il tempo."}</h1><p class="lead">Scegli cosa osservare. Ogni risposta corretta vale 100 punti. ${mode === "training" ? "Il tempo è misurato per il riepilogo e non cambia il punteggio." : "Ogni immagine ha il proprio countdown. Alla scadenza si passa alla successiva, senza punti per quella scaduta."}</p>${saved ? '<button id="resume">Riprendi la partita precedente</button>' : ""}<form id="settings"><fieldset class="category-fieldset"><legend>Categorie e sottocategorie (selezione multipla)</legend><div class="category-options" id="categories">Caricamento…</div></fieldset><div class="form-grid"><div><label for="count">Numero di immagini</label><input type="number" id="count" min="1" max="50" value="10"></div><div>${mode === "timed" ? '<label for="round-seconds">Tempo per immagine</label><select id="round-seconds"><option value="10">10 secondi</option><option value="20" selected>20 secondi</option><option value="30">30 secondi</option></select>' : ""}</div></div>${mode === "timed" ? "<p>Prepariamo una sola immagine alla volta. Il countdown continua anche cambiando scheda o applicazione.</p>" : ""}<p>${publicDemo ? "La demo usa illustrazioni geometriche con etichette simulate. Non misura la capacità di riconoscere immagini IA." : "Giocherai con le immagini REAL e SLOP pubblicate. Le immagini in revisione restano escluse."}</p><p><a href="/informazioni#origine">Regole delle immagini e limiti della verifica visiva</a></p><button class="primary" type="submit">Inizia la partita</button><div id="error" role="alert"></div></form></section>`;
  document
    .querySelector("#resume")
    ?.addEventListener("click", () => void play(saved!));
  const formElement = document.querySelector<HTMLFormElement>("#settings")!;
  try {
    const rows =
      await api<{ id: string; name: string; parent_id: string | null }[]>(
        "/categories",
      );
    if (!formElement.isConnected) return;
    document.querySelector("#categories")!.innerHTML = rows
      .map(
        (c) =>
          `<label class="chip"><input type="checkbox" value="${escape(c.id)}">${c.parent_id ? "↳ " : ""}${escape(c.name)}</label>`,
      )
      .join("");
  } catch (e) {
    if (!formElement.isConnected) return;
    document.querySelector("#categories")!.textContent = String(e);
  }
  document
    .querySelector("#settings")!
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const btn = document.querySelector<HTMLButtonElement>("[type=submit]")!;
      btn.disabled = true;
      try {
        const result = await api<{ id: string; warnings: string[] }>(
          "/sessions",
          {
            method: "POST",
            body: JSON.stringify({
              mode,
              count: Number(
                document.querySelector<HTMLInputElement>("#count")?.value || 10,
              ),
              roundSeconds: Number(
                document.querySelector<HTMLSelectElement>("#round-seconds")?.value ||
                  20,
              ),
              categories: Array.from(
                document.querySelectorAll<HTMLInputElement>(
                  "#categories input:checked",
                ),
              ).map((i) => i.value),
            }),
          },
        );
        if (!formElement.isConnected) return;
        sessionStorage.setItem("ros_" + mode, result.id);
        await play(result.id, result.warnings.join(" "));
      } catch (e) {
        if (!formElement.isConnected) return;
        document.querySelector("#error")!.textContent = String(e);
        btn.disabled = false;
      }
    });
}
async function play(sid: string, warning = "") {
  stopPlay();
  let timer: ReturnType<typeof setInterval> | undefined;
  let active = true, busy = false, refreshing = false, version = 0;
  let preloader = new ImagePreloader(), last: State | null = null;
  let seconds: (() => number) | null = null, clockExpired = false;
  const mediaPrivacy = protectGameMedia(document, window, () => !refreshing && (!seconds || seconds() > 0));
  const current = (value: number) => active && value === version;
  const resyncOnReturn = () => {
    if (active && !busy && seconds && document.visibilityState === "visible") void load();
  };
  const key = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || ["INPUT", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)) return;
    const choice = event.key.toLowerCase() === "r" ? "REAL" : event.key.toLowerCase() === "i" ? "AI" : null;
    if (choice) document.querySelector<HTMLButtonElement>(`[data-choice=${choice}]`)?.click();
  };
  stopPlay = () => {
    active = false; version++; preloader.dispose(); mediaPrivacy.dispose();
    document.querySelector<HTMLDialogElement>("[data-game-zoom]")?.close();
    if (timer) clearInterval(timer);
    document.removeEventListener("keydown", key);
    document.removeEventListener("visibilitychange", resyncOnReturn);
    window.removeEventListener("focus", resyncOnReturn);
    window.removeEventListener("pageshow", resyncOnReturn);
  };
  document.addEventListener("keydown", key);
  const syncClock = (state: { expiresAt: number | null; serverNow: number }) => {
    if (!state.expiresAt) { if (timer) clearInterval(timer); timer = undefined; seconds = null; const clock = document.querySelector("#clock"); if (clock) clock.textContent = ""; return; }
    seconds = serverCountdown(state.expiresAt, state.serverNow); clockExpired = false;
    const tick = () => {
      const left = seconds?.() ?? 0;
      const clock = document.querySelector("#clock"); if (clock) clock.textContent = left + " s";
      if (!left && !clockExpired) {
        clockExpired = true;
        document.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach(button => { button.disabled = true; });
        document.querySelector<HTMLDialogElement>("[data-game-zoom]")?.close();
        void load();
      }
    };
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 200); tick();
  };
  const loading = (title: string, copy: string) => {
    content().innerHTML = `<section class="page narrow preparation"><div class="eyebrow">${last?.demo ?? publicDemo ? "DEMO SINTETICA" : "CATALOGO VERIFICATO"}</div><h1>${title}</h1><p>${copy}</p><strong id="clock" role="timer" aria-label="Tempo rimasto"></strong><p id="preload-progress" role="status" aria-live="polite"></p></section>`;
    if (seconds) document.querySelector("#clock")!.textContent = seconds() + " s";
  };
  const failure = (error: unknown, preparing = false) => {
    if (!active) return;
    busy = true;
    void api(`/sessions/${sid}/report`, { method: "POST", body: JSON.stringify({ reason: "media_unavailable" }) }).catch(() => { /* A network failure may also prevent reporting. */ });
    loading("Immagine non disponibile.", preparing ? "Il tempo di gioco non è partito. Puoi riprovare la preparazione." : last?.mode === "timed" ? "Il timer del server continua. Puoi riprovare oppure annullare la partita senza un risultato valido." : "Nessuna risposta è stata registrata per questo caricamento. Puoi riprovare o annullare l’allenamento.");
    content().insertAdjacentHTML("beforeend", `<div class="narrow load-actions"><p role="alert">${escape(error)}</p><button id="retry-media" class="primary">Riprova</button> <button id="invalidate-session">Annulla partita</button></div>`);
    document.querySelector("#retry-media")!.addEventListener("click", () => {
      if (preparing) { preloader.dispose(); preloader = new ImagePreloader(); }
      void load();
    });
    document.querySelector("#invalidate-session")!.addEventListener("click", async () => {
      try { await api(`/sessions/${sid}/invalidate`, { method: "POST", body: JSON.stringify({ reason: "media_unavailable" }) }); await load(); }
      catch (error) { failure(error, preparing); }
    });
  };
  const finish = (state: State) => {
    sessionStorage.removeItem("ros_" + state.mode);
    if (state.phase === "invalidated") {
      content().innerHTML = `<section class="page narrow"><div class="eyebrow">PARTITA ANNULLATA${state.demo ? " · DEMO" : ""}</div><h1>Ripartiamo da un’immagine visibile.</h1><p>${state.invalidReason === "preparation_expired" ? "La finestra di preparazione è scaduta." : "La partita è stata annullata per un problema di caricamento."} Nessun risultato valido o punto di questa partita entra nelle statistiche.</p><a class="button primary" href="${state.mode === "training" ? "/allenamento" : "/tempo"}">Nuova partita</a></section>`;
    } else {
      content().innerHTML = `<section class="page narrow"><div class="eyebrow">PARTITA COMPLETATA${state.demo ? " · DEMO" : ""}</div><h1>Il tuo sguardo,<br>in numeri.</h1><div class="score">${state.score}<small> punti</small></div><p>${state.answered - (state.timedOut || 0)} risposte su ${state.total} immagini${state.timedOut ? ` · ${state.timedOut} scadute` : ""} · tempo di osservazione ${(state.elapsedMs / 1000).toFixed(1)} s${state.mode === "training" ? " (solo informativo)" : ""}</p><a class="button primary" href="${state.mode === "training" ? "/allenamento" : "/tempo"}">Gioca ancora</a><h2>Storie e crediti</h2>${state.credits.map(r => `<div class="feedback">${feedback(r)}</div>`).join("")}</section>`;
    }
    stopPlay();
  };
  const showQuestion = async (state: State, manifest: Question[], value: number, started = false) => {
    const q = state.question!;
    loading("Osserva tra un istante.", state.mode === "timed" ? "Prepariamo l’immagine. Il timer del server resta attivo." : "Controlliamo il file prima di abilitare le risposte.");
    preloader.retain(manifest.slice(0, 3).map(q => q.image), state.mode === "timed");
    const asset = await preloader.activate(q.image);
    if (!current(value)) return;
    if (state.protocolVersion === 2 && !started) {
      state = await api<State>(`/sessions/${sid}/ready`, { method: "POST", body: JSON.stringify({ roundId: q.id }) });
      if (!current(value)) return;
      if (state.done || state.question?.id !== q.id) { await load(); return; }
      syncClock(state);
    }
    last = state; busy = false; refreshing = false;
    content().innerHTML = `<section class="play" aria-label="Domanda ${q.number} di ${state.total}"><div class="play-top"><span>${state.mode === "training" ? "ALLENAMENTO" : "A TEMPO"}${state.demo ? " · DEMO" : ""}</span><div class="play-metrics"><span>Round <strong>${q.number}/${state.total}</strong></span><span><strong>${state.score}</strong> pt</span><strong id="clock" role="timer" aria-label="Tempo rimasto"></strong></div></div>${progress(state.answered, state.total)}${warning ? `<details class="play-warning"><summary>Nota sul catalogo</summary><p>${escape(warning)}</p></details>` : ""}<div class="game-media-surface"><img data-game-media draggable="false" class="play-image" src="${escape(asset.url)}" alt="${escape(q.alt)}" loading="eager" fetchpriority="high" decoding="async" tabindex="0" role="button" aria-label="Ingrandisci l’immagine"><div class="media-privacy-cover"><p>Immagine oscurata dopo aver lasciato la pagina. Il tempo continua.</p><button type="button" data-reveal-media>Mostra immagine</button></div></div><p class="sr-only">R per REAL, I per SLOP (generata con IA).</p>${choices("data-choice")}<div id="feedback" aria-live="polite"></div><div id="play-error" role="alert"></div></section>`;
    if (seconds) document.querySelector("#clock")!.textContent = seconds() + " s";
    mediaPrivacy.refresh();
    zoom();
    for (const future of manifest.slice(1, 3)) void preloader.prefetch(future.image).catch(() => { /* Retry if this future image is actually needed. */ });
    document.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach(button => {
      button.onclick = async () => {
        if (busy) return;
        busy = true;
        document.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach(button => { button.disabled = true; });
        try {
          const r = await api<Reveal>(`/sessions/${sid}/answer`, { method: "POST", body: JSON.stringify({ roundId: q.id, choice: button.dataset.choice }) });
          if (!current(value)) return;
          if (r.serverNow !== undefined) syncClock({ expiresAt: r.expiresAt ?? null, serverNow: r.serverNow });
          document.querySelector("#feedback")!.innerHTML = `<div class="feedback" tabindex="-1">${feedback(r)}<button id="next" class="primary">Continua</button></div>`;
          document.querySelector<HTMLElement>("#feedback .feedback")!.focus({ preventScroll: true });
          document.querySelector("#next")!.addEventListener("click", () => void load());
        } catch (error) {
          if (!current(value)) return;
          if (seconds && seconds() === 0) { await load(); return; }
          document.querySelector("#play-error")!.innerHTML = `${escape(error)} <button id="retry">Riprendi connessione</button>`;
          document.querySelector("#retry")!.addEventListener("click", () => void load());
        }
      };
    });
  };
  const load = async () => {
    const value = ++version; busy = true; refreshing = true;
    try {
      const state = await api<State>("/sessions/" + sid);
      if (!current(value)) return;
      const previousTimeouts = last?.timedOut || 0;
      last = state;
      if (state.done) { finish(state); return; }
      syncClock(state);
      if (!current(value)) return;
      if (state.timedOut > previousTimeouts) {
        loading("Tempo scaduto.", "Non è stata registrata una risposta per questa immagine. Il prossimo countdown partirà con la prossima immagine.");
        content().insertAdjacentHTML("beforeend", '<div class="narrow"><button id="next-after-timeout" class="primary">Prossima immagine</button></div>');
        document.querySelector("#next-after-timeout")!.addEventListener("click", () => void load());
        return;
      }
      const manifest = await api<{ images: Question[] }>(`/sessions/${sid}/manifest`);
      if (!current(value)) return;
      if (state.phase === "preparing") {
        loading("Prepariamo la tua sfida.", "Il timer non è ancora partito. Scarichiamo e controlliamo l’immagine prima di avviare il suo countdown. Puoi lasciare questa pagina per interrompere il caricamento.");
        const urls = manifest.images.map(q => q.image);
        document.querySelector("#preload-progress")!.textContent = `0/${urls.length} immagini verificate`;
        preloader.retain(urls.slice(0, 3));
        await preloader.prepareAll(urls, info => {
          if (current(value)) document.querySelector("#preload-progress")!.textContent = `${info.verified}/${info.total} immagini verificate · ${(info.bytes / 1024 / 1024).toFixed(2)} MiB scaricati`;
        });
        if (!current(value)) return;
        if (!urls.length) throw Error("Nessuna immagine assegnata");
        await preloader.activate(urls[0]);
        if (!current(value)) return;
        document.querySelector("#preload-progress")!.insertAdjacentHTML("afterend", '<button id="start-prepared" class="primary">Inizia il countdown</button>');
        document.querySelector<HTMLButtonElement>("#start-prepared")!.onclick = async event => {
          (event.currentTarget as HTMLButtonElement).disabled = true;
          try {
            const started = await api<State>(`/sessions/${sid}/start`, { method: "POST", body: JSON.stringify({ prepared: true, roundIds: manifest.images.map(q => q.id) }) });
            if (!current(value)) return;
            last = started; syncClock(started);
            await showQuestion(started, manifest.images, value, true);
          } catch (error) { if (current(value)) failure(error, true); }
        };
        return;
      }
      await showQuestion(state, manifest.images, value);
    } catch (error) { if (current(value)) failure(error, last?.phase === "preparing"); }
  };
  document.addEventListener("visibilitychange", resyncOnReturn);
  window.addEventListener("focus", resyncOnReturn);
  window.addEventListener("pageshow", resyncOnReturn);
  await load();
}
