/** Automatic generation controls, server progress and a separate catalogue balance notification. */
import "./slop-auto.css";
import { prepareItemCopy, type TreatableItem } from "./game-copy";
import { escape } from "../shared/html";

interface Proposal { n_real: number; n_slop: number; n_new: number; spread: number; spread_percent: number; missing: number; size: number }
interface AutoImage { id: string; status: string; index: number | null; copy: boolean; analysis: string }
interface Config { max_generation_attempts: number; editorial_tolerance: number; text_model: string; image_model: string; quality: string }
interface AutoBatch {
  pipeline_version: number; config: Config; processes: {slot: number; state: string; updated_at: string; attempts: unknown[]}[];
  runner: { id: string; status: string | null; updated_at: string | null; alive: boolean } | null;
  id: string; size: number; status: "running" | "review"; prompts_status: string; prompts_error: string; slots: number;
  attempted: number[]; snapshot: Proposal | null; images: AutoImage[]; undecided: number; updated_at: string;
}
export interface AutoState { config: Config; max_batch: number; available: number; paid_calls: boolean; batch: AutoBatch | null; balance: {real:number; slop:number; pending:number; missing:number} }
interface Hooks { loop: (batchId:string) => void | Promise<void>; review: (batchId: string) => void | Promise<void>; changed: () => Promise<void>; indicator: (imbalances: number) => void }

const LIBRARY = "/api/admin/library", SLOP = LIBRARY + "/slop/";
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

async function call<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Error(data.error || "Richiesta non riuscita");
  return data;
}

let observed: (() => void) | null = null;
/** Changes to the library made from this page (any non-GET request that succeeds), the batch's own calls excepted. */
function observeLibrary(changed: () => void) {
  if (observed) { observed = changed; return; }
  observed = changed;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (response.ok && method !== "GET" && /\/api\/admin\/library(\/|\?|$)/.test(url) && !/\/api\/admin\/library\/slop\//.test(url)
      && !/\/(copy|analyze|metrics)(\?|$)/.test(url)) observed?.();
    return response;
  };
}

