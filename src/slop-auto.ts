/** The SLOP wizard of a gallery (owner decisions of 2026-11-22, specification `generazione-slop`): choice of the REAL from a corrected
 * extraction the owner edits, proposals written by the owner or asked to the model for each REAL, choice of the proposals, premise and
 * prompt prepared by the model and editable, generation on the server; the review of the images is the studio's (src/slop-studio.ts).
 * On the dashboard the same module only shows the catalogue balance and the link to the open batch. */
import "./slop-auto.css";
import { prepareItemCopy, type TreatableItem } from "./game-copy";
import { escape } from "../shared/html";
import { onLongPress, openPreview } from "./image-preview";
import { withPhotoProcessing } from "./photo-processing";
import { type Gallery } from "./galleries";

interface AutoImage { id: string; status: string; index: number | null; copy: boolean }
interface Config { max_generation_attempts: number; editorial_tolerance: number; text_model: string; image_model: string; quality: string }
interface Idea { id: string; idea: string; genre: string; changes: string; status: "proposed" | "approved" | "used"; state: "proposed" | "approved" | "used" | "review"; busy: boolean; model: string }
interface Reference { id: string; title: string; description: string; file: string; original: string; idea: {id: string; idea: string; genre: string; changes: string} | null }
interface Candidate extends Reference { levels: {crowdedness: number; detail: number} | null; ideas: Idea[]; ideas_reason: string }
interface Candidates { gallery: {id: string; title: string}; max_batch: number; paid_calls: boolean; candidates: Candidate[] }
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
  /** The open batch to show in the review (step 7) or nothing. */
  batch?: (batchId: string | null) => Promise<void>;
  review?: (batchId: string) => void;
  openGallery?: (galleryId: string) => void;
  changed?: () => Promise<void>;
  indicator?: (gallery: Gallery | undefined) => void;
}

const LIBRARY = "/api/admin/library", SLOP = LIBRARY + "/slop/";
const STEPS = ["Galleria", "REAL", "Proposte", "Scelta", "Prompt", "Generazione", "Revisione"];
const MAX_IDEAS = 3;
const IDEA_STATE: Record<Idea["state"], string> = { proposed: "proposta dal modello", approved: "approvata", used: "usata", review: "da rivedere" };
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

async function call<T>(url: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", method: method || (body === undefined ? "GET" : "POST"),
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
      && !/\/(copy|metrics|ideas)(\?|$)/.test(url) && !/\/ideas\//.test(url)) observed?.();
    return response;
  };
}

/** A proposal that can be chosen: not used and not in another batch. */
const choosable = (idea: Idea) => idea.state !== "used" && !idea.busy;

