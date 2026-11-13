/** v1.2.0, 2026-11-13T22:00:00Z: no captions (docs/didascalie-wizard.v1.0.0.md): the confirmation speaks of tags only.
 * v1.1.0, 2026-11-13T10:00:00Z: copies in the photo's format (src/game-copy.v3.0.0.ts, docs/copie-di-gioco.v4.0.0.md).
 * Automatic SLOP batches on proposal (docs/proposta-generazione-slop.v2.0.0.md, sections 4–6). v1.0.0, 2026-11-12T21:00:00Z.
 * A box at the top of the dashboard, in every section: the proposal (Genera, Ignora, close until the next opening of the dashboard),
 * the progress of the running batch (Interrompi) or the batch waiting for the owner's decisions (Rivedi nel Database).
 * The batch runs here, in the browser, because the game copies are made here: prompts once, then for each slot the image,
 * its copy and its analysis. Every paid call was confirmed with «Genera»; the server records each slot before sending it, so a
 * batch picked up after the tab was closed never resends a call. The proposal is read again after every change to the library
 * made from the dashboard (approve, publish, trash, tags…), observed on the requests themselves. */
import "./slop-auto.v1.0.0.css";
import { prepareLibraryCopy } from "./game-copy.v3.0.0";
import { escape } from "../shared/html";

interface Proposal { tag: string; n_real: number; n_slop: number; n_new: number; spread: number; spread_percent: number; missing: number; size: number }
interface AutoImage { id: string; status: string; index: number | null; copy: boolean; analysis: string }
interface AutoBatch {
  id: string; tag: string; size: number; status: "running" | "review"; prompts_status: string; prompts_error: string; slots: number;
  attempted: number[]; snapshot: Proposal | null; images: AutoImage[]; undecided: number; updated_at: string;
}
export interface AutoState { enabled: boolean; threshold_percent: number; max_batch: number; paid_calls: boolean; batch: AutoBatch | null; proposal: Proposal | null; reason: string | null }
interface Hooks { review: (batchId: string) => void | Promise<void>; changed: () => Promise<void>; indicator: (proposals: number) => void }

const LIBRARY = "/api/admin/library", SLOP = LIBRARY + "/slop/", STALE_MS = 10 * 60_000;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const percent = (value: number) => Math.round(value) + "%";

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
      && !/\/(copy|analyze)(\?|$)/.test(url)) observed?.();
    return response;
  };
}

