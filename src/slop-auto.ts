/** Automatic generation controls, server progress and a separate catalogue balance notification. */
import "./slop-auto.css";
import { prepareItemCopy, type TreatableItem } from "./game-copy";
import { escape } from "../shared/html";
import { onLongPress, openPreview } from "./image-preview";
import { startPills } from "./tag-ui";
import type { Tag } from "../shared/slop-proposals";
import type { RealDescription } from "../shared/editorial";

import { type Gallery } from "./galleries";
interface AutoImage { id: string; status: string; index: number | null; copy: boolean; analysis: string }
interface Config { max_generation_attempts: number; editorial_tolerance: number; text_model: string; image_model: string; quality: string }
interface Reference {id: string; title: string; tags: Tag[]; description: RealDescription; file: string; original: string}
interface AutoPreview {
  token: string; expires: number; config: Config;
  references: Reference[];
}
interface AutoBatch {
  config: Config; processes: {slot: number; state: string; updated_at: string; attempts: unknown[]; premise: string | null; prompt: string; error: string}[];
  runner: { id: string; status: string | null; updated_at: string | null; alive: boolean } | null;
  id: string; gallery_id: string; size: number; status: "running" | "review"; prompts_status: string; prompts_error: string; slots: number;
  attempted: number[];
  gallery_review: "pending" | "confirmed" | null;
  proposal_review: {gallery: {id: string; title: string}; expires: number; invalid: boolean; references: {slot: number; real: Reference | null}[]} | null; images: AutoImage[]; undecided: number; updated_at: string;
}
export interface AutoState { config: Config; max_batch: number; galleries: Gallery[]; expired: boolean; paid_calls: boolean; batch: AutoBatch | null; balance: {real:number; slop:number; pending:number; missing:number} }
interface Hooks {
  loop: (batchId: string) => Promise<void>;
  review: (batchId: string) => Promise<void>;
  openGallery: (galleryId: string) => Promise<void>;
  changed: () => Promise<void>;
  indicator: (gallery: Gallery | undefined) => void;
}

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

