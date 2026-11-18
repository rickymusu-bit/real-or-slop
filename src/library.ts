/** Admin dashboard (spec `dashboard-admin-wizard-real`, section 2): the five sections, the loading notice, the box of
 * the automatic SLOP batches; the Database section (spec `database-immagini`: views, filters, sorting, cards with press-and-hold
 * preview, selection, detail with editing, crop, analysis, regeneration, observed tags of a generated SLOP, distribution) and Settings
 * (spec `statistiche-impostazioni`: models, model context, vocabulary, leaderboard, thresholds, open games). */
import "./library.css";
import { mountAdminWorkspace } from "./admin-workspace";
import { descriptionFields, readDescription } from "./editorial-ui";
import type { RealDescription } from "../shared/editorial";
import "./admin-navigation.css";
import "./caption-count.css";
import "./admin-loading.css";
import "./model-context.css";
import { mountSlopStudio } from "./slop-studio";
import { mountSlopAuto } from "./slop-auto";
import { mountStats, type Stats } from "./stats";
import { mountDistribution, type Distribution } from "./database-chart";
import "./database.css";
import { CATEGORIES, CATEGORY_LABELS, isCategory, type Category } from "../shared/tag-categories";
import { imageLabel } from "../shared/image-label";
import { categoryOf, categorySelect, legend, pill, sortByCategory, suggestedCategory } from "./tag-ui";
import { mountRealWizard, type RealWizard } from "./real-wizard";
import { onLongPress, openPreview } from "./image-preview";
import { content, escape } from "./main";
import { type TreatableItem, measureMissing, prepareItemCopy, remakeCopies, saveFrame } from "./game-copy";
import { chooseTreatment } from "./treatment-editor";
import { METRICS_VERSION, type Metrics, type Treatment } from "../shared/copy-treatment";
import { chooseFrame } from "./crop-editor";
import { FORMAT_LABELS, type Crop } from "../shared/game-copy";
import { markGameMedia } from "./media-mark";
import { tagFromInput } from "../shared/tag-input";

type Status = "new" | "approved" | "published" | "trash";
interface Item extends TreatableItem {
  id: string; origin: "REAL" | "SLOP"; status: Status; trashed_from: Status | null; title?: string; description: string;
  commons_description: string | null; real_description: RealDescription | null; source_url: string; author: string; license_name: string; license_url: string;
  prompt: string; model: string; width: number; height: number; copy: { width: number; height: number; bytes: number; crop: Crop | null; sha256: string | null } | null;
  rights_confirmed: boolean; revision: number; tags: string[]; file: string; updated_at: string; created_at: string;
  analysis: { status: "none" | "running" | "done" | "uncertain" | "failed"; error: string; at: string | null };
  generated: { tags: string[] } | null;
  categories: Record<string, string>;
  stats: { views: number; correct: number }; in_play: number; no_derivatives: boolean;
  reference_state?: "pending" | "unapproved" | "approved" | null;
  missing_categories: string[]; completable: boolean;
  metrics: Metrics | null; treatment: Treatment | null; copy_sha?: string;
}
interface Analysis { enabled: boolean; reason: string; model: string; calls_30_days: { total: number; uncertain: number; input_tokens: number; output_tokens: number }; note: string }
interface ModelOption { id: string; available: boolean | null; qualities?: string[]; shutdown?: string | null }
interface Models { text_model: string; image_model: string; image_quality: string; text_models: ModelOption[]; image_models: ModelOption[]; note: string }
interface ContextVersion { id: string; body: string; created_at: string; pipeline: number; used: number }
interface ContextState { max: number; parts: { part: string; current: { id: string; body: string }; history: ContextVersion[]; outdated?: boolean; proposed?: string | null }[] }
interface Tag { label: string; category: Category; images: number; aliases: string[] }
const API = "/api/admin/library";
const STATUS_LABEL: Record<string, string> = { library: "Tutte", new: "Nuove", approved: "Approvate", published: "Pubblicate", trash: "Cestino" };
const STATE_LABEL: Record<Status, string> = { new: "nuova", approved: "approvata", published: "pubblicata", trash: "nel cestino" };
/** A section still loading: a short line with a spinner (src/admin-loading.css). */
const loading = (text = "Caricamento…") => `<p class="admin-loading" role="status">${text}</p>`;
const FIELDS: [keyof Item, string, number, boolean][] = [
  ["title", "Titolo", 200, false], ["description", "Descrizione", 1000, true], ["source_url", "Pagina della fonte", 1000, false],
  ["author", "Autore", 300, false], ["license_name", "Licenza", 200, false], ["license_url", "Indirizzo della licenza", 1000, false],
  ["prompt", "Prompt (SLOP)", 4000, true], ["model", "Modello (SLOP)", 100, false],
];

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, { credentials: "same-origin", ...options,
    headers: options.body instanceof Blob || options.body instanceof ArrayBuffer ? options.headers : { "Content-Type": "application/json", ...options.headers } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Error(data.error || "Connessione non disponibile");
  return data;
}
interface Conflict { label: string; proposed: string; existing: string }
/** Tags the model proposed in a category other than the vocabulary's: the vocabulary wins, so the owner must hear about them (a Genre
 * proposed as «mugshot» while «mugshot» is in Altro leaves the image without a Genre). */
const conflictText = (list: Conflict[] = []) => list.length ? " Categorie in conflitto, da sistemare nel vocabolario: " + list.map(c =>
  `«${c.label}» proposto come ${CATEGORY_LABELS[c.proposed as Category] || c.proposed}, nel vocabolario è ${CATEGORY_LABELS[c.existing as Category] || c.existing}`).join("; ") + "." : "";
const kb = (bytes: number) => bytes < 1024 ? bytes + " byte" : Math.round(bytes / 1024) + " kB";

interface Deletion { deleted: number; postponed: number; awaiting_slop?: number }
const deletionText = ({ deleted, postponed, awaiting_slop = 0 }: Deletion) =>
  (deleted === 1 ? "1 immagine eliminata definitivamente." : `${deleted} immagini eliminate definitivamente.`) +
  (postponed === 1 ? " 1 immagine resta nel cestino." : postponed ? ` ${postponed} immagini restano nel cestino.` : "") +
  (awaiting_slop ? ` ${awaiting_slop} REAL ${awaiting_slop === 1 ? "attende" : "attendono"} l’approvazione della SLOP o la chiusura del processo senza SLOP.` : "") +
  (postponed > awaiting_slop ? " Le immagini ancora in gioco potranno essere eliminate al termine delle partite in corso." : "");