export function mountSlopAuto(root: HTMLElement, hooks: Hooks): { refresh: () => Promise<void> } {
  let state: AutoState | null = null, running = false, stopping = false, dismissed = "", progress = "", notice = "", timer = 0;

  const render = () => {
    const batch = state?.batch, next = state?.proposal;
    hooks.indicator(next && !batch ? 1 : 0);
    let html = "";
    if (batch && batch.status === "running") {
      const ready = batch.images.filter(i => i.analysis === "done").length;
      html = `<p><strong>Batch automatico</strong> per <code>${escape(batch.tag)}</code>: ${batch.attempted.length} di ${batch.slots} immagini inviate al generatore, ${ready} pronte.</p>
        <p class="slop-auto-progress" role="status">${escape(running ? progress : "In pausa: riprende da qui.")}</p>
        <div class="slop-auto-actions"><button type="button" data-auto="stop">Interrompi</button></div>`;
    } else if (batch) {
      html = `<p><strong>Batch automatico</strong> per <code>${escape(batch.tag)}</code>: ${batch.undecided} di ${batch.images.length} ${batch.images.length === 1 ? "immagine" : "immagini"} da decidere.
        Nessuna nuova proposta finché non sono tutte approvate, pubblicate o nel cestino.</p>
        <div class="slop-auto-actions"><button type="button" data-auto="review">Rivedi nel Database</button></div>`;
    } else if (next && dismissed !== next.tag + ":" + next.size) {
      html = `<p><strong>Proposta di generazione</strong> per <code>${escape(next.tag)}</code>: ${next.n_real} REAL, ${next.n_slop} SLOP approvate o pubblicate,
        ${next.n_new} SLOP nuove; spread ${percent(next.spread_percent)}, ne mancano ${next.missing}.
        Generare un batch di <strong>${next.size} SLOP</strong>? Per ogni immagine: generazione e tag; in più una chiamata per i prompt.</p>
        ${state!.paid_calls ? "" : '<p class="hint">Chiamate a pagamento spente: manca la chiave OpenAI.</p>'}
        <div class="slop-auto-actions"><button type="button" class="primary" data-auto="start" ${state!.paid_calls ? "" : "disabled"}>Genera ${next.size} SLOP</button>
        <button type="button" data-auto="ignore">Ignora</button><button type="button" data-auto="dismiss" aria-label="Chiudi la proposta">Chiudi</button></div>`;
    }
    if (notice) html += `<p class="slop-auto-notice" role="status">${escape(notice)}</p>`;
    root.innerHTML = html;
    root.hidden = !html;
  };

  const load = async () => {
    try { state = await call<AutoState>(SLOP + "auto"); }
    catch (error) { notice = "Proposte di generazione: " + errorText(error); }
    render();
  };
  const refresh = async () => {
    await load();
    if (state?.batch?.status === "running" && !running) void run();
  };

  /** Copy (when missing), then the analysis (only if never asked: uncertain or failed outcomes are not resent). */
  const finish = async (image: { id: string; copy: boolean; analysis: string }) => {
    if (!image.copy) await prepareLibraryCopy(image.id);
    if (image.analysis === "none") await call(LIBRARY + "/" + encodeURIComponent(image.id) + "/analyze", { confirm: true });
  };

  const run = async () => {
    if (running || !state?.batch || state.batch.status !== "running") return;
    running = true; stopping = false;
    const batchId = state.batch.id, problems: string[] = [];
    let account = false;
    const step = (text: string) => { progress = text; render(); };
    try {
      const { image_quality: quality } = await call<{ image_quality: string }>(LIBRARY + "/models");
      let batch = state.batch;
      if (batch.prompts_status === "none") {
        step("Scrittura dei prompt…");
        try { await call(SLOP + "batches/" + encodeURIComponent(batchId) + "/prompts", { confirm: true }); }
        catch (error) { problems.push("prompt: " + errorText(error)); }
        await load(); batch = state?.batch?.id === batchId ? state.batch : batch;
      }
      if (batch.prompts_status === "running") {
        if (Date.now() - Date.parse(batch.updated_at) < STALE_MS) { notice = "Prompt in scrittura: il batch riprende alla prossima apertura della dashboard."; return; }
        problems.push("scrittura dei prompt interrotta, esito incerto: non ripetuta");
      }
      if (batch.prompts_status !== "done") {
        await call(SLOP + "auto/stop", {}).catch(() => {});
        notice = "Batch fermato: prompt non scritti" + (batch.prompts_error ? " (" + batch.prompts_error + ")" : "") + (problems.length ? ". " + problems.join(" | ") : "") + ".";
        return;
      }
      const todo = Array.from({ length: batch.slots }, (_, i) => i).filter(i => !batch.attempted.includes(i));
      for (const [n, index] of todo.entries()) {
        if (stopping) break;
        step(`Immagine ${batch.attempted.length + n + 1} di ${batch.slots}: generazione…`);
        try {
          const image = await call<{ id: string }>(SLOP + "batches/" + encodeURIComponent(batchId) + "/images", { confirm: true, index, quality });
          step(`Immagine ${batch.attempted.length + n + 1} di ${batch.slots}: copia di gioco e analisi…`);
          await finish({ id: image.id, copy: false, analysis: "none" });
        } catch (error) {
          problems.push("immagine " + (index + 1) + ": " + errorText(error));
          if (/OpenAI:/.test(errorText(error))) { account = true; break; }
          if (/non è più in generazione/.test(errorText(error))) break;
        }
      }
      // Picked up again: images generated earlier but still without copy or analysis.
      await load();
      for (const image of state?.batch?.id === batchId ? state.batch.images : []) {
        if (image.status !== "new" || (image.copy && image.analysis !== "none")) continue;
        step("Copia di gioco e analisi di un'immagine del batch…");
        try { await finish(image); } catch (error) { problems.push(errorText(error)); if (/OpenAI:/.test(errorText(error))) { account = true; break; } }
      }
      if (!stopping) await call(SLOP + "auto/" + (account ? "stop" : "finish"), {}).catch(() => {});
      notice = (stopping ? "Batch interrotto." : account ? "Batch fermato da un problema dell'account OpenAI." : "Batch generato: le immagini sono tra le nuove da decidere.") +
        (problems.length ? " Problemi: " + problems.join(" | ") : "");
    } catch (error) {
      notice = "Batch automatico: " + errorText(error);
    } finally {
      running = false; progress = "";
      await load();
      await hooks.changed();
    }
  };

  root.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-auto]");
    if (!button || !state) return;
    const action = button.dataset.auto!, next = state.proposal;
    notice = "";
    try {
      if (action === "dismiss" && next) { dismissed = next.tag + ":" + next.size; render(); return; }
      if (action === "review" && state.batch) { await hooks.review(state.batch.id); return; }
      if (action === "stop") { stopping = true; await call(SLOP + "auto/stop", {}); await load(); return; }
      if (action === "ignore" && next) { state = await call<AutoState>(SLOP + "auto/ignore", { tag: next.tag }); render(); return; }
      if (action === "start" && next) {
        const models = await call<{ text_model: string; image_model: string; image_quality: string }>(LIBRARY + "/models");
        if (!window.confirm(`Generare ${next.size} SLOP per «${next.tag}» con ${models.image_model} in qualità ${models.image_quality} e analizzarle con ${models.text_model}? ` +
          `Sono ${next.size * 2 + 1} chiamate a pagamento: una per i prompt, una per ogni immagine e una per ogni analisi.`)) return;
        button.disabled = true;
        state = await call<AutoState>(SLOP + "auto/start", { tag: next.tag, size: next.size, confirm: true });
        render();
        void run();
      }
    } catch (error) { notice = errorText(error); await load(); }
  });

  observeLibrary(() => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (!running) void load(); }, 400); });
  return { refresh };
}
