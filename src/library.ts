import { galleryCards, galleryOptions, mountGalleryEditor, type GalleryList } from "./galleries";
/** Admin dashboard, with the gallery browser and wizards, statistics and settings. */
import "./library.css";
import { mountAdminWorkspace } from "./admin-workspace";
import "./admin-navigation.css";
import "./caption-count.css";
import "./admin-loading.css";
import "./model-context.css";
import { mountSlopAuto } from "./slop-auto";
import { mountStats, type Stats } from "./stats";
import { mountDistribution, type Distribution } from "./database-chart";
import "./database.css";
import { imageLabel } from "../shared/image-label";
import { galleryPhotosPath, galleryWizardPath } from "./gallery-paths";
import { onLongPress, openPreview } from "./image-preview";
import { content, escape } from "./main";
import { type TreatableItem, measureMissing, prepareItemCopy } from "./game-copy";
import { chooseTreatment } from "./treatment-editor";
import { METRICS_VERSION, type Metrics, type Monochrome, type Treatment } from "../shared/copy-treatment";
import { editFrame } from "./crop-editor";
import { withPhotoProcessing } from "./photo-processing";
import { FORMAT_LABELS, type Crop } from "../shared/game-copy";
import { markGameMedia } from "./media-mark";
import { detailText, MEASURE_FORMULA, type Observation, type Scores } from "../shared/real-measure";
import type { VisualDescription } from "../shared/real-description";
import { describePhotos, indexRealPhotos, visualDescription, type IndexTarget } from "./real-description";

type Status = "new" | "approved" | "published" | "trash";
interface Item extends TreatableItem {
  id: string; gallery_id: string; origin: "REAL" | "SLOP"; status: Status; trashed_from: Status | null; title?: string; description?: string;
  source_url: string; author: string; license_name: string; license_url: string;
  prompt: string; model: string; width: number; height: number; copy: { width: number; height: number; bytes: number; crop: Crop | null; sha256: string | null } | null;
  rights_confirmed: boolean; revision: number; file: string; original: string; updated_at: string; created_at: string;
  stats: { views: number; correct: number }; in_play: number; no_derivatives: boolean;
  metrics: Metrics | null; treatment: Treatment | null; copy_sha?: string;
  /** REAL only: last nightly check of the Commons page and when the file was found missing (spec `libreria-immagini`, section 9). */
  source_checked_at?: string | null; source_missing_at?: string | null;
  /** REAL only: latest crowding and detail and the scores above the gallery's thresholds (spec `libreria-immagini`, section 10). */
  measure?: Measure | null;
  /** REAL only: ideas of falsification and why the model proposed none (specification `generazione-slop`, section 2). */
  ideas?: Idea[]; ideas_reason?: string;
  has_visual_description?: boolean; visual_description?: VisualDescription | null;
}
/** `status`: as stored; `state`: «review» for an idea not used written for other instructions or another gallery. */
interface Idea { id: string; idea: string; genre: string; changes: string; status: "proposed" | "approved" | "used"; state: "proposed" | "approved" | "used" | "review"; busy: boolean; used_at: string | null }
const IDEA_STATE: Record<Idea["state"], string> = { proposed: "proposta", approved: "approvata", used: "usata", review: "da rivedere" };

