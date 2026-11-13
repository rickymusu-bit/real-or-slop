/** The only game mode: levels (docs/gioco-a-livelli.v1.0.0.md). v2.2.0, 2026-11-13T10:00:00Z: game copies in the photo's format
 * (docs/copie-di-gioco.v4.0.0.md, section 5). The photo can be explored (src/photo-viewer.v1.0.0.ts): on a vertical screen it starts in
 * a 4:5 frame on the round's initial view, on a horizontal one whole; drag to move, two fingers or the wheel to zoom, «Vista iniziale»
 * to go back. No swipe any more: the REAL and SLOP buttons are always visible, also on a phone; R and S on a keyboard.
 * v2.0.0, 2026-11-12T09:00:00Z.
 * Owner decisions of 2026-11-11 and 2026-11-12. The player picks a level; each photo, in a fixed 4:5 frame with its caption, has
 * its own countdown, which starts when the photo is on screen and stops at the answer. The server says at once whether the
 * answer was right (✓ or ✗ for a moment), then the next photo comes; when the time runs out the game moves on by itself.
 * On a phone the answer is a swipe: right REAL, left SLOP (the buttons stay for keyboards and screen readers, out of sight);
 * on a desktop the buttons under the photo and the keys R and S. Leaving the page hides photo and caption; the time goes on.
 * At the end: score, the leaderboard form (nickname, game code to screenshot), and every photo with the answer, the source of the
 * REAL and the prompt of the SLOP. Previous version: src/play.ts (training and timed modes, kept as history).
 * v2.1.0, 2026-11-12T19:00:00Z (docs/privacy-note-legali.v1.0.0.md): the leaderboard form warns not to use one's real name and asks to
 * declare at least 14 years or a parent's permission; the credits of a REAL say how it was changed (licences CC BY, CC BY-SA). */
import "./play.v2.2.0.css";
import { photoViewer, type ViewFractions, type Viewer } from "./photo-viewer.v1.0.0";
import { MIN_AGE } from "../shared/legal.v1.0.0";
import { api, content, escape } from "./main";
import { safeUrl } from "../shared/html";
import { ImagePreloader } from "./preload";
import { protectGameMedia } from "./media-privacy";
import { markGameMedia } from "./media-mark.v1.0.0";
import type { Level, Score } from "../shared/levels.v1.0.0";

interface LevelInfo { id: Level; label: string; photos: number; seconds: number; available: boolean }
interface Question { id: string; number: number; image: string; alt: string; caption: string; view?: ViewFractions }
interface Credit { number: number; image: string; caption: string; answer: "REAL" | "AI"; choice: "REAL" | "AI" | null; correct: boolean; timedOut: boolean;
  title?: string; author?: string; source?: string | null; license?: string; licenseUrl?: string | null; changes?: string; prompt?: string }
interface State {
  id: string; level: Level; seconds: number; phase: "preparing" | "active" | "completed" | "invalidated"; invalidReason: string | null;
  done: boolean; serverNow: number; expiresAt: number | null; total: number; answered: number; right: number; timedOut: number;
  question: Question | null; result: Score | null; entered: boolean; credits: Credit[];
}
const SESSION_KEY = "ros_levels", FEEDBACK_MS = 900;
let viewer: Viewer | null = null;
const LABEL: Record<Level, string> = { facile: "Facile", medio: "Medio", difficile: "Difficile", esperto: "Esperto" };
const points = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export let stopPlay = () => {};