export function mountSlopAuto(root: HTMLElement, controls: HTMLElement, hooks: Hooks): { refresh: () => Promise<void> } {
  let state: AutoState | null = null, running = false, quantity = 1, progress = "", notice = "", timer = 0;

  const render = () => {
    const batch = state?.batch, balance = state?.balance;
    hooks.indicator(balance?.missing ? 1 : 0);
    root.innerHTML = balance && balance.real !== balance.slop ? `<p role="status"><strong>Dataset sbilanciato</strong>: ${balance.real} REAL e ${balance.slop} SLOP approvate o pubblicate; ${balance.pending} SLOP nuove da decidere.${balance.missing ? ` Mancano ${balance.missing} SLOP al pareggio, contando le nuove.` : ""}</p>` : "";
    root.hidden = !root.innerHTML;
    let html = "";
    if (batch && batch.pipeline_version !== 2) {
      html = '<p>Batch precedente in pausa: sola revisione. Nessuna chiamata verrà ripetuta.</p><button data-auto="stop">Chiudi generazione precedente</button><button data-auto="review">Rivedi nel Database</button>';
    } else if (batch && batch.status === "running") {
      const ready = batch.images.filter(i => i.analysis === "done").length;
      html = `<p><strong>Batch automatico</strong> di SLOP: ${batch.attempted.length} di ${batch.slots} immagini inviate al generatore, ${ready} pronte.</p>
        <p class="slop-auto-progress" role="status">${escape(batch.runner?.alive ? progress || "Generazione in corso sul server…" : "Generazione ferma sul server: si riprende da dove si è interrotta, senza ripetere chiamate già inviate.")}</p>
        <div class="slop-auto-actions">${batch.runner?.alive ? "" : '<button type="button" class="primary" data-auto="resume">Riprendi sul server</button>'}<button type="button" data-auto="stop">Interrompi</button></div>`;
    } else if (batch) {
      html = `<p><strong>Batch automatico</strong> di SLOP: ${batch.undecided} di ${batch.images.length} ${batch.images.length === 1 ? "immagine" : "immagini"} da decidere.
        Decidi le immagini nuove prima di avviare un altro batch. Esaurite: ${batch.processes.filter(p=>p.state==="exhausted").length}; sospese: ${batch.processes.filter(p=>["review_needed","uncertain","failed"].includes(p.state)).length}.</p>
        ${(() => { const left = batch.processes.filter(p => ["draft", "ready", "retry"].includes(p.state)).length;
          return left ? `<p class="hint">${left} SLOP ancora da generare dalle REAL di riferimento del batch: il batch si è interrotto prima.</p>` : ""; })()}
        <div class="slop-auto-actions">${batch.processes.some(p => ["draft", "ready", "retry"].includes(p.state)) && !batch.runner?.alive ? '<button type="button" class="primary" data-auto="resume">Riprendi sul server</button>' : ""}<button type="button" data-auto="review">Rivedi nel Database</button><button type="button" data-auto="loop">Dettagli dei tentativi</button>${batch.undecided ? "" : '<button type="button" data-auto="close">Chiudi revisione</button>'}</div>`;
    } else if (state) {
      const max = state.max_batch;
      quantity = Math.min(Math.max(1, quantity), Math.max(1, max));
      html = `<h3>Generazione automatica</h3><p>REAL disponibili: ${state.available}. Ogni REAL scelta a caso ispira una SLOP. Una madre resta esclusa finché la figlia esiste, anche nel cestino.</p>
        <label>Numero di SLOP<input id="slop-auto-size" type="number" required min="1" max="${max}" value="${quantity}" ${max ? "" : "disabled"}></label>
        <p class="hint">Per ogni SLOP: brief e prompt, fino a ${state.config.max_generation_attempts} generazioni con valutazione, poi analisi dei tag. Massimo <span id="slop-auto-max-calls">${quantity*(2+2*state.config.max_generation_attempts)}</span> chiamate.</p>
        ${max ? "" : '<p role="status">Nessuna REAL libera con descrizione editoriale. Aggiungi REAL o elimina definitivamente una SLOP per liberarne la madre.</p>'}
        ${state.paid_calls ? "" : '<p class="hint">Manca la chiave OpenAI.</p>'}
        <button type="button" class="primary" data-auto="start" ${max && state.paid_calls ? "" : "disabled"}>Genera SLOP</button>`;
    }
    if (notice) html += `<p class="slop-auto-notice" role="status">${escape(notice)}</p>`;
    controls.innerHTML = html;
  };

  const load = async () => {
    try { state = await call<AutoState>(SLOP + "auto"); }
    catch (error) { notice = "Generazione automatica: " + errorText(error); }
    render();
  };
  const refresh = async () => {
    await load();
    if (state?.batch?.pipeline_version === 2 && state.batch.status === "running" && state.batch.runner?.alive) void follow();
    else if (state?.batch?.status === "review") void pickup().then(load);
  };

  /** Copy (when missing), then the analysis (only if never asked: uncertain or failed outcomes are not resent). */
  const finish = async (image: { id: string; copy: boolean; analysis: string }) => {
    if (!image.copy) await prepareItemCopy(await call<TreatableItem>(LIBRARY + "/" + encodeURIComponent(image.id)));
    if (image.analysis === "none") await call(LIBRARY + "/" + encodeURIComponent(image.id) + "/analyze", { confirm: true });
  };

  /** Copies of the images the server accepted (made in the browser, free), and the tags only if never asked. */
  const pickup = async () => {
    const batch = state?.batch;
    if (!batch || batch.pipeline_version !== 2 || running) return;
    for (const image of batch.images) {
      if (image.status !== "new" || (image.copy && image.analysis !== "none")) continue;
      progress = "Copia di gioco di un'immagine del batch…"; render();
      try { await finish(image); } catch (error) { notice = errorText(error); break; }
    }
    progress = "";
  };
  /** The loop runs on Cloudflare: the dashboard only follows it, and closing it stops nothing. */
  const follow = async () => {
    if (running) return;
    running = true;
    try {
      while (state?.batch?.status === "running" && state.batch.runner?.alive) {
        const b = state.batch, briefs = b.processes.filter(p => p.state !== "draft" && p.state !== "prompting").length;
        const attempts = b.processes.reduce((n, p) => n + p.attempts.length, 0), accepted = b.processes.filter(p => p.state === "accepted").length;
        progress = briefs < b.slots ? `Sul server: brief e prompt ${briefs} di ${b.slots}…` : `Sul server: ${attempts} ${attempts === 1 ? "tentativo" : "tentativi"}, ${accepted} ${accepted === 1 ? "SLOP accettata" : "SLOP accettate"} su ${b.slots}…`;
        render();
        await new Promise(resolve => window.setTimeout(resolve, 3000));
        await load();
      }
    } finally { running = false; progress = ""; }
    if (state?.batch?.status === "review") { await pickup(); notice = notice || "Batch generato: le immagini sono tra le nuove da decidere."; }
    await load(); await hooks.changed();
  };

  controls.addEventListener("input", event => {
    const input = event.target as HTMLInputElement;
    if (input.id !== "slop-auto-size") return;
    quantity = Number(input.value);
    const calls = controls.querySelector("#slop-auto-max-calls");
    if (calls && state) calls.textContent = String(quantity*(2+2*state.config.max_generation_attempts));
  });
  controls.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-auto]");
    if (!button || !state) return;
    const action = button.dataset.auto!;
    notice = "";
    try {
      if (action === "loop" && state.batch) { await hooks.loop(state.batch.id); return; }
      if (action === "close") { state = await call<AutoState>(SLOP + "auto/close", {}); render(); return; }
      if (action === "review" && state.batch) { await hooks.review(state.batch.id); return; }
      if (action === "stop") { await call(SLOP + "auto/stop", {}); notice = "Batch interrotto: il server si ferma prima della prossima chiamata."; await load(); return; }
      if (action === "resume") {
        if (!window.confirm("Riprendere il batch sul server? Continua da dove si è interrotto, entro il massimo di chiamate confermato all'avvio; le chiamate già inviate o con esito incerto non si ripetono.")) return;
        button.disabled = true; state = await call<AutoState>(SLOP + "auto/resume", { confirm: true }); render(); void follow(); return;
      }
      if (action === "start") {
        const input = controls.querySelector<HTMLInputElement>("#slop-auto-size")!;
        if (!input.reportValidity()) return;
        const size = Number(input.value);
        const c = state.config;
        if (!window.confirm(`Generare ${size} SLOP con ${c.image_model}, qualità ${c.quality}, valutatore e tag ${c.text_model}? Massimo ${size*(2+2*c.max_generation_attempts)} chiamate: ${size} brief+prompt, fino a ${size*c.max_generation_attempts} immagini e altrettante valutazioni, ${size} analisi tag solo dopo accettazione. Tolleranza ${c.editorial_tolerance}. Stop anticipato alla prima candidata idonea.`)) return;
        button.disabled = true;
        state = await call<AutoState>(SLOP + "auto/start", { size: size, confirm: true, config: c });
        render();
        void follow();
      }
    } catch (error) { notice = errorText(error); await load(); }
  });

  observeLibrary(() => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (!running) void load(); }, 400); });
  return { refresh };
}