interface Measure extends Scores { id: string; model: string; created_at: string; objects: number; formula: number; over: (keyof Scores)[]; limits: Scores | null }
/** A REAL with no measure, or measured with an earlier formula: the group «Misura» includes it. */
const toMeasure = (item: Item) => item.origin === "REAL" && (!item.measure || item.measure.formula < MEASURE_FORMULA);
interface StoredMeasure extends Omit<Measure, "over" | "limits"> { observation: Observation }
const SCORE_LABEL: Record<keyof Scores, string> = { crowdedness: "affollamento", detail: "dettaglio" };
/** Text of the scores above the thresholds, e.g. «affollamento 80 oltre la soglia di 67». */
const overText = (m: Measure) => m.over.map(k => `${SCORE_LABEL[k]} ${m[k]} oltre la soglia di ${m.limits?.[k]}`).join(", ");
interface ModelOption { id: string; available: boolean | null; qualities?: string[]; shutdown?: string | null }
interface Models { text_model: string; image_model: string; image_quality: string; text_models: ModelOption[]; image_models: ModelOption[]; note: string }
interface ContextVersion { id: string; body: string; created_at: string; pipeline: number }
interface ContextState { max: number; parts: { part: string; current: { id: string; body: string }; history: ContextVersion[]; proposed?: string | null }[] }
const API = "/api/admin/library";
const STATUS_LABEL: Record<string, string> = { library: "Tutte", new: "Nuove", approved: "Approvate", published: "Pubblicate", trash: "Cestino" };
const STATE_LABEL: Record<Status, string> = { new: "nuova", approved: "approvata", published: "pubblicata", trash: "nel cestino" };
/** A section still loading: a short line with a spinner (src/admin-loading.css). */
const loading = (text = "Caricamento…") => `<p class="admin-loading" role="status">${text}</p>`;
const FIELDS: [keyof Item, string, number, boolean][] = [
  ["title", "Titolo", 200, false], ["description", "Descrizione della fonte", 1000, true], ["source_url", "Pagina della fonte", 1000, false],
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
const COLOUR_LABEL: Record<Monochrome, string> = { "": "a colori", "black-and-white": "in bianco e nero", sepia: "seppia" };
const kb = (bytes: number) => bytes < 1024 ? bytes + " byte" : Math.round(bytes / 1024) + " kB";

async function bulkUpdate(action: string, ids: string[], fields: Record<string, unknown>) {
  const result = { done: 0, deleted: 0, postponed: 0, failed: [] as { id: string; error: string }[] };
  // A publication can prepare the DB state and copy the image to R2 for every photo.
  const batchSize = 50;
  for (let start = 0; start < ids.length; start += batchSize) {
    const part = await call<Partial<typeof result>>("/bulk", { method: "POST",
      body: JSON.stringify({ ...fields, action, ids: ids.slice(start, start + batchSize) }) });
    result.done += part.done ?? 0;
    result.deleted += part.deleted ?? 0;
    result.postponed += part.postponed ?? 0;
    result.failed.push(...(part.failed ?? []));
  }
  return result;
}

export async function showLibrary() {
  let galleryList: GalleryList | null = null;
  const galleries = () => galleryList?.galleries || [];
  let items: Item[] = [], selected = new Set<string>(), open: Item | null = null, busy = false, undescribed = 0, unindexed = 0;
  const SORT_KEY = "ros-library-sort";
  let sort = { by: "added", order: "desc" };
  try { const saved = JSON.parse(localStorage.getItem(SORT_KEY) || "null") as typeof sort | null;
    if (saved && ["added", "views", "accuracy"].includes(saved.by) && ["asc", "desc"].includes(saved.order)) sort = saved; } catch { /* private browsing */ }
  let measuring = false;
  const filter = { status: "library", origin: "all", q: "", batch: "", gallery: "" };
  let models: Models | null = null;
  let statsView: { refresh: () => Promise<void> } = { refresh: async () => {} };
  let distribution: { refresh: () => Promise<void> } = { refresh: async () => {} };
  content().innerHTML = `<section class="library page" aria-labelledby="library-title">
    <header class="library-head"><h1 id="library-title">Dashboard</h1><span id="dashboard-loading">${loading("Caricamento della dashboard…")}</span></header>
    <nav class="admin-tabs" aria-label="Sezioni amministrazione">
      <button type="button" data-admin-tab="galleries" aria-pressed="true">Gallerie</button>
      <button type="button" data-admin-tab="stats" aria-pressed="false">Statistiche</button>
      <button type="button" data-admin-tab="settings" aria-pressed="false">Impostazioni</button>
    </nav>
    <section id="admin-galleries" class="admin-panel" aria-labelledby="galleries-title">
      <div class="gallery-section-head"><h2 id="galleries-title">Gallerie</h2><button type="button" class="primary" data-gallery-create disabled>Nuova galleria</button></div>
      <a class="button" id="gallery-active-batch" hidden></a>
      <p id="gallery-navigation-status" role="status" hidden></p>
      <div id="gallery-cards">${loading("Caricamento delle gallerie…")}</div>
    </section>
    <dialog id="gallery-workspace" class="gallery-workspace" aria-labelledby="gallery-title">
      <div class="gallery-workspace-head">
        <div class="gallery-title-row"><h2 id="gallery-title" tabindex="-1" autofocus></h2><button type="button" data-gallery-close aria-label="Chiudi galleria">×</button></div>
        <div class="gallery-actions">
          <a class="button primary" id="gallery-upload-link">Carica REAL</a>
          <a class="button" id="gallery-generation-link">Genera SLOP</a>
          <button type="button" id="library-describe-gallery" hidden>Descrivi le REAL</button>
          <button type="button" id="library-index-gallery" hidden>Indicizza le descrizioni</button>
          <button type="button" data-gallery-edit>Modifica galleria</button>
        </div>
      </div>
      <div class="gallery-workspace-scroll">
    <div id="db-images">
    <p id="library-counts" aria-live="polite"></p>
    <div class="db-search-row"><label>Cerca nella galleria<input id="library-search" type="search" placeholder="ID, titolo REAL, descrizione o prompt"></label></div><details class="db-filter-panel"><summary>Filtri e ordinamento</summary><div class="library-toolbar">
      <nav class="library-views" aria-label="Viste">${Object.entries(STATUS_LABEL).map(([key, label]) =>
        `<button type="button" data-view="${key}" aria-pressed="${key === "library"}">${label}</button>`).join("")}</nav>
      <label>Origine<select id="library-origin"><option value="all">REAL e SLOP</option><option value="REAL">REAL</option><option value="SLOP">SLOP</option></select></label>
      <label>Ordina per<select id="library-sort"><option value="added">data di aggiunta</option><option value="views">visualizzazioni</option><option value="accuracy">accuratezza</option></select></label>
      <label>Ordine<select id="library-order"><option value="desc">decrescente</option><option value="asc">crescente</option></select></label>
    </div></details>
    <div class="library-add"><button type="button" id="library-select-all" hidden>Seleziona tutte</button><button type="button" id="library-empty-trash" hidden>Svuota cestino</button></div>
    <p id="library-batch-filter" class="library-batch-filter" hidden><span>Batch automatico in corso: solo le sue immagini.</span><button type="button" data-batch-clear>Mostra tutte</button></p>
    <ul id="library-grid" class="library-grid" aria-label="Immagini"><li class="library-grid-loading">${loading("Caricamento delle immagini…")}</li></ul>
    <button type="button" id="library-more" hidden>Carica altre foto</button>
    </div>
    </div>
    <div class="gallery-workspace-footer">
      <div id="library-selection" class="library-selection" role="group" aria-label="Azioni per le foto selezionate" hidden>
        <strong id="library-selection-count" aria-live="polite"></strong>
        <div class="library-selection-actions">
          <button type="button" data-bulk="set-approved">Approva</button>
          <button type="button" data-bulk="set-published">Pubblica</button>
          <button type="button" data-bulk="withdraw" hidden>Togli dalla pubblicazione</button>
          <button type="button" data-bulk="trash" aria-label="Sposta nel cestino">Nel cestino</button>
          <button type="button" data-bulk="restore" hidden>Ripristina</button>
          <button type="button" data-bulk="delete" class="danger" hidden>Elimina definitivamente</button>
          <button type="button" data-bulk="gallery">Cambia galleria</button>
          <button type="button" data-bulk="measure" hidden>Misura</button>
        </div>
        <button type="button" data-bulk="none">Deseleziona</button>
      </div>
      <p id="library-message" role="status" aria-live="polite"></p>
    </div>
    </dialog>
    <dialog id="library-move-gallery" class="gallery-editor" aria-labelledby="library-move-title">
      <div class="gallery-title-row"><h2 id="library-move-title">Cambia galleria</h2></div>
      <form class="gallery-form">
        <label>Galleria di destinazione<select id="library-bulk-gallery" required autofocus></select></label>
        <div class="library-inline"><button type="button" id="library-cancel-move">Annulla</button><button type="submit" class="primary">Sposta</button></div>
      </form>
    </dialog>
    <dialog id="gallery-editor" class="gallery-editor" aria-labelledby="gallery-editor-title">
      <div class="gallery-title-row"><h2 id="gallery-editor-title"></h2><button type="button" data-gallery-editor-close aria-label="Chiudi il modulo">×</button></div>
      <div data-gallery-form></div>
    </dialog>
    <section id="admin-stats" class="admin-panel" hidden><h2>Statistiche</h2><div id="slop-auto" class="slop-auto" role="region" aria-label="Equilibrio del dataset" hidden></div>
      <div id="stats-body">${loading()}</div>
      <details id="stats-distribution"><summary>Distribuzione delle immagini</summary><div id="db-distribution">${loading()}</div></details>
    </section>
    <section id="admin-settings" class="admin-panel" hidden><h2>Impostazioni</h2>
    <p id="library-settings-message" role="status" aria-live="polite"></p>
    <details id="library-contexts" class="library-vocabulary"><summary>Contesto dei modelli</summary>
      <p class="hint">Testi fissi inviati al modello linguistico. Ogni salvataggio crea una nuova versione; le precedenti restano e si possono ripristinare. Ogni generazione registra la versione usata. Formato della risposta e controlli restano nel codice.</p>
      <div id="library-contexts-body">${loading()}</div></details>
    <details id="library-leaderboard" class="library-vocabulary"><summary>Classifica</summary>
      <p class="hint">Chi entra in classifica riceve un codice partita, mostrato una sola volta. Se qualcuno ti mostra un codice, controllalo qui: il sito ne conserva solo l'impronta. Una voce nascosta non compare nella classifica pubblica; «Cancella» la elimina per sempre, per esempio su richiesta del giocatore.</p>
      <form id="library-code" class="library-inline"><label>Codice partita<input name="code" placeholder="ABCD-EFGH-JK" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label><button>Controlla</button></form>
      <p id="library-code-result" role="status" aria-live="polite"></p>
      <ol id="library-entries" class="library-entries"></ol></details>
    <details id="library-models" class="library-vocabulary"><summary>Modelli</summary>
      <p class="hint">Il modello di testo deve leggere immagini. Descrive e misura le REAL, scrive i prompt delle SLOP e valuta le SLOP. Il modello di immagini genera le SLOP. Le chiamate a pagamento richiedono conferma e seguono il limite di spesa del progetto OpenAI.</p>
      <form id="library-models-form" class="library-inline"><label>Modello di testo<select name="text_model"></select></label><label>Modello di immagini<select name="image_model"></select></label><label>Qualità delle immagini<select name="image_quality"></select></label></form>
      <p id="library-models-note" class="hint"></p>
      <p class="hint">La qualità vale per le SLOP generate dal wizard «Genera SLOP».</p></details>
    <details id="library-thresholds" class="library-vocabulary"><summary>Generazione SLOP</summary>
      <form id="library-thresholds-form" class="library-inline">
        <label>Tentativi massimi per SLOP<input type="number" name="max_generation_attempts" required></label><label>Tolleranza (0 rigorosa, 1 normale, 2 permissiva)<input type="number" name="editorial_tolerance" required></label>
        <button>Salva</button></form>
      <p class="hint">Apri una galleria e scegli «Genera SLOP»: il wizard estrae le REAL di riferimento dalla galleria.</p></details>
    <details id="library-games" class="library-vocabulary"><summary>Partite</summary>
      <form id="library-games-form" class="library-inline"><label>Durata massima di una partita aperta (ore)<input type="number" name="open_game_hours" required></label><button>Salva</button></form>
      <p class="hint">Oltre questo tempo una partita non conclusa non trattiene più le copie delle foto ritirate o modificate, e la sua foto può non essere più disponibile. I livelli del gioco sono fissi nel codice.</p></details>
    <details id="library-measures" class="library-vocabulary"><summary>Misure delle REAL</summary>
      <form id="library-measures-form" class="library-inline"><label>Soglia predefinita di affollamento<input type="number" name="crowdedness_threshold" required></label><label>Soglia predefinita di dettaglio<input type="number" name="detail_threshold" required></label><button>Salva</button></form>
      <p class="hint">Un modello misura su richiesta, con una chiamata a pagamento per foto, quanto è affollata e dettagliata una REAL. Affollamento: 100·n/(n+5), con n gli oggetti riconoscibili oltre al soggetto (5 oggetti valgono 50, 10 valgono 67). Dettaglio: per ogni oggetto sette categorie di dettaglio, ciascuna con grado 0 (assente), 1 (leggibile) o 2 (fitto o minuto), in quota sul massimo; media pesata sull’area degli oggetti. Una REAL con un valore oltre la soglia della sua galleria è segnalata nella griglia e nel dettaglio. Ogni galleria può avere soglie proprie in «Modifica galleria»; senza, valgono queste. 100 non pone limiti.</p></details>
    <details id="library-sources" class="library-vocabulary"><summary>Fonti Commons</summary>
      <form id="library-sources-form" class="library-inline"><label>REAL controllate ogni notte<input type="number" name="commons_checks_per_night" required></label><button>Salva</button></form>
      <p class="hint">Ogni notte si chiede a Wikimedia Commons se il file di queste REAL esiste ancora, cominciando da quelle controllate da più tempo; ogni foto torna in coda tre mesi dopo l’ultimo controllo. Un file sparito è solo segnalato nella galleria. Le richieste a Commons sono da 50 foto; 0 sospende il controllo.</p></details></section>
    <dialog id="library-detail" class="library-detail" aria-labelledby="library-detail-title"></dialog>
  </section>`;
  const page = content().querySelector<HTMLElement>(".library")!;
  mountAdminWorkspace(page);
  const $ = <T extends HTMLElement>(selector: string) => page.querySelector<T>(selector)!;
  const message = (text: string) => { $("#library-message").textContent = text; };
  const settingsMessage = (text: string) => { $("#library-settings-message").textContent = text; };

  const galleryDialog = $<HTMLDialogElement>("#gallery-workspace");
  const galleryEditorDialog = $<HTMLDialogElement>("#gallery-editor");
  let savedGallery = "";
  const galleryEditor = mountGalleryEditor(galleryEditorDialog, call, async id => {
    await refreshGalleries();
    savedGallery = id;
  }, id => {
    if (galleryList) showGalleries({ ...galleryList, galleries: galleries().filter(g => g.id !== id) });
    closeGallery();
    $("[data-gallery-create]").focus({ preventScroll: true });
    void autoBox.refresh().catch(report);
  });
  galleryEditorDialog.addEventListener("close", () => {
    if (savedGallery) { const id = savedGallery; savedGallery = ""; void openGallery(id).catch(report); }
  });
  const showGalleries = (list: GalleryList) => {
    galleryList = list;
    const cards = $("#gallery-cards"), focused = (document.activeElement as HTMLElement | null)?.dataset.galleryOpen;
    cards.innerHTML = galleryCards(list.galleries);
    if (focused) cards.querySelector<HTMLElement>(`[data-gallery-open="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    $<HTMLButtonElement>("[data-gallery-create]").disabled = false;
    const current = list.galleries.find(g => g.id === filter.gallery);
    if (current) $("#gallery-title").textContent = current.title;
  };
  const refreshGalleries = async () => { showGalleries(await call<GalleryList>("/galleries")); };
  const report = (error: unknown) => message(error instanceof Error ? error.message : String(error));

  let searchTimer = 0;
  $("#library-search").addEventListener("input", event => {
    filter.q = (event.target as HTMLInputElement).value.trim();
    window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { void load().catch(error => message(String(error))); }, 250);
  });
  // The list of the last request wins: a slower, older answer never overwrites a newer one.
  let loadSeq = 0, nextPage: number | null = null;
  const load = async (append = false) => {
    const offset = append ? nextPage : 0;
    if (!filter.gallery || offset === null) return;
    const seq = ++loadSeq, more = $<HTMLButtonElement>("#library-more");
    more.disabled = true;
    if (!append) { more.hidden = true; nextPage = null; }
    const params = new URLSearchParams({
      status: filter.status, origin: filter.origin, q: filter.q,
      batch: filter.batch, gallery: filter.gallery, offset: String(offset), sort: sort.by, order: sort.order,
    });
    $("#library-batch-filter").hidden = !filter.batch;
    try {
      const data = await call<{ items: Item[]; next: number | null; counts: { status: string; origin: string; n: number }[];
        undescribed: number; unindexed: number }>("?" + params);
      if (seq !== loadSeq) return;
      undescribed = data.undescribed;
      unindexed = data.unindexed;
      const added = append ? data.items.filter(item => !items.some(i => i.id === item.id)) : data.items;
      items = append ? [...items, ...added] : added;
      nextPage = data.next;
      selected = new Set([...selected].filter(id => items.some(item => item.id === id)));
      const count = (status: string) => data.counts.filter(c => c.status === status).reduce((n, c) => n + c.n, 0);
      $("#library-counts").textContent = `${count("new")} nuove / ${count("approved")} approvate / ${count("published")} pubblicate / ${count("trash")} nel cestino`;
      $("#library-empty-trash").hidden = filter.status !== "trash" || !count("trash");
      render(append ? added : undefined);
      // Copies without current-version measurements are measured in the browser, one at a time.
      if (!measuring && added.some(i => i.metrics?.v !== METRICS_VERSION && i.copy)) {
        measuring = true;
        void measureMissing(added.map(i => ({ id: i.id, metrics: i.metrics, copy: i.copy ? { sha256: i.copy.sha256 } : null }))).finally(() => { measuring = false; });
      }
    } finally {
      if (seq === loadSeq) { more.disabled = false; more.hidden = nextPage === null; }
    }
  };
  const rate = (item: Item) => item.stats.views ? ` (${Math.round(item.stats.correct / item.stats.views * 100)}%)` : "";
  const statsLine = (item: Item) => `<span class="db-stats" data-stats>Vista <strong>${item.stats.views}</strong> ${item.stats.views === 1 ? "volta" : "volte"} / classificata correttamente <strong>${item.stats.correct}</strong>${rate(item)}</span>`;
  const preview = (item: Item) => openPreview(item.origin === "REAL"
    ? { src: item.file, alt: imageLabel(item), title: imageLabel(item), description: item.description,
      link: item.source_url ? { href: item.source_url, label: "Apri la pagina su Commons" } : undefined,
      extra: item.measure?.over.length ? `<p class="db-edit-note" data-over-threshold>Oltre la soglia della galleria: ${escape(overText(item.measure))}.</p>` : "" }
    : { src: item.file, alt: imageLabel(item), title: imageLabel(item),
      extra: (item.prompt ? `<p><span class="image-preview-label">Prompt</span><br><q lang="en">${escape(item.prompt)}</q></p>` : "") });
  const card = (item: Item) => `<li class="library-card${selected.has(item.id) ? " is-selected" : ""}" data-id="${escape(item.id)}">
    <label class="library-check"><input type="checkbox" data-select="${escape(item.id)}" ${selected.has(item.id) ? "checked" : ""} aria-label="Seleziona ${escape(imageLabel(item))}"></label>
    <button type="button" class="library-open" data-open="${escape(item.id)}" data-long-press aria-label="Apri ${escape(imageLabel(item))}"${item.origin === "REAL" && !item.has_visual_description ? ' aria-description="Descrizione visiva mancante"' : ""}>
      <img src="${escape(item.file)}" alt="" loading="lazy" draggable="false">${item.origin === "REAL" && !item.has_visual_description
        ? '<span class="library-description-icon" data-description-missing title="Descrizione visiva mancante" aria-hidden="true">▤</span>' : ""}
      <span class="library-badges"><span class="badge badge-${item.origin.toLowerCase()}">${item.origin}</span>
      <span class="badge badge-status">${STATE_LABEL[item.status]}</span>${item.source_missing_at
        ? '<span class="badge badge-warn" data-source-missing title="Il file non risulta più su Wikimedia Commons">Fonte rimossa</span>' : ""}${item.measure?.over.length
        ? `<span class="badge badge-warn badge-symbol" data-over-threshold role="img" title="${escape("Oltre la soglia della galleria: " + overText(item.measure))}" aria-label="${escape("Oltre la soglia: " + overText(item.measure))}">\u26a0\ufe0e</span>` : ""}</span>
    </button></li>`;
  const selectionBar = () => {
    const bar = $("#library-selection");
    bar.hidden = !selected.size;
    $("#library-selection-count").textContent = `${selected.size} ${selected.size === 1 ? "selezionata" : "selezionate"}`;
    const trash = filter.status === "trash";
    const describe = $<HTMLButtonElement>("#library-describe-gallery");
    describe.hidden = trash || !galleryList?.paid_calls || !undescribed;
    describe.disabled = busy;
    describe.textContent = `Descrivi le REAL (${undescribed})`;
    const index = $<HTMLButtonElement>("#library-index-gallery");
    index.hidden = trash || !galleryList?.paid_calls || !unindexed;
    index.disabled = busy;
    index.textContent = `Indicizza le descrizioni (${unindexed})`;
    const chosen = items.filter(item => selected.has(item.id));
    for (const button of bar.querySelectorAll<HTMLButtonElement>("[data-bulk]")) {
      const action = button.dataset.bulk;
      if (action === "withdraw") button.hidden = trash || !chosen.some(item => item.status === "published");
      else if (action === "set-approved") button.hidden = trash || !chosen.some(item => item.status === "new");
      else if (action === "measure") button.hidden = trash || !galleryList?.paid_calls || !chosen.some(toMeasure);
      else if (action !== "none" && action !== "gallery") button.hidden = trash !== (action === "restore" || action === "delete");
      button.disabled = busy || (action === "gallery" && !galleries().some(g => g.id !== filter.gallery));
    }
    const all = $<HTMLButtonElement>("#library-select-all");
    all.hidden = !items.length || items.every(item => selected.has(item.id));
    all.textContent = `Seleziona tutte (${items.length})`;
  };
  const syncSelection = () => {
    for (const check of page.querySelectorAll<HTMLInputElement>("#library-grid [data-select]")) {
      check.checked = selected.has(check.dataset.select!);
      check.closest(".library-card")?.classList.toggle("is-selected", check.checked);
    }
    selectionBar();
  };
  const render = (added?: Item[]) => {
    const grid = $("#library-grid");
    if (added) grid.insertAdjacentHTML("beforeend", added.map(card).join(""));
    else grid.innerHTML = items.length ? items.map(card).join("") : `<li class="library-empty">${filter.status === "trash" ? "Il cestino è vuoto." : "Non ci sono foto in questa vista."}</li>`;
    selectionBar();
  };

  // Press and hold a card: the large preview; a short press opens the detail.
  onLongPress($("#library-grid"), "[data-open]", element => { const item = items.find(i => i.id === element.dataset.open); if (item) preview(item); });

  // Detail: every change is saved at once.
  const detail = $<HTMLDialogElement>("#library-detail");
  let saving: Promise<unknown> = Promise.resolve();
  const save = (item: Item, change: Partial<Record<keyof Item, unknown>>): Promise<Item> => {
    const request = saving.catch(() => {}).then(async () => {
      const latest = items.find(i=>i.id===item.id) || (open?.id===item.id ? open : item);
      const updated = await call<Item>("/" + encodeURIComponent(item.id), { method: "PATCH", body: JSON.stringify({ revision: latest.revision, ...change }) });
      items = items.map(i => i.id === updated.id ? updated : i);
      return updated;
    });
    saving = request; return request;
  };
  const metricText = (m: Metrics) => `lato ${m.long} px / rumore ${m.noise.toFixed(1)} / nitidezza ${m.sharpness.toFixed(1)} / contrasto ${m.contrast} / saturazione ${m.saturation.toFixed(2)}`;
  /** Measures of the copy and, for a SLOP, its treatment with the commands (free; they make the copy again). */
  const measuresBlock = (item: Item, editable: boolean) => {
    const t = item.treatment;
    const treatment = item.origin !== "SLOP" ? "" : !t ? '<p class="hint" data-treatment>Copia senza trattamento.</p>'
      : `<p class="hint" data-treatment>${t.off ? "Trattamento spento" : `Trattamento fotografico${t.applied ? " " + COLOUR_LABEL[t.applied.monochrome] : ""}` +
        (t.settings ? ", regolato dall'owner" : "") + (t.gap !== undefined ? `, scarto dall'obiettivo ${Math.round(t.gap * 100)}%` : "") + `: ${metricText(t.sample.metrics)}`}.</p>`;
    const commands = item.origin === "SLOP" && editable && item.copy ? `<div class="library-inline" data-treatment-commands>` +
      (t && !t.off ? '<button type="button" id="library-treatment-off">Senza trattamento</button>'
        : '<button type="button" id="library-treatment-on">Con trattamento</button>') +
      (t ? '<button type="button" id="library-treatment-edit">Regola il trattamento</button>' : "") + "</div>" : "";
    return (item.metrics ? `<p class="hint" data-metrics>Misure della copia: ${metricText(item.metrics)}.</p>` : "") + treatment + commands;
  };
  const day = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  /** Nightly check of the Commons source: a flag only, the owner decides (spec `libreria-immagini`, section 9). */
  const sourceCheck = (item: Item) => item.origin !== "REAL" ? "" : item.source_missing_at
    ? `<p class="db-edit-note" data-source-missing>Dal ${day(item.source_missing_at)} il file non risulta più su Wikimedia Commons. Commons
      cancella soprattutto per problemi di diritti: verifica la pagina della fonte. Se la licenza non è più sostenibile, togli la foto dalla
      pubblicazione o spostala nel cestino; se il file è stato spostato, correggi la pagina della fonte, che sarà ricontrollata la notte
      successiva.</p>`
    : item.source_checked_at ? `<p class="hint" data-source-checked>Fonte presente su Commons al ${day(item.source_checked_at)}.</p>` : "";
  /** Warning of a REAL above the thresholds of its gallery: a flag only, the owner decides (owner decision of 2026-11-21). */
  const overWarning = (item: Item) => item.measure?.over.length ? `<p class="db-edit-note" data-over-threshold>Oltre la soglia della
    galleria: ${escape(overText(item.measure))}. Il generatore di immagini potrebbe faticare a riprodurre una foto simile. Le soglie si
    cambiano da «Modifica galleria».</p>` : "";
  /** Crowding and detail of a REAL, with the command of the paid measure and, on request, the objects seen and the earlier measures. */
  const measureBlock = (item: Item) => {
    if (item.origin !== "REAL") return "";
    const m = item.measure, paid = !!galleryList?.paid_calls && item.status !== "trash";
    return `<section class="library-measure" data-measure><h3>Affollamento e dettaglio</h3>
      ${m ? `<p data-measure-values>Affollamento <strong>${m.crowdedness}</strong>/100 (${m.objects} ${m.objects === 1 ? "oggetto" : "oggetti"} oltre il soggetto),
        dettaglio <strong>${m.detail}</strong>/100${m.limits ? `; soglie della galleria ${m.limits.crowdedness} e ${m.limits.detail}` : ""}.
        Misura del ${escape(when(m.created_at))} con ${escape(m.model)}.</p>
        ${m.formula < MEASURE_FORMULA ? '<p class="hint" data-measure-old>Misura con la formula precedente (sei categorie, senza gradi): il dettaglio non è confrontabile con le misure nuove. Misurala di nuovo.</p>' : ""}`
        : '<p class="hint" data-measure-values>Non ancora misurata.</p>'}
      ${paid ? `<p><button type="button" id="library-measure">${m ? "Misura di nuovo" : "Misura"} (1 chiamata)</button></p>` : ""}
      ${m ? '<details data-measure-history><summary>Oggetti riconosciuti e misure precedenti</summary><div data-measure-history-body></div></details>' : ""}
    </section>`;
  };
  /** Proposals of a REAL, read only: they are written, asked to the model and chosen in the SLOP wizard (owner decision of 2026-11-22). */
  const ideasBlock = (item: Item) => {
    if (item.origin !== "REAL") return "";
    const ideas = item.ideas || [];
    return `<section class="library-ideas" data-ideas><h3>Proposte SLOP</h3>
      <p class="hint">Si scrivono, si chiedono al modello e si scelgono nel wizard «Genera SLOP». Ogni proposta dà al massimo una SLOP.</p>
      ${!ideas.length ? `<p class="hint" data-ideas-reason>${item.ideas_reason ? "Il modello non ha proposto idee: " + escape(item.ideas_reason) : "Nessuna proposta."}</p>` : ""}
      ${ideas.length ? `<ol class="library-idea-list">${ideas.map(i => `<li data-idea="${escape(i.id)}"><span class="badge badge-idea-${i.state}">${IDEA_STATE[i.state]}</span>${i.busy ? ' <span class="hint">in un batch in corso</span>' : ""}
        <p>${escape(i.idea)}</p>${i.genre || i.changes || i.used_at ? `<p class="hint">${escape([i.genre, i.changes].filter(Boolean).join(". "))}${i.used_at ? `${i.genre || i.changes ? ". " : ""}Usata il ${escape(when(i.used_at))}.` : ""}</p>` : ""}</li>`).join("")}</ol>` : ""}
    </section>`;
  };
  /** The objects of the latest measure drawn on the whole original, with their kinds of detail, and every measure of the photo. */
  const showMeasures = (item: Item, measures: StoredMeasure[], target: HTMLElement) => {
    const latest = measures[0];
    if (!latest) { target.innerHTML = '<p class="hint">Nessuna misura.</p>'; return; }
    const o = latest.observation, objects = [{ ...o.subject, subject: true }, ...o.others.map(x => ({ ...x, subject: false }))];
    target.innerHTML = `<figure class="measure-figure"><div class="measure-frame" style="aspect-ratio:${item.width}/${item.height}"><img src="${escape(item.original)}" alt="Originale di ${escape(imageLabel(item))}" draggable="false">
      ${objects.map((x, i) => `<span class="measure-box${x.subject ? " is-subject" : ""}" style="left:${x.box.x * 100}%;top:${x.box.y * 100}%;width:${x.box.width * 100}%;height:${x.box.height * 100}%"><b>${i + 1}</b></span>`).join("")}</div>
      <figcaption class="hint">Riquadri dell'ultima misura sull'originale intero. Il soggetto è in evidenza.</figcaption></figure>
      <ol class="measure-objects">${objects.map(x => `<li>${x.subject ? "<strong>Soggetto:</strong> " : ""}${escape(x.name)}: ${escape(detailText(x.detail))}</li>`).join("")}</ol>
      ${o.unlisted ? `<p class="hint">Altri ${o.unlisted} oggetti contati e non elencati.</p>` : ""}
      <h4>Misure</h4><ol class="measure-history">${measures.map(m => `<li>${escape(when(m.created_at))}, ${escape(m.model)}: affollamento ${m.crowdedness}, dettaglio ${m.detail}, ${m.objects} oggetti oltre il soggetto${m.formula < MEASURE_FORMULA ? ", formula precedente" : ""}</li>`).join("")}</ol>`;
  };
  const showDetail = (item: Item) => {
    open = item;
    const editable = item.status === "new" || item.status === "approved";
    const fields = FIELDS.filter(([key]) => item.origin === "REAL" ? key !== "prompt" && key !== "model"
      : !["title", "description", "source_url", "author", "license_name", "license_url"].includes(key));
    detail.innerHTML = `<form method="dialog" class="library-detail-close"><button aria-label="Chiudi">×</button></form>
      <h2 id="library-detail-title">${escape(imageLabel(item))}</h2>
      <p class="hint">${item.origin} / ${STATE_LABEL[item.status]} / originale ${item.width}×${item.height}${item.copy ? ` / copia di gioco WebP ${item.copy.width}×${item.copy.height}${item.copy.crop ? ", " + FORMAT_LABELS[item.copy.crop.format] : ""}, ${kb(item.copy.bytes)}: è ciò che vedranno i giocatori` : " / copia di gioco non pronta"}</p>
      ${sourceCheck(item)}
      ${overWarning(item)}
      <div class="library-detail-body"><div class="game-media-surface library-preview"><img data-game-media draggable="false" src="${escape(item.file)}" alt="${escape(imageLabel(item))}"></div>
      <div class="library-fields"><p>${statsLine(item)}</p>
      <label>Galleria<select id="library-detail-gallery">${galleryOptions(galleries(), item.gallery_id)}</select></label>
      ${item.in_play ? `<p class="hint">In ${item.in_play} ${item.in_play === 1 ? "partita" : "partite"} in corso: continuano con la versione con cui sono iniziate; le modifiche valgono dalle partite nuove.</p>` : ""}
      ${item.status === "published" ? '<div class="db-edit-note"><p>«Modifica foto» apre i comandi di modifica e ritira la foto dalla pubblicazione. Le partite in corso mantengono la versione attuale.</p><button type="button" data-action="edit" class="primary">Modifica foto</button></div>' : ""}
      ${item.status === "approved" ? '<p class="hint">Le modifiche si salvano subito e la foto resta approvata. Pubblicala quando hai finito.</p>' : ""}
      ${item.no_derivatives ? '<p class="db-edit-note">Licenza senza opere derivate (ND): la copia di gioco è una versione modificata.</p>' : ""}
      ${!item.copy && item.status === "new" ? '<p><button type="button" id="library-copy">Prepara la copia di gioco</button></p>' : ""}
      ${editable ? '<p><button type="button" id="library-crop">Inquadratura</button></p>' : ""}
      ${measuresBlock(item, editable)}
      ${measureBlock(item)}
      ${ideasBlock(item)}
      ${item.origin === "REAL" ? item.visual_description ? visualDescription(item.visual_description)
        : item.has_visual_description ? loading("Caricamento della descrizione visiva…")
          : `<section class="editorial-description"><h3>Descrizione visiva</h3><p class="hint">Da generare.</p>${galleryList?.paid_calls && item.status !== "trash"
            ? '<button type="button" id="library-describe-photo">Genera descrizione (1 chiamata)</button>' : ""}</section>` : ""}
      ${fields.map(([key, label, max, area]) => `<label>${label}${area
        ? `<textarea data-field="${key}" maxlength="${max}" rows="3" ${editable ? "" : "readonly"}>${escape(item[key])}</textarea>`
        : `<input data-field="${key}" maxlength="${max}" value="${escape(item[key])}" ${editable ? "" : "readonly"}>`}</label>`).join("")}
      ${editable && item.origin === "SLOP" ? '<p class="hint">Per rigenerare: cestina questa SLOP e avvia un nuovo processo nello studio, con conferma e valutazione.</p>' : ""}
      <div class="library-actions">${item.status === "new" ? `${item.origin === "REAL" ? `<label><input type="checkbox" id="library-rights" ${item.rights_confirmed ? "checked" : ""}> Ho verificato diritti e licenza</label>` : ""}<button type="button" data-action="approve" class="primary">Approva</button>` : ""}
        ${item.status === "approved" ? '<button type="button" data-action="publish" class="primary">Pubblica nel gioco</button>' : ""}
        ${item.status === "published" ? '<button type="button" data-action="withdraw">Togli dalla pubblicazione</button><button type="button" data-action="remove">Elimina (nel cestino)</button>' : ""}
        ${item.status === "trash" ? '<button type="button" data-action="restore">Ripristina</button><button type="button" data-action="delete" class="danger">Elimina definitivamente</button>'
          : item.status !== "published" ? '<button type="button" data-action="trash">Elimina (nel cestino)</button>' : ""}</div>
      <p id="library-detail-message" role="status" aria-live="polite"></p></div></div>`;
    if (!detail.open) detail.showModal();
    markGameMedia(detail);
  };
  detail.addEventListener("close", () => { open = null; });
  detail.addEventListener("toggle", event => {
    const history = event.target as HTMLDetailsElement;
    if (!history.matches?.("[data-measure-history]") || !history.open || !open) return;
    const item = open, body = history.querySelector<HTMLElement>("[data-measure-history-body]")!;
    body.innerHTML = loading();
    void call<{ measures: StoredMeasure[] }>(`/${encodeURIComponent(item.id)}/measures`)
      .then(data => { if (open?.id === item.id) showMeasures(item, data.measures, body); })
      .catch(error => { body.textContent = String(error instanceof Error ? error.message : error); });
  }, true);
  const detailMessage = (text: string) => { const el = detail.querySelector("#library-detail-message"); if (el) el.textContent = text; };
  detail.addEventListener("change", async event => {
    const gallery = (event.target as HTMLElement).closest<HTMLSelectElement>("#library-detail-gallery");
    if (gallery && open) {
      const item = open;
      try {
        const updated = await save(item, {gallery_id: gallery.value});
        if (open?.id === updated.id) { showDetail(updated); detailMessage("Galleria aggiornata."); }
        await load();
      } catch (error) {
        if (open?.id === item.id) { showDetail(open); detailMessage(String(error)); }
      }
      return;
    }
    const field = (event.target as HTMLElement).closest<HTMLInputElement | HTMLTextAreaElement>("[data-field]");
    if (!field || !open || field.readOnly) return;
    try { open = await save(open, { [field.dataset.field!]: field.value }); showDetail(open); detailMessage("Salvato."); render(); }
    catch (error) { detailMessage(String(error instanceof Error ? error.message : error)); }
  });
  detail.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (button?.dataset.openSource && !busy) {
      try { showDetail(await call<Item>("/" + encodeURIComponent(button.dataset.openSource))); } catch (error) { detailMessage(String(error instanceof Error ? error.message : error)); }
      return;
    }
    if (!button || !open || busy || !(button.dataset.action || ["library-copy", "library-regenerate", "library-measure", "library-describe-photo",
      "library-crop", "library-treatment-off", "library-treatment-on", "library-treatment-edit"].includes(button.id))) return;
    const id = open.id;
    busy = true;
    try {
      if (button.id === "library-describe-photo") {
        const item = open;
        const result = await describePhotos([{ id, title: imageLabel(item) }], item.gallery_id, call<Item>, updated => { open = updated; });
        if (result === null) return;
        detailMessage(result);
      }
      else if (button.id === "library-measure") {
        if (!window.confirm(`Misurare affollamento e dettaglio di «${imageLabel(open)}» con ${galleryList?.text_model || "il modello di testo"}? Una chiamata a pagamento, mai ripetuta in automatico.`)) return;
        const item = open;
        open = await withPhotoProcessing("Misuro affollamento e dettaglio…", () => call<Item>(`/${encodeURIComponent(item.id)}/measure`,
          { method: "POST", body: JSON.stringify({ confirm: true, request: crypto.randomUUID() }) }));
        detailMessage("Misura salvata.");
      }
      else if (button.id === "library-copy") {
        const item = open;
        open = await withPhotoProcessing("Preparo la copia di gioco…", () => prepareItemCopy<Item>(item));
        detailMessage("Copia di gioco pronta.");
      }
      else if (button.id === "library-treatment-edit") {
        const choice = await chooseTreatment(open, imageLabel(open));
        if (!choice) return;
        const item = open;
        open = await withPhotoProcessing("Applico il trattamento alla foto…", () => prepareItemCopy<Item>(item, undefined, choice));
        detailMessage(choice.settings ? "Trattamento regolato salvato." : "Trattamento proposto salvato.");
      }
      else if (button.id.startsWith("library-treatment-")) {
        const off = button.id === "library-treatment-off";
        const item = open;
        open = await withPhotoProcessing("Elaboro la copia di gioco…", () => prepareItemCopy<Item>(item, undefined, { off }));
        detailMessage(open.treatment && !open.treatment.off ? "Copia trattata." : open.treatment ? "Copia senza trattamento." : "Misure della REAL di riferimento non disponibili: copia senza trattamento.");
      }
      else if (button.id === "library-crop") {
        const updated = await editFrame(open, imageLabel(open));
        if (!updated) return;
        open = updated;
        detailMessage("Inquadratura salvata.");
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
      if (detail.open && open) { showDetail(open); detailMessage(said); }
    } catch (error) {
      if (detail.open && open?.id === id) detailMessage(String(error instanceof Error ? error.message : error));
    }
    finally { busy = false; selectionBar(); }
  });

  const moveGallery = $<HTMLDialogElement>("#library-move-gallery");
  const applySelection = async (action: string, destination = "") => {
    const chosen = items.filter(item => selected.has(item.id) && (action !== "withdraw" || item.status === "published")
      && (action !== "set-approved" || item.status === "new"));
    if (!chosen.length || busy) return;
    const scope = filter.gallery, ids = chosen.map(item => item.id);
    const rights = ["set-approved", "set-published"].includes(action)
      && chosen.some(item => item.status === "new" && item.origin === "REAL" && !item.rights_confirmed);
    const removing = chosen.filter(item => item.status === "published").length;
    const notes: string[] = [];
    if (action === "trash" && removing) notes.push(`${removing} ${removing === 1 ? "immagine è pubblicata ed esce" : "immagini sono pubblicate ed escono"} subito dal gioco. Le partite in corso proseguono con la versione attuale.`);
    if (action === "withdraw") notes.push(`${removing} ${removing === 1 ? "immagine pubblicata torna approvata ed esce" : "immagini pubblicate tornano approvate ed escono"} dal gioco. Le partite in corso proseguono con la versione attuale.`);
    if (rights) notes.push("Confermi di aver verificato i diritti e la licenza delle REAL selezionate da approvare?");
    if (notes.length && !window.confirm(notes.join("\n\n") + (rights ? "" : "\n\nContinuare?"))) return;

    busy = true;
    selectionBar();
    message("Aggiornamento…");
    try {
      const result = await bulkUpdate(action, ids, {
        ...(rights ? { rights_confirmed: true } : {}),
        ...(destination ? { gallery_id: destination } : {}),
      });
      if (filter.gallery !== scope) return;
      const failures = new Set(result.failed.map(item => item.id));
      for (const id of ids) if (!failures.has(id)) selected.delete(id);
      await Promise.allSettled([load(), refreshGalleries()]);
      if (filter.gallery !== scope) return;
      message(action === "delete"
        ? `${result.deleted} eliminate definitivamente.` + (result.postponed ? ` ${result.postponed} restano nel cestino perché in partite in corso.` : "")
        : `${result.done} ${action === "gallery" ? "spostate" : "aggiornate"}.` +
          (result.failed.length ? ` ${result.failed.length} operazioni non completate. ${[...new Set(result.failed.map(item => item.error))].join(" / ")}` : ""));
    } catch (error) {
      if (filter.gallery === scope) { await load().catch(() => {}); report(error); }
    } finally { busy = false; syncSelection(); }
  };
  /** Measures, one paid call each, the selected REAL that have no measure yet or only one of an earlier formula; a REAL already
   * measured with the current formula is measured again from its detail. The calls go one at a time with the page open; an account
   * problem («OpenAI: …») stops the rest. */
  const measureSelection = async () => {
    const chosen = items.filter(item => selected.has(item.id) && item.status !== "trash" && toMeasure(item));
    if (!chosen.length || busy) return;
    const already = items.filter(item => selected.has(item.id) && item.origin === "REAL" && !toMeasure(item)).length;
    if (!window.confirm(`Misurare affollamento e dettaglio di ${chosen.length} REAL con ${galleryList?.text_model || "il modello di testo"}? ` +
      `Massimo ${chosen.length} ${chosen.length === 1 ? "chiamata" : "chiamate"} a pagamento, una per foto, mai ripetute in automatico.` +
      (already ? ` Le ${already} REAL già misurate restano escluse: si misurano di nuovo dal dettaglio.` : ""))) return;
    const scope = filter.gallery;
    busy = true; selectionBar();
    let done = 0;
    const failed: string[] = [];
    try {
      for (const [index, item] of chosen.entries()) {
        if (filter.gallery !== scope) break;
        message(`Misuro ${index + 1} di ${chosen.length}…`);
        try {
          await call(`/${encodeURIComponent(item.id)}/measure`, { method: "POST", body: JSON.stringify({ confirm: true, request: crypto.randomUUID() }) });
          done++; selected.delete(item.id);
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          failed.push(`${imageLabel(item)}: ${text}`);
          if (text.startsWith("OpenAI:")) break;
        }
      }
    } finally {
      busy = false;
      if (filter.gallery === scope) {
        await load().catch(report);
        message(`${done} ${done === 1 ? "REAL misurata" : "REAL misurate"}.` + (failed.length ? ` Non misurate: ${failed.join(" / ")}` : ""));
      }
      syncSelection();
    }
  };
  const describeGallery = async () => {
    const scope = filter.gallery;
    busy = true; selectionBar();
    try {
      const { images } = await call<{ images: { id: string; title: string }[] }>("/undescribed-reals?" + new URLSearchParams({ gallery: scope }));
      if (scope !== filter.gallery) return;
      const result = images.length ? await describePhotos(images, scope, call<Item>) : "Tutte le REAL hanno una descrizione visiva.";
      if (scope === filter.gallery && result !== null) { await load().catch(report); message(result); }
    } catch (error) { if (scope === filter.gallery) report(error); }
    finally { busy = false; selectionBar(); }
  };
  const indexGallery = async () => {
    const scope = filter.gallery;
    busy = true; selectionBar();
    try {
      const { images } = await call<{ images: IndexTarget[] }>("/real-index/pending?" + new URLSearchParams({ gallery: scope }));
      if (scope !== filter.gallery) return;
      const result = images.length ? await indexRealPhotos(images, scope, call) : "Le descrizioni sono già indicizzate.";
      if (scope === filter.gallery && result !== null) { await load().catch(report); message(result); }
    } catch (error) { if (scope === filter.gallery) report(error); }
    finally { busy = false; selectionBar(); }
  };
  $("#library-cancel-move").addEventListener("click", () => moveGallery.close());
  moveGallery.addEventListener("submit", event => {
    event.preventDefault();
    const destination = $<HTMLSelectElement>("#library-bulk-gallery").value;
    if (!destination) return;
    moveGallery.close();
    void applySelection("gallery", destination);
  });

  let detailOpenRequest = 0;
  page.addEventListener("click", async event => {
    const target = event.target as HTMLElement, button = target.closest<HTMLButtonElement>("button");
    if (target.closest("dialog") && !target.closest("#db-images, #library-selection, .gallery-actions, .gallery-title-row")) return;
    if (button?.dataset.adminTab) {
      const tab = button.dataset.adminTab;
      for (const panel of ["galleries", "stats", "settings"])
        $<HTMLElement>("#admin-" + panel).hidden = panel !== tab;
      page.querySelectorAll<HTMLButtonElement>("[data-admin-tab]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
      if (tab === "galleries") await refreshGalleries().catch(showGalleryError);
      if (tab === "stats") {
        await statsView.refresh();
        if ($<HTMLDetailsElement>("#stats-distribution").open) await distribution.refresh();
      }
      return;
    }
    if (button?.hasAttribute("data-gallery-create") && galleryList) { galleryEditor.open(galleryList); return; }
    if (button?.dataset.galleryOpen) { await openGallery(button.dataset.galleryOpen).catch(report); return; }
    if (button?.hasAttribute("data-gallery-close")) { closeGallery(); return; }
    if (button?.hasAttribute("data-gallery-edit") && galleryList) { galleryEditor.open(galleryList, filter.gallery); return; }
    if (button?.id === "library-more") { await load(true).catch(report); return; }
    if (button?.hasAttribute("data-batch-clear")) {
      filter.batch = "";
      history.replaceState(history.state, "", galleryPhotosPath(filter.gallery));
      await load();
      return;
    }
    const opener = target.closest<HTMLElement>("[data-open]");
    if (opener) {
      const item = items.find(i => i.id === opener.dataset.open);
      if (!item) return;
      const request = ++detailOpenRequest;
      if (item.has_visual_description && !item.visual_description) {
        const current = () => request === detailOpenRequest && galleryDialog.open && filter.gallery === item.gallery_id;
        try {
          const described = await call<Item>("/" + encodeURIComponent(item.id));
          if (current()) showDetail(described);
        } catch (error) { if (current()) report(error); }
      } else showDetail(item);
      return;
    }
    // Changing view is never blocked by an action still reloading the list (the click used to be dropped).
    if (button?.dataset.view) {
      filter.status = button.dataset.view; selected.clear(); syncSelection();
      page.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
      try { await load(); } catch (error) { message(String(error instanceof Error ? error.message : error)); }
      return;
    }
    if (!button || busy) return;
    if (button.id === "library-describe-gallery") { await describeGallery(); return; }
    if (button.id === "library-index-gallery") { await indexGallery(); return; }
    if (button.id === "library-select-all") {
      for (const item of items) selected.add(item.id);
      syncSelection();
      return;
    }
    const action = button.dataset.bulk;
    if (action === "none") { selected.clear(); syncSelection(); return; }
    if (action === "measure") { await measureSelection(); return; }
    if (action === "gallery") {
      const options = galleryOptions(galleries().filter(g => g.id !== filter.gallery), "");
      $<HTMLSelectElement>("#library-bulk-gallery").innerHTML = '<option value="">Scegli una galleria</option>' + options;
      moveGallery.showModal();
      return;
    }
    if (action) { await applySelection(action); return; }
    if (button.id !== "library-empty-trash") return;
    busy = true;
    try {
      const result = await call<{ deleted: number; postponed: number }>("/trash/empty?" + new URLSearchParams({gallery: filter.gallery}), { method: "POST", body: "{}" });
      await load();
      message(`${result.deleted} immagini eliminate definitivamente.` + (result.postponed ? ` ${result.postponed} restano nel cestino finché le partite o le generazioni in corso non finiscono.` : ""));
    } catch (error) { report(error); }
    finally { busy = false; selectionBar(); }
  });
  page.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (target.closest("dialog") && !target.closest("#db-images")) return;
    if (target.dataset.select) {
      if (target.checked) selected.add(target.dataset.select); else selected.delete(target.dataset.select);
      target.closest(".library-card")?.classList.toggle("is-selected", target.checked);
      selectionBar();
    }
    else if (target.id === "library-origin") { filter.origin = target.value; void load(); }
    else if (target.id === "library-sort" || target.id === "library-order") {
      sort = { by: $<HTMLSelectElement>("#library-sort").value, order: $<HTMLSelectElement>("#library-order").value };
      try { localStorage.setItem(SORT_KEY, JSON.stringify(sort)); } catch { /* private browsing */ }
      void load().catch(report);
    }
  });
  $<HTMLSelectElement>("#library-sort").value = sort.by; $<HTMLSelectElement>("#library-order").value = sort.order;
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
      settingsMessage(`${({ text_model: "Modello di testo", image_model: "Modello di immagini", image_quality: "Qualità delle immagini" } as Record<string, string>)[field.name]}: ${field.value}.`);
    } catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); await refreshModels(); }
  });
  // Model context: three texts, each saved as a new version; an old version can become the current one again.
  const CONTEXT_LABELS: Record<string, [string, string]> = {
    base: ["Base comune", "Inviata in ogni chiamata: misure delle REAL, proposte di galleria, indicazioni SLOP proposte e valutazioni."],
    real_ideas: ["Idee SLOP delle REAL", "Usato nel wizard «Genera SLOP» quando chiedi proposte al modello. Inviato insieme alla base, all’originale intero, a titolo e descrizione della fonte, a titolo e descrizione della galleria e all’ultima misura. Numero di idee, campi e regole sul riferimento restano fissati nel codice."],
    real_measure: ["Misura delle REAL", "Inviato insieme alla base, all’originale intero e a titolo e descrizione della galleria. Elenco degli oggetti, riquadri e categorie di dettaglio restano fissati nel codice, come il calcolo di affollamento e dettaglio."],
    slop_gallery_prompt: ["Premessa e prompt di galleria", "Inviato insieme alla base, all’originale intero, all’idea approvata della REAL e a titolo e descrizione della galleria."],
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
        ${p.proposed ? `<p class="hint" data-context-proposal>È disponibile un testo proposto con l'aggiornamento dell'app. <button type="button" data-context-load="${escape(p.part)}">Carica nel campo</button> (diventa una versione solo se lo salvi).</p>` : ""}
        <div class="library-inline"><button type="button" data-context-save="${escape(p.part)}">Salva nuova versione</button></div>
        <details class="library-context-history"><summary>Versioni (${p.history.length})</summary><ol>${p.history.map((v, index) =>
          `<li><span>${escape(when(v.created_at))}</span> / ${v.body.length} caratteri${index === 0 ? " / <strong>attuale</strong>" : ` <button type="button" data-context-restore="${escape(v.id)}">Ripristina</button>`}
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
  // Thresholds of the SLOP studio, hours of an open game and nightly Commons checks: numbers checked by the server.
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
  const numbersForm = (selector: string, fields: string[], done: string, after = async () => {}) => $(selector).addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    try {
      renderNumbers(await call<Numbers>("/settings", { method: "PUT", body: JSON.stringify(Object.fromEntries(fields.map(f => [f, Number((form.elements.namedItem(f) as HTMLInputElement).value)]))) }), fields);
      settingsMessage(done); await Promise.all([autoBox.refresh(), after()]);
    } catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); }
  });
  numbersForm("#library-thresholds-form", ["max_generation_attempts", "editorial_tolerance"], "Soglie della generazione SLOP salvate.");
  numbersForm("#library-games-form", ["open_game_hours"], "Durata massima di una partita aperta salvata.");
  numbersForm("#library-sources-form", ["commons_checks_per_night"], "Numero di REAL controllate ogni notte salvato.");
  numbersForm("#library-measures-form", ["crowdedness_threshold", "detail_threshold"], "Soglie predefinite di affollamento e dettaglio salvate.", refreshGalleries);
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
  $("#stats-distribution").addEventListener("toggle", () => {
    if ($<HTMLDetailsElement>("#stats-distribution").open) void distribution.refresh();
  });

  const resetGallery = (gallery: string, batch = "") => {
    window.clearTimeout(searchTimer);
    Object.assign(filter, { gallery, batch, status: "library", origin: "all", q: "" });
    selected.clear();
    items = [];
    undescribed = 0;
    unindexed = 0;
    nextPage = null;
    render();
    $("#library-grid").innerHTML = `<li class="library-grid-loading">${loading("Caricamento delle immagini…")}</li>`;
    $("#library-counts").textContent = "";
    $("#library-empty-trash").hidden = true;
    message("");
    $<HTMLInputElement>("#library-search").value = "";
    $<HTMLSelectElement>("#library-origin").value = filter.origin;
    page.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === filter.status)));
  };
  const openGallery = async (id: string, batch = "") => {
    const gallery = galleries().find(g => g.id === id);
    if (!gallery) throw Error("Galleria non disponibile.");
    if (filter.gallery !== id || filter.batch !== batch) resetGallery(id, batch);
    $("#gallery-title").textContent = gallery.title;
    $<HTMLAnchorElement>("#gallery-upload-link").href = galleryWizardPath(id, "real");
    $<HTMLAnchorElement>("#gallery-generation-link").href = galleryWizardPath(id, "slop");
    $("#gallery-navigation-status").hidden = true;
    history.replaceState(history.state, "", galleryPhotosPath(id, batch));
    if (!galleryDialog.open) {
      galleryDialog.showModal();
      $(".gallery-workspace-scroll").scrollTop = 0;
    }
    await load();
  };
  const closeGallery = () => {
    if (!galleryDialog.open) return;
    const id = filter.gallery;
    filter.gallery = "";
    ++loadSeq;
    history.replaceState(history.state, "", "/admin");
    galleryDialog.close();
    window.clearTimeout(searchTimer);
    if (!document.activeElement?.closest("#admin-galleries"))
      page.querySelector<HTMLElement>(`[data-gallery-open="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    void refreshGalleries().catch(showGalleryError);
  };
  galleryDialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeGallery();
  });
  const activeBatch = $<HTMLAnchorElement>("#gallery-active-batch");
  const autoBox = mountSlopAuto($("#slop-auto"), null, "", {
    changed: async () => { await Promise.allSettled([load(), refreshGalleries()]); },
    indicator: gallery => {
      activeBatch.hidden = !gallery;
      if (gallery) {
        activeBatch.href = galleryWizardPath(gallery.id, "slop");
        activeBatch.textContent = `Batch SLOP in corso: ${gallery.title}`;
      }
    },
  });
  const restoreGallery = async () => {
    await refreshGalleries();
    const query = new URLSearchParams(location.search), id = query.get("gallery");
    if (!id) return;
    if (galleries().some(g => g.id === id)) {
      const batch = query.get("batch") || "";
      await openGallery(id, /^[\w-]{1,64}$/.test(batch) ? batch : "").catch(report);
    } else {
      closeGallery();
      const status = $("#gallery-navigation-status");
      status.hidden = false;
      status.textContent = "Galleria non disponibile.";
      history.replaceState(history.state, "", "/admin");
    }
  };
  window.addEventListener("pageshow", event => {
    if (event.persisted) void Promise.allSettled([restoreGallery(), autoBox.refresh()]);
  });
  const showGalleryError = (error: unknown) => {
    if (galleryList) return;
    $("#gallery-cards").innerHTML = `<p role="status">${escape(error instanceof Error ? error.message : String(error))}</p><button type="button" data-gallery-retry>Riprova</button>`;
  };
  $("#gallery-cards").addEventListener("click", event => {
    if ((event.target as HTMLElement).closest("[data-gallery-retry]")) void restoreGallery().catch(showGalleryError);
  });
  await Promise.all([
    restoreGallery().catch(showGalleryError),
    refreshContexts().catch(error => settingsMessage(String(error instanceof Error ? error.message : error))),
    refreshModels().catch(error => settingsMessage(String(error instanceof Error ? error.message : error))),
    call<Numbers>("/settings").then(n => renderNumbers(n)).catch(error => settingsMessage(String(error instanceof Error ? error.message : error))),
    autoBox.refresh(),
  ]);
  $("#dashboard-loading").remove();
}