/** /gioca: the level picker. */
export async function setupGame() {
  stopPlay();
  const saved = sessionStorage.getItem(SESSION_KEY);
  content().innerHTML = `<section class="page narrow levels-page"><div class="eyebrow">UNA FOTO ALLA VOLTA</div><h1>Scegli il livello.</h1>
    <p class="lead">Ogni foto ha il suo tempo. Decidi se è REAL, una fotografia vera, o SLOP, generata con l'intelligenza artificiale.</p>
    ${saved ? '<p><button type="button" id="resume">Riprendi la partita in corso</button></p>' : ""}
    <div id="levels" class="levels" role="list"><p class="hint">Caricamento…</p></div>
    <details class="rules"><summary>Regole</summary><ul>
      <li>Il tempo di una foto parte quando la foto compare e si ferma quando rispondi. Se scade, la foto conta come non riconosciuta e si passa alla successiva.</li>
      <li>Rispondi con i pulsanti REAL e SLOP, o con i tasti R e S sul computer.</li>
      <li>Puoi esplorare la foto: trascinala per spostarti, ingrandiscila con due dita o con la rotella. «Vista iniziale» la riporta com'era.</li>
      <li>Se lasci la pagina, foto e didascalia si oscurano ma il tempo continua.</li>
      <li>Il punteggio è foto × (2 × accuratezza bilanciata − 1): chi risponde a caso, o sempre allo stesso modo, fa zero. Vale solo una partita giocata fino all'ultima foto.</li>
    </ul></details><div id="error" role="alert"></div></section>`;
  document.querySelector("#resume")?.addEventListener("click", () => void play(saved!));
  try {
    const { levels } = await api<{ levels: LevelInfo[] }>("/levels");
    document.querySelector("#levels")!.innerHTML = levels.map(l => `<button type="button" class="level-card" role="listitem" data-level="${l.id}" ${l.available ? "" : "disabled"}>
      <strong>${escape(l.label)}</strong><span>${l.photos} foto · ${l.seconds} secondi per foto</span>
      <small>${l.available ? `Punteggio massimo ${l.photos}` : "Non ancora disponibile: servono più foto pubblicate"}</small></button>`).join("");
  } catch (error) { document.querySelector("#error")!.textContent = String(error instanceof Error ? error.message : error); }
  document.querySelector("#levels")!.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-level]");
    if (!button || button.disabled) return;
    document.querySelectorAll<HTMLButtonElement>("[data-level]").forEach(b => { b.disabled = true; });
    try {
      const { id } = await api<{ id: string }>("/sessions", { method: "POST", body: JSON.stringify({ level: button.dataset.level }) });
      sessionStorage.setItem(SESSION_KEY, id);
      await play(id);
    } catch (error) {
      document.querySelector("#error")!.textContent = String(error instanceof Error ? error.message : error);
      document.querySelectorAll<HTMLButtonElement>("[data-level]").forEach(b => { b.disabled = false; });
    }
  });
}