export function mountSlopAuto(root: HTMLElement, controls: HTMLElement, hooks: Hooks) {
  let preview: AutoPreview | null = null, extraction = 0, galleryId = "";
  let state: AutoState | null = null, running = false, quantity = 1, progress = "", notice = "", timer = 0;

  const gallery = () => state?.galleries.find(g => g.id === galleryId);
  const validProposals = (batch: AutoBatch) => batch.processes.filter(p => p.state === "ready" && p.premise);
  const settings = (c: Config) => `Immagini: ${c.image_model}, qualità ${c.quality}, pianificazione predefinita dal modello. Valutazione e tag: ${c.text_model}. Tentativi massimi: ${c.max_generation_attempts} per SLOP. Tolleranza: ${c.editorial_tolerance}.`;
  const imageCalls = (batch: AutoBatch, size: number) => size * (1 + 2 * batch.config.max_generation_attempts);
  const card = (r: Reference) => `<button type="button" class="slop-auto-photo" data-auto-reference="${escape(r.id)}" aria-label="Ingrandisci ${escape(r.title)}" data-long-press><img src="${escape(r.file)}" alt="" draggable="false"></button>
    <strong>${escape(r.title)}</strong><div class="rw-pills">${startPills(r)}</div>`;
  const render = () => {
    const activeBatch = state?.batch, balance = state?.balance;
    const batch = activeBatch?.gallery_id === galleryId ? activeBatch : null;
    const activeGallery = state?.galleries.find(g => g.id === activeBatch?.gallery_id);
    window.clearTimeout(check);
    if (activeBatch && preview) { preview = null; extraction++; }
    hooks.indicator(activeGallery);
    root.innerHTML = balance && balance.real !== balance.slop ? `<p role="status"><strong>Dataset sbilanciato</strong>: ${balance.real} REAL e ${balance.slop} SLOP approvate o pubblicate; ${balance.pending} SLOP nuove da decidere.${balance.missing ? ` Mancano ${balance.missing} SLOP al pareggio, contando le nuove.` : ""}</p>` : "";
    root.hidden = !root.innerHTML;
    let html = "";
    if (!galleryId) html = "";
    else if (activeBatch && !batch) {
      html = activeGallery ? `<p>Batch automatico aperto in <strong>${escape(activeGallery.title)}</strong>.</p>
        <button type="button" data-auto="open-gallery">Apri il batch automatico</button>` : '<p>È già aperto un batch automatico.</p>';
    } else if (batch?.proposal_review) {
      const review = batch.proposal_review, valid = validProposals(batch).length;
      const live = !!batch.runner?.alive, prompting = batch.processes.some(p => p.state === "prompting");
      if (!live) nextCheck(prompting ? 10_000 : review.expires - Date.now() + 100);
      html = `<section data-proposal-review aria-labelledby="proposal-title"><h3 id="proposal-title">Proposte per ${escape(review.gallery.title)}</h3>
        <p role="status">${review.invalid ? "La galleria o le REAL sono cambiate. Annulla e ripeti l’estrazione."
          : live || prompting ? "Preparazione delle proposte sul server…" : `${valid} ${valid === 1 ? "proposta valida" : "proposte valide"} su ${batch.slots}.`}</p>
        ${batch.prompts_error ? `<p class="hint">${escape(batch.prompts_error)}</p>` : ""}
        <ul class="slop-auto-references slop-auto-proposals">${review.references.map(({slot, real}) => {
          const p = batch.processes.find(p => p.slot === slot);
          return `<li data-reference="${escape(real?.id || "")}"><div>${real ? card(real) : "<p>REAL modificata o non disponibile.</p>"}</div>
            <div>${p?.premise ? `<p data-premise>${escape(p.premise)}</p><details><summary>Prompt inglese</summary><p lang="en">${escape(p.prompt)}</p></details>`
              : `<p>${escape(p?.error || (p?.state === "draft" && !live ? "Proposta non preparata." : "In attesa della proposta…"))}</p>`}</div></li>`;
        }).join("")}</ul>
        <p class="hint">Scadenza ${new Date(review.expires).toLocaleTimeString("it-IT", {hour: "2-digit", minute: "2-digit"})}.
          Massimo ${imageCalls(batch, valid)} chiamate rimanenti.</p>
        <p class="hint">${escape(settings(batch.config))}</p>
        ${state?.paid_calls ? "" : '<p class="hint">Manca la chiave OpenAI.</p>'}
        <div class="slop-auto-actions">${valid && !review.invalid && !live && !prompting ? `<button type="button" class="primary" data-auto="start" ${state?.paid_calls ? "" : "disabled"}>Conferma e genera ${valid} SLOP</button>` : ""}
        ${!live && !review.invalid && batch.processes.some(p => p.state === "draft") ? '<button type="button" data-auto="resume">Riprendi le proposte</button>' : ""}
        <button type="button" data-auto="cancel">Annulla proposte</button></div></section>`;

    } else if (batch && batch.status === "running") {
      const ready = batch.images.filter(i => i.analysis === "done").length;
      html = `<p><strong>Batch automatico</strong> di SLOP: ${batch.attempted.length} di ${batch.slots} immagini inviate al generatore, ${ready} pronte.</p>
        <p class="slop-auto-progress" role="status">${escape(batch.runner?.alive ? progress || "Generazione in corso sul server…" : "Generazione ferma sul server: si riprende da dove si è interrotta, senza ripetere chiamate già inviate.")}</p>
        <div class="slop-auto-actions">${batch.runner?.alive ? "" : '<button type="button" class="primary" data-auto="resume">Riprendi sul server</button>'}<button type="button" data-auto="stop">Interrompi</button></div>`;
    } else if (batch) {
      html = `<p><strong>Batch automatico</strong> di SLOP: ${batch.undecided} di ${batch.images.length} ${batch.images.length === 1 ? "immagine" : "immagini"} da decidere.
        Decidi le immagini nuove prima di avviare un altro batch. Esaurite: ${batch.processes.filter(p=>p.state==="exhausted").length}; sospese: ${batch.processes.filter(p=>["review_needed","uncertain","failed"].includes(p.state)).length}.</p>
        ${(() => { const left = batch.processes.filter(p => ["draft", "ready", "retry"].includes(p.state)).length;
          return left ? `<p class="hint">${left} SLOP ancora da generare dalle proposte approvate.</p>` : ""; })()}
        <div class="slop-auto-actions">${batch.processes.some(p => ["draft", "ready", "retry"].includes(p.state)) && !batch.runner?.alive ? '<button type="button" class="primary" data-auto="resume">Riprendi sul server</button>' : ""}<button type="button" data-auto="review">Rivedi nella galleria</button><button type="button" data-auto="loop">Dettagli dei tentativi</button>${batch.undecided ? "" : '<button type="button" data-auto="close">Chiudi revisione</button>'}</div>`;
    } else if (state) {
      const selected = gallery(), max = state.max_batch, c = preview?.config || state.config;
      html = `<h3>Generazione automatica</h3>
        ${selected ? `<p role="status">${selected.ready ? `REAL disponibili: ${selected.available}.` : "Salva le Indicazioni SLOP con «Modifica galleria» per abilitare la generazione automatica."}</p>` : ""}
        <label>Numero di SLOP<input id="slop-auto-size" type="number" required min="1" max="${max}" value="${quantity}" ${selected?.ready ? "" : "disabled"}></label>
        ${state.paid_calls ? "" : '<p class="hint">Manca la chiave OpenAI.</p>'}
        <button type="button" data-auto="preview" ${selected?.ready ? "" : "disabled"}>${preview ? "Estrai di nuovo le REAL" : "Estrai le REAL"}</button>
        <p class="hint">L’estrazione è gratuita. Dopo aver visto le REAL potrai confermare la preparazione delle proposte.</p>`;
      if (preview) html += `<section data-auto-preview aria-labelledby="slop-preview-title"><h4 id="slop-preview-title">REAL estratte: ${preview.references.length}</h4>
        <p>Tocca una foto o tieni premuto per vedere l’originale intero e la descrizione editoriale.</p>
        <ul class="slop-auto-references">${preview.references.map(r=>`<li data-reference="${escape(r.id)}">${card(r)}</li>`).join("")}</ul>
        <p class="hint">${escape(settings(c))}</p>
        <p class="hint">Massimo ${preview.references.length} ${preview.references.length === 1 ? "chiamata" : "chiamate"} con ${escape(c.text_model)} per preparare premessa e prompt. L’estrazione vale 15 minuti.</p>
        <div class="slop-auto-actions"><button type="button" class="primary" data-auto="prepare" ${state.paid_calls ? "" : "disabled"}>Prepara ${preview.references.length} ${preview.references.length === 1 ? "proposta" : "proposte"}</button><button type="button" data-auto="discard">Annulla estrazione</button></div></section>`;
    }
    if (galleryId && notice) html += `<p class="slop-auto-notice" role="status">${escape(notice)}</p>`;
    controls.innerHTML = html;
  };

  const load = async () => {
    try {
      const previous = state?.batch?.proposal_review;
      state = await call<AutoState>(SLOP + "auto");
      if (state.expired || (previous && !state.batch && previous.expires <= Date.now())) notice = "Proposte scadute. Estrai di nuovo le REAL.";
    }
    catch (error) { notice = "Generazione automatica: " + errorText(error); }
    render();
  };
  let check = 0;
  const nextCheck = (delay: number) => {
    window.clearTimeout(check);
    check = window.setTimeout(() => { void refresh(); }, Math.max(2000, delay));
  };
  const refresh = async () => {
    await load();
    if (state?.batch?.status === "running" && state.batch.runner?.alive) void follow();
    else if (state?.batch?.status === "review") void pickup().then(load);
  };

  /** Prepare the game copies in the browser after acceptance. */
  const pickup = async () => {
    const batch = state?.batch;
    if (!batch || running) return;
    for (const image of batch.images) {
      if (image.status !== "new" || image.copy) continue;
      progress = "Copia di gioco di un'immagine del batch…"; render();
      try { await prepareItemCopy(await call<TreatableItem>(LIBRARY + "/" + encodeURIComponent(image.id))); }
      catch (error) { notice = errorText(error); break; }
    }
    progress = "";
  };
  /** The loop runs on Cloudflare: the dashboard only follows it, and closing it stops nothing. */
  const follow = async () => {
    if (running) return;
    running = true;
    try {
      while (state?.batch?.status === "running" && state.batch.runner?.alive) {
        const b = state.batch;
        const attempts = b.processes.reduce((n, p) => n + p.attempts.length, 0), accepted = b.processes.filter(p => p.state === "accepted").length;
        progress = `Sul server: ${attempts} ${attempts === 1 ? "tentativo" : "tentativi"}, ${accepted} ${accepted === 1 ? "SLOP accettata" : "SLOP accettate"} su ${b.slots}…`;
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
    preview = null;
    extraction++;
    controls.querySelector("[data-auto-preview]")?.remove();
  });
  const showReference = (element: HTMLElement) => {
    const key = element.dataset.autoReference;
    const ref = preview?.references.find(r => r.id === key) ||
      state?.batch?.proposal_review?.references.find(r => r.real?.id === key)?.real;
    if (!ref) return;
    openPreview({src: ref.original, alt: "Originale REAL intero", title: ref.title,
      description: ref.description.visible, extra: `<div class="rw-pills">${startPills(ref)}</div><p>Contesto documentato: ${escape(ref.description.documented_context)}</p><p>Incertezze: ${escape(ref.description.uncertainties)}</p>`});
  };
  onLongPress(controls, "[data-auto-reference]", showReference);
  controls.addEventListener("click", async event => {
    const reference = (event.target as HTMLElement).closest<HTMLElement>("[data-auto-reference]");
    if (reference) { showReference(reference); return; }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-auto]");
    if (!button || !state) return;
    const action = button.dataset.auto!;
    const active = state.batch;
    if (action === "open-gallery" && active) { await hooks.openGallery(active.gallery_id); return; }
    if (active && active.gallery_id !== galleryId) return;
    notice = "";
    try {
      if (action === "discard") { preview = null; extraction++; render(); return; }
      if (action === "preview") {
        const input = controls.querySelector<HTMLInputElement>("#slop-auto-size")!;
        if (!input.reportValidity()) return;
        const request = ++extraction;
        preview = null; controls.querySelector("[data-auto-preview]")?.remove(); button.disabled = true;
        try {
          const selected = await call<AutoPreview>(SLOP + "auto/preview", {size: Number(input.value), gallery_id: galleryId});
          if (request !== extraction || state.batch) return;
          preview = selected; render();
        } catch (error) { if (request === extraction) throw error; }
        return;
      }
      if (action === "loop" && state.batch) { await hooks.loop(state.batch.id); return; }
      if (action === "close" && active) { state = await call<AutoState>(SLOP + "auto/close", {batch: active.id}); render(); return; }
      if (action === "review" && state.batch) { await hooks.review(state.batch.id); return; }
      if (action === "stop" && active) { await call(SLOP + "auto/stop", {batch: active.id}); notice = "Batch interrotto: il server si ferma prima della prossima chiamata."; await load(); return; }
      if (action === "resume") {
        const batch = state.batch;
        if (!batch) return;
        const remaining = batch.processes.filter(p => p.state === "draft").length;
        const question = batch.proposal_review
          ? `Riprendere le proposte sul server? Massimo ${remaining} ${remaining === 1 ? "chiamata" : "chiamate"} con ${batch.config.text_model} per le proposte ancora da preparare.`
          : "Riprendere il batch sul server entro il massimo di chiamate confermato all’avvio?";
        if (!window.confirm(question)) return;
        button.disabled = true; state = await call<AutoState>(SLOP + "auto/resume", { batch: batch.id, confirm: true }); render(); void follow(); return;
      }
      if (action === "cancel" && state.batch?.proposal_review) {
        button.disabled = true;
        state = await call<AutoState>(SLOP + "auto/cancel", {batch: state.batch.id});
        notice = "Proposte annullate.";
        render(); return;
      }
      if (action === "prepare" && preview) {
        const selected = preview, count = selected.references.length;
        if (!window.confirm(`Preparare ${count} proposte con ${selected.config.text_model}? Massimo ${count} ${count === 1 ? "chiamata" : "chiamate"}. Potrai controllare le premesse prima di generare le immagini.`)) return;
        button.disabled = true;
        state = await call<AutoState>(SLOP + "auto/prepare", {preview: selected.token, count, confirm: true});
        render(); void follow(); return;
      }
      if (action === "start" && state.batch?.proposal_review) {
        const batch = state.batch, count = validProposals(batch).length, c = batch.config;
        if (!window.confirm(`Generare ${count} SLOP sulle ${batch.slots} REAL estratte? Massimo ${imageCalls(batch, count)} chiamate: fino a ${count*c.max_generation_attempts} immagini con ${c.image_model} (${c.quality}), altrettante valutazioni con ${c.text_model}, più ${count} analisi dei tag dopo accettazione. Tolleranza ${c.editorial_tolerance}.`)) return;
        button.disabled = true;
        state = await call<AutoState>(SLOP + "auto/start", {batch: batch.id, count, confirm: true});
        render(); void follow();
      }
    } catch (error) { if (action === "prepare" || action === "preview") preview = null; notice = errorText(error); await load(); }
  });

  observeLibrary(() => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (!running) void load(); }, 400); });
  return { refresh, selectGallery(id: string) {
    if (id === galleryId) return;
    galleryId = id;
    preview = null;
    notice = "";
    quantity = 1;
    extraction++;
    render();
  } };
}

