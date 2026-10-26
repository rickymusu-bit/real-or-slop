import { api, content, escape } from "./main";
import { safeUrl } from "./admin";
export interface Reveal {
  answer: string;
  correct: boolean;
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
  mode: string;
  demo: boolean;
  serverNow: number;
  expiresAt: number | null;
  done: boolean;
  total: number;
  answered: number;
  score: number;
  elapsedMs: number;
  question: Question | null;
  credits: Reveal[];
}
export let stopPlay = () => {};
export function zoom() {
  document.querySelector(".play-image")?.addEventListener("click", (event) => {
    const img = event.target as HTMLImageElement;
    const d = document.createElement("dialog");
    d.setAttribute("aria-label", "Immagine ingrandita");
    d.innerHTML = `<button autofocus>Chiudi ×</button><br><img src="${escape(img.src)}" alt="${escape(img.alt)}">`;
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
  `<h2>${r.correct ? "✓ Risposta corretta" : "Un dettaglio ti è sfuggito"}</h2><p><strong>${r.answer === "REAL" ? "REAL · Reale" : "SLOP · Generata con IA"}</strong> · ${escape(r.title)}</p><p>${escape(r.explanation)}</p><p>${escape(r.author)} · ${r.licenseUrl ? `<a href="${safeUrl(r.licenseUrl)}" target="_blank" rel="noopener noreferrer">${escape(r.license)}</a>` : escape(r.license)} ${r.source ? `· <a href="${safeUrl(r.source)}" target="_blank" rel="noopener noreferrer">Fonte</a>` : ""}</p>`;
export async function setupGame(mode: string) {
  stopPlay();
  const saved = sessionStorage.getItem("ros_" + mode);
  content().innerHTML = `<section class="page narrow"><div class="eyebrow">DEMO SINTETICA · RISPOSTE SIMULATE</div><h1>${mode === "training" ? "Allena lo sguardo." : "Sfida il tempo."}</h1><p class="lead">Scegli cosa osservare. Ogni risposta vale 100 punti; a parità conta il minor tempo totale di risposta.</p>${saved ? '<button id="resume">Riprendi la partita precedente</button>' : ""}<form id="settings"><fieldset class="category-fieldset"><legend>Categorie e sottocategorie (selezione multipla)</legend><div class="category-options" id="categories">Caricamento…</div></fieldset><div class="form-grid"><div><label for="difficulty">Difficoltà</label><select id="difficulty"><option value="all">Tutte le difficoltà</option><option value="facile">Facile</option><option value="medio">Media</option><option value="difficile">Difficile</option></select></div><div>${mode === "training" ? '<label for="count">Numero di domande</label><input type="number" id="count" min="1" max="50" value="10">' : '<label for="duration">Durata</label><select id="duration"><option value="60">60 secondi</option><option value="120">120 secondi</option><option value="180">180 secondi</option></select>'}</div></div><p>La demo usa illustrazioni geometriche con etichette simulate. Non misura la capacità di riconoscere immagini IA.</p><button class="primary" type="submit">Inizia la partita</button><div id="error" role="alert"></div></form></section>`;
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
              difficulty:
                document.querySelector<HTMLSelectElement>("#difficulty")!.value,
              count: Number(
                document.querySelector<HTMLInputElement>("#count")?.value || 10,
              ),
              duration: Number(
                document.querySelector<HTMLSelectElement>("#duration")?.value ||
                  60,
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
  let active = true;
  let busy = false;
  const key = (e: KeyboardEvent) => {
    if (
      !["INPUT", "SELECT", "TEXTAREA"].includes(
        (e.target as HTMLElement).tagName,
      )
    ) {
      if (e.key.toLowerCase() === "r")
        document
          .querySelector<HTMLButtonElement>("[data-choice=REAL]")
          ?.click();
      if (e.key.toLowerCase() === "i")
        document.querySelector<HTMLButtonElement>("[data-choice=AI]")?.click();
    }
  };
  stopPlay = () => {
    active = false;
    if (timer) clearInterval(timer);
    document.removeEventListener("keydown", key);
  };
  document.addEventListener("keydown", key);
  const load = async () => {
    try {
      const state = await api<State>("/sessions/" + sid);
      if (!active) return;
      if (timer) clearInterval(timer);
      busy = false;
      if (state.done) {
        sessionStorage.removeItem("ros_" + state.mode);
        content().innerHTML = `<section class="page narrow"><div class="eyebrow">PARTITA COMPLETATA · DEMO</div><h1>Il tuo sguardo,<br>in numeri.</h1><div class="score">${state.score}<small> punti</small></div><p>${state.answered} risposte su ${state.total} immagini · tempo di risposta ${(state.elapsedMs / 1000).toFixed(1)} s</p><a class="button primary" href="${state.mode === "training" ? "/allenamento" : "/tempo"}">Gioca ancora</a><h2>Storie e crediti</h2>${state.credits.map((r) => `<div class="feedback">${feedback(r)}</div>`).join("")}</section>`;
        stopPlay();
        return;
      }
      const q = state.question!;
      content().innerHTML = `<section class="play" aria-label="Domanda ${q.number} di ${state.total}"><div class="play-top"><span>${state.mode === "training" ? "ALLENAMENTO" : "A TEMPO"} · DEMO</span><div class="play-metrics"><span>Round <strong>${q.number}/${state.total}</strong></span><span><strong>${state.score}</strong> pt</span><strong id="clock" role="timer" aria-label="Tempo rimasto"></strong></div></div>${progress(state.answered, state.total)}${warning ? `<details class="play-warning"><summary>Nota sul catalogo</summary><p>${escape(warning)}</p></details>` : ""}<img class="play-image" src="${escape(q.image)}" alt="${escape(q.alt)}" tabindex="0" role="button" aria-label="Ingrandisci l’immagine"><p class="sr-only">R per REAL, I per SLOP (generata con IA).</p>${choices("data-choice")}<div id="feedback" aria-live="polite"></div><div id="play-error" role="alert"></div></section>`;
      zoom();
      document.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach(
        (btn) =>
          (btn.onclick = async () => {
            if (busy) return;
            busy = true;
            document
              .querySelectorAll<HTMLButtonElement>("[data-choice]")
              .forEach((b) => (b.disabled = true));
            try {
              const r = await api<Reveal>("/sessions/" + sid + "/answer", {
                method: "POST",
                body: JSON.stringify({
                  roundId: q.id,
                  choice: btn.dataset.choice,
                }),
              });
              if (!active) return;
              document.querySelector("#feedback")!.innerHTML =
                `<div class="feedback" tabindex="-1">${feedback(r)}<button id="next" class="primary">Continua</button></div>`;
              document.querySelector<HTMLElement>("#feedback .feedback")!.focus({ preventScroll: true });
              document
                .querySelector("#next")!
                .addEventListener("click", () => void load());
            } catch (e) {
              if (!active) return;
              document.querySelector("#play-error")!.innerHTML =
                `${escape(e)} <button id="retry">Riprendi connessione</button>`;
              document
                .querySelector("#retry")!
                .addEventListener("click", () => void load());
            }
          }),
      );
      if (state.expiresAt) {
        const offset = state.serverNow - Date.now();
        const tick = () => {
          const left = Math.max(
            0,
            Math.ceil((state.expiresAt! - Date.now() - offset) / 1000),
          );
          const clock = document.querySelector("#clock");
          if (clock) clock.textContent = left + " s";
          if (left === 0) {
            if (timer) clearInterval(timer);
            document
              .querySelectorAll<HTMLButtonElement>("[data-choice]")
              .forEach((b) => (b.disabled = true));
            void load();
          }
        };
        timer = setInterval(tick, 250);
        tick();
      }
    } catch (e) {
      if (active)
        content().innerHTML = `<section class="page narrow"><h1>Connessione interrotta.</h1><p>${escape(e)}</p><button id="reconnect">Riprova</button></section>`;
      document
        .querySelector("#reconnect")
        ?.addEventListener("click", () => void load());
    }
  };
  await load();
}