export async function showLibrary() {
  let items: Item[] = [], selected = new Set<string>(), open: Item | null = null, busy = false;
  const SORT_KEY = "ros-library-sort";
  let sort = { by: "added", order: "desc" };
  try { const saved = JSON.parse(localStorage.getItem(SORT_KEY) || "null") as typeof sort | null;
    if (saved && ["added", "views", "accuracy"].includes(saved.by) && ["asc", "desc"].includes(saved.order)) sort = saved; } catch { /* private browsing */ }
  let measuring = false;
  let slopStudio: { refresh: () => Promise<void> } = { refresh: async () => {} };
  const filter = { status: "library", origin: "all", tags: [] as string[], match: "all", q: "", batch: "" };
  let autoBox: { refresh: () => Promise<void> } = { refresh: async () => {} };
  let models: Models | null = null;
  let statsView: { refresh: () => Promise<void> } = { refresh: async () => {} };
  let realWizard: RealWizard | null = null;
  let distribution: { refresh: () => Promise<void> } = { refresh: async () => {} };
  let analysis: Analysis | null = null;
  content().innerHTML = `<section class="library page" aria-labelledby="library-title">
    <div class="library-head"><div><p class="admin-eyebrow">REAL or SLOP / Studio</p><h1 id="library-title">Il tuo archivio, in ordine.</h1><p class="admin-intro">Scegli le fotografie, crea le SLOP e prepara il prossimo gioco.</p></div><span id="dashboard-loading">${loading("Caricamento della dashboard…")}</span></div>
    <div id="slop-auto" class="slop-auto" role="region" aria-label="Equilibrio del dataset" hidden></div>
    <nav class="admin-tabs" aria-label="Sezioni amministrazione">
      <button type="button" data-admin-tab="real" aria-pressed="true">Caricamento REAL</button>
      <button type="button" data-admin-tab="slop" aria-pressed="false">Generazione SLOP<span id="slop-auto-count"></span><span id="slop-attention-count"></span></button>
      <button type="button" data-admin-tab="database" aria-pressed="false">Database immagini</button>
      <button type="button" data-admin-tab="stats" aria-pressed="false">Statistiche</button>
      <button type="button" data-admin-tab="settings" aria-pressed="false">Impostazioni</button>
    </nav>
    <section id="admin-real" class="admin-panel"><div id="real-wizard">${loading("Caricamento del wizard…")}</div></section>
    <section id="admin-database" class="admin-panel" hidden>
    <h2>Database immagini</h2>
    <nav class="db-tabs" aria-label="Schede del database"><button type="button" data-db-tab="images" aria-pressed="true">Immagini</button><button type="button" data-db-tab="distribution" aria-pressed="false">Distribuzione</button></nav>
    <section id="db-distribution" hidden></section>
    <div id="db-images">
    <p id="library-counts" aria-live="polite"></p><p id="library-analysis" class="hint"></p>
    <div class="db-search-row"><label>Cerca nel catalogo<input id="library-search" type="search" placeholder="ID, titolo REAL, descrizione o prompt"></label></div><details class="db-filter-panel" open><summary>Filtri e ordinamento</summary><div class="library-toolbar">
      <nav class="library-views" aria-label="Viste">${Object.entries(STATUS_LABEL).map(([key, label]) =>
        `<button type="button" data-view="${key}" aria-pressed="${key === "library"}">${label}</button>`).join("")}</nav>
      <label>Origine<select id="library-origin"><option value="all">REAL e SLOP</option><option value="REAL">REAL</option><option value="SLOP">SLOP</option></select></label>
      <div class="db-tag-filter"><span>Tag</span><div class="db-tag-entry"><input id="library-tag" list="library-tag-list" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="es. riot, Invio" aria-label="Aggiungi un tag al filtro">
        <select id="library-tag-match" aria-label="Come combinare i tag"><option value="all">con tutti i tag</option><option value="any">con almeno un tag</option></select></div>
        <div class="rw-pills" id="library-tag-pills"></div></div>
      <label>Ordina per<select id="library-sort"><option value="added">data di aggiunta</option><option value="views">visualizzazioni</option><option value="accuracy">accuratezza</option></select></label>
      <label>Ordine<select id="library-order"><option value="desc">decrescente</option><option value="asc">crescente</option></select></label>
      <datalist id="library-tag-list"></datalist>
    </div></details>
    <div class="library-add"><button type="button" id="library-select-all" hidden>Seleziona tutte</button><button type="button" id="library-empty-trash" hidden>Svuota cestino</button><span id="library-progress" role="status" aria-live="polite"></span></div>
    <p id="library-batch-filter" class="library-batch-filter" hidden><span>Batch automatico in corso: solo le sue immagini.</span><button type="button" data-batch-clear>Mostra tutte</button></p>
    <div id="library-selection" class="library-selection" hidden></div>
    <p id="library-message" role="status" aria-live="polite"></p>
    <ul id="library-grid" class="library-grid" aria-label="Immagini"><li class="library-grid-loading">${loading("Caricamento delle immagini…")}</li></ul>
    </div></section>
    <section id="admin-stats" class="admin-panel" hidden><h2>Statistiche</h2><div id="stats-body">${loading()}</div></section>
    <section id="admin-settings" class="admin-panel" hidden><h2>Impostazioni</h2>
    <p id="library-settings-message" role="status" aria-live="polite"></p>
    <details id="library-contexts" class="library-vocabulary"><summary>Contesto dei modelli</summary>
      <p class="hint">Testi fissi inviati al modello linguistico. Ogni salvataggio crea una nuova versione; le precedenti restano e si possono ripristinare. Ogni generazione registra la versione usata. Formato della risposta e controlli sui tag restano nel codice.</p>
      <div id="library-contexts-body">${loading()}</div></details>
    <details id="library-vocabulary" class="library-vocabulary"><summary>Vocabolario dei tag</summary>
      <p class="hint">Un tag sparisce con la sua ultima immagine. «Unisci» sposta le immagini sul tag che resta e trasforma l'altro in alias: chi scrive l'alias ottiene il tag.</p>
      <form id="library-merge" class="library-inline"><label>Unisci<input name="from" list="library-tag-list" required autocapitalize="none"></label><label>in<input name="into" list="library-tag-list" required autocapitalize="none"></label><button>Unisci</button></form>
      <form id="library-alias" class="library-inline"><label>Nuovo alias<input name="alias" required autocapitalize="none"></label><label>del tag<input name="into" list="library-tag-list" required autocapitalize="none"></label><button>Aggiungi alias</button></form>
      <ul id="library-vocabulary-list"></ul></details>
    <details id="library-leaderboard" class="library-vocabulary"><summary>Classifica</summary>
      <p class="hint">Chi entra in classifica riceve un codice partita, mostrato una sola volta. Se qualcuno ti mostra un codice, controllalo qui: il sito ne conserva solo l'impronta. Una voce nascosta non compare nella classifica pubblica; «Cancella» la elimina per sempre, per esempio su richiesta del giocatore.</p>
      <form id="library-code" class="library-inline"><label>Codice partita<input name="code" placeholder="ABCD-EFGH-JK" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label><button>Controlla</button></form>
      <p id="library-code-result" role="status" aria-live="polite"></p>
      <ol id="library-entries" class="library-entries"></ol></details>
    <details id="library-models" class="library-vocabulary"><summary>Modelli</summary>
      <p class="hint">Modelli OpenAI usati dalle chiamate a pagamento. Il modello di testo scrive i tag e i prompt delle SLOP, e deve leggere immagini; quello di immagini genera le SLOP. Ogni chiamata chiede conferma; il limite di spesa che conta è quello impostato sul progetto OpenAI (platform.openai.com).</p>
      <form id="library-models-form" class="library-inline"><label>Modello di testo<select name="text_model"></select></label><label>Modello di immagini<select name="image_model"></select></label><label>Qualità delle immagini<select name="image_quality"></select></label></form>
      <p id="library-models-note" class="hint"></p>
      <p class="hint">La qualità vale per lo studio SLOP e per la rigenerazione nella sezione Database.</p></details>
    <details id="library-thresholds" class="library-vocabulary"><summary>Studio SLOP</summary>
      <form id="library-thresholds-form" class="library-inline">
        <label>Tentativi massimi per SLOP<input type="number" name="max_generation_attempts" required></label><label>Tolleranza (0 rigorosa, 1 normale, 2 permissiva)<input type="number" name="editorial_tolerance" required></label>
        <button>Salva</button></form>
      <p class="hint">In Generazione SLOP scegli la modalità manuale oppure automatica e la quantità. Lo sbilanciamento del catalogo è solo una notifica. Una REAL resta occupata finché la sua SLOP esiste, anche nel cestino.</p></details>
    <details id="library-games" class="library-vocabulary"><summary>Partite</summary>
      <form id="library-games-form" class="library-inline"><label>Durata massima di una partita aperta (ore)<input type="number" name="open_game_hours" required></label><button>Salva</button></form>
      <p class="hint">Oltre questo tempo una partita non conclusa non trattiene più le copie delle foto ritirate o modificate, e la sua foto può non essere più disponibile. I livelli del gioco sono fissi nel codice.</p></details></section>
    <section id="admin-slop" class="admin-panel" hidden><h2>Generazione SLOP</h2>
      <nav class="db-tabs" aria-label="Modalità di generazione"><button type="button" data-generation-mode="manual" aria-pressed="true">Generazione manuale</button><button type="button" data-generation-mode="automatic" aria-pressed="false">Generazione automatica</button></nav>
      <section id="slop-manual"><div id="slop-studio">${loading("Caricamento dello studio SLOP…")}</div></section>
      <section id="slop-automatic" hidden><div id="slop-auto-controls">${loading()}</div></section></section>
    <dialog id="library-detail" class="library-detail" aria-labelledby="library-detail-title"></dialog>
  </section>`;
  const page = content().querySelector<HTMLElement>(".library")!;
  mountAdminWorkspace(page);
  const $ = <T extends HTMLElement>(selector: string) => page.querySelector<T>(selector)!;
  const message = (text: string) => { $("#library-message").textContent = text; };
  const settingsMessage = (text: string) => { $("#library-settings-message").textContent = text; };
  const progress = (text: string) => { $("#library-progress").textContent = text; };

  const setGenerationMode = (mode: string) => {
    $("#slop-manual").hidden = mode !== "manual";
    $("#slop-automatic").hidden = mode !== "automatic";
    page.querySelectorAll<HTMLButtonElement>("[data-generation-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.generationMode === mode)));
    sessionStorage.setItem("ros-generation-mode", mode);
  };
  page.querySelectorAll<HTMLButtonElement>("[data-generation-mode]").forEach(b => b.addEventListener("click", () => setGenerationMode(b.dataset.generationMode!)));
  setGenerationMode(sessionStorage.getItem("ros-generation-mode") === "automatic" ? "automatic" : "manual");

  let searchTimer = 0;
  $("#library-search").addEventListener("input", event => {
    filter.q = (event.target as HTMLInputElement).value.trim();
    window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { void load().catch(error => message(String(error))); }, 250);
  });
  let tagCategories = new Map<string, Category>();
  const refreshTags = async () => {
    const { tags } = await call<{ tags: Tag[] }>("/tags");
    tagCategories = new Map(tags.map(t => [t.label, isCategory(t.category) ? t.category : "other"]));
    $("#library-tag-list").innerHTML = tags.map(t => `<option value="${escape(t.label)}">${escape(t.label)} (${t.images})</option>`).join("");
    $("#library-vocabulary summary").textContent = `Vocabolario dei tag (${tags.length})`;
    // Grouped by category; the category of a tag changes for every image that uses it.
    $("#library-vocabulary-list").innerHTML = CATEGORIES.map(c => [c, tags.filter(t => t.category === c)] as const).filter(([, list]) => list.length)
      .map(([c, list]) => `<li class="tag-category-group">${escape(CATEGORY_LABELS[c])} (${list.length})</li>` + list.map(t =>
        `<li class="tag-cat tag-cat-${t.category}"><strong>${escape(t.label)}</strong> / ${t.images} ${t.images === 1 ? "immagine" : "immagini"} ` +
        categorySelect(`data-tag-category="${escape(t.label)}" data-images="${t.images}"`, t.category) + (t.aliases.length
        ? " / alias: " + t.aliases.map(a => `${escape(a)} <button type="button" data-alias-remove="${escape(a)}" aria-label="Togli l'alias ${escape(a)}">×</button>`).join(" ") : "") + "</li>").join("")).join("")
      || "<li>Nessun tag.</li>";
  };
  const refreshAnalysis = async () => {
    analysis = await call<Analysis>("/analysis");
    $("#library-analysis").textContent = analysis.enabled ? `Analisi IA con ${analysis.model}: una chiamata a pagamento per immagine, con conferma.` : `Analisi IA non disponibile: ${analysis.reason}.`;
  };
  /** Completes Genre, Color and Medium of images analysed before they existed: one paid call per image, confirmed once for all. */
  const completeMany = async (ids: string[]) => {
    if (!analysis?.enabled || !ids.length) return;
    if (!window.confirm(`Completare Genere, Colore e Supporto di ${ids.length} ${ids.length === 1 ? "immagine" : "immagini"} con ${analysis.model}? ` +
      `${ids.length === 1 ? "È una chiamata" : "Sono " + ids.length + " chiamate"} a pagamento, una sola volta per immagine; gli altri tag restano, le pubblicate restano nel gioco.`)) return;
    let done = 0; const errors: string[] = [], conflicts: Conflict[] = [];
    for (const [index, imageId] of ids.entries()) {
      progress(`Completamento ${index + 1} di ${ids.length}`);
      try {
        const result = await call<{ tag_conflicts?: Conflict[] }>(`/${encodeURIComponent(imageId)}/categories`, { method: "POST", body: JSON.stringify({ confirm: true }) });
        conflicts.push(...(result.tag_conflicts || [])); done++;
      }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); if (/OpenAI:/.test(String(error))) break; }
    }
    await Promise.all([load(), refreshTags(), refreshAnalysis()]);
    progress("");
    message(`${done} di ${ids.length} completate.` + conflictText(conflicts) + (errors.length ? " " + [...new Set(errors)].join(" / ") : ""));
  };
  /** Analyses images one by one after an explicit confirmation of the total estimate. */
  const analyzeMany = async (ids: string[], describe = false) => {
    if (!analysis?.enabled || !ids.length) return;
    const repeated = new Set(items.filter(i => ids.includes(i.id) && unsure(i)).map(i => i.id));
    const risk = repeated.size ? ` ${repeated.size === 1 ? "Una di queste ha" : repeated.size + " di queste hanno"} un'analisi precedente interrotta o con esito incerto, che potrebbe essere già stata addebitata: ${repeated.size === 1 ? "verrà ripetuta" : "verranno ripetute"}.` : "";
    if (!window.confirm((describe
      ? `Analisi combinata tag e descrizione di ${ids.length} REAL con ${analysis.model}: al massimo ${ids.length} ${ids.length === 1 ? "chiamata" : "chiamate"} a pagamento, una per foto, sull'originale intero, nessuna ripetuta in automatico. I tag attuali saranno sostituiti.`
      : `Analizzare ${ids.length} ${ids.length === 1 ? "immagine" : "immagini"} con ${analysis.model}? Sono chiamate a pagamento. I tag attuali saranno sostituiti; ogni immagine si analizza una sola volta.`) + risk + " Continuare?")) return;
    let done = 0; const errors: string[] = [], conflicts: Conflict[] = [];
    for (const [index, imageId] of ids.entries()) {
      progress(`Analisi ${index + 1} di ${ids.length}`);
      try {
        const result = await call<{ tag_conflicts?: Conflict[] }>(`/${encodeURIComponent(imageId)}/analyze`, { method: "POST",
          body: JSON.stringify({ confirm: true, ...(describe ? { refresh_description: true } : {}), ...(repeated.has(imageId) ? { repeat_uncertain: true } : {}) }) });
        conflicts.push(...(result.tag_conflicts || [])); done++;
      }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); if (/OpenAI:/.test(String(error))) break; }
    }
    // The list is reloaded first: the message says the work is over only when the cards show the new tags.
    await Promise.all([load(), refreshTags(), refreshAnalysis()]);
    progress("");
    message(`${done} di ${ids.length} analizzate.` + conflictText(conflicts) + (errors.length ? " " + [...new Set(errors)].join(" / ") : ""));
  };
  // The list of the last request wins: a slower, older answer never overwrites a newer one.
  let loadSeq = 0;
  const load = async () => {
    const seq = ++loadSeq;
    const params = new URLSearchParams({ status: filter.status, origin: filter.origin, tags: filter.tags.join(","), match: filter.match, q: filter.q, batch: filter.batch });
    $("#library-batch-filter").hidden = !filter.batch;
    const data = await call<{ items: Item[]; counts: { status: string; origin: string; n: number }[] }>("?" + params);
    if (seq !== loadSeq) return;
    items = data.items;
    selected = new Set([...selected].filter(id => items.some(item => item.id === id)));
    const count = (status: string) => data.counts.filter(c => c.status === status).reduce((n, c) => n + c.n, 0);
    $("#library-counts").textContent = `${count("new")} nuove / ${count("approved")} approvate / ${count("published")} pubblicate / ${count("trash")} nel cestino`;
    $("#library-empty-trash").hidden = filter.status !== "trash" || !count("trash");
    render();
    // Copies without measures of the current version are measured in this page, in the background, one at a time (free).
    if (!measuring && items.some(i => i.metrics?.v !== METRICS_VERSION && i.copy)) {
      measuring = true;
      void measureMissing(items.map(i => ({ id: i.id, metrics: i.metrics, copy: i.copy ? { sha256: i.copy.sha256 } : null }))).finally(() => { measuring = false; });
    }
  };
  const rate = (item: Item) => item.stats.views ? ` (${Math.round(item.stats.correct / item.stats.views * 100)}%)` : "";
  const statsLine = (item: Item) => `<span class="db-stats" data-stats>Vista <strong>${item.stats.views}</strong> ${item.stats.views === 1 ? "volta" : "volte"} / classificata correttamente <strong>${item.stats.correct}</strong>${rate(item)}</span>`;
  const tagPills = () => {
    $("#library-tag-pills").innerHTML = filter.tags.map(t => pill(t, tagCategories.get(t) || "other", "rw-pill",
      `<button type="button" data-filter-remove="${escape(t)}" aria-label="Togli ${escape(t)} dal filtro">×</button>`)).join("") ||
      "<small>Nessun tag: tutte le immagini</small>";
  };
  const preview = (item: Item) => openPreview(item.origin === "REAL"
    ? { src: item.file, alt: imageLabel(item), title: imageLabel(item), description: item.description,
      link: item.source_url ? { href: item.source_url, label: "Apri la pagina su Commons" } : undefined }
    : { src: item.file, alt: imageLabel(item), title: imageLabel(item),
      extra: (item.prompt ? `<p><span class="image-preview-label">Prompt</span><br><q lang="en">${escape(item.prompt)}</q></p>` : "") });
  const card = (item: Item) => `<li class="library-card${selected.has(item.id) ? " is-selected" : ""}" data-id="${escape(item.id)}">
    <label class="library-check"><input type="checkbox" data-select="${escape(item.id)}" ${selected.has(item.id) ? "checked" : ""} aria-label="Seleziona ${escape(imageLabel(item))}"></label>
    <button type="button" class="library-open" data-open="${escape(item.id)}" data-long-press aria-label="Apri ${escape(imageLabel(item))}">
      <img src="${escape(item.file)}" alt="" loading="lazy" draggable="false"><span class="library-badges"><span class="badge badge-${item.origin.toLowerCase()}">${item.origin}</span>
      <span class="badge badge-status">${STATE_LABEL[item.status]}</span></span>
    </button></li>`;
  const selectionBar = () => {
    const bar = $("#library-selection"), n = selected.size;
    bar.hidden = !n;
    if (!n) return;
    const trash = filter.status === "trash";
    bar.innerHTML = `<strong>${n} selezionate</strong>` + (trash
      ? '<button data-bulk="restore">Ripristina</button><button data-bulk="delete" class="danger">Elimina definitivamente</button>'
      : '<button data-bulk="trash">Sposta nel cestino</button><label><input type="checkbox" id="library-bulk-rights"> Diritti delle REAL verificati</label><button data-bulk="copy-portrait">Rifai la copia di gioco</button><button data-bulk="analyze">Analizza con IA</button><button data-bulk="describe">Analisi combinata tag e descrizione</button><button data-bulk="complete">Completa Genere, Colore e Supporto</button><button data-bulk="approve">Approva</button><button data-bulk="publish">Pubblica</button><button data-bulk="withdraw">Ritira dal gioco</button>' +
        '<label>Tag<input id="library-bulk-tag" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' + categorySelect('id="library-bulk-category"') + '<button data-bulk="tag-add">Aggiungi tag</button><button data-bulk="tag-remove">Togli tag</button>') +
      '<button data-bulk="none">Deseleziona</button>';
  };
  /** Order of the grid: date added, views or accuracy (correct over views), descending or ascending. For accuracy, photos never
   * seen have none and go last either way; ties keep the most recent first. */
  const sorted = () => {
    const sign = sort.order === "asc" ? 1 : -1, added = (i: Item) => Date.parse(i.created_at) || 0;
    const key = (i: Item): number | null => sort.by === "views" ? i.stats.views : sort.by === "accuracy" ? (i.stats.views ? i.stats.correct / i.stats.views : null) : added(i);
    return [...items].sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (ka === null || kb === null) return ka === kb ? added(b) - added(a) : ka === null ? 1 : -1;
      return (ka - kb) * sign || added(b) - added(a);
    });
  };
  const render = () => {
    $("#library-grid").innerHTML = items.length ? sorted().map(card).join("") : `<li class="library-empty">${filter.status === "trash" ? "Il cestino è vuoto." : "Nessuna immagine. Aggiungi le REAL con «Caricamento REAL» e genera le SLOP con «Generazione SLOP»."}</li>`;
    // «Seleziona tutte» takes every photo shown by the current view and filters, never the hidden ones.
    const all = $<HTMLButtonElement>("#library-select-all");
    all.hidden = !items.length || items.every(i => selected.has(i.id));
    all.textContent = `Seleziona tutte (${items.length})`;
    selectionBar();
  };

  // Press and hold a card: the large preview; a short press opens the detail.
  onLongPress($("#library-grid"), "[data-open]", element => { const item = items.find(i => i.id === element.dataset.open); if (item) preview(item); });

  // Detail: every change is saved at once; tags too.
  const detail = $<HTMLDialogElement>("#library-detail");
  let saving: Promise<unknown> = Promise.resolve();
  const save = (item: Item, change: Partial<Record<keyof Item | "tag_categories", unknown>>): Promise<Item> => {
    const request = saving.catch(() => {}).then(async () => {
      const latest = items.find(i=>i.id===item.id) || (open?.id===item.id ? open : item);
      const updated = await call<Item>("/" + encodeURIComponent(item.id), { method: "PATCH", body: JSON.stringify({ revision: latest.revision, ...change }) });
      items = items.map(i => i.id === updated.id ? updated : i);
      return updated;
    });
    saving = request; return request;
  };
  /** An analysis still marked «running» after ten minutes belongs to a request that died (the server treats it the same way): it may
   * have been charged, so it is repeated only with the explicit warning, like an uncertain outcome. */
  const interrupted = (item: Item) => item.analysis.status === "running" && Date.now() - Date.parse(item.updated_at) > 10 * 60_000;
  const unsure = (item: Item) => item.analysis.status === "uncertain" || interrupted(item);
  const analysisLine = (item: Item) => interrupted(item) ? "Analisi interrotta: esito incerto, forse già addebitata." : ({ none: "Non ancora analizzata.", running: "Analisi in corso…",
    done: "Analizzata: tag generati una volta sola, da rivedere prima di approvare.",
    uncertain: "Esito incerto: " + item.analysis.error, failed: "Analisi non riuscita: " + item.analysis.error })[item.analysis.status];
  const metricText = (m: Metrics) => `lato ${m.long} px / rumore ${m.noise.toFixed(1)} / nitidezza ${m.sharpness.toFixed(1)} / contrasto ${m.contrast} / saturazione ${m.saturation.toFixed(2)}`;
  /** Missing categories and the paid completion. */
  const categoriesBlock = (item: Item) => {
    const missing = item.missing_categories.map(c => CATEGORY_LABELS[c as Category] || c);
    return (missing.length ? `<p class="hint" data-missing-categories>Mancano: ${escape(missing.join(", "))}.</p>` : "") +
      (item.completable && analysis?.enabled ? '<p><button type="button" id="library-complete">Completa Genere, Colore e Supporto (a pagamento)</button></p>' : "");
  };
  /** Measures of the copy and, for a SLOP, its treatment with the commands (free; they make the copy again). */
  const measuresBlock = (item: Item, editable: boolean) => {
    const t = item.treatment;
    const treatment = item.origin !== "SLOP" ? "" : !t ? '<p class="hint" data-treatment>Copia senza trattamento.</p>'
      : `<p class="hint" data-treatment>${t.off ? "Trattamento spento" : `Trattamento fotografico (${escape(t.medium || "supporto non indicato")}, ${escape(t.color || "colore non indicato")})` +
        (t.settings ? ", regolato dall'owner" : "") + (t.gap !== undefined ? `, scarto dall'obiettivo ${Math.round(t.gap * 100)}%` : "") + `: ${metricText(t.sample.metrics)}`}.</p>`;
    const commands = item.origin === "SLOP" && editable && item.copy ? `<div class="library-inline" data-treatment-commands>` +
      (t && !t.off ? '<button type="button" id="library-treatment-off">Senza trattamento</button>'
        : '<button type="button" id="library-treatment-on">Con trattamento</button>') +
      (t ? '<button type="button" id="library-treatment-edit">Regola il trattamento</button>' : "") + "</div>" : "";
    return (item.metrics ? `<p class="hint" data-metrics>Misure della copia: ${metricText(item.metrics)}.</p>` : "") + treatment + commands;
  };
  const showDetail = (item: Item) => {
    open = item;
    const editable = item.status === "new" || item.status === "approved";
    const sourceExcluded = item.reference_state === "unapproved" || item.reference_state === "approved";
    const sourceProtected = item.reference_state === "pending" || item.reference_state === "unapproved";
    const fields = FIELDS.filter(([key]) => item.origin === "REAL" ? key !== "prompt" && key !== "model" : !["title", "source_url", "author", "license_name", "license_url"].includes(key));
    detail.innerHTML = `<form method="dialog" class="library-detail-close"><button aria-label="Chiudi">×</button></form>
      <h2 id="library-detail-title">${escape(imageLabel(item))}</h2>
      <p class="hint">${item.origin} / ${STATE_LABEL[item.status]} / originale ${item.width}×${item.height}${item.copy ? ` / copia di gioco WebP ${item.copy.width}×${item.copy.height}${item.copy.crop ? ", " + FORMAT_LABELS[item.copy.crop.format] : ""}, ${kb(item.copy.bytes)}${sourceExcluded ? "" : ": è ciò che vedranno i giocatori"}` : " / copia di gioco non pronta"}</p>
      <div class="library-detail-body"><div class="game-media-surface library-preview"><img data-game-media draggable="false" src="${escape(item.file)}" alt="${escape(imageLabel(item))}"></div>
      <div class="library-fields"><p>${statsLine(item)}</p>
      ${item.in_play ? `<p class="hint">In ${item.in_play} ${item.in_play === 1 ? "partita" : "partite"} in corso: continuano con la versione con cui sono iniziate; le modifiche valgono dalle partite nuove.</p>` : ""}
      ${item.status === "published" ? '<p class="db-edit-note">Pubblicata: per modificarla avvia la modifica. La foto esce subito dalla pubblicazione, quindi non entra in nuove partite; quelle in corso finiscono con la versione attuale. Finita la modifica resta approvata: la ripubblichi quando vuoi.</p>' : ""}
      ${item.status === "approved" && !sourceExcluded ? '<p class="hint">Le modifiche si salvano subito e la foto resta approvata. Pubblicala quando hai finito.</p>' : ""}
      ${sourceExcluded ? '<p class="db-edit-note">Questa REAL ha generato una SLOP ed è esclusa dalle nuove partite.</p>' : ""}
      ${sourceProtected ? `<p class="hint">${item.reference_state === "pending"
        ? "Questa REAL è riservata a una generazione. Per eliminarla definitivamente, chiudi il processo senza una SLOP oppure approva la SLOP che ne deriva."
        : "Puoi eliminarla definitivamente dopo aver approvato la SLOP derivata."}</p>` : ""}
      ${item.no_derivatives ? '<p class="db-edit-note">Licenza senza opere derivate (ND): la foto è esclusa dal gioco, perché la copia di gioco la ritaglia.</p>' : ""}
      ${!item.copy && item.status === "new" ? '<p><button type="button" id="library-copy">Prepara la copia di gioco</button></p>' : ""}
      ${editable ? '<p><button type="button" id="library-crop">Inquadratura</button></p>' : ""}
      ${categoriesBlock(item)}
      ${measuresBlock(item, editable)}
      ${fields.map(([key, label, max, area]) => `<label>${label}${area
        ? `<textarea data-field="${key}" maxlength="${max}" rows="3" ${editable ? "" : "readonly"}>${escape(item[key])}</textarea>`
        : `<input data-field="${key}" maxlength="${max}" value="${escape(item[key])}" ${editable ? "" : "readonly"}>`}</label>`).join("")}
      ${item.origin === "REAL" ? descriptionFields(item.id, item.real_description, item.status === "trash", item.commons_description || "") : ""}
      ${item.origin === "REAL" && !item.real_description && item.copy && item.status !== "trash" ? (unsure(item) ? `<p class="hint" data-analysis-unsure>${escape(analysisLine(item))}</p>` : "") + '<button type="button" id="library-description-analysis">Analisi combinata tag e descrizione (a pagamento)</button>' : ""}
      <div class="library-tags"><span>Tag</span>${legend()}<ul>${sortByCategory(item.tags, item.categories).map(t => `<li class="tag-cat tag-cat-${categoryOf(item.categories, t)}" title="${escape(CATEGORY_LABELS[categoryOf(item.categories, t)])}">${escape(t)}${editable ? ` <button type="button" data-tag-remove="${escape(t)}" aria-label="Togli ${escape(t)}">×</button>` : ""}</li>`).join("") || "<li>nessuno</li>"}</ul>
        ${item.origin === "REAL" && !item.tags.some(t => categoryOf(item.categories, t) === "time") ? '<p class="hint" data-no-time>Nessun tag di Tempo: aggiungi il decennio se è noto.</p>' : ""}
        ${editable ? '<div class="library-tag-entry library-inline"><input id="library-tag-input" list="library-tag-list" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="nuovo tag, Invio">' + categorySelect('id="library-tag-category"') + '</div><p id="library-tag-hint" class="hint">Scegli la categoria per un tag nuovo. Maiuscole, accenti e spazi vengono convertiti (São Paulo → sao-paulo); inglese per i nomi comuni.</p>' : ""}</div>
      ${item.status === "new" && item.copy ? `<p class="library-analysis">${analysisLine(item)} ${analysis?.enabled && (item.analysis.status !== "running" || interrupted(item)) && item.analysis.status !== "done"
        ? `<button type="button" id="library-analyze">${item.analysis.status === "none" ? "Analizza con IA" : "Riprova l'analisi"} (a pagamento)</button>` : ""}</p>` : ""}
      ${editable && item.generated ? '<p><button type="button" id="library-restore">Ripristina i tag generati</button></p>' : ""}
      ${editable && item.origin === "SLOP" ? '<p class="hint">Per rigenerare: cestina questa SLOP e avvia un nuovo processo nello studio, con conferma e valutazione.</p>' : ""}
      <div class="library-actions">${item.status === "new" ? `${item.origin === "REAL" ? `<label><input type="checkbox" id="library-rights" ${item.rights_confirmed ? "checked" : ""}> Ho verificato diritti e licenza</label>` : ""}<button type="button" data-action="approve" class="primary">Approva</button>` : ""}
        ${item.status === "approved" && !sourceExcluded ? '<button type="button" data-action="publish" class="primary">Pubblica nel gioco</button>' : ""}
        ${item.status === "published" ? '<button type="button" data-action="edit" class="primary">Modifica</button><button type="button" data-action="withdraw">Ritira dal gioco</button><button type="button" data-action="remove">Elimina (nel cestino)</button>' : ""}
        ${item.status === "trash" ? `<button type="button" data-action="restore">Ripristina</button>${sourceProtected ? "" : '<button type="button" data-action="delete" class="danger">Elimina definitivamente</button>'}`
          : item.status !== "published" ? '<button type="button" data-action="trash">Elimina (nel cestino)</button>' : ""}</div>
      <p id="library-detail-message" role="status" aria-live="polite"></p></div></div>`;
    if (!detail.open) detail.showModal();
    markGameMedia(detail);
  };
  detail.addEventListener("close", () => { open = null; });
  const detailMessage = (text: string) => { const el = detail.querySelector("#library-detail-message"); if (el) el.textContent = text; };
  detail.addEventListener("change", async event => {
    const editorial = (event.target as HTMLElement).closest<HTMLTextAreaElement>("[data-editorial]");
    if (editorial && open && !editorial.disabled) {
      try { open = await save(open, {real_description: readDescription(detail, open.id)}); detailMessage("Descrizione privata salvata; tag invariati."); }
      catch (e) { detailMessage(String(e)); } return;
    }
    const field = (event.target as HTMLElement).closest<HTMLInputElement | HTMLTextAreaElement>("[data-field]");
    if (!field || !open || field.readOnly) return;
    try { open = await save(open, { [field.dataset.field!]: field.value }); showDetail(open); detailMessage("Salvato."); render(); }
    catch (error) { detailMessage(String(error instanceof Error ? error.message : error)); }
  });
  detail.addEventListener("input", event => {
    const input = event.target as HTMLInputElement;
    if (input.id !== "library-tag-input") return;
    const checked = tagFromInput(input.value), picker = detail.querySelector<HTMLSelectElement>("#library-tag-category");
    const suggested = checked.ok ? suggestedCategory(checked.tag, tagCategories) : "";
    if (picker && suggested) picker.value = suggested;
  });
  detail.addEventListener("keydown", async event => {
    const input = event.target as HTMLInputElement;
    if (input.id !== "library-tag-input" || event.key !== "Enter" || !open) return;
    event.preventDefault();
    const checked = tagFromInput(input.value);
    const hint = detail.querySelector("#library-tag-hint")!;
    if (!checked.ok) { hint.textContent = checked.reason; return; }
    const chosen = detail.querySelector<HTMLSelectElement>("#library-tag-category")?.value || "";
    const existing = tagCategories.get(checked.tag), category = existing && !chosen ? existing : chosen;
    if (!isCategory(category)) { hint.textContent = "Scegli la categoria del tag."; return; }
    try {
      if (existing && existing !== category) {
        if (!window.confirm(`«${checked.tag}» è già un tag della categoria ${CATEGORY_LABELS[existing]}. Vuoi spostarlo in ${CATEGORY_LABELS[category]}? Il cambio vale per tutte le immagini che lo usano. Altrimenti usa una parola più specifica.`)) {
          hint.textContent = "Tag non aggiunto: usa una parola più specifica."; return;
        }
        await call("/tags/category", { method: "PUT", body: JSON.stringify({ label: checked.tag, category }) });
        open = await call<Item>("/" + encodeURIComponent(open.id));
      }
      open = await save(open, { tags: [...new Set([...open.tags, checked.tag])], tag_categories: { [checked.tag]: category } });
      showDetail(open); render(); void refreshTags(); detail.querySelector<HTMLInputElement>("#library-tag-input")?.focus();
    } catch (error) { detailMessage(String(error instanceof Error ? error.message : error)); }
  });
  detail.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (button?.dataset.openSource && !busy) {
      try { showDetail(await call<Item>("/" + encodeURIComponent(button.dataset.openSource))); } catch (error) { detailMessage(String(error instanceof Error ? error.message : error)); }
      return;
    }
    if (!button || !open || busy || !(button.dataset.tagRemove || button.dataset.action || ["library-description-analysis", "library-copy", "library-analyze", "library-restore", "library-regenerate",
      "library-crop", "library-complete", "library-treatment-off", "library-treatment-on", "library-treatment-edit"].includes(button.id))) return;
    busy = true;
    try {
      if (button.id === "library-description-analysis") {
        const repeat = unsure(open);
        if (!window.confirm(`Analizzare nuovamente tag e descrizione di «${imageLabel(open)}»? Una chiamata a pagamento con ${analysis?.model}. I tag saranno sostituiti.${repeat ? " L'analisi precedente ha un esito incerto e potrebbe essere già stata addebitata." : ""}`)) return;
        open = await call<Item>(`/${open.id}/analyze`, {method:"POST",body:JSON.stringify(repeat ? {confirm:true,refresh_description:true,repeat_uncertain:true} : {confirm:true,refresh_description:true})});
      }
      else if (button.dataset.tagRemove) open = await save(open, { tags: open.tags.filter(t => t !== button.dataset.tagRemove) });
      else if (button.id === "library-copy") { detailMessage("Preparo la copia di gioco…"); open = await prepareItemCopy<Item>(open); }
      else if (button.id === "library-complete" && analysis) {
        if (!window.confirm(`Completare Genere, Colore e Supporto di «${imageLabel(open)}» con ${analysis.model}? È una chiamata a pagamento, una sola volta per l'immagine; gli altri tag restano.`)) return;
        detailMessage("Completamento in corso…");
        const completed = await call<Item & { tag_conflicts?: Conflict[] }>(`/${encodeURIComponent(open.id)}/categories`, { method: "POST", body: JSON.stringify({ confirm: true }) });
        open = completed; detailMessage("Completamento fatto." + conflictText(completed.tag_conflicts));
        void Promise.all([refreshTags(), refreshAnalysis()]);
      }
      else if (button.id === "library-treatment-edit") {
        const choice = await chooseTreatment(open, imageLabel(open));
        if (!choice) return;
        detailMessage("Rifaccio la copia con il trattamento scelto…");
        open = await prepareItemCopy<Item>(open, open.copy?.crop || undefined, choice);
        detailMessage(choice.settings ? "Trattamento regolato salvato." : "Trattamento proposto salvato.");
      }
      else if (button.id.startsWith("library-treatment-")) {
        const off = button.id === "library-treatment-off";
        detailMessage(off ? "Rifaccio la copia senza trattamento…" : "Rifaccio la copia con il trattamento…");
        open = await prepareItemCopy<Item>(open, open.copy?.crop || undefined, { off });
        detailMessage(open.treatment && !open.treatment.off ? "Copia trattata." : open.treatment ? "Copia senza trattamento." : "Misure della REAL di riferimento non disponibili: copia senza trattamento.");
      }
      else if (button.id === "library-crop") {
        const choice = await chooseFrame(open.id, open.width, open.height, open.copy ? { crop: open.copy.crop } : null, imageLabel(open));
        if (!choice) return;
        detailMessage("Rifaccio la copia con la nuova inquadratura…");
        open = await saveFrame<Item>(open, choice);
        detailMessage("Inquadratura salvata.");
      }
      else if (button.id === "library-analyze" && analysis) {
        const repeat = unsure(open) ? " L'analisi precedente ha un esito incerto e potrebbe essere già stata addebitata." : "";
        if (!window.confirm(`Analizzare «${imageLabel(open)}» con ${analysis.model}? È una chiamata a pagamento. I tag attuali saranno sostituiti.${repeat}`)) return;
        detailMessage("Analisi in corso…");
        const analysed = await call<Item & { tag_conflicts?: Conflict[] }>(`/${encodeURIComponent(open.id)}/analyze`, { method: "POST",
          body: JSON.stringify(repeat ? { confirm: true, repeat_uncertain: true } : { confirm: true }) });
        open = analysed; detailMessage("Analisi completata." + conflictText(analysed.tag_conflicts));
        void Promise.all([refreshTags(), refreshAnalysis()]);
      }
      else if (button.id === "library-restore" && open.generated) {
        open = await save(open, { tags: open.generated.tags }); void refreshTags();
      }
      else if (button.dataset.action === "delete") { await call("/" + encodeURIComponent(open.id), { method: "DELETE" }); detail.close(); open = null; }
      else if (button.dataset.action === "edit") {
        // Owner decision of 2026-11-11: the photo leaves publication as soon as the edit starts.
        if (!window.confirm(`Modificare «${imageLabel(open)}»? Esce subito dalla pubblicazione e non entra in nuove partite; le partite in corso finiscono con la versione attuale. Finita la modifica resta approvata.`)) return;
        open = await call<Item>(`/${encodeURIComponent(open.id)}/withdraw`, { method: "POST", body: "{}" });
        detailMessage("Modifica avviata: la foto non è più pubblicata.");
      }
      else if (button.dataset.action === "remove") {
        if (!window.confirm(`Eliminare «${imageLabel(open)}»? Esce dalla pubblicazione e va nel cestino; le partite in corso finiscono con la versione attuale.`)) return;
        open = await call<Item>(`/${encodeURIComponent(open.id)}/trash`, { method: "POST", body: "{}" });
      }

      else if (button.dataset.action) open = await call<Item>(`/${encodeURIComponent(open.id)}/${button.dataset.action}`, { method: "POST",
        body: JSON.stringify(button.dataset.action === "approve" ? { rights_confirmed: Boolean(detail.querySelector<HTMLInputElement>("#library-rights")?.checked) } : {}) });
      await load();
      // The detail is drawn again: the last message stays.
      const said = detail.querySelector("#library-detail-message")?.textContent || "";
      if (open) { showDetail(items.find(i => i.id === open!.id) || open); detailMessage(said); }
    } catch (error) { detailMessage(String(error instanceof Error ? error.message : error)); }
    finally { busy = false; }
  });

  page.addEventListener("click", async event => {
    const target = event.target as HTMLElement, button = target.closest<HTMLButtonElement>("button");
    if (target.closest("dialog") || target.closest("#real-wizard") || target.closest("#slop-auto")) return;
    if (button?.dataset.adminTab) {
      const tab = button.dataset.adminTab;
      try { sessionStorage.setItem("ros-admin-section", tab); } catch { /* storage unavailable */ }
      for (const panel of ["real", "slop", "database", "stats", "settings"])
        $<HTMLElement>("#admin-" + panel).hidden = panel !== tab;
      page.querySelectorAll<HTMLButtonElement>("[data-admin-tab]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
      if (tab === "database") { await load(); if (!$("#db-distribution").hidden) await distribution.refresh(); }
      if (tab === "slop") await slopStudio.refresh();
      if (tab === "real") await realWizard?.sync();
      if (tab === "stats") await statsView.refresh();
      return;
    }
    if (button?.dataset.dbTab) {
      const images = button.dataset.dbTab === "images";
      $("#db-images").hidden = !images; $("#db-distribution").hidden = images;
      page.querySelectorAll<HTMLButtonElement>("[data-db-tab]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
      if (images) await load(); else await distribution.refresh();
      return;
    }
    if (button?.hasAttribute("data-batch-clear")) { filter.batch = ""; await load(); return; }
    if (button?.dataset.filterRemove) {
      filter.tags = filter.tags.filter(t => t !== button.dataset.filterRemove); tagPills(); await load(); return;
    }
    const opener = target.closest<HTMLElement>("[data-open]");
    if (opener) { const item = items.find(i => i.id === opener.dataset.open); if (item) showDetail(item); return; }
    // Changing view is never blocked by an action still reloading the list (the click used to be dropped).
    if (button?.dataset.view) {
      filter.status = button.dataset.view; selected.clear();
      page.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
      try { await load(); } catch (error) { message(String(error instanceof Error ? error.message : error)); }
      return;
    }
    if (!button || busy) return;
    if (button.id === "library-select-all") { for (const item of items) selected.add(item.id); render(); return; }
    busy = true;
    try {
      if (button.id === "library-empty-trash") {
        const result = await call<Deletion>("/trash/empty", { method: "POST", body: "{}" });
        await Promise.all([load(), refreshTags()]);
        message(deletionText(result));
      } else if (button.dataset.bulk) {
        const action = button.dataset.bulk;
        if (action === "none") { selected.clear(); render(); return; }
        if (action === "trash") {
          const published = items.filter(i => selected.has(i.id) && i.status === "published").length;
          if (published && !window.confirm(`${published} ${published === 1 ? "immagine è pubblicata: esce" : "immagini sono pubblicate: escono"} subito dal gioco e ${published === 1 ? "va" : "vanno"} nel cestino; le partite in corso finiscono con la versione attuale. Continuare?`)) return;
        }
        if (action === "copy-portrait") {
          // Every selected copy is made again in this page, with its 4:5 crop (centred for an earlier format); free.
          const pending = items.filter(i => selected.has(i.id) && i.status !== "trash");
          if (!pending.length) { message("Nessuna immagine selezionata fuori dal cestino."); return; }
          if (pending.some(i=>i.status === "published") && !window.confirm("Le foto pubblicate verranno ritirate e resteranno approvate con la nuova copia. Continuare?")) return;
          const result = await remakeCopies(pending, progress);
          progress(""); await load();
          message(`${result.done} di ${pending.length} copie rifatte. Controlla l’inquadratura prima di pubblicare.` + (result.failed.length ? " Non riuscite: " + result.failed.map(f => f.error).join(" / ") : "")); return;
        }
        if (action === "complete") {
          const ids = items.filter(i => selected.has(i.id) && i.completable).map(i => i.id);
          if (!ids.length) { message("Nessuna immagine selezionata da completare: servono un'analisi riuscita, un completamento mai fatto e almeno una categoria tra Genere, Colore e Supporto mancante."); return; }
          await completeMany(ids); return;
        }
        // An analysis still running (less than ten minutes) is left alone; an uncertain or interrupted one may have been charged:
        // it is included only after a confirmation that names it, and its request carries the explicit repeat.
        const waiting = (i: Item) => i.analysis.status === "running" && !interrupted(i);
        if (action === "describe") {
          // REAL without the private description, at any status but the trash: tags and description from the whole original.
          const chosen = items.filter(i => selected.has(i.id) && i.origin === "REAL" && !i.real_description && i.status !== "trash");
          const ids = chosen.filter(i => !waiting(i)).map(i => i.id), busyNow = chosen.length - ids.length;
          if (!ids.length) { message(chosen.length ? `${busyNow === 1 ? "L'analisi della REAL selezionata è" : "Le analisi delle REAL selezionate sono"} ancora in corso: riprova fra qualche minuto.` : "Nessuna REAL senza descrizione privata tra le selezionate: le altre l'hanno già (il testo di Commons non conta)."); return; }
          await analyzeMany(ids, true); return;
        }
        if (action === "analyze") {
          const ids = items.filter(i => selected.has(i.id) && i.status === "new" && i.copy && i.analysis.status !== "done" && !waiting(i)).map(i => i.id);
          if (!ids.length) { message("Nessuna immagine nuova, con copia di gioco e non ancora analizzata tra le selezionate."); return; }
          await analyzeMany(ids); return;
        }
        let tag = $<HTMLInputElement>("#library-bulk-tag")?.value.trim();
        let bulkCategory = "";
        if ((action === "tag-add" || action === "tag-remove")) {
          const checked = tagFromInput(tag || "");
          if (!checked.ok) { message(checked.reason); return; }
          tag = checked.tag;
          const chosen = $<HTMLSelectElement>("#library-bulk-category").value, existing = tagCategories.get(tag);
          if (action === "tag-add" && !existing && !isCategory(chosen)) { message("Scegli la categoria del tag nuovo."); return; }
          if (action === "tag-add" && existing && isCategory(chosen) && chosen !== existing) {
            message(`«${tag}» è già un tag della categoria ${CATEGORY_LABELS[existing]}: cambiala dal vocabolario nelle Impostazioni, oppure usa una parola più specifica.`); return;
          }
          bulkCategory = isCategory(chosen) ? chosen : "";
        }
        const result = await call<Deletion | { done: number; failed?: { error: string }[] }>("/bulk", { method: "POST",
          body: JSON.stringify({ action, ids: [...selected], tags: tag ? [tag] : [], ...(bulkCategory ? { category: bulkCategory } : {}), rights_confirmed: action === "approve" && Boolean($<HTMLInputElement>("#library-bulk-rights")?.checked) }) });
        const completedMessage = "deleted" in result ? deletionText(result) :
          `${result.done} aggiornate.` + (result.failed?.length ? ` ${result.failed.length} non aggiornate: ${[...new Set(result.failed.map(f => f.error))].join("; ")}.` : "");
        if (action !== "tag-add" && action !== "tag-remove") selected.clear();
        await Promise.all([load(), refreshTags()]);
        message(completedMessage);
      }
    } catch (error) { message(String(error instanceof Error ? error.message : error)); }
    finally { busy = false; }
  });
  page.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (target.closest("dialog")) return;
    if (target.dataset.select) { if (target.checked) selected.add(target.dataset.select); else selected.delete(target.dataset.select); render(); }
    else if (target.id === "library-origin") { filter.origin = target.value; void load(); }
    else if (target.id === "library-sort" || target.id === "library-order") {
      sort = { by: $<HTMLSelectElement>("#library-sort").value, order: $<HTMLSelectElement>("#library-order").value };
      try { localStorage.setItem(SORT_KEY, JSON.stringify(sort)); } catch { /* private browsing */ }
      render();
    }
    else if (target.id === "library-tag") addFilterTag(target);
    else if (target.id === "library-tag-match") { filter.match = target.value; void load(); }
  });
  /** A tag typed in the filter, converted like a tag written by hand; an alias is resolved by the server only when saving, so
   * here the label is used as typed. */
  const addFilterTag = (input: HTMLInputElement) => {
    const checked = tagFromInput(input.value);
    if (!input.value.trim()) return;
    if (!checked.ok) { message(checked.reason); return; }
    if (!filter.tags.includes(checked.tag)) filter.tags = [...filter.tags, checked.tag];
    input.value = ""; tagPills(); void load();
  };
  $<HTMLSelectElement>("#library-sort").value = sort.by; $<HTMLSelectElement>("#library-order").value = sort.order;
  $("#library-tag").addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault(); addFilterTag(event.target as HTMLInputElement);
  });
  const tagForm = (selector: string, path: string, fields: string[], done: string) =>
    $(selector).addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.target as HTMLFormElement, data = new FormData(form);
      try {
        await call(path, { method: "POST", body: JSON.stringify(Object.fromEntries(fields.map(f => [f, String(data.get(f) || "").trim()]))) });
        settingsMessage(done); form.reset(); await Promise.all([load(), refreshTags()]);
      } catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); }
    });
  tagForm("#library-merge", "/tags/merge", ["from", "into"], "Tag uniti.");
  tagForm("#library-alias", "/tags/alias", ["alias", "into"], "Alias aggiunto.");
  // Model selectors: a model missing from the OpenAI project is shown but cannot be chosen.
  const renderModels = (m: Models) => {
    const options = (list: ModelOption[], chosen: string) => list.map(o => `<option value="${escape(o.id)}"${o.id === chosen ? " selected" : ""}${o.available === false && o.id !== chosen ? " disabled" : ""}>${escape(o.id)}${o.shutdown ? ` (dismesso da OpenAI il ${new Date(o.shutdown).toLocaleDateString("it-IT")})` : ""}${o.available === false ? " (non disponibile nel progetto)" : ""}</option>`).join("");
    $("#library-models-form [name=text_model]").innerHTML = options(m.text_models, m.text_model);
    $("#library-models-form [name=image_model]").innerHTML = options(m.image_models, m.image_model);
    $("#library-models-form [name=image_quality]").innerHTML = (m.image_models.find(o => o.id === m.image_model)?.qualities || [m.image_quality])
      .map(q => `<option value="${escape(q)}"${q === m.image_quality ? " selected" : ""}>${escape(q)}</option>`).join("");
    $("#library-models-note").textContent = m.note;
  };
  const refreshModels = async () => { models = await call<Models>("/models"); renderModels(models); };
  $("#library-models-form").addEventListener("change", async event => {
    const field = event.target as HTMLSelectElement;
    try {
      models = await call<Models>("/models", { method: "PUT", body: JSON.stringify({ [field.name]: field.value }) }); renderModels(models);
      settingsMessage(`${({ text_model: "Modello di testo", image_model: "Modello di immagini", image_quality: "Qualità delle immagini" } as Record<string, string>)[field.name]}: ${field.value}.`); await refreshAnalysis();
    } catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); await refreshModels(); }
  });
  $("#library-vocabulary-list").addEventListener("change", async event => {
    const picker = (event.target as HTMLElement).closest<HTMLSelectElement>("[data-tag-category]");
    if (!picker || !isCategory(picker.value)) return;
    const label = picker.dataset.tagCategory!, images = Number(picker.dataset.images);
    if (!window.confirm(`Spostare «${label}» in ${CATEGORY_LABELS[picker.value]}? Vale per ${images === 1 ? "l'immagine che lo usa" : `tutte le ${images} immagini che lo usano`}.`)) { await refreshTags(); return; }
    try { await call("/tags/category", { method: "PUT", body: JSON.stringify({ label, category: picker.value }) }); settingsMessage(`«${label}»: categoria ${CATEGORY_LABELS[picker.value]}.`); }
    catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); }
    await Promise.all([refreshTags(), load()]);
  });
  $("#library-vocabulary-list").addEventListener("click", async event => {
    const alias = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-alias-remove]")?.dataset.aliasRemove;
    if (!alias) return;
    try { await call("/tags/alias", { method: "DELETE", body: JSON.stringify({ alias }) }); settingsMessage("Alias tolto."); await refreshTags(); }
    catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); }
  });
  // Model context: four texts, each saved as a new version; an old version can become the current one again.
  const CONTEXT_LABELS: Record<string, [string, string]> = {
    base: ["Base comune", "Inviata in ogni chiamata. Non deve parlare di immagini generate: il modello che scrive i tag non deve sapere che esistono."],
    analysis: ["Tag", "Inviato insieme alla base a ogni analisi: tag e, per le REAL, descrizione privata."],
    slop_prompt: ["Brief e prompt per le SLOP", "Inviato insieme alla base alla chiamata che scrive brief e prompt di una SLOP dalla descrizione e dai tag della REAL."],
    slop_evaluation: ["Valutazione delle SLOP", "Inviato insieme alla base a ogni valutazione di una candidata intera. Decisioni, tolleranza e formato della risposta restano fissati nel codice."],
  };
  const when = (iso: string) => new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
  let proposals = new Map<string, string>();
  const renderContexts = (state: ContextState) => {
    proposals = new Map(state.parts.filter(p => p.proposed).map(p => [p.part, p.proposed!]));
    $("#library-contexts-body").innerHTML = state.parts.map(p => {
      const [label, hint] = CONTEXT_LABELS[p.part] || [p.part, ""];
      return `<section class="library-context" data-context-part="${escape(p.part)}"><h3>${escape(label)}</h3><p class="hint">${escape(hint)}</p>
        <textarea data-context="${escape(p.part)}" rows="10" maxlength="${state.max}" spellcheck="true" aria-label="${escape(label)}">${escape(p.current.body)}</textarea>
        <small class="caption-count" data-context-count>${p.current.body.length}/${state.max}</small>
        ${p.outdated ? `<p class="hint" role="status" data-context-outdated><strong>Il testo in vigore è stato scritto per le SLOP gemelle e contraddice il brief editoriale: finché non salvi una nuova versione (il testo proposto o uno tuo) lo studio non scrive brief e prompt.</strong></p>` : ""}
        ${p.proposed ? `<p class="hint" data-context-proposal>È disponibile un testo proposto con l'aggiornamento dell'app. <button type="button" data-context-load="${escape(p.part)}">Carica nel campo</button> (diventa una versione solo se lo salvi).</p>` : ""}
        <div class="library-inline"><button type="button" data-context-save="${escape(p.part)}">Salva nuova versione</button></div>
        <details class="library-context-history"><summary>Versioni (${p.history.length})</summary><ol>${p.history.map((v, index) =>
          `<li><span>${escape(when(v.created_at))}</span> / ${v.body.length} caratteri${p.part === "base" || p.part === "analysis" ? ` / usata da ${v.used} ${v.used === 1 ? "immagine" : "immagini"}` : ""}${p.part === "slop_prompt" && v.pipeline < 2 ? " / SLOP gemelle" : ""}${index === 0 ? " / <strong>attuale</strong>" : ` <button type="button" data-context-restore="${escape(v.id)}">Ripristina</button>`}
          <details><summary>Testo</summary><pre>${escape(v.body)}</pre></details></li>`).join("")}</ol></details></section>`;
    }).join("");
  };
  const refreshContexts = async () => renderContexts(await call<ContextState>("/contexts"));
  $("#library-contexts").addEventListener("input", event => {
    const field = event.target as HTMLTextAreaElement;
    const count = field.dataset.context ? field.parentElement?.querySelector<HTMLElement>("[data-context-count]") : null;
    if (count) count.textContent = field.value.length + "/" + field.maxLength;
  });
  $("#library-contexts").addEventListener("click", async event => {
    const load = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-context-load]");
    if (load) {
      const field = $<HTMLTextAreaElement>(`[data-context="${load.dataset.contextLoad}"]`);
      field.value = proposals.get(load.dataset.contextLoad!) || field.value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      settingsMessage("Testo proposto caricato: controllalo e salvalo per renderlo attivo.");
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-context-save],[data-context-restore]");
    if (!button) return;
    try {
      if (button.dataset.contextSave) {
        const part = button.dataset.contextSave;
        const text = $<HTMLTextAreaElement>(`[data-context="${part}"]`).value;
        renderContexts(await call<ContextState>("/contexts", { method: "POST", body: JSON.stringify({ part, body: text }) }));
        settingsMessage(`${CONTEXT_LABELS[part]?.[0] || part}: versione salvata.`);
      } else if (window.confirm("Ripristinare questa versione? Diventa la versione attuale; quella di oggi resta tra le versioni.")) {
        renderContexts(await call<ContextState>("/contexts/restore", { method: "POST", body: JSON.stringify({ id: button.dataset.contextRestore }) }));
        settingsMessage("Versione ripristinata.");
      }
    } catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); }
  });
  // Thresholds of the SLOP studio and hours of an open game: numbers checked by the server.
  interface Numbers { values: Record<string, number>; limits: Record<string, { min: number; max: number; default: number }> }
  /** Writes the stored numbers into the fields; after a save only those of the saved form, so that a slower answer never
   * overwrites what the owner is typing in another form. */
  const renderNumbers = (n: Numbers, only?: string[]) => {
    for (const [key, value] of Object.entries(n.values)) {
      if (only && !only.includes(key)) continue;
      const input = page.querySelector<HTMLInputElement>(`[name="${key}"]`);
      if (input) { input.value = String(value); input.min = String(n.limits[key].min); input.max = String(n.limits[key].max); }
    }
  };
  const numbersForm = (selector: string, fields: string[], done: string) => $(selector).addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    try {
      renderNumbers(await call<Numbers>("/settings", { method: "PUT", body: JSON.stringify(Object.fromEntries(fields.map(f => [f, Number((form.elements.namedItem(f) as HTMLInputElement).value)]))) }), fields);
      settingsMessage(done); await slopStudio.refresh(); await autoBox.refresh();
    } catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); }
  });
  numbersForm("#library-thresholds-form", ["max_generation_attempts", "editorial_tolerance"], "Soglie dello studio SLOP salvate.");
  numbersForm("#library-games-form", ["open_game_hours"], "Durata massima di una partita aperta salvata.");
  statsView = mountStats($<HTMLElement>("#stats-body"), period => call<Stats>("/stats?" + new URLSearchParams({ period })));
  // Leaderboard: check a code, hide or show an entry.
  interface Entry { id: string; nickname: string; level_label: string; score: number; photos: number; balanced_accuracy: number; hidden: boolean; created_at: string }
  const entryLine = (e: Entry) => `${escape(e.nickname)} / ${escape(e.level_label)} / ${e.score.toLocaleString("it-IT", { minimumFractionDigits: 1 })} punti / ${Math.round(e.balanced_accuracy * 100)}% / ${escape(when(e.created_at))}${e.hidden ? " / <strong>nascosta</strong>" : ""}`;
  const leaderboardCall = async <T>(path: string, init: RequestInit = {}) => {
    const response = await fetch("/api/admin/leaderboard" + path, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json" } });
    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw Error(data.error || "Connessione non disponibile");
    return data;
  };
  const refreshEntries = async () => {
    const { entries } = await leaderboardCall<{ entries: Entry[] }>("");
    $("#library-entries").innerHTML = entries.map(e => `<li data-entry="${escape(e.id)}">${entryLine(e)} <button type="button" data-entry-hide="${escape(e.id)}" data-hidden="${!e.hidden}">${e.hidden ? "Mostra" : "Nascondi"}</button> <button type="button" class="danger" data-entry-delete="${escape(e.id)}">Cancella</button></li>`).join("") || "<li>Nessuna voce.</li>";
  };
  $("#library-code").addEventListener("submit", async event => {
    event.preventDefault();
    const code = String(new FormData(event.target as HTMLFormElement).get("code") || "");
    try {
      const result = await leaderboardCall<{ found: boolean; entry: Entry | null }>("?" + new URLSearchParams({ code }));
      $("#library-code-result").innerHTML = result.entry ? "Codice valido: " + entryLine(result.entry) + ` <button type="button" class="danger" data-entry-delete="${escape(result.entry.id)}">Cancella</button>` : "Nessuna partita con questo codice.";
    } catch (error) { $("#library-code-result").textContent = String(error instanceof Error ? error.message : error); }
  });
  // Deleting an entry for good, for example when a player shows the code and asks for it (privacy notice).
  $("#library-leaderboard").addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-entry-delete]");
    if (!button) return;
    if (!window.confirm("Cancellare definitivamente questa voce della classifica? Non si può annullare.")) return;
    try {
      await leaderboardCall("/" + encodeURIComponent(button.dataset.entryDelete!), { method: "DELETE" });
      $("#library-code-result").textContent = "Voce cancellata.";
      await refreshEntries();
    } catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); }
  });
  $("#library-entries").addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-entry-hide]");
    if (!button) return;
    try { await leaderboardCall("/" + encodeURIComponent(button.dataset.entryHide!), { method: "POST", body: JSON.stringify({ hidden: button.dataset.hidden === "true" }) }); await refreshEntries(); }
    catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); }
  });
  $("#library-leaderboard").addEventListener("toggle", () => { if (($("#library-leaderboard") as HTMLDetailsElement).open) void refreshEntries().catch(error => settingsMessage(String(error))); });
  // Opened while the dashboard was still loading: the toggle came before this listener, so load the entries now.
  if (($("#library-leaderboard") as HTMLDetailsElement).open) void refreshEntries().catch(error => settingsMessage(String(error)));
  distribution = mountDistribution($<HTMLElement>("#db-distribution"), () => call<Distribution>("/distribution"));
  // Bind every command before startup requests: visible forms must never submit natively while data loads.
  // The REAL wizard is the section shown first: it is mounted before the others load.
  realWizard = await mountRealWizard($<HTMLElement>("#real-wizard"), async () => { await Promise.all([load(), refreshTags(), refreshAnalysis()]); })
    .catch(error => { $("#real-wizard").textContent = String(error instanceof Error ? error.message : error); return null; });
  await Promise.all([load(), refreshTags(), refreshAnalysis()]).catch(error => message(String(error instanceof Error ? error.message : error)));
  await refreshContexts().catch(error => settingsMessage(String(error instanceof Error ? error.message : error)));
  await refreshModels().catch(error => settingsMessage(String(error instanceof Error ? error.message : error)));
  await call<Numbers>("/settings").then(n => renderNumbers(n)).catch(error => settingsMessage(String(error instanceof Error ? error.message : error)));
  tagPills();
  slopStudio = await mountSlopStudio($<HTMLElement>("#slop-studio"), n => { $("#slop-attention-count").textContent = n ? ` / ${n} da vedere` : ""; });
  // Automatic generation controls, balance notification, progress and review (spec `generazione-slop`).
  autoBox = mountSlopAuto($<HTMLElement>("#slop-auto"), $<HTMLElement>("#slop-auto-controls"), {
    loop: async batchId => {
      sessionStorage.setItem("ros-editorial-studio-v1",batchId);
      page.querySelector<HTMLButtonElement>('[data-admin-tab="slop"]')!.click();
      page.querySelector<HTMLButtonElement>('[data-generation-mode="manual"]')!.click();
      await slopStudio.refresh();
    },
    review: async batchId => {
      filter.batch = batchId; filter.status = "library"; selected.clear();
      page.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === "library")));
      page.querySelector<HTMLButtonElement>('[data-admin-tab="database"]')!.click();
    },
    changed: async () => { await Promise.all([load(), refreshTags()]); },
    indicator: n => { $("#slop-auto-count").textContent = n ? ` (${n})` : ""; },
  });
  await autoBox.refresh();
  $("#dashboard-loading").remove();
  try { const saved = sessionStorage.getItem("ros-admin-section"); if (saved && ["real","slop","database","stats","settings"].includes(saved)) page.querySelector<HTMLButtonElement>(`[data-admin-tab="${saved}"]`)?.click(); } catch { /* storage unavailable */ }
}

