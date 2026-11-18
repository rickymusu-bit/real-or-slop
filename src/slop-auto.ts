/** Automatic generation controls, server progress and a separate catalogue balance notification. */
import "./slop-auto.css";
import { prepareItemCopy, type TreatableItem } from "./game-copy";
import { escape } from "../shared/html";
import { onLongPress, openPreview } from "./image-preview";
import { startPills } from "./tag-ui";
import { MAX_BATCH, type Tag } from "../shared/slop-proposals";
import { mountRealWizard } from "./real-wizard";
import type { RealDescription } from "../shared/editorial";

interface Proposal { n_real: number; n_slop: number; n_new: number; spread: number; spread_percent: number; missing: number; size: number }
interface AutoImage { id: string; status: string; index: number | null; copy: boolean; analysis: string }
interface Config { max_generation_attempts: number; editorial_tolerance: number; text_model: string; image_model: string; quality: string }
interface AutoPreview {
  token: string; expires: number; config: Config;
  references: {id: string; title: string; tags: Tag[]; description: RealDescription; file: string; original: string}[];
}
interface DatabaseReference { id: string; title: string; description: string; tags: Tag[] }
type SourceMode = "database" | "commons" | "random";
const SOURCE_MODES: Record<SourceMode, string> = { database: "Dal Database", commons: "Da Wikimedia Commons", random: "Estrazione casuale" };
const REFERENCES_PAGE = 12;
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

