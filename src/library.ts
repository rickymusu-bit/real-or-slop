import { galleryCards, galleryOptions, mountGalleryEditor, type GalleryList } from "./galleries";
/** Admin dashboard, with the gallery browser and wizards, statistics and settings. */
import "./library.css";
import { mountAdminWorkspace } from "./admin-workspace";
import "./admin-navigation.css";
import "./caption-count.css";
import "./admin-loading.css";
import "./model-context.css";
import { mountDatasetBalance } from "./slop-auto";
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
import type { VisualDescription } from "../shared/real-description";
import { describePhotos, visualDescription } from "./real-description";

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
  generated_count?: number; has_visual_description?: boolean; visual_description?: VisualDescription | null;
}
interface ModelOption { id: string; available: boolean | null; qualities?: string[]; shutdown?: string | null }
interface Models { text_model: string; image_model: string; image_quality: string; text_models: ModelOption[]; image_models: ModelOption[]; note: string }
interface ContextVersion { id: string; body: string; created_at: string; pipeline: number }
interface ContextState { max: number; parts: { part: string; current: { id: string; body: string }; history: ContextVersion[]; proposed?: string | null }[] }
const API = "/api/admin/library";
const STATUS_LABEL: Record<string, string> = { library: "All", new: "New", approved: "Approved", published: "Published", trash: "Trash" };
const STATE_LABEL: Record<Status, string> = { new: "new", approved: "approved", published: "published", trash: "in Trash" };
/** A section still loading: a short line with a spinner (src/admin-loading.css). */
const loading = (text = "Loading…") => `<p class="admin-loading" role="status">${text}</p>`;
const FIELDS: [keyof Item, string, number, boolean][] = [
  ["title", "Title", 200, false], ["description", "Source description", 1000, true], ["source_url", "Source page", 1000, false],
  ["author", "Author", 300, false], ["license_name", "License", 200, false], ["license_url", "License URL", 1000, false],
  ["prompt", "Prompt (SLOP)", 4000, true], ["model", "Model (SLOP)", 100, false],
];

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, { credentials: "same-origin", ...options,
    headers: options.body instanceof Blob || options.body instanceof ArrayBuffer ? options.headers : { "Content-Type": "application/json", ...options.headers } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Error(data.error || "Connection unavailable");
  return data;
}
const COLOUR_LABEL: Record<Monochrome, string> = { "": "color", "black-and-white": "black and white", sepia: "sepia" };
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
  let items: Item[] = [], selected = new Set<string>(), open: Item | null = null, busy = false, undescribed = 0;
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
    <header class="library-head"><h1 id="library-title">Dashboard</h1><span id="dashboard-loading">${loading("Loading dashboard…")}</span></header>
    <nav class="admin-tabs" aria-label="Admin sections">
      <button type="button" data-admin-tab="galleries" aria-pressed="true">Galleries</button>
      <button type="button" data-admin-tab="stats" aria-pressed="false">Statistics</button>
      <button type="button" data-admin-tab="settings" aria-pressed="false">Settings</button>
    </nav>
    <section id="admin-galleries" class="admin-panel" aria-labelledby="galleries-title">
      <div class="gallery-section-head"><h2 id="galleries-title">Galleries</h2><button type="button" class="primary" data-gallery-create disabled>New gallery</button></div>
      <a class="button" id="gallery-active-batch" hidden></a>
      <p id="gallery-navigation-status" role="status" hidden></p>
      <div id="gallery-cards">${loading("Loading galleries…")}</div>
    </section>
    <dialog id="gallery-workspace" class="gallery-workspace" aria-labelledby="gallery-title">
      <div class="gallery-workspace-head">
        <div class="gallery-title-row"><h2 id="gallery-title" tabindex="-1" autofocus></h2><button type="button" data-gallery-close aria-label="Close gallery">×</button></div>
        <div class="gallery-actions">
          <a class="button primary" id="gallery-upload-link">Import REAL</a>
          <a class="button" id="gallery-generation-link">Generate SLOP</a>
          <button type="button" id="library-describe-gallery" hidden>Describe REAL</button>
          <button type="button" data-gallery-edit>Edit gallery</button>
        </div>
      </div>
      <div class="gallery-workspace-scroll">
    <div id="db-images">
    <p id="library-counts" aria-live="polite"></p>
    <div class="db-search-row"><label>Search gallery<input id="library-search" type="search" placeholder="ID, REAL title, description or prompt"></label></div><details class="db-filter-panel"><summary>Filters and sorting</summary><div class="library-toolbar">
      <nav class="library-views" aria-label="Views">${Object.entries(STATUS_LABEL).map(([key, label]) =>
        `<button type="button" data-view="${key}" aria-pressed="${key === "library"}">${label}</button>`).join("")}</nav>
      <label>Origin<select id="library-origin"><option value="all">REAL and SLOP</option><option value="REAL">REAL</option><option value="SLOP">SLOP</option></select></label>
      <label>Sort by<select id="library-sort"><option value="added">date added</option><option value="views">views</option><option value="accuracy">accuracy</option></select></label>
      <label>Order<select id="library-order"><option value="desc">descending</option><option value="asc">ascending</option></select></label>
    </div></details>
    <div class="library-add"><button type="button" id="library-select-all" hidden>Select all</button><button type="button" id="library-empty-trash" hidden>Empty Trash</button></div>
    <p id="library-batch-filter" class="library-batch-filter" hidden><span>Active legacy batch: showing its images only.</span><button type="button" data-batch-clear>Show all</button></p>
    <ul id="library-grid" class="library-grid" aria-label="Images"><li class="library-grid-loading">${loading("Loading images…")}</li></ul>
    <button type="button" id="library-more" hidden>Load more photos</button>
    </div>
    </div>
    <div class="gallery-workspace-footer">
      <div id="library-selection" class="library-selection" role="group" aria-label="Actions for selected photos" hidden>
        <strong id="library-selection-count" aria-live="polite"></strong>
        <div class="library-selection-actions">
          <button type="button" data-bulk="set-approved">Approve</button>
          <button type="button" data-bulk="set-published">Publish</button>
          <button type="button" data-bulk="withdraw" hidden>Unpublish</button>
          <button type="button" data-bulk="trash" aria-label="Move to Trash">Move to Trash</button>
          <button type="button" data-bulk="restore" hidden>Restore</button>
          <button type="button" data-bulk="delete" class="danger" hidden>Delete permanently</button>
          <button type="button" data-bulk="gallery">Move to gallery</button>
        </div>
        <button type="button" data-bulk="none">Deselect</button>
      </div>
      <p id="library-message" role="status" aria-live="polite"></p>
    </div>
    </dialog>
    <dialog id="library-move-gallery" class="gallery-editor" aria-labelledby="library-move-title">
      <div class="gallery-title-row"><h2 id="library-move-title">Move to gallery</h2></div>
      <form class="gallery-form">
        <label>Destination gallery<select id="library-bulk-gallery" required autofocus></select></label>
        <div class="library-inline"><button type="button" id="library-cancel-move">Cancel</button><button type="submit" class="primary">Move</button></div>
      </form>
    </dialog>
    <dialog id="gallery-editor" class="gallery-editor" aria-labelledby="gallery-editor-title">
      <div class="gallery-title-row"><h2 id="gallery-editor-title"></h2><button type="button" data-gallery-editor-close aria-label="Close form">×</button></div>
      <div data-gallery-form></div>
    </dialog>
    <section id="admin-stats" class="admin-panel" hidden><h2>Statistics</h2><div id="slop-auto" class="slop-auto" role="region" aria-label="Dataset balance" hidden></div>
      <div id="stats-body">${loading()}</div>
      <details id="stats-distribution"><summary>Image distribution</summary><div id="db-distribution">${loading()}</div></details>
    </section>
    <section id="admin-settings" class="admin-panel" hidden><h2>Settings</h2>
    <p id="library-settings-message" role="status" aria-live="polite"></p>
    <details id="library-contexts" class="library-vocabulary"><summary>Model context</summary>
      <p class="hint">Fixed instructions sent to the language model. Saving creates a new version; previous versions can be restored. Each generation records its context version. Response formats and validation are defined in code.</p>
      <div id="library-contexts-body">${loading()}</div></details>
    <details id="library-leaderboard" class="library-vocabulary"><summary>Leaderboard</summary>
      <p class="hint">Players entering the leaderboard receive a game code, shown once. Verify a code here: the site stores only its hash. Hidden entries do not appear publicly; “Delete” removes an entry permanently, for example at a player’s request.</p>
      <form id="library-code" class="library-inline"><label>Game code<input name="code" placeholder="ABCD-EFGH-JK" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label><button>Check</button></form>
      <p id="library-code-result" role="status" aria-live="polite"></p>
      <ol id="library-entries" class="library-entries"></ol></details>
    <details id="library-models" class="library-vocabulary"><summary>Models</summary>
      <p class="hint">The text model must support vision. It describes and measures REAL, writes SLOP prompts and evaluates SLOP. The image model generates SLOP. Paid calls require confirmation and follow the OpenAI project spending limit.</p>
      <form id="library-models-form" class="library-inline"><label>Text model<select name="text_model"></select></label><label>Image model<select name="image_model"></select></label><label>Image quality<select name="image_quality"></select></label></form>
      <p id="library-models-note" class="hint"></p>
      <p class="hint">Quality applies to SLOP generated through the “Generate SLOP” wizard.</p></details>
    <details id="library-thresholds" class="library-vocabulary"><summary>Legacy SLOP generation</summary>
      <form id="library-thresholds-form" class="library-inline">
        <label>Maximum attempts per legacy SLOP<input type="number" name="max_generation_attempts" required></label><label>Tolerance (0 strict, 1 normal, 2 permissive)<input type="number" name="editorial_tolerance" required></label>
        <button>Save</button></form>
      <p class="hint">These settings apply only to legacy jobs. Open a gallery and choose “Generate SLOP” to configure the current pipeline.</p></details>
    <details id="library-games" class="library-vocabulary"><summary>Games</summary>
      <form id="library-games-form" class="library-inline"><label>Maximum open game duration (hours)<input type="number" name="open_game_hours" required></label><button>Save</button></form>
      <p class="hint">After this time, an unfinished game no longer retains copies of withdrawn or modified photos, and its photo may become unavailable. Game levels are defined in code.</p></details>
    <details id="library-sources" class="library-vocabulary"><summary>Commons sources</summary>
      <form id="library-sources-form" class="library-inline"><label>REAL checked each night<input type="number" name="commons_checks_per_night" required></label><button>Save</button></form>
      <p class="hint">Each night, Wikimedia Commons is checked for missing REAL files, starting with the oldest checks. Each photo becomes eligible again after three months. Missing files are only flagged in the gallery. Commons requests cover 50 photos at a time; 0 pauses checks.</p></details></section>
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
        undescribed: number }>("?" + params);
      if (seq !== loadSeq) return;
      undescribed = data.undescribed;
      const added = append ? data.items.filter(item => !items.some(i => i.id === item.id)) : data.items;
      items = append ? [...items, ...added] : added;
      nextPage = data.next;
      selected = new Set([...selected].filter(id => items.some(item => item.id === id)));
      const count = (status: string) => data.counts.filter(c => c.status === status).reduce((n, c) => n + c.n, 0);
      $("#library-counts").textContent = `${count("new")} new / ${count("approved")} approved / ${count("published")} published / ${count("trash")} in Trash`;
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
  const statsLine = (item: Item) => `<span class="db-stats" data-stats>Viewed <strong>${item.stats.views}</strong> ${item.stats.views === 1 ? "time" : "times"} / correctly identified <strong>${item.stats.correct}</strong>${rate(item)}</span>`;
  const preview = (item: Item) => openPreview(item.origin === "REAL"
    ? { src: item.file, alt: imageLabel(item), title: imageLabel(item), description: item.description,
      link: item.source_url ? { href: item.source_url, label: "Open Commons page" } : undefined }
    : { src: item.file, alt: imageLabel(item), title: imageLabel(item),
      extra: (item.prompt ? `<p><span class="image-preview-label">Prompt</span><br><q lang="en">${escape(item.prompt)}</q></p>` : "") });
  const card = (item: Item) => `<li class="library-card${selected.has(item.id) ? " is-selected" : ""}" data-id="${escape(item.id)}">
    <label class="library-check"><input type="checkbox" data-select="${escape(item.id)}" ${selected.has(item.id) ? "checked" : ""} aria-label="Select ${escape(imageLabel(item))}"></label>
    <button type="button" class="library-open" data-open="${escape(item.id)}" data-long-press aria-label="Open ${escape(imageLabel(item))}"${item.origin === "REAL" && !item.has_visual_description ? ' aria-description="Missing visual description"' : ""}>
      <img src="${escape(item.file)}" alt="" loading="lazy" draggable="false">${item.origin === "REAL" && !item.has_visual_description
        ? '<span class="library-description-icon" data-description-missing title="Missing visual description" aria-hidden="true">▤</span>' : ""}
      <span class="library-badges"><span class="badge badge-${item.origin.toLowerCase()}">${item.origin}</span>
      <span class="badge badge-status">${STATE_LABEL[item.status]}</span>${item.origin === "REAL" ? `<span class="badge" data-generated-count title="Successful initial generations tracked since this feature was introduced; earlier uses are unavailable">${item.generated_count ?? 0} SLOP generated</span>` : ""}${item.source_missing_at
        ? '<span class="badge badge-warn" data-source-missing title="The file is no longer on Wikimedia Commons">Source removed</span>' : ""}</span>
    </button></li>`;
  const selectionBar = () => {
    const bar = $("#library-selection");
    bar.hidden = !selected.size;
    $("#library-selection-count").textContent = `${selected.size} ${selected.size === 1 ? "selected" : "selected"}`;
    const trash = filter.status === "trash";
    const describe = $<HTMLButtonElement>("#library-describe-gallery");
    describe.hidden = trash || !galleryList?.paid_calls || !undescribed;
    describe.disabled = busy;
    describe.textContent = `Describe REAL (${undescribed})`;
    const chosen = items.filter(item => selected.has(item.id));
    for (const button of bar.querySelectorAll<HTMLButtonElement>("[data-bulk]")) {
      const action = button.dataset.bulk;
      if (action === "withdraw") button.hidden = trash || !chosen.some(item => item.status === "published");
      else if (action === "set-approved") button.hidden = trash || !chosen.some(item => item.status === "new");
      else if (action !== "none" && action !== "gallery") button.hidden = trash !== (action === "restore" || action === "delete");
      button.disabled = busy || (action === "gallery" && !galleries().some(g => g.id !== filter.gallery));
    }
    const all = $<HTMLButtonElement>("#library-select-all");
    all.hidden = !items.length || items.every(item => selected.has(item.id));
    all.textContent = `Select all (${items.length})`;
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
    else grid.innerHTML = items.length ? items.map(card).join("") : `<li class="library-empty">${filter.status === "trash" ? "Trash is empty." : "No photos in this view."}</li>`;
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
  const metricText = (m: Metrics) => `long edge ${m.long} px / noise ${m.noise.toFixed(1)} / sharpness ${m.sharpness.toFixed(1)} / contrast ${m.contrast} / saturation ${m.saturation.toFixed(2)}`;
  /** Measures of the copy and, for a SLOP, its treatment with the commands (free; they make the copy again). */
  const measuresBlock = (item: Item, editable: boolean) => {
    const t = item.treatment;
    const treatment = item.origin !== "SLOP" ? "" : !t ? '<p class="hint" data-treatment>Copy without treatment.</p>'
      : `<p class="hint" data-treatment>${t.off ? "Treatment off" : `Photographic treatment${t.applied ? " " + COLOUR_LABEL[t.applied.monochrome] : ""}` +
        (t.settings ? ", adjusted by owner" : "") + (t.gap !== undefined ? `, difference from target ${Math.round(t.gap * 100)}%` : "") + `: ${metricText(t.sample.metrics)}`}.</p>`;
    const commands = item.origin === "SLOP" && editable && item.copy ? `<div class="library-inline" data-treatment-commands>` +
      (t && !t.off ? '<button type="button" id="library-treatment-off">Without treatment</button>'
        : '<button type="button" id="library-treatment-on">With treatment</button>') +
      (t ? '<button type="button" id="library-treatment-edit">Adjust treatment</button>' : "") + "</div>" : "";
    return (item.metrics ? `<p class="hint" data-metrics>Copy measurements: ${metricText(item.metrics)}.</p>` : "") + treatment + commands;
  };
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  /** Nightly check of the Commons source: a flag only, the owner decides (spec `libreria-immagini`, section 9). */
  const sourceCheck = (item: Item) => item.origin !== "REAL" ? "" : item.source_missing_at
    ? `<p class="db-edit-note" data-source-missing>The file has been missing from Wikimedia Commons since ${day(item.source_missing_at)}. Commons often removes files over rights issues: check the source page. If the license no longer holds, unpublish the photo or move it to Trash. If the file moved, update its source page; it will be checked again next night.</p>`
    : item.source_checked_at ? `<p class="hint" data-source-checked>Source last found on Commons on ${day(item.source_checked_at)}.</p>` : "";
  const showDetail = (item: Item) => {
    open = item;
    const editable = item.status === "new" || item.status === "approved";
    const fields = FIELDS.filter(([key]) => item.origin === "REAL" ? key !== "prompt" && key !== "model"
      : !["title", "description", "source_url", "author", "license_name", "license_url"].includes(key));
    detail.innerHTML = `<form method="dialog" class="library-detail-close"><button aria-label="Close">×</button></form>
      <h2 id="library-detail-title">${escape(imageLabel(item))}</h2>
      <p class="hint">${item.origin} / ${STATE_LABEL[item.status]} / original ${item.width}×${item.height}${item.copy ? ` / WebP game copy ${item.copy.width}×${item.copy.height}${item.copy.crop ? ", " + FORMAT_LABELS[item.copy.crop.format] : ""}, ${kb(item.copy.bytes)}: this is what players will see` : " / game copy not ready"}</p>
      ${sourceCheck(item)}

      <div class="library-detail-body"><div class="game-media-surface library-preview"><img data-game-media draggable="false" src="${escape(item.file)}" alt="${escape(imageLabel(item))}"></div>
      <div class="library-fields"><p>${statsLine(item)}</p>
      <label>Gallery<select id="library-detail-gallery">${galleryOptions(galleries(), item.gallery_id)}</select></label>
      ${item.in_play ? `<p class="hint">In ${item.in_play} ${item.in_play === 1 ? "game" : "games"} in progress: they keep the version they started with; changes apply to new games.</p>` : ""}
      ${item.status === "published" ? '<div class="db-edit-note"><p>“Edit photo” opens editing controls and unpublishes the photo. Games in progress keep the current version.</p><button type="button" data-action="edit" class="primary">Edit photo</button></div>' : ""}
      ${item.status === "approved" ? '<p class="hint">Changes are saved immediately and the photo stays approved. Publish it when finished.</p>' : ""}
      ${item.no_derivatives ? '<p class="db-edit-note">No derivatives (ND) license: the game copy is a modified version.</p>' : ""}
      ${!item.copy && item.status === "new" ? '<p><button type="button" id="library-copy">Prepare game copy</button></p>' : ""}
      ${editable ? '<p><button type="button" id="library-crop">Framing</button></p>' : ""}
      ${measuresBlock(item, editable)}
      ${item.origin === "REAL" ? item.visual_description ? visualDescription(item.visual_description)
        : item.has_visual_description ? loading("Loading visual description…")
          : `<section class="editorial-description"><h3>Visual description</h3><p class="hint">Not generated yet.</p>${galleryList?.paid_calls && item.status !== "trash"
            ? '<button type="button" id="library-describe-photo">Generate description (1 call)</button>' : ""}</section>` : ""}
      ${fields.map(([key, label, max, area]) => `<label>${label}${area
        ? `<textarea data-field="${key}" maxlength="${max}" rows="3" ${editable ? "" : "readonly"}>${escape(item[key])}</textarea>`
        : `<input data-field="${key}" maxlength="${max}" value="${escape(item[key])}" ${editable ? "" : "readonly"}>`}</label>`).join("")}
      ${editable && item.origin === "SLOP" ? '<p class="hint">To regenerate, move this SLOP to Trash and start a new job in the gallery pipeline.</p>' : ""}
      <div class="library-actions">${item.status === "new" ? `${item.origin === "REAL" ? `<label><input type="checkbox" id="library-rights" ${item.rights_confirmed ? "checked" : ""}> I have checked rights and license</label>` : ""}<button type="button" data-action="approve" class="primary">Approve</button>` : ""}
        ${item.status === "approved" ? '<button type="button" data-action="publish" class="primary">Publish to game</button>' : ""}
        ${item.status === "published" ? '<button type="button" data-action="withdraw">Unpublish</button><button type="button" data-action="remove">Delete (move to Trash)</button>' : ""}
        ${item.status === "trash" ? '<button type="button" data-action="restore">Restore</button><button type="button" data-action="delete" class="danger">Delete permanently</button>'
          : item.status !== "published" ? '<button type="button" data-action="trash">Delete (move to Trash)</button>' : ""}</div>
      <p id="library-detail-message" role="status" aria-live="polite"></p></div></div>`;
    if (!detail.open) detail.showModal();
    markGameMedia(detail);
  };
  detail.addEventListener("close", () => { open = null; });
  const detailMessage = (text: string) => { const el = detail.querySelector("#library-detail-message"); if (el) el.textContent = text; };
  detail.addEventListener("change", async event => {
    const gallery = (event.target as HTMLElement).closest<HTMLSelectElement>("#library-detail-gallery");
    if (gallery && open) {
      const item = open;
      try {
        const updated = await save(item, {gallery_id: gallery.value});
        if (open?.id === updated.id) { showDetail(updated); detailMessage("Gallery updated."); }
        await load();
      } catch (error) {
        if (open?.id === item.id) { showDetail(open); detailMessage(String(error)); }
      }
      return;
    }
    const field = (event.target as HTMLElement).closest<HTMLInputElement | HTMLTextAreaElement>("[data-field]");
    if (!field || !open || field.readOnly) return;
    try { open = await save(open, { [field.dataset.field!]: field.value }); showDetail(open); detailMessage("Saved."); render(); }
    catch (error) { detailMessage(String(error instanceof Error ? error.message : error)); }
  });
  detail.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (button?.dataset.openSource && !busy) {
      try { showDetail(await call<Item>("/" + encodeURIComponent(button.dataset.openSource))); } catch (error) { detailMessage(String(error instanceof Error ? error.message : error)); }
      return;
    }
    if (!button || !open || busy || !(button.dataset.action || ["library-copy", "library-regenerate", "library-describe-photo",
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
      else if (button.id === "library-copy") {
        const item = open;
        open = await withPhotoProcessing("Preparing game copy…", () => prepareItemCopy<Item>(item));
        detailMessage("Game copy ready.");
      }
      else if (button.id === "library-treatment-edit") {
        const choice = await chooseTreatment(open, imageLabel(open));
        if (!choice) return;
        const item = open;
        open = await withPhotoProcessing("Applying treatment to photo…", () => prepareItemCopy<Item>(item, undefined, choice));
        detailMessage(choice.settings ? "Adjusted treatment saved." : "Suggested treatment saved.");
      }
      else if (button.id.startsWith("library-treatment-")) {
        const off = button.id === "library-treatment-off";
        const item = open;
        open = await withPhotoProcessing("Processing game copy…", () => prepareItemCopy<Item>(item, undefined, { off }));
        detailMessage(open.treatment && !open.treatment.off ? "Copy treated." : open.treatment ? "Copy without treatment." : "Reference REAL measurements unavailable: copy without treatment.");
      }
      else if (button.id === "library-crop") {
        const updated = await editFrame(open, imageLabel(open));
        if (!updated) return;
        open = updated;
        detailMessage("Frame saved.");
      }
      else if (button.dataset.action === "delete") { await call("/" + encodeURIComponent(open.id), { method: "DELETE" }); detail.close(); open = null; }
      else if (button.dataset.action === "edit") {
        // Owner decision of 2026-11-11: the photo leaves publication as soon as the edit starts.
        if (!window.confirm(`Edit “${imageLabel(open)}”? It will be unpublished immediately; games in progress keep the current version. It stays approved after editing.`)) return;
        open = await call<Item>(`/${encodeURIComponent(open.id)}/withdraw`, { method: "POST", body: "{}" });
        detailMessage("Editing started: the photo is no longer published.");
      }
      else if (button.dataset.action === "remove") {
        if (!window.confirm(`Delete “${imageLabel(open)}”? It will be unpublished and moved to Trash; games in progress keep the current version.`)) return;
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
    if (action === "trash" && removing) notes.push(`${removing} ${removing === 1 ? "image is published and will leave" : "images are published and will leave"} the game immediately. Games in progress keep the current version.`);
    if (action === "withdraw") notes.push(`${removing} ${removing === 1 ? "published image will return to approved status and leave" : "published images will return to approved status and leave"} the game. Games in progress keep the current version.`);
    if (rights) notes.push("Have you checked the rights and license of the selected REAL images to approve?");
    if (notes.length && !window.confirm(notes.join("\n\n") + (rights ? "" : "\n\nContinue?"))) return;

    busy = true;
    selectionBar();
    message("Updating…");
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
        ? `${result.deleted} permanently deleted.` + (result.postponed ? ` ${result.postponed} remain in Trash because they are in games in progress.` : "")
        : `${result.done} ${action === "gallery" ? "moved" : "updated"}.` +
          (result.failed.length ? ` ${result.failed.length} operations failed. ${[...new Set(result.failed.map(item => item.error))].join(" / ")}` : ""));
    } catch (error) {
      if (filter.gallery === scope) { await load().catch(() => {}); report(error); }
    } finally { busy = false; syncSelection(); }
  };
  const describeGallery = async () => {
    const scope = filter.gallery;
    busy = true; selectionBar();
    try {
      const { images } = await call<{ images: { id: string; title: string }[] }>("/undescribed-reals?" + new URLSearchParams({ gallery: scope }));
      if (scope !== filter.gallery) return;
      const result = images.length ? await describePhotos(images, scope, call<Item>) : "All REAL have a visual description.";
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
    if (button.id === "library-select-all") {
      for (const item of items) selected.add(item.id);
      syncSelection();
      return;
    }
    const action = button.dataset.bulk;
    if (action === "none") { selected.clear(); syncSelection(); return; }
    if (action === "gallery") {
      const options = galleryOptions(galleries().filter(g => g.id !== filter.gallery), "");
      $<HTMLSelectElement>("#library-bulk-gallery").innerHTML = '<option value="">Choose a gallery</option>' + options;
      moveGallery.showModal();
      return;
    }
    if (action) { await applySelection(action); return; }
    if (button.id !== "library-empty-trash") return;
    busy = true;
    try {
      const result = await call<{ deleted: number; postponed: number }>("/trash/empty?" + new URLSearchParams({gallery: filter.gallery}), { method: "POST", body: "{}" });
      await load();
      message(`${result.deleted} images permanently deleted.` + (result.postponed ? ` ${result.postponed} remain in Trash until active games or generations finish.` : ""));
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
    const options = (list: ModelOption[], chosen: string) => list.map(o => `<option value="${escape(o.id)}"${o.id === chosen ? " selected" : ""}${o.available === false && o.id !== chosen ? " disabled" : ""}>${escape(o.id)}${o.shutdown ? ` (retired by OpenAI on ${new Date(o.shutdown).toLocaleDateString("en-GB")})` : ""}${o.available === false ? " (unavailable in this project)" : ""}</option>`).join("");
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
      settingsMessage(`${({ text_model: "Text model", image_model: "Image model", image_quality: "Image quality" } as Record<string, string>)[field.name]}: ${field.value}.`);
    } catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); await refreshModels(); }
  });
  // Model context: three texts, each saved as a new version; an old version can become the current one again.
  const CONTEXT_LABELS: Record<string, [string, string]> = {
    base: ["Shared instructions", "Shared instructions for REAL descriptions and legacy model calls."],
    real_ideas: ["Legacy REAL ideas", "Instructions retained for compatibility with the legacy proposal workflow."],
    slop_gallery_prompt: ["Legacy gallery premise and prompt", "Retained for legacy jobs. New scene planning uses gallery rules in the pipeline wizard."],
    slop_evaluation: ["SLOP evaluation", "Used for legacy full-candidate evaluations. Current pipeline reviews use the gallery rules and fixed review instructions."],
  };
  const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
  let proposals = new Map<string, string>();
  const renderContexts = (state: ContextState) => {
    proposals = new Map(state.parts.filter(p => p.proposed).map(p => [p.part, p.proposed!]));
    $("#library-contexts-body").innerHTML = state.parts.filter(p => p.part !== "real_ideas").map(p => {
      const [label, hint] = CONTEXT_LABELS[p.part] || [p.part, ""];
      return `<section class="library-context" data-context-part="${escape(p.part)}"><h3>${escape(label)}</h3><p class="hint">${escape(hint)}</p>
        <textarea data-context="${escape(p.part)}" rows="10" maxlength="${state.max}" spellcheck="true" aria-label="${escape(label)}">${escape(p.current.body)}</textarea>
        <small class="caption-count" data-context-count>${p.current.body.length}/${state.max}</small>
        ${p.proposed ? `<p class="hint" data-context-proposal>Updated default instructions are available. <button type="button" data-context-load="${escape(p.part)}">Load into field</button> (becomes a version only when saved).</p>` : ""}
        <div class="library-inline"><button type="button" data-context-save="${escape(p.part)}">Save new version</button></div>
        <details class="library-context-history"><summary>Versions (${p.history.length})</summary><ol>${p.history.map((v, index) =>
          `<li><span>${escape(when(v.created_at))}</span> / ${v.body.length} characters${index === 0 ? " / <strong>current</strong>" : ` <button type="button" data-context-restore="${escape(v.id)}">Restore</button>`}
          <details><summary>Text</summary><pre>${escape(v.body)}</pre></details></li>`).join("")}</ol></details></section>`;
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
      settingsMessage("Suggested text loaded: review and save it to activate it.");
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-context-save],[data-context-restore]");
    if (!button) return;
    try {
      if (button.dataset.contextSave) {
        const part = button.dataset.contextSave;
        const text = $<HTMLTextAreaElement>(`[data-context="${part}"]`).value;
        renderContexts(await call<ContextState>("/contexts", { method: "POST", body: JSON.stringify({ part, body: text }) }));
        settingsMessage(`${CONTEXT_LABELS[part]?.[0] || part}: version saved.`);
      } else if (window.confirm("Restore this version? It becomes current; today’s version remains in history.")) {
        renderContexts(await call<ContextState>("/contexts/restore", { method: "POST", body: JSON.stringify({ id: button.dataset.contextRestore }) }));
        settingsMessage("Version restored.");
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
  numbersForm("#library-thresholds-form", ["max_generation_attempts", "editorial_tolerance"], "Legacy SLOP generation settings saved.");
  numbersForm("#library-games-form", ["open_game_hours"], "Maximum open game duration saved.");
  numbersForm("#library-sources-form", ["commons_checks_per_night"], "Nightly REAL check count saved.");
  statsView = mountStats($<HTMLElement>("#stats-body"), period => call<Stats>("/stats?" + new URLSearchParams({ period })));
  // Leaderboard: check a code, hide or show an entry.
  interface Entry { id: string; nickname: string; level_label: string; score: number; photos: number; balanced_accuracy: number; hidden: boolean; created_at: string }
  const entryLine = (e: Entry) => `${escape(e.nickname)} / ${escape(e.level_label)} / ${e.score.toLocaleString("en-GB", { minimumFractionDigits: 1 })} points / ${Math.round(e.balanced_accuracy * 100)}% / ${escape(when(e.created_at))}${e.hidden ? " / <strong>hidden</strong>" : ""}`;
  const leaderboardCall = async <T>(path: string, init: RequestInit = {}) => {
    const response = await fetch("/api/admin/leaderboard" + path, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json" } });
    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw Error(data.error || "Connection unavailable");
    return data;
  };
  const refreshEntries = async () => {
    const { entries } = await leaderboardCall<{ entries: Entry[] }>("");
    $("#library-entries").innerHTML = entries.map(e => `<li data-entry="${escape(e.id)}">${entryLine(e)} <button type="button" data-entry-hide="${escape(e.id)}" data-hidden="${!e.hidden}">${e.hidden ? "Show" : "Hide"}</button> <button type="button" class="danger" data-entry-delete="${escape(e.id)}">Delete</button></li>`).join("") || "<li>No entries.</li>";
  };
  $("#library-code").addEventListener("submit", async event => {
    event.preventDefault();
    const code = String(new FormData(event.target as HTMLFormElement).get("code") || "");
    try {
      const result = await leaderboardCall<{ found: boolean; entry: Entry | null }>("?" + new URLSearchParams({ code }));
      $("#library-code-result").innerHTML = result.entry ? "Valid code: " + entryLine(result.entry) + ` <button type="button" class="danger" data-entry-delete="${escape(result.entry.id)}">Delete</button>` : "No game matches this code.";
    } catch (error) { $("#library-code-result").textContent = String(error instanceof Error ? error.message : error); }
  });
  // Deleting an entry for good, for example when a player shows the code and asks for it (privacy notice).
  $("#library-leaderboard").addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-entry-delete]");
    if (!button) return;
    if (!window.confirm("Permanently delete this leaderboard entry? This cannot be undone.")) return;
    try {
      await leaderboardCall("/" + encodeURIComponent(button.dataset.entryDelete!), { method: "DELETE" });
      $("#library-code-result").textContent = "Entry deleted.";
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
    nextPage = null;
    render();
    $("#library-grid").innerHTML = `<li class="library-grid-loading">${loading("Loading images…")}</li>`;
    $("#library-counts").textContent = "";
    $("#library-empty-trash").hidden = true;
    message("");
    $<HTMLInputElement>("#library-search").value = "";
    $<HTMLSelectElement>("#library-origin").value = filter.origin;
    page.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === filter.status)));
  };
  const openGallery = async (id: string, batch = "") => {
    const gallery = galleries().find(g => g.id === id);
    if (!gallery) throw Error("Gallery unavailable.");
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
  const autoBox = mountDatasetBalance($("#slop-auto"), gallery => {
    activeBatch.hidden = !gallery;
    if (gallery) {
      activeBatch.href = galleryWizardPath(gallery.id, "slop");
      activeBatch.textContent = `Legacy SLOP batch in progress: ${gallery.title}`;
    }
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
      status.textContent = "Gallery unavailable.";
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