export function mountSlopAuto(root: HTMLElement | null, controls: HTMLElement | null, galleryId: string, hooks: Hooks) {
  let state: AutoState | null = null, list: Candidates | null = null, running = false, copying = false, busy = false;
  let quantity = 3, progress = "", notice = "", timer = 0, check = 0;
  // Steps 2-4 live in the browser until the first confirmation, per gallery and tab.
  const draftKey = "ros-slop-wizard-v1:" + galleryId;
  let draft: {step: 2 | 3 | 4; selection: string[]; chosen: string[]} = {step: 2, selection: [], chosen: []};
  try {
    const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null") as typeof draft | null;
    if (saved && [2, 3, 4].includes(saved.step) && Array.isArray(saved.selection) && Array.isArray(saved.chosen)) draft = saved;
  } catch { /* private browsing */ }
  const keep = () => { try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* private browsing */ } };

  const candidate = (id: string) => list?.candidates.find(c => c.id === id);
  const selected = () => draft.selection.map(candidate).filter((c): c is Candidate => !!c);
  /** Chosen proposals still choosable, in the order of the selected REAL. */
  const chosenIdeas = () => selected().flatMap(c => c.ideas.filter(i => draft.chosen.includes(i.id) && choosable(i)).map(i => ({real: c, idea: i})));
  const validProposals = (batch: AutoBatch) => batch.processes.filter(p => p.state === "ready" && p.premise);
  const settings = (c: Config) => `Immagini: ${c.image_model}, qualità ${c.quality}. Prompt e valutazioni: ${c.text_model}. Tentativi massimi: ${c.max_generation_attempts} per SLOP. Tolleranza: ${c.editorial_tolerance}.`;
  const imageCalls = (batch: AutoBatch, size: number) => size * 2 * batch.config.max_generation_attempts;
  const levels = (c: Candidate) => c.levels ? `<span class="hint">affollamento ${c.levels.crowdedness}, dettaglio ${c.levels.detail}</span>` : "";
  const thumb = (r: Reference) => `<button type="button" class="slop-auto-photo" data-auto-reference="${escape(r.id)}" aria-label="Ingrandisci ${escape(r.title)}" data-long-press><img src="${escape(r.file)}" alt="" draggable="false"></button>`;
  const stepper = (current: number) => `<ol class="rw-steps slop-wizard-steps">${STEPS.map((label, i) =>
    `<li ${current === i + 1 ? 'aria-current="step"' : ""}>${i + 1}. ${label}</li>`).join("")}</ol>`;

  const stepReal = () => {
    const all = list?.candidates || [];
    return `<section data-wizard-step="real"><h3>Scegli le REAL</h3>
      <p class="hint">L’estrazione è gratuita e favorisce affollamento e dettaglio meno rappresentati fra le SLOP già nate da proposte della galleria, perché le SLOP non diventino più semplici delle REAL. Poi togli o aggiungi REAL a mano.</p>
      <div class="slop-auto-actions"><label>REAL da estrarre<input id="slop-auto-size" type="number" min="1" max="${list?.max_batch || 10}" value="${quantity}"></label>
        <button type="button" data-auto="preview" ${all.length ? "" : "disabled"}>Estrai le REAL</button></div>
      <p role="status">${draft.selection.length} ${draft.selection.length === 1 ? "REAL scelta" : "REAL scelte"} su ${all.length} disponibili.</p>
      ${all.length ? `<ul class="slop-auto-references slop-wizard-candidates">${[...all].sort((a, b) => Number(draft.selection.includes(b.id)) - Number(draft.selection.includes(a.id)))
        .map(c => `<li data-reference="${escape(c.id)}" class="${draft.selection.includes(c.id) ? "is-selected" : ""}">${thumb(c)}
          <label><input type="checkbox" data-select-real="${escape(c.id)}" ${draft.selection.includes(c.id) ? "checked" : ""}> <strong>${escape(c.title)}</strong></label>${levels(c)}</li>`).join("")}</ul>`
        : '<p>Nessuna REAL approvata o pubblicata in questa galleria.</p>'}
      <div class="slop-auto-actions"><button type="button" class="primary" data-auto="to-ideas" ${draft.selection.length ? "" : "disabled"}>Avanti: proposte</button></div></section>`;
  };
  const stepIdeas = () => {
    const reals = selected(), missing = reals.filter(c => !c.ideas.some(choosable) && c.ideas.length < MAX_IDEAS);
    const chosen = chosenIdeas().length, max = list?.max_batch || 10;
    return `<section data-wizard-step="ideas"><h3>Proposte per ogni REAL</h3>
      <p class="hint">Scrivi una proposta o chiedila al modello (fino a ${MAX_IDEAS} per REAL). Spunta quelle da generare: ognuna dà una SLOP, anche più d’una dalla stessa REAL. Le proposte restano salvate sulla REAL per i batch successivi; quelle usate non si ripetono.</p>
      ${list?.paid_calls && missing.length ? `<div class="slop-auto-actions"><button type="button" data-auto="ask-all">Chiedi al modello per ${missing.length} ${missing.length === 1 ? "REAL" : "REAL"} senza proposte (${missing.length} ${missing.length === 1 ? "chiamata" : "chiamate"})</button></div>` : ""}
      <ol class="slop-wizard-reals">${reals.map(c => `<li data-real="${escape(c.id)}"><div class="slop-wizard-real-head">${thumb(c)}<div><strong>${escape(c.title)}</strong> ${levels(c)}</div></div>
        ${!c.ideas.length && c.ideas_reason ? `<p class="hint">Il modello non ha proposto idee: ${escape(c.ideas_reason)}</p>` : ""}
        <ul class="slop-wizard-ideas">${c.ideas.map(i => `<li data-idea="${escape(i.id)}">
          ${choosable(i) ? `<label class="slop-wizard-choose"><input type="checkbox" data-choose="${escape(i.id)}" ${draft.chosen.includes(i.id) ? "checked" : ""}> Genera da questa proposta</label>` : ""}
          <span class="badge">${i.model === "owner" ? "scritta da te" : IDEA_STATE[i.state]}${i.busy ? ", in un batch in corso" : ""}</span>
          ${choosable(i) ? `<textarea data-idea-text="${escape(i.id)}" rows="2" maxlength="600" aria-label="Proposta">${escape(i.idea)}</textarea>` : `<p>${escape(i.idea)}</p>`}
          ${i.genre || i.changes ? `<p class="hint">${escape([i.genre, i.changes].filter(Boolean).join(". "))}</p>` : ""}
          ${i.state !== "used" && !i.busy ? `<button type="button" data-discard="${escape(i.id)}">Scarta</button>` : ""}</li>`).join("")}</ul>
        ${c.ideas.length < MAX_IDEAS ? `<div class="slop-wizard-own"><label>Scrivi una proposta<textarea data-own="${escape(c.id)}" rows="2" maxlength="600" placeholder="La scena da generare: soggetto, ambiente, punto di vista, luce"></textarea></label>
          <div class="slop-auto-actions"><button type="button" data-add-own="${escape(c.id)}">Aggiungi la proposta</button>
          ${list?.paid_calls ? `<button type="button" data-ask="${escape(c.id)}">Chiedi al modello (1 chiamata)</button>` : ""}</div></div>` : ""}</li>`).join("")}</ol>
      <p role="status" data-chosen-count>Proposte scelte: ${chosen}${chosen > max ? `, oltre il massimo di ${max} per batch` : ` su un massimo di ${max}`}.</p>
      <div class="slop-auto-actions"><button type="button" data-auto="to-real">Indietro: REAL</button><button type="button" class="primary" data-auto="to-choice" ${chosen && chosen <= max ? "" : "disabled"}>Avanti: scelta</button></div></section>`;
  };
  const stepChoice = () => {
    const chosen = chosenIdeas(), c = state?.config;
    return `<section data-wizard-step="choice"><h3>Proposte scelte: ${chosen.length}</h3>
      <ol class="slop-wizard-chosen">${chosen.map(({real, idea}) => `<li>${thumb(real)}<div><strong>${escape(real.title)}</strong><p>${escape(idea.idea)}</p></div></li>`).join("")}</ol>
      ${c ? `<p class="hint">${escape(settings(c))}</p>` : ""}
      <p class="hint">Il modello scrive premessa e prompt per ogni proposta, con l’originale intero della REAL: massimo ${chosen.length} ${chosen.length === 1 ? "chiamata" : "chiamate"}. Potrai correggerli prima di generare le immagini.</p>
      <div class="slop-auto-actions"><button type="button" data-auto="to-ideas">Indietro: proposte</button>
        <button type="button" class="primary" data-auto="prepare" ${state?.paid_calls && chosen.length ? "" : "disabled"}>Crea i prompt (${chosen.length} ${chosen.length === 1 ? "chiamata" : "chiamate"})</button></div>
      ${state?.paid_calls ? "" : '<p class="hint">Manca la chiave OpenAI.</p>'}</section>`;
  };
  const stepPrompts = (batch: AutoBatch) => {
    const review = batch.proposal_review!, valid = validProposals(batch).length;
    const live = !!batch.runner?.alive, prompting = batch.processes.some(p => p.state === "prompting");
    if (!live) nextCheck(prompting ? 10_000 : review.expires - Date.now() + 100);
    return `<section data-proposal-review aria-labelledby="proposal-title"><h3 id="proposal-title">Premesse e prompt</h3>
      <p role="status">${review.invalid ? "La galleria o le REAL sono cambiate. Annulla e ricomincia."
        : live || prompting ? "Preparazione dei prompt sul server…" : `${valid} ${valid === 1 ? "proposta valida" : "proposte valide"} su ${batch.slots}. Correggi premessa e prompt se serve: si salvano da soli.`}</p>
      ${batch.prompts_error ? `<p class="hint">${escape(batch.prompts_error)}</p>` : ""}
      <ul class="slop-auto-references slop-auto-proposals">${review.references.map(({slot, real}) => {
        const p = batch.processes.find(p => p.slot === slot), editable = !!p?.premise && p.state === "ready" && !live && !review.invalid;
        return `<li data-reference="${escape(real?.id || "")}"><div>${real ? `${thumb(real)}<strong>${escape(real.title)}</strong>${real.idea ? `<p class="hint" data-idea>Proposta: ${escape(real.idea.idea)}</p>` : ""}` : "<p>REAL modificata o non disponibile.</p>"}</div>
          <div>${p?.premise ? (editable ? `<label>Premessa<textarea data-premise="${slot}" rows="2" maxlength="500">${escape(p.premise)}</textarea></label>
              <label>Prompt inglese<textarea data-prompt="${slot}" rows="5" maxlength="4000" lang="en">${escape(p.prompt)}</textarea></label>`
            : `<p data-premise-text>${escape(p.premise)}</p><details><summary>Prompt inglese</summary><p lang="en">${escape(p.prompt)}</p></details>`)
            : `<p>${escape(p?.error || (p?.state === "draft" && !live ? "Prompt non preparato." : "In attesa del prompt…"))}</p>`}</div></li>`;
      }).join("")}</ul>
      <p class="hint">Scadenza ${new Date(review.expires).toLocaleTimeString("it-IT", {hour: "2-digit", minute: "2-digit"})}. Massimo ${imageCalls(batch, valid)} chiamate rimanenti.</p>
      <p class="hint">${escape(settings(batch.config))}</p>
      ${state?.paid_calls ? "" : '<p class="hint">Manca la chiave OpenAI.</p>'}
      <div class="slop-auto-actions">${valid && !review.invalid && !live && !prompting ? `<button type="button" class="primary" data-auto="start" ${state?.paid_calls ? "" : "disabled"}>Conferma e genera ${valid} SLOP</button>` : ""}
      ${!live && !review.invalid && batch.processes.some(p => p.state === "draft") ? '<button type="button" data-auto="resume">Riprendi i prompt</button>' : ""}
      <button type="button" data-auto="cancel">Annulla</button></div></section>`;
  };

  const render = () => {
    const activeBatch = state?.batch, balance = state?.balance;
    const batch = activeBatch?.gallery_id === galleryId ? activeBatch : null;
    const activeGallery = state?.galleries.find(g => g.id === activeBatch?.gallery_id);
    window.clearTimeout(check);
    hooks.indicator?.(activeGallery);
    if (root) {
      root.innerHTML = balance && balance.real !== balance.slop ? `<p role="status"><strong>Dataset sbilanciato</strong>: ${balance.real} REAL e ${balance.slop} SLOP approvate o pubblicate; ${balance.pending} SLOP nuove da decidere.${balance.missing ? ` Mancano ${balance.missing} SLOP al pareggio, contando le nuove.` : ""}</p>` : "";
      root.hidden = !root.innerHTML;
    }
    if (!controls) return;
    let html = "";
    if (activeBatch && !batch) {
      html = stepper(1) + (activeGallery ? `<p>Batch aperto in <strong>${escape(activeGallery.title)}</strong>: un batch alla volta.</p>
        <button type="button" data-auto="open-gallery">Apri il batch</button>` : '<p>È già aperto un batch in un’altra galleria.</p>');
    } else if (batch?.proposal_review) {
      html = stepper(5) + stepPrompts(batch);
    } else if (batch && batch.status === "running") {
      html = stepper(6) + `<p><strong>Generazione</strong>: ${batch.attempted.length} di ${batch.slots} SLOP inviate al generatore.</p>
        <p class="slop-auto-progress" role="status">${escape(batch.runner?.alive ? progress || "Generazione in corso sul server…" : "Generazione ferma sul server: si riprende da dove si è interrotta, senza ripetere chiamate già inviate.")}</p>
        <p class="hint">La generazione continua sul server anche se chiudi questa pagina.</p>
        <div class="slop-auto-actions">${batch.runner?.alive ? "" : '<button type="button" class="primary" data-auto="resume">Riprendi sul server</button>'}<button type="button" data-auto="stop">Interrompi</button></div>`;
    } else if (batch) {
      const left = batch.processes.filter(p => ["draft", "ready", "retry"].includes(p.state)).length;
      html = stepper(7) + `<p><strong>Revisione</strong>: ${batch.undecided} di ${batch.images.length} ${batch.images.length === 1 ? "SLOP" : "SLOP"} da decidere. Prepara inquadratura e trattamento, poi approva o scarta ogni SLOP qui sotto.
        Esaurite: ${batch.processes.filter(p => p.state === "exhausted").length}; sospese: ${batch.processes.filter(p => ["review_needed", "uncertain", "failed"].includes(p.state)).length}.</p>
        ${left ? `<p class="hint">${left} SLOP ancora da generare dalle proposte confermate.</p>` : ""}
        <div class="slop-auto-actions">${left && !batch.runner?.alive ? '<button type="button" class="primary" data-auto="resume">Riprendi sul server</button>' : ""}<button type="button" data-auto="review">Apri nella galleria</button>${batch.undecided ? "" : '<button type="button" data-auto="close">Chiudi il batch</button>'}</div>`;
    } else if (state && list) {
      html = stepper(draft.step) + (draft.step === 2 ? stepReal() : draft.step === 3 ? stepIdeas() : stepChoice());
    } else if (state) html = stepper(2) + '<p class="admin-loading" role="status">Caricamento delle REAL…</p>';
    if (busy && progress) html += `<p class="slop-auto-progress" role="status">${escape(progress)}</p>`;
    if (notice) html += `<p class="slop-auto-notice" role="status">${escape(notice)}</p>`;
    controls.innerHTML = html;
    if (busy) controls.querySelectorAll<HTMLButtonElement>("button").forEach(b => { b.disabled = true; });
    void hooks.batch?.(batch && !batch.proposal_review && batch.status === "review" ? batch.id : null);
  };

  const load = async () => {
    try {
      const previous = state?.batch?.proposal_review;
      state = await call<AutoState>(SLOP + "auto");
      if (state.expired || (previous && !state.batch && previous.expires <= Date.now())) notice = "Prompt scaduti. Riparti dalla scelta delle proposte.";
      if (controls && !state.batch) {
        list = await call<Candidates>(SLOP + "auto/candidates?" + new URLSearchParams({gallery: galleryId}));
        // REAL no longer available leave the selection; proposals no longer choosable leave the choice.
        draft.selection = draft.selection.filter(id => candidate(id));
        draft.chosen = draft.chosen.filter(id => list!.candidates.some(c => c.ideas.some(i => i.id === id && choosable(i))));
        if (!draft.selection.length) draft.step = 2;
        keep();
      }
    }
    catch (error) { notice = errorText(error); }
    render();
  };
  const nextCheck = (delay: number) => {
    window.clearTimeout(check);
    check = window.setTimeout(() => { void refresh(); }, Math.max(2000, delay));
  };
  const refresh = async () => {
    await load();
    if (state?.batch?.status === "running" && state.batch.runner?.alive) void follow();
    else if (state?.batch?.status === "review") void pickup().then(async copied => {
      if (copied) { await load(); await hooks.changed?.(); }
    });
  };
  /** Prepare the game copies in the browser after acceptance. */
  const pickup = async () => {
    const batch = state?.batch;
    if (!batch || running || copying) return false;
    copying = true;
    let copied = false;
    try {
      for (const image of batch.images) {
        if (image.status !== "new" || image.copy) continue;
        progress = "Copia di gioco di un'immagine del batch…"; render();
        await prepareItemCopy(await call<TreatableItem>(LIBRARY + "/" + encodeURIComponent(image.id)));
        copied = true;
      }
    } catch (error) { notice = errorText(error); }
    finally { copying = false; progress = ""; render(); }
    return copied;
  };
  /** The loop runs on Cloudflare: the page only follows it, and closing it stops nothing. */
  const follow = async () => {
    if (running) return;
    running = true;
    try {
      while (state?.batch && state.batch.runner?.alive) {
        const b = state.batch;
        const attempts = b.processes.reduce((n, p) => n + p.attempts.length, 0), accepted = b.processes.filter(p => p.state === "accepted").length;
        progress = b.proposal_review ? "Preparazione dei prompt sul server…"
          : `Sul server: ${attempts} ${attempts === 1 ? "tentativo" : "tentativi"}, ${accepted} ${accepted === 1 ? "SLOP accettata" : "SLOP accettate"} su ${b.slots}…`;
        render();
        await new Promise(resolve => window.setTimeout(resolve, 3000));
        await load();
      }
    } finally { running = false; progress = ""; }
    if (state?.batch?.status === "review") { await pickup(); notice = notice || "SLOP generate: preparale e decidile nella revisione."; }
    await load(); await hooks.changed?.();
  };

  observeLibrary(() => { window.clearTimeout(timer); timer = window.setTimeout(() => { if (!running) void load(); }, 400); });
  if (!controls) return { refresh };
  const updateCandidate = (item: {id: string; ideas?: Idea[]; ideas_reason?: string}) => {
    const c = candidate(item.id);
    if (c) { c.ideas = item.ideas || []; c.ideas_reason = item.ideas_reason || ""; }
  };
  const askModel = async (ids: string[]) => {
    const failed: string[] = [];
    for (const [index, id] of ids.entries()) {
      progress = ids.length > 1 ? `Proposte dal modello: ${index + 1} di ${ids.length}…` : "Proposte dal modello…"; render();
      try {
        updateCandidate(await call(LIBRARY + "/" + encodeURIComponent(id) + "/ideas", {confirm: true, request: crypto.randomUUID()}));
      } catch (error) {
        const text = errorText(error);
        failed.push(`${candidate(id)?.title || id}: ${text}`);
        if (text.startsWith("OpenAI:")) break;
      }
    }
    notice = failed.length ? "Non riuscite: " + failed.join(" / ") : "Proposte pronte: spunta quelle da generare.";
  };

  controls.addEventListener("input", event => {
    const input = event.target as HTMLInputElement;
    if (input.id === "slop-auto-size") quantity = Number(input.value);
  });
  controls.addEventListener("change", async event => {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (input instanceof HTMLInputElement && input.dataset.selectReal) {
      const id = input.dataset.selectReal;
      draft.selection = input.checked ? [...new Set([...draft.selection, id])] : draft.selection.filter(x => x !== id);
      keep(); render(); return;
    }
    if (input instanceof HTMLInputElement && input.dataset.choose) {
      const id = input.dataset.choose;
      draft.chosen = input.checked ? [...new Set([...draft.chosen, id])] : draft.chosen.filter(x => x !== id);
      keep(); render(); return;
    }
    try {
      if (input.dataset.ideaText) {
        updateCandidate(await call(LIBRARY + "/ideas/" + encodeURIComponent(input.dataset.ideaText), {idea: input.value}, "PATCH"));
        notice = "Proposta salvata."; render(); return;
      }
      const batch = state?.batch;
      if ((input.dataset.premise || input.dataset.prompt) && batch?.proposal_review) {
        const slot = Number(input.dataset.premise ?? input.dataset.prompt);
        await call(SLOP + "auto/proposal", {batch: batch.id, slot, [input.dataset.premise !== undefined ? "premise" : "prompt"]: input.value});
        notice = input.dataset.premise !== undefined ? "Premessa salvata." : "Prompt salvato.";
        await load();
      }
    } catch (error) { notice = errorText(error); await load(); }
  });
  const showReference = (element: HTMLElement) => {
    const key = element.dataset.autoReference;
    const ref = candidate(key || "") || state?.batch?.proposal_review?.references.find(r => r.real?.id === key)?.real;
    if (!ref) return;
    openPreview({src: ref.original, alt: "Originale REAL intero", title: ref.title, description: ref.description});
  };
  onLongPress(controls, "[data-auto-reference]", showReference);
  controls.addEventListener("click", async event => {
    const reference = (event.target as HTMLElement).closest<HTMLElement>("[data-auto-reference]");
    if (reference) { showReference(reference); return; }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button || !state || busy) return;
    const action = button.dataset.auto || "";
    const active = state.batch;
    if (action === "open-gallery" && active) { hooks.openGallery?.(active.gallery_id); return; }
    if (active && active.gallery_id !== galleryId) return;
    notice = "";
    try {
      if (action === "to-real" || action === "to-ideas" || action === "to-choice") {
        draft.step = action === "to-real" ? 2 : action === "to-ideas" ? 3 : 4; keep(); render();
        controls.querySelector(".slop-wizard-steps")?.scrollIntoView({block: "start"});
        return;
      }
      if (action === "preview") {
        const input = controls.querySelector<HTMLInputElement>("#slop-auto-size")!;
        if (!input.reportValidity()) return;
        const extraction = await call<{references: Reference[]}>(SLOP + "auto/preview", {size: Number(input.value), gallery_id: galleryId});
        draft.selection = extraction.references.map(r => r.id); keep();
        notice = `Estratte ${draft.selection.length} REAL: togli o aggiungi quelle che vuoi.`; render(); return;
      }
      if (button.dataset.addOwn) {
        const id = button.dataset.addOwn, field = controls.querySelector<HTMLTextAreaElement>(`[data-own="${CSS.escape(id)}"]`)!;
        if (!field.value.trim()) { field.focus(); return; }
        const item = await call<{id: string; ideas: Idea[]}>(LIBRARY + "/" + encodeURIComponent(id) + "/ideas", {idea: field.value});
        updateCandidate(item);
        const added = item.ideas.filter(i => i.model === "owner").at(-1);
        if (added) draft.chosen = [...new Set([...draft.chosen, added.id])];
        keep(); notice = "Proposta aggiunta e scelta."; render(); return;
      }
      if (button.dataset.discard) {
        if (!window.confirm("Scartare questa proposta? Non si può recuperare.")) return;
        const id = button.dataset.discard;
        updateCandidate(await call(LIBRARY + "/ideas/" + encodeURIComponent(id), {}, "DELETE"));
        draft.chosen = draft.chosen.filter(x => x !== id); keep(); render(); return;
      }
      if (button.dataset.ask || action === "ask-all") {
        const ids = button.dataset.ask ? [button.dataset.ask]
          : selected().filter(c => !c.ideas.some(choosable) && c.ideas.length < MAX_IDEAS).map(c => c.id);
        const names = ids.length === 1 ? `«${candidate(ids[0])?.title}»` : `${ids.length} REAL`;
        if (!window.confirm(`Chiedere proposte per ${names} a ${state.config.text_model}? Massimo ${ids.length} ${ids.length === 1 ? "chiamata" : "chiamate"} a pagamento, una per REAL, mai ripetute in automatico. Le proposte non scelte del modello vengono sostituite; quelle scritte da te, approvate o usate restano.`)) return;
        busy = true;
        await withPhotoProcessing("Preparo le proposte…", () => askModel(ids));
        busy = false; progress = ""; render(); return;
      }
      if (action === "close" && active) { state = await call<AutoState>(SLOP + "auto/close", {batch: active.id}); await load(); return; }
      if (action === "review" && state.batch) { hooks.review?.(state.batch.id); return; }
      if (action === "stop" && active) { await call(SLOP + "auto/stop", {batch: active.id}); notice = "Batch interrotto: il server si ferma prima della prossima chiamata."; await load(); return; }
      if (action === "resume") {
        const batch = state.batch;
        if (!batch) return;
        const remaining = batch.processes.filter(p => p.state === "draft").length;
        const question = batch.proposal_review
          ? `Riprendere i prompt sul server? Massimo ${remaining} ${remaining === 1 ? "chiamata" : "chiamate"} con ${batch.config.text_model} per i prompt ancora da preparare.`
          : "Riprendere il batch sul server entro il massimo di chiamate confermato all’avvio?";
        if (!window.confirm(question)) return;
        button.disabled = true; state = await call<AutoState>(SLOP + "auto/resume", { batch: batch.id, confirm: true }); render(); void follow(); return;
      }
      if (action === "cancel" && state.batch?.proposal_review) {
        button.disabled = true;
        state = await call<AutoState>(SLOP + "auto/cancel", {batch: state.batch.id});
        notice = "Prompt annullati: le proposte restano sulle REAL."; draft.step = 3; keep();
        await load(); return;
      }
      if (action === "prepare") {
        const chosen = chosenIdeas(), count = chosen.length;
        if (!count) return;
        if (!window.confirm(`Creare premessa e prompt per ${count} ${count === 1 ? "proposta" : "proposte"} con ${state.config.text_model}? Massimo ${count} ${count === 1 ? "chiamata" : "chiamate"}. Potrai correggerli prima di generare le immagini.`)) return;
        button.disabled = true;
        state = await call<AutoState>(SLOP + "auto/prepare", {gallery_id: galleryId, ideas: chosen.map(c => c.idea.id), count, request: crypto.randomUUID(), confirm: true});
        draft = {step: 2, selection: [], chosen: []}; keep();
        render(); void follow(); return;
      }
      if (action === "start" && state.batch?.proposal_review) {
        const batch = state.batch, count = validProposals(batch).length, c = batch.config;
        if (!window.confirm(`Generare ${count} SLOP? Massimo ${imageCalls(batch, count)} chiamate: fino a ${count*c.max_generation_attempts} immagini con ${c.image_model} (${c.quality}), altrettante valutazioni con ${c.text_model}. Tolleranza ${c.editorial_tolerance}.`)) return;
        button.disabled = true;
        state = await call<AutoState>(SLOP + "auto/start", {batch: batch.id, count, confirm: true});
        render(); void follow();
      }
    } catch (error) { busy = false; progress = ""; notice = errorText(error); await load(); }
  });

  return { refresh };
}