export function mountSlopAuto(root: HTMLElement, host: HTMLElement, hooks: Hooks): { refresh: () => Promise<void> } {
  host.innerHTML = '<div data-auto-options></div><section data-auto-commons aria-label="REAL da Wikimedia Commons" hidden></section><div data-auto-selection></div>';
  const controls = host.querySelector<HTMLElement>("[data-auto-options]")!;
  const commons = host.querySelector<HTMLElement>("[data-auto-commons]")!;
  const selection = host.querySelector<HTMLElement>("[data-auto-selection]")!;
  let mode: SourceMode = "database", query = "", visibleLimit = REFERENCES_PAGE;
  let catalog: DatabaseReference[] | null = null, catalogError = "", commonsMounted = false, starting = false, previewing = false;
  const picked = new Map<string, DatabaseReference>();
  let preview: AutoPreview | null = null, extraction = 0;
  let state: AutoState | null = null, running = false, quantity = 1, progress = "", notice = "", timer = 0;

  const forgetPreview = () => {
    preview = null;
    previewing = false;
    extraction++;
  };
  const loadCatalog = async () => {
    catalog = (await call<{ references: DatabaseReference[] }>(SLOP + "auto/references")).references;
    catalogError = "";
  };
  const renderCandidates = () => {
    const region = controls.querySelector("[data-auto-results]");
    if (!region) return;
    if (catalogError) {
      region.innerHTML = '<p role="status">' + escape(catalogError) + '</p><button type="button" data-auto="retry-catalog">Ricarica il Database</button>';
      return;
    }
    if (!catalog) { region.textContent = "Caricamento delle REAL…"; return; }
    const terms = query.toLowerCase().trim().split(/\s+/);
    const matching = catalog.filter(row => {
      const text = [row.title, row.description, ...row.tags.map(tag => tag.label)].join(" ").toLowerCase();
      return terms.every(term => text.includes(term));
    });
    region.innerHTML = matching.length ? `<ul class="slop-auto-references">${matching.slice(0, visibleLimit).map(r => `<li>
      <button type="button" class="slop-auto-photo" data-auto-reference="${escape(r.id)}" aria-label="Ingrandisci ${escape(r.title)}" data-long-press><img src="${LIBRARY}/${escape(r.id)}/file" alt="" loading="lazy" draggable="false"></button>
      <label class="slop-auto-check"><input type="checkbox" data-auto-pick="${escape(r.id)}" ${picked.has(r.id) ? "checked" : ""}> <strong>${escape(r.title)}</strong></label>
      <div class="rw-pills">${startPills(r)}</div></li>`).join("")}</ul>
      ${matching.length > visibleLimit ? '<button type="button" data-auto="more">Mostra altre REAL</button>' : ""}`
      : `<p role="status">${catalog.length ? "Nessuna REAL corrisponde alla ricerca." : "Nessuna REAL libera con tag e descrizione editoriale. Puoi cercare su Wikimedia Commons."}</p>`;
  };
  const renderSelection = () => {
    if (!state || state.batch) {
      selection.innerHTML = notice ? `<p class="slop-auto-notice" role="status">${escape(notice)}</p>` : "";
      return;
    }
    const config = preview?.config || state.config;
    const count = preview?.references.length ?? (mode === "random" ? quantity : picked.size);
    const bound = count * (2 + 2 * config.max_generation_attempts);
    let html = "";
    if (mode !== "random" && !preview) html += `<h4>REAL selezionate (${picked.size}/${MAX_BATCH})</h4>
      ${picked.size ? `<ul class="slop-auto-picked">${[...picked.values()].map(r => `<li><span>${escape(r.title)}</span>
        <button type="button" data-auto="remove-reference" data-id="${escape(r.id)}" aria-label="Rimuovi ${escape(r.title)} dalla selezione">×</button></li>`).join("")}</ul>` : ""}
      <button type="button" data-auto="preview" ${!picked.size || previewing || starting ? "disabled" : ""}>Rivedi la selezione</button>`;
    if (count > 0) html += `<p class="hint">Massimo <span id="slop-auto-max-calls">${bound}</span> chiamate per ${count} SLOP.</p>`;
    if (preview) html += `<section data-auto-preview aria-labelledby="slop-preview-title"><h4 id="slop-preview-title" tabindex="-1">2. Rivedi le REAL e avvia</h4>
      <p>Tocca una foto o tienila premuta per vedere l'originale intero e la descrizione editoriale.</p>
      <ul class="slop-auto-references">${preview.references.map(r => `<li data-reference="${escape(r.id)}">
        <button type="button" class="slop-auto-photo" data-auto-reference="${escape(r.id)}" aria-label="Ingrandisci ${escape(r.title)}" data-long-press><img src="${escape(r.file)}" alt="" draggable="false"></button>
        <strong>${escape(r.title)}</strong><div class="rw-pills">${startPills(r)}</div></li>`).join("")}</ul>
      <p class="hint">L’anteprima vale 15 minuti. Le REAL vengono prenotate quando avvii il batch.</p>
      ${state.paid_calls ? "" : '<p class="hint">Manca la chiave OpenAI.</p>'}
      <div class="slop-auto-actions"><button type="button" class="primary" data-auto="start" ${state.paid_calls && !starting ? "" : "disabled"}>Conferma e avvia ${count} SLOP</button>
      <button type="button" data-auto="discard" ${starting ? "disabled" : ""}>Torna alla selezione</button></div></section>`;
    if (notice) html += `<p class="slop-auto-notice" role="status">${escape(notice)}</p>`;
    selection.innerHTML = html;
  };

  const render = () => {
    const batch = state?.batch, balance = state?.balance;
    if (batch) forgetPreview();
    commons.hidden = !state || !!batch || mode !== "commons" || !!preview;
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
      if (!preview && mode === "random") quantity = Math.min(Math.max(1, quantity), Math.max(1, max));
      html = `<h3>1. Scegli le REAL di riferimento</h3>
        <nav class="db-tabs" aria-label="Origine delle REAL di riferimento">${Object.entries(SOURCE_MODES).map(([key, label]) =>
          `<button type="button" data-auto="mode" data-source-mode="${key}" aria-pressed="${mode === key}" ${starting ? "disabled" : ""}>${label}</button>`).join("")}</nav>`;
      if (mode === "database" && !preview) html += `<label>Filtra le REAL<input type="search" data-auto-query value="${escape(query)}" placeholder="Titolo, descrizione o tag"></label>
        <p class="hint">Sono disponibili le REAL libere con tag e descrizione editoriale.</p><div data-auto-results></div>`;
      if (mode === "random") html += `<label>Numero di SLOP<input id="slop-auto-size" type="number" required min="1" max="${Math.max(max, 1)}" value="${quantity}" ${max && !starting ? "" : "disabled"}></label>
        <p class="hint">REAL disponibili per l’estrazione: ${state.available}.</p>
        <button type="button" data-auto="preview" ${max && !previewing && !starting ? "" : "disabled"}>${preview ? "Estrai di nuovo le REAL" : "Estrai le REAL"}</button>`;
    }
    controls.innerHTML = html;
    renderCandidates();
    renderSelection();
  };

  const load = async () => {
    try {
      state = await call<AutoState>(SLOP + "auto");
      if (!state.batch && mode === "database") await loadCatalog().catch(error => { catalogError = errorText(error); });
    }
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

  const chooseMode = async (source: SourceMode) => {
    mode = source;
    forgetPreview();
    render();
    if (source === "database") {
      await loadCatalog().catch(error => { catalogError = errorText(error); });
      renderCandidates();
    } else if (source === "commons" && !commonsMounted) {
      commonsMounted = true;
      commons.textContent = "Caricamento della ricerca su Commons…";
      await mountRealWizard(commons, hooks.changed, async ids => {
        if (state?.batch || starting) throw Error("C’è già un batch automatico in corso.");
        if (new Set([...picked.keys(), ...ids]).size > MAX_BATCH) throw Error(`Puoi usare fino a ${MAX_BATCH} REAL per batch. Rimuovi qualche foto dalla selezione.`);
        await loadCatalog();
        const byId = new Map(catalog?.map(row => [row.id, row]));
        if (!ids.every(id => byId.has(id))) throw Error("Una REAL importata non è più disponibile.");
        for (const id of ids) picked.set(id, byId.get(id)!);
        if (mode === "commons") mode = "database";
        notice = "";
        forgetPreview();
        render();
      });
    }
  };
  controls.addEventListener("input", event => {
    const input = event.target as HTMLInputElement;
    if (input.matches("[data-auto-query]")) {
      query = input.value;
      visibleLimit = REFERENCES_PAGE;
      renderCandidates();
    } else if (input.id === "slop-auto-size") {
      quantity = input.valueAsNumber || 1;
      forgetPreview();
      const draw = controls.querySelector<HTMLButtonElement>('[data-auto="preview"]');
      if (draw) draw.disabled = !state?.max_batch;
      renderSelection();
    }
  });
  controls.addEventListener("change", event => {
    const input = event.target as HTMLInputElement;
    if (!input.dataset.autoPick || starting) return;
    const row = catalog?.find(r => r.id === input.dataset.autoPick);
    if (!row) return;
    notice = "";
    if (!input.checked) picked.delete(row.id);
    else if (picked.size < MAX_BATCH) picked.set(row.id, row);
    else {
      input.checked = false;
      notice = `Puoi scegliere fino a ${MAX_BATCH} REAL per batch.`;
    }
    forgetPreview();
    renderSelection();
  });
  const showReference = (element: HTMLElement) => {
    const id = element.dataset.autoReference;
    const ref = preview?.references.find(r => r.id === id);
    if (ref) openPreview({src: ref.original, alt: "Originale REAL intero", title: ref.title,
      description: ref.description.visible, extra: `<div class="rw-pills">${startPills(ref)}</div><p>Contesto documentato: ${escape(ref.description.documented_context)}</p><p>Incertezze: ${escape(ref.description.uncertainties)}</p>`});
    else {
      const candidate = catalog?.find(r => r.id === id);
      if (candidate) openPreview({src: `${LIBRARY}/${candidate.id}/original`, alt: "Originale REAL intero",
        title: candidate.title, description: candidate.description, extra: `<div class="rw-pills">${startPills(candidate)}</div>`});
    }
  };
  onLongPress(host, "[data-auto-reference]", showReference);
  host.addEventListener("click", async event => {
    const reference = (event.target as HTMLElement).closest<HTMLElement>("[data-auto-reference]");
    if (reference) { showReference(reference); return; }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-auto]");
    if (!button || !state || starting) return;
    const action = button.dataset.auto!;
    notice = "";
    try {
      if (action === "mode") { await chooseMode(button.dataset.sourceMode as SourceMode); return; }
      if (action === "retry-catalog") { await chooseMode("database"); return; }
      if (action === "more") { visibleLimit += REFERENCES_PAGE; renderCandidates(); return; }
      if (action === "remove-reference") {
        picked.delete(button.dataset.id!);
        forgetPreview(); render();
        return;
      }
      if (action === "discard") { forgetPreview(); render(); return; }
      if (action === "preview") {
        const input = controls.querySelector<HTMLInputElement>("#slop-auto-size");
        if (mode === "random" && !input?.reportValidity()) return;
        const data = mode === "random" ? { size: input!.valueAsNumber } : { sources: [...picked.keys()] };
        if (data.sources && !data.sources.length) return;
        forgetPreview();
        const request = extraction;
        previewing = true;
        button.disabled = true;
        renderSelection();
        try {
          const selected = await call<AutoPreview>(SLOP + "auto/preview", data);
          if (request === extraction && !state.batch) preview = selected;
        } catch (error) {
          if (request === extraction) notice = errorText(error);
        } finally {
          if (request === extraction) {
            previewing = false;
            render();
            if (preview) selection.querySelector<HTMLElement>("#slop-preview-title")?.focus();
          }
        }
        return;
      }
      if (action === "loop" && state.batch) { await hooks.loop(state.batch.id); return; }
      if (action === "close") { state = await call<AutoState>(SLOP + "auto/close", {}); render(); return; }
      if (action === "review" && state.batch) { await hooks.review(state.batch.id); return; }
      if (action === "stop") { await call(SLOP + "auto/stop", {}); notice = "Batch interrotto: il server si ferma prima della prossima chiamata."; await load(); return; }
      if (action === "resume") {
        if (!window.confirm("Riprendere il batch sul server? Continua da dove si è interrotto, entro il massimo di chiamate confermato all'avvio; le chiamate già inviate o con esito incerto non si ripetono.")) return;
        button.disabled = true; state = await call<AutoState>(SLOP + "auto/resume", { confirm: true }); render(); void follow(); return;
      }
      if (action === "start") {
        if (!preview) return;
        const selected = preview, size = selected.references.length, c = selected.config;
        if (!window.confirm(`Generare ${size} SLOP con ${c.image_model}, qualità ${c.quality}, valutatore e tag ${c.text_model}? Massimo ${size*(2+2*c.max_generation_attempts)} chiamate: ${size} brief+prompt, fino a ${size*c.max_generation_attempts} immagini e altrettante valutazioni, ${size} analisi tag solo dopo accettazione. Tolleranza ${c.editorial_tolerance}. Stop anticipato alla prima candidata idonea.`)) return;
        starting = true;
        render();
        try {
          state = await call<AutoState>(SLOP + "auto/start", { preview: selected.token, confirm: true });
          picked.clear();
        } finally { starting = false; }
        render();
        void follow();
      }
    } catch (error) { if (action === "start") forgetPreview(); notice = errorText(error); await load(); }
  });

  observeLibrary(() => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (!running) void load(); }, 400); });
  return { refresh };
}