async function play(sid: string) {
  stopPlay();
  let active = true, version = 0, answering = false, preloader = new ImagePreloader();
  let timer: ReturnType<typeof setInterval> | undefined, deadline = 0, offset = 0, total = 1;
  const mediaPrivacy = protectGameMedia(document, window, () => true);
  const current = (value: number) => active && value === version;
  const choose = (choice: "REAL" | "AI") => document.querySelector<HTMLButtonElement>(`[data-choice="${choice}"]`)?.click();
  const key = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || ["INPUT", "SELECT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)) return;
    const k = event.key.toLowerCase();
    if (k === "r") choose("REAL"); else if (k === "s") choose("AI");
  };
  stopPlay = () => {
    active = false; version++; preloader.dispose(); mediaPrivacy.dispose(); viewer?.dispose(); viewer = null;
    if (timer) clearInterval(timer);
    document.removeEventListener("keydown", key);
  };
  document.addEventListener("keydown", key);

  const message = (title: string, text: string, actions = "") => {
    content().innerHTML = `<section class="page narrow preparation"><div class="eyebrow">${escape(LABEL[last?.level || "facile"] || "")}</div><h1>${title}</h1><p>${text}</p>${actions}<div id="play-error" role="alert"></div></section>`;
  };
  let last: State | null = null;
  const stopClock = () => { if (timer) clearInterval(timer); timer = undefined; };
  /** Display clock only: the server alone accepts or refuses an answer. */
  const startClock = (state: State, onEnd: () => void) => {
    stopClock();
    if (!state.expiresAt) return;
    deadline = state.expiresAt; offset = state.serverNow - Date.now(); total = state.seconds * 1000;
    const tick = () => {
      const left = Math.max(0, deadline - (Date.now() + offset));
      const clock = document.querySelector<HTMLElement>("#clock"), bar = document.querySelector<HTMLElement>("#clock-bar");
      if (clock) clock.textContent = Math.ceil(left / 1000) + " s";
      if (bar) bar.style.transform = `scaleX(${Math.min(1, left / total)})`;
      if (!left) { stopClock(); onEnd(); }
    };
    timer = setInterval(tick, 100); tick();
  };

  const finish = (state: State) => {
    stopClock();
    sessionStorage.removeItem(SESSION_KEY);
    if (state.phase === "invalidated" || !state.result) {
      content().innerHTML = `<section class="page narrow"><div class="eyebrow">PARTITA NON CONCLUSA</div><h1>Nessun punteggio.</h1>
        <p>${state.invalidReason === "preparation_expired" ? "La preparazione è scaduta prima dell'inizio." : "La partita non è arrivata all'ultima foto."}</p>
        <a class="button primary" href="/gioca">Nuova partita</a></section>`;
      stopPlay(); return;
    }
    const r = state.result;
    content().innerHTML = `<section class="page results"><div class="eyebrow">PARTITA CONCLUSA · ${escape(LABEL[state.level])}</div>
      <h1>Il tuo sguardo,<br>in numeri.</h1><div class="score">${points(r.score)}<small> punti su ${r.photos}</small></div>
      <p>REAL riconosciute <strong>${r.real.right}/${r.real.total}</strong> · SLOP riconosciute <strong>${r.slop.right}/${r.slop.total}</strong>
        · accuratezza bilanciata <strong>${Math.round(r.balanced_accuracy * 100)}%</strong>${r.timed_out ? ` · ${r.timed_out} ${r.timed_out === 1 ? "foto scaduta" : "foto scadute"}` : ""}</p>
      <section class="enter" id="enter">${state.entered ? '<p>Questa partita è già in classifica.</p>' : `<h2>Entra in classifica</h2>
        <form id="enter-form" class="enter-form"><label>Soprannome<input name="nickname" minlength="3" maxlength="20" required autocomplete="nickname" autocapitalize="off"></label>
        <label class="enter-age"><input type="checkbox" name="age_ok" required> Ho almeno ${MIN_AGE} anni, oppure un genitore mi ha dato il permesso</label>
        <button class="primary">Entra in classifica</button></form><p class="hint">Il soprannome è pubblico: non usare il tuo nome e cognome. Riceverai un codice partita: fotografa lo schermo per conservarlo, è l'unica prova che la partita è tua e serve anche per chiedere di cancellarla (<a href="/privacy">privacy</a>).</p>`}
        <div id="enter-error" role="alert"></div></section>
      <div class="actions"><a class="button primary" href="/gioca">Gioca ancora</a> <a class="button" href="/">Classifica</a></div>
      <h2>Le foto della partita</h2><ol class="credits">${state.credits.map(c => `<li class="credit ${c.correct ? "is-right" : "is-wrong"}">
        <div class="game-media-surface credit-image"><img data-game-media draggable="false" src="${escape(c.image)}" alt="Foto ${c.number}" loading="lazy"></div>
        <div class="credit-text"><p class="credit-head"><strong>${c.answer === "REAL" ? "REAL" : "SLOP"}</strong> · ${c.timedOut ? "tempo scaduto" : c.correct ? "✓ risposta giusta" : "✗ risposta sbagliata"}</p>
        ${c.caption ? `<p class="play-caption">${escape(c.caption)}</p>` : ""}
        ${c.answer === "REAL" ? `<p>${escape(c.title || "")}${c.author ? " · " + escape(c.author) : ""}${c.license ? " · " + (c.licenseUrl ? `<a href="${safeUrl(c.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escape(c.license)}</a>` : escape(c.license)) : ""}${c.source ? ` · <a href="${safeUrl(c.source)}" target="_blank" rel="noopener noreferrer">Fonte</a>` : ""}</p>${c.changes ? `<p class="credit-changes">${escape(c.changes)}; la versione modificata ha la stessa licenza dell'originale.</p>` : ""}`
          : `<p class="credit-prompt"><span>Prompt</span> <q lang="en">${escape(c.prompt || "")}</q></p>`}</div></li>`).join("")}</ol></section>`;
    markGameMedia(content());
    document.querySelector("#enter-form")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.target as HTMLFormElement, nickname = String(new FormData(form).get("nickname") || ""), ageOk = new FormData(form).get("age_ok") === "on";
      form.querySelector("button")!.disabled = true;
      try {
        const entry = await api<{ code: string; score: number; nickname: string }>(`/sessions/${sid}/leaderboard`, { method: "POST", body: JSON.stringify({ nickname, age_ok: ageOk }) });
        document.querySelector("#enter")!.innerHTML = `<h2>Sei in classifica, ${escape(entry.nickname)}.</h2><p>Il tuo codice partita:</p>
          <p class="game-code" data-game-code>${escape(entry.code)}</p><p class="hint">Fotografa lo schermo adesso: il codice non verrà più mostrato e serve a dimostrare che la partita è tua.</p>`;
      } catch (error) {
        document.querySelector("#enter-error")!.textContent = String(error instanceof Error ? error.message : error);
        form.querySelector("button")!.disabled = false;
      }
    });
    stopPlay();
  };

  /** A moment of feedback over the card, then the next photo. */
  const outcome = (kind: "right" | "wrong" | "late", answer?: "REAL" | "AI") => {
    const card = document.querySelector<HTMLElement>(".card");
    card?.classList.add("is-" + kind);
    const text = kind === "late" ? "Tempo scaduto" : (kind === "right" ? "✓ Giusto" : "✗ Sbagliato") + (answer ? `: era ${answer === "REAL" ? "REAL" : "SLOP"}` : "");
    document.querySelector("#verdict")!.innerHTML = `<span class="verdict verdict-${kind}">${text}</span>`;
    if (kind !== "late" && "vibrate" in navigator) navigator.vibrate(kind === "right" ? 30 : [40, 60, 40]);
    window.setTimeout(() => { if (active) void load(); }, FEEDBACK_MS);
  };

  const showQuestion = async (state: State, value: number, started = false) => {
    const q = state.question!;
    const asset = await preloader.activate(q.image);
    if (!current(value)) return;
    if (!started || !state.expiresAt) {
      state = await api<State>(`/sessions/${sid}/ready`, { method: "POST", body: JSON.stringify({ roundId: q.id }) });
      if (!current(value)) return;
      if (state.done || state.question?.id !== q.id) { await load(); return; }
    }
    last = state; answering = false;
    content().innerHTML = `<section class="play play-levels" aria-label="Foto ${q.number} di ${state.total}">
      <div class="play-top"><span>${escape(LABEL[state.level])}</span><div class="play-metrics"><span>Foto <strong>${q.number}/${state.total}</strong></span>
        <span>Giuste <strong>${state.right}</strong></span><strong id="clock" role="timer" aria-label="Tempo rimasto"></strong></div></div>
      <div class="clock-track" aria-hidden="true"><span id="clock-bar"></span></div>
      <div class="card" tabindex="-1">
        <div class="game-media-surface card-media"><div class="viewer-layer"><img data-game-media draggable="false" class="play-image" src="${escape(asset.url)}" alt="${escape(q.alt)}" decoding="async"></div>
          <div class="media-privacy-cover"><p>Foto oscurata perché hai lasciato la pagina. Il tempo continua.</p><button type="button" data-reveal-media>Mostra la foto</button></div></div>
        <p class="viewer-tools"><button type="button" data-viewer-reset disabled>Vista iniziale</button></p>
        ${q.caption ? `<p class="play-caption">${escape(q.caption)}</p>` : ""}<div id="verdict" aria-live="assertive"></div></div>
      <div class="choices"><button type="button" data-choice="AI" class="choice-slop" aria-label="SLOP, generata con IA. Tasto S"><span>SLOP</span><kbd aria-hidden="true">S</kbd></button>
        <button type="button" data-choice="REAL" class="choice-real" aria-label="REAL, fotografia vera. Tasto R"><span>REAL</span><kbd aria-hidden="true">R</kbd></button></div>
      <div id="play-error" role="alert"></div></section>`;
    viewer?.dispose();
    const resetButton = document.querySelector<HTMLButtonElement>("[data-viewer-reset]")!;
    viewer = photoViewer(document.querySelector<HTMLElement>(".card-media")!, document.querySelector<HTMLElement>(".viewer-layer")!,
      document.querySelector<HTMLImageElement>(".play-image")!, q.view || { x: 0, y: 0, width: 1, height: 1 }, changed => { resetButton.disabled = !changed; });
    resetButton.onclick = () => viewer?.reset();
    markGameMedia(content());
    mediaPrivacy.refresh();
    const send = async (choice: "REAL" | "AI") => {
      if (answering) return;
      answering = true; stopClock();
      document.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach(b => { b.disabled = true; });
      try {
        const r = await api<{ correct: boolean; answer: "REAL" | "AI" }>(`/sessions/${sid}/answer`, { method: "POST", body: JSON.stringify({ roundId: q.id, choice }) });
        if (current(value)) outcome(r.correct ? "right" : "wrong", r.answer);
      } catch (error) {
        if (!current(value)) return;
        if (/scaduto/.test(String(error))) { outcome("late"); return; }
        document.querySelector("#play-error")!.innerHTML = `${escape(error)} <button type="button" id="retry">Riprova</button>`;
        document.querySelector("#retry")!.addEventListener("click", () => { answering = false; void send(choice); });
      }
    };
    document.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach(b => { b.onclick = () => void send(b.dataset.choice as "REAL" | "AI"); });
    startClock(state, () => {
      if (answering || !current(value)) return;
      answering = true;
      document.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach(b => { b.disabled = true; });
      outcome("late");
    });
  };

  const load = async () => {
    const value = ++version;
    try {
      const state = await api<State>("/sessions/" + sid);
      if (!current(value)) return;
      last = state;
      if (state.done) { finish(state); return; }
      if (state.phase === "preparing") {
        message("Prepariamo la prima foto.", "Il tempo non è ancora partito.");
        const manifest = await api<{ images: Question[] }>(`/sessions/${sid}/manifest`);
        if (!current(value)) return;
        const first = manifest.images[0];
        if (!first) throw Error("Nessuna foto assegnata");
        await preloader.activate(first.image);
        if (!current(value)) return;
        message("Pronto?", `${state.total} foto, ${state.seconds} secondi per foto. Il tempo di ogni foto parte quando la vedi.`,
          '<button type="button" id="start" class="primary">Inizia</button>');
        document.querySelector<HTMLButtonElement>("#start")!.onclick = async event => {
          (event.currentTarget as HTMLButtonElement).disabled = true;
          try {
            const started = await api<State>(`/sessions/${sid}/start`, { method: "POST", body: JSON.stringify({ prepared: true, roundIds: [first.id] }) });
            if (current(value)) await showQuestion(started, value);
          } catch (error) { if (current(value)) failure(error); }
        };
        return;
      }
      if (!state.question) { await load(); return; }
      await showQuestion(state, value, !!state.expiresAt);
    } catch (error) { if (current(value)) failure(error); }
  };
  const failure = (error: unknown) => {
    message("Qualcosa non ha funzionato.", "Se la foto in corso aveva già il suo tempo, il tempo continua. Puoi riprovare.",
      '<button type="button" id="retry-load" class="primary">Riprova</button>');
    document.querySelector("#play-error")!.textContent = String(error instanceof Error ? error.message : error);
    document.querySelector("#retry-load")!.addEventListener("click", () => { preloader.dispose(); preloader = new ImagePreloader(); void load(); });
  };
  await load();
}
