/** Admin image library and five-section dashboard. v1.15.0, 2026-11-12T21:00:00Z: automatic SLOP batches on proposal
 * (docs/proposta-generazione-slop.v2.0.0.md): the box at the top of every section (src/slop-auto.v1.0.0.ts), the number of proposals
 * on «Generazione SLOP», the Database filter «Batch automatico in corso» and, in Settings «Studio SLOP», proposals on or off and
 * their threshold in percent of spread. Changing view («Tutte», «Nuove», «Cestino»…) is no longer dropped while an action reloads the
 * list, and an older answer of the list never overwrites a newer one. v1.14.0, 2026-11-12T19:00:00Z: Settings «Classifica» deletes an entry for good, on the
 * player's request (docs/privacy-note-legali.v1.0.0.md); the code check offers the same command.
 * v1.13.0, 2026-11-12T11:00:00Z (docs/statistiche-impostazioni.v1.0.0.md): section
 * «Statistiche» (src/stats.v1.0.0.ts); Settings hold only commands: models with the default image quality, thresholds of the SLOP
 * studio, hours of an open game; the count of paid calls moves to Statistiche. The regeneration uses the quality of Settings.
 * v1.12.0, 2026-11-12T09:00:00Z: Settings «Classifica» (docs/gioco-a-livelli.v1.0.0.md):
 * check a game code shown by a player, last entries with «Nascondi» and «Mostra».
 * v1.11.0, 2026-11-12T08:00:00Z: 4:5 game copies (docs/copie-di-gioco.v3.0.0.md):
 * «Inquadratura» in the detail of a new or approved image moves or resizes the frame and remakes the copy; a copy made before the
 * 4:5 format is flagged «da rifare in 4:5»; a REAL under a licence without derivatives is flagged as excluded from the game.
 * v1.10.0, 2026-11-11T09:30:00Z: Database section (docs/database-immagini.v1.0.0.md)
 * in two tabs. «Immagini»: filter by one or more tags (all or any), REAL, SLOP or both; each card shows thumbnail, every tag,
 * views and correct classifications. In the detail, «Modifica» on a published image takes it out of publication at once
 * (games in progress keep the version they started with) and leaves it approved; tags, caption and, for a SLOP, the prompt
 * can be edited; a SLOP can be regenerated from its prompt (paid, confirmed, statistics restart); «Elimina» moves to the trash.
 * «Distribuzione»: REAL and SLOP, approved and published, overall and for each tag, with the spread (database-chart.v1.0.0.ts).
 * v1.9.0, 2026-11-11T05:40:53Z: SLOP studio with its paid part (slop-studio.v1.1.0.ts).
 * v1.8.0, 2026-11-10T22:11:48Z: no budget; Settings «Modelli» with the text and
 * image model selectors and a count of paid calls; the SLOP studio in its section (slop-studio.v1.0.0.ts).
 * v1.6.0, 2026-11-10T16:16:00Z: tag categories (docs/categorie-tag.v1.1.0.md) in the
 * detail, bulk actions and vocabulary (change of category, grouped list); the proposed model context can be loaded.
 * v1.5.0, 2026-11-10T09:39:49Z: Settings «Contesto dei modelli», three editable
 * texts with versions and restore (worker/model-context.v1.0.0.ts); Settings messages shown in Settings.
 * v1.4.0, 2026-11-10T06:23:49Z (wizard v1.3.0): caption counter, soft limit 160, ceiling 256;
 * typed tags with a wrong form are converted and saved silently (shared/tag-input.v1.0.0.ts).
 * v1.3.0, 2026-11-09T22:50:37Z: vocabulary, aliases and analysis (phase 2).
 * Analysis replaces tags and caption, once per image; «Ripristina i testi generati» restores them at no cost.
 * Add files (device or Commons), edit in place, multi-select, trash without confirmations, delete for good. */
import "./library.v1.0.0.css";
import { CAPTION_MAX, captionCount } from "../shared/caption.v1.0.0";
import "./admin-navigation.v1.0.0.css";
import "./caption-count.v1.0.0.css";
import "./model-context.v1.0.0.css";
import { mountSlopStudio } from "./slop-studio.v1.3.0";
import { mountSlopAuto } from "./slop-auto.v1.0.0";
import { mountStats, type Stats } from "./stats.v1.0.0";
import { mountDistribution, type Distribution } from "./database-chart.v1.0.0";
import "./database.v1.0.0.css";
import { CATEGORIES, CATEGORY_LABELS, isCategory, type Category } from "../shared/tag-categories.v1.0.0";
import { categoryOf, categorySelect, legend, pill, sortByCategory, suggestedCategory } from "./tag-ui.v1.1.0";
import { mountRealWizard } from "./real-wizard.v1.8.0";
import { content, escape } from "./main";
import { prepareLibraryCopy } from "./game-copy.v2.0.0";
import { chooseCrop } from "./crop-editor.v1.0.0";
import type { Crop } from "../shared/game-copy.v2.0.0";
import { markGameMedia } from "./media-mark.v1.0.0";
import { tagFromInput } from "../shared/tag-input.v1.0.0";

type Status = "new" | "approved" | "published" | "trash";
interface Item {
  id: string; origin: "REAL" | "SLOP"; status: Status; trashed_from: Status | null; title: string; description: string;
  caption: string; explanation: string; source_url: string; author: string; license_name: string; license_url: string;
  prompt: string; model: string; width: number; height: number; copy: { width: number; height: number; bytes: number; crop: Crop | null } | null;
  rights_confirmed: boolean; revision: number; tags: string[]; file: string; updated_at: string;
  analysis: { status: "none" | "running" | "done" | "uncertain" | "failed"; error: string; at: string | null };
  generated: { tags: string[]; caption: string } | null;
  categories: Record<string, string>;
  stats: { views: number; correct: number }; in_play: number; no_derivatives: boolean;
}
interface Analysis { enabled: boolean; reason: string; model: string; calls_30_days: { total: number; uncertain: number; input_tokens: number; output_tokens: number }; note: string }
interface ModelOption { id: string; available: boolean | null; qualities?: string[]; shutdown?: string | null }
interface Models { text_model: string; image_model: string; image_quality: string; text_models: ModelOption[]; image_models: ModelOption[]; note: string }
interface ContextVersion { id: string; body: string; created_at: string; used: number }
interface ContextState { max: number; parts: { part: string; current: { id: string; body: string }; history: ContextVersion[]; proposed?: string | null }[] }
interface Tag { label: string; category: Category; images: number; aliases: string[] }
interface CommonsHit { title: string; page_url: string; thumb_url: string; width: number; height: number }
const API = "/api/admin/library";
const STATUS_LABEL: Record<string, string> = { library: "Tutte", new: "Nuove", approved: "Approvate", published: "Pubblicate", trash: "Cestino" };
const STATE_LABEL: Record<Status, string> = { new: "nuova", approved: "approvata", published: "pubblicata", trash: "nel cestino" };
/** Caption length under the field: «142/160», highlighted over the soft limit. */
const countLine = (text: string) => { const c = captionCount(text);
  return `<small class="caption-count${c.over ? " caption-over" : ""}" data-caption-count aria-live="polite">${c.label}</small>`; };
const FIELDS: [keyof Item, string, number, boolean][] = [
  ["title", "Titolo", 200, false], ["description", "Descrizione", 1000, true], ["caption", "Didascalia (con l'immagine, nel round)", CAPTION_MAX, true],
  ["explanation", "Spiegazione (dopo la risposta)", 2000, true], ["source_url", "Pagina della fonte", 1000, false],
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
const kb = (bytes: number) => bytes < 1024 ? bytes + " byte" : Math.round(bytes / 1024) + " kB";
const fileTitle = (name: string) => name.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").trim().slice(0, 200) || "Senza titolo";

export async function showLibrary() {
  let items: Item[] = [], selected = new Set<string>(), open: Item | null = null, busy = false;
  let slopStudio: { refresh: () => Promise<void> } = { refresh: async () => {} };
  const filter = { status: "library", origin: "all", tags: [] as string[], match: "all", q: "", batch: "" };
  let autoBox: { refresh: () => Promise<void> } = { refresh: async () => {} };
  let models: Models | null = null;
  let statsView: { refresh: () => Promise<void> } = { refresh: async () => {} };
  let distribution: { refresh: () => Promise<void> } = { refresh: async () => {} };
  let analysis: Analysis | null = null;
  content().innerHTML = `<section class="library page" aria-labelledby="library-title">
    <div class="library-head"><h1 id="library-title">Dashboard admin</h1></div>
    <div id="slop-auto" class="slop-auto" role="region" aria-label="Generazione automatica delle SLOP" hidden></div>
    <nav class="admin-tabs" aria-label="Sezioni amministrazione">
      <button type="button" data-admin-tab="real" aria-pressed="true">Caricamento REAL</button>
      <button type="button" data-admin-tab="slop" aria-pressed="false">Generazione SLOP<span id="slop-auto-count"></span></button>
      <button type="button" data-admin-tab="database" aria-pressed="false">Database immagini</button>
      <button type="button" data-admin-tab="stats" aria-pressed="false">Statistiche</button>
      <button type="button" data-admin-tab="settings" aria-pressed="false">Impostazioni</button>
    </nav>
    <section id="admin-real" class="admin-panel"><div id="real-wizard"></div></section>
    <section id="admin-database" class="admin-panel" hidden>
    <h2>Database immagini</h2>
    <nav class="db-tabs" aria-label="Schede del database"><button type="button" data-db-tab="images" aria-pressed="true">Immagini</button><button type="button" data-db-tab="distribution" aria-pressed="false">Distribuzione</button></nav>
    <section id="db-distribution" hidden></section>
    <div id="db-images">
    <p id="library-counts" aria-live="polite"></p><p id="library-analysis" class="hint"></p>
    <div class="library-toolbar">
      <nav class="library-views" aria-label="Viste">${Object.entries(STATUS_LABEL).map(([key, label]) =>
        `<button type="button" data-view="${key}" aria-pressed="${key === "library"}">${label}</button>`).join("")}</nav>
      <label>Origine<select id="library-origin"><option value="all">REAL e SLOP</option><option value="REAL">REAL</option><option value="SLOP">SLOP</option></select></label>
      <div class="db-tag-filter"><span>Tag</span><div class="db-tag-entry"><input id="library-tag" list="library-tag-list" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="es. riot, Invio" aria-label="Aggiungi un tag al filtro">
        <select id="library-tag-match" aria-label="Come combinare i tag"><option value="all">con tutti i tag</option><option value="any">con almeno un tag</option></select></div>
        <div class="rw-pills" id="library-tag-pills"></div></div>
      <label>Cerca<input id="library-search" type="search" placeholder="titolo"></label>
      <datalist id="library-tag-list"></datalist>
    </div>
    <div class="library-add">
      <label class="button primary library-upload">Carica file<input id="library-files" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
      <label>come<select id="library-upload-origin"><option value="REAL">REAL</option><option value="SLOP">SLOP</option></select></label>
      <button type="button" id="library-commons-toggle" aria-expanded="false">Da Commons</button>
      <button type="button" id="library-empty-trash" hidden>Svuota cestino</button>
      <span id="library-progress" role="status" aria-live="polite"></span>
    </div>
    <div id="library-commons" class="library-commons" hidden>
      <label>Link di Commons, uno per riga<textarea id="library-commons-links" rows="3" placeholder="https://commons.wikimedia.org/wiki/File:..."></textarea></label>
      <button type="button" id="library-commons-add">Aggiungi i link</button>
      <form id="library-commons-search" class="library-commons-search"><label>Cerca su Commons<input name="q" minlength="3" required></label><button>Cerca</button></form>
      <div id="library-commons-results" class="library-commons-results"></div>
      <button type="button" id="library-commons-pick" disabled>Aggiungi le selezionate</button>
    </div>
    <div id="library-drop" class="library-drop">Trascina qui le immagini da aggiungere</div>
    <p id="library-batch-filter" class="library-batch-filter" hidden><span>Batch automatico in corso: solo le sue immagini.</span><button type="button" data-batch-clear>Mostra tutte</button></p>
    <div id="library-selection" class="library-selection" hidden></div>
    <p id="library-message" role="status" aria-live="polite"></p>
    <ul id="library-grid" class="library-grid" aria-label="Immagini"></ul>
    </div></section>
    <section id="admin-stats" class="admin-panel" hidden><h2>Statistiche</h2><div id="stats-body"></div></section>
    <section id="admin-settings" class="admin-panel" hidden><h2>Impostazioni</h2>
    <p id="library-settings-message" role="status" aria-live="polite"></p>
    <details id="library-contexts" class="library-vocabulary"><summary>Contesto dei modelli</summary>
      <p class="hint">Testi fissi inviati al modello linguistico. Ogni salvataggio crea una nuova versione; le precedenti restano e si possono ripristinare. Ogni generazione registra la versione usata. Formato della risposta, limiti della didascalia e controlli sui tag restano nel codice.</p>
      <div id="library-contexts-body"></div></details>
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
      <p class="hint">Modelli OpenAI usati dalle chiamate a pagamento. Il modello di testo scrive tag e didascalie e i prompt delle SLOP, e deve leggere immagini; quello di immagini genera le SLOP. Ogni chiamata chiede conferma; il limite di spesa che conta è quello impostato sul progetto OpenAI (platform.openai.com).</p>
      <form id="library-models-form" class="library-inline"><label>Modello di testo<select name="text_model"></select></label><label>Modello di immagini<select name="image_model"></select></label><label>Qualità delle immagini<select name="image_quality"></select></label></form>
      <p id="library-models-note" class="hint"></p>
      <p class="hint">La qualità vale per lo studio SLOP e per la rigenerazione nella sezione Database.</p></details>
    <details id="library-thresholds" class="library-vocabulary"><summary>Studio SLOP</summary>
      <form id="library-thresholds-form" class="library-inline"><label>REAL approvate o pubblicate per aprire lo studio<input type="number" name="slop_section_min_real" required></label>
        <label>REAL con tutti i tag del tema<input type="number" name="slop_theme_min_real" required></label>
        <label>Proposte automatiche<select name="slop_auto_enabled"><option value="1">attive</option><option value="0">spente</option></select></label>
        <label>Soglia di proposta (% di spread)<input type="number" name="slop_auto_threshold_percent" required></label><button>Salva</button></form>
      <p class="hint">Stime da verificare sui primi temi reali (docs/wizard-slop.v1.4.1.md, sezione 2). Una proposta di generazione compare quando
        100 × (REAL − SLOP) / REAL di un tag raggiunge la soglia (33%: 1,5 REAL per ogni SLOP); spegnere le proposte non ferma un batch già avviato.</p></details>
    <details id="library-games" class="library-vocabulary"><summary>Partite</summary>
      <form id="library-games-form" class="library-inline"><label>Durata massima di una partita aperta (ore)<input type="number" name="open_game_hours" required></label><button>Salva</button></form>
      <p class="hint">Oltre questo tempo una partita non conclusa non trattiene più le copie delle foto ritirate o modificate, e la sua foto può non essere più disponibile. I livelli del gioco sono fissi nel codice.</p></details></section>
    <section id="admin-slop" class="admin-panel" hidden><div id="slop-studio"></div></section>
    <dialog id="library-detail" class="library-detail" aria-labelledby="library-detail-title"></dialog>
  </section>`;
  const page = content().querySelector<HTMLElement>(".library")!;
  const $ = <T extends HTMLElement>(selector: string) => page.querySelector<T>(selector)!;
  const message = (text: string) => { $("#library-message").textContent = text; };
  const settingsMessage = (text: string) => { $("#library-settings-message").textContent = text; };
  const progress = (text: string) => { $("#library-progress").textContent = text; };

  let tagCategories = new Map<string, Category>();
  const refreshTags = async () => {
    const { tags } = await call<{ tags: Tag[] }>("/tags");
    tagCategories = new Map(tags.map(t => [t.label, isCategory(t.category) ? t.category : "other"]));
    $("#library-tag-list").innerHTML = tags.map(t => `<option value="${escape(t.label)}">${escape(t.label)} (${t.images})</option>`).join("");
    $("#library-vocabulary summary").textContent = `Vocabolario dei tag (${tags.length})`;
    // Grouped by category; the category of a tag changes for every image that uses it.
    $("#library-vocabulary-list").innerHTML = CATEGORIES.map(c => [c, tags.filter(t => t.category === c)] as const).filter(([, list]) => list.length)
      .map(([c, list]) => `<li class="tag-category-group">${escape(CATEGORY_LABELS[c])} (${list.length})</li>` + list.map(t =>
        `<li class="tag-cat tag-cat-${t.category}"><strong>${escape(t.label)}</strong> · ${t.images} ${t.images === 1 ? "immagine" : "immagini"} ` +
        categorySelect(`data-tag-category="${escape(t.label)}" data-images="${t.images}"`, t.category) + (t.aliases.length
        ? " · alias: " + t.aliases.map(a => `${escape(a)} <button type="button" data-alias-remove="${escape(a)}" aria-label="Togli l'alias ${escape(a)}">×</button>`).join(" ") : "") + "</li>").join("")).join("")
      || "<li>Nessun tag.</li>";
  };
  const refreshAnalysis = async () => {
    analysis = await call<Analysis>("/analysis");
    $("#library-analysis").textContent = analysis.enabled ? `Analisi IA con ${analysis.model}: una chiamata a pagamento per immagine, con conferma.` : `Analisi IA non disponibile: ${analysis.reason}.`;
  };
  /** Analyses images one by one after an explicit confirmation of the total estimate. */
  const analyzeMany = async (ids: string[]) => {
    if (!analysis?.enabled || !ids.length) return;
    if (!window.confirm(`Analizzare ${ids.length} ${ids.length === 1 ? "immagine" : "immagini"} con ${analysis.model}? Sono chiamate a pagamento. Tag e didascalia attuali saranno sostituiti; ogni immagine si analizza una sola volta.`)) return;
    let done = 0; const errors: string[] = [];
    for (const [index, imageId] of ids.entries()) {
      progress(`Analisi ${index + 1} di ${ids.length}`);
      try { await call(`/${encodeURIComponent(imageId)}/analyze`, { method: "POST", body: JSON.stringify({ confirm: true }) }); done++; }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); if (/OpenAI:/.test(String(error))) break; }
    }
    progress("");
    message(`${done} di ${ids.length} analizzate.` + (errors.length ? " " + [...new Set(errors)].join(" · ") : ""));
    await Promise.all([load(), refreshTags(), refreshAnalysis()]);
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
    $("#library-counts").textContent = `${count("new")} nuove · ${count("approved")} approvate · ${count("published")} pubblicate · ${count("trash")} nel cestino`;
    $("#library-empty-trash").hidden = filter.status !== "trash" || !count("trash");
    render();
  };
  const rate = (item: Item) => item.stats.views ? ` (${Math.round(item.stats.correct / item.stats.views * 100)}%)` : "";
  const statsLine = (item: Item) => `<span class="db-stats" data-stats>Vista <strong>${item.stats.views}</strong> ${item.stats.views === 1 ? "volta" : "volte"} · classificata correttamente <strong>${item.stats.correct}</strong>${rate(item)}</span>`;
  const tagPills = () => {
    $("#library-tag-pills").innerHTML = filter.tags.map(t => pill(t, tagCategories.get(t) || "other", "rw-pill",
      `<button type="button" data-filter-remove="${escape(t)}" aria-label="Togli ${escape(t)} dal filtro">×</button>`)).join("") ||
      "<small>Nessun tag: tutte le immagini</small>";
  };
  const card = (item: Item) => `<li class="library-card${selected.has(item.id) ? " is-selected" : ""}" data-id="${escape(item.id)}">
    <label class="library-check"><input type="checkbox" data-select="${escape(item.id)}" ${selected.has(item.id) ? "checked" : ""} aria-label="Seleziona ${escape(item.title)}"></label>
    <button type="button" class="library-open" data-open="${escape(item.id)}" aria-label="Apri ${escape(item.title)}">
      <img src="${escape(item.file)}" alt="" loading="lazy"><span class="library-badges"><span class="badge badge-${item.origin.toLowerCase()}">${item.origin}</span>
      <span class="badge badge-status">${STATE_LABEL[item.status]}</span>${item.copy ? item.copy.crop ? "" : '<span class="badge badge-warn">copia da rifare in 4:5</span>' : '<span class="badge badge-warn">senza copia</span>'}${item.no_derivatives ? '<span class="badge badge-warn">licenza ND: esclusa</span>' : ""}</span>
      ${item.in_play ? `<span class="library-badges"><span class="badge badge-play">in ${item.in_play} ${item.in_play === 1 ? "partita" : "partite"} in corso</span></span>` : ""}
      <span class="library-card-title">${escape(item.title)}</span><span class="library-card-tags db-tags">${item.tags.length ? sortByCategory(item.tags, item.categories).map(t => pill(t, categoryOf(item.categories, t), "db-tag")).join("") : "nessun tag"}</span>
      ${statsLine(item)}
    </button></li>`;
  const selectionBar = () => {
    const bar = $("#library-selection"), n = selected.size;
    bar.hidden = !n;
    if (!n) return;
    const trash = filter.status === "trash";
    bar.innerHTML = `<strong>${n} selezionate</strong>` + (trash
      ? '<button data-bulk="restore">Ripristina</button><button data-bulk="delete" class="danger">Elimina definitivamente</button>'
      : '<button data-bulk="trash">Sposta nel cestino</button><label><input type="checkbox" id="library-bulk-rights"> Diritti delle REAL verificati</label><button data-bulk="analyze">Analizza con IA</button><button data-bulk="approve">Approva</button><button data-bulk="publish">Pubblica</button><button data-bulk="withdraw">Ritira dal gioco</button>' +
        '<label>Tag<input id="library-bulk-tag" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' + categorySelect('id="library-bulk-category"') + '<button data-bulk="tag-add">Aggiungi tag</button><button data-bulk="tag-remove">Togli tag</button>') +
      '<button data-bulk="none">Deseleziona</button>';
  };
  const render = () => {
    $("#library-grid").innerHTML = items.length ? items.map(card).join("") : `<li class="library-empty">${filter.status === "trash" ? "Il cestino è vuoto." : "Nessuna immagine. Carica dei file o aggiungili da Commons."}</li>`;
    selectionBar();
  };

  // Adding images: upload, then the game copy from the same file, without downloading it again.
  const addFiles = async (files: File[]) => {
    const origin = $<HTMLSelectElement>("#library-upload-origin").value;
    let done = 0; const errors: string[] = [], added: string[] = [];
    for (const [index, file] of files.entries()) {
      progress(`Carico ${index + 1} di ${files.length}: ${file.name}`);
      try {
        const item = await call<Item>(`/upload?${new URLSearchParams({ origin, title: fileTitle(file.name) })}`,
          { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        progress(`Copia di gioco ${index + 1} di ${files.length}`);
        await prepareLibraryCopy<Item>(item.id, file).then(() => added.push(item.id)).catch(error => errors.push(file.name + ": copia non pronta (" + (error instanceof Error ? error.message : error) + ")"));
        done++;
      } catch (error) { errors.push(file.name + ": " + (error instanceof Error ? error.message : String(error))); }
    }
    progress("");
    message(`${done} di ${files.length} aggiunte.` + (errors.length ? " " + errors.join(" · ") : ""));
    await Promise.all([load(), refreshTags()]);
    await analyzeMany(added);
  };
  const addCommons = async (links: string[]) => {
    let done = 0; const errors: string[] = [], added: string[] = [];
    for (const [index, url] of links.entries()) {
      progress(`Commons ${index + 1} di ${links.length}`);
      try {
        const item = await call<Item>("/commons", { method: "POST", body: JSON.stringify({ url }) });
        await prepareLibraryCopy<Item>(item.id).then(() => added.push(item.id)).catch(error => errors.push(item.title + ": copia non pronta (" + (error instanceof Error ? error.message : error) + ")"));
        done++;
      } catch (error) { errors.push(url.replace(/^https:\/\/commons\.wikimedia\.org\/wiki\//, "") + ": " + (error instanceof Error ? error.message : String(error))); }
    }
    progress("");
    message(`${done} di ${links.length} aggiunte da Commons.` + (errors.length ? " " + errors.join(" · ") : ""));
    await load();
    await analyzeMany(added);
  };

  // Detail: every change is saved at once; tags too.
  const detail = $<HTMLDialogElement>("#library-detail");
  const save = async (item: Item, change: Partial<Record<keyof Item | "tag_categories", unknown>>) => {
    const updated = await call<Item>("/" + encodeURIComponent(item.id), { method: "PATCH", body: JSON.stringify({ revision: item.revision, ...change }) });
    items = items.map(i => i.id === updated.id ? updated : i);
    return updated;
  };
  const analysisLine = (item: Item) => ({ none: "Non ancora analizzata.", running: "Analisi in corso…",
    done: "Analizzata: tag e didascalia generati una volta sola, da rivedere prima di approvare.",
    uncertain: "Esito incerto: " + item.analysis.error, failed: "Analisi non riuscita: " + item.analysis.error })[item.analysis.status];
  const showDetail = (item: Item) => {
    open = item;
    const editable = item.status === "new" || item.status === "approved";
    const fields = FIELDS.filter(([key]) => item.origin === "SLOP" || (key !== "prompt" && key !== "model"));
    detail.innerHTML = `<form method="dialog" class="library-detail-close"><button aria-label="Chiudi">×</button></form>
      <h2 id="library-detail-title">${escape(item.title)}</h2>
      <p class="hint">${item.origin} · ${STATE_LABEL[item.status]} · originale ${item.width}×${item.height}${item.copy ? ` · copia di gioco WebP ${item.copy.width}×${item.copy.height}, ${kb(item.copy.bytes)}: è ciò che vedranno i giocatori` : " · copia di gioco non pronta"}</p>
      <div class="library-detail-body"><div class="game-media-surface library-preview"><img data-game-media draggable="false" src="${escape(item.file)}" alt="${escape(item.title)}"></div>
      <div class="library-fields"><p>${statsLine(item)}</p>
      ${item.in_play ? `<p class="hint">In ${item.in_play} ${item.in_play === 1 ? "partita" : "partite"} in corso: continuano con la versione con cui sono iniziate; le modifiche valgono dalle partite nuove.</p>` : ""}
      ${item.status === "published" ? '<p class="db-edit-note">Pubblicata: per modificarla avvia la modifica. La foto esce subito dalla pubblicazione, quindi non entra in nuove partite; quelle in corso finiscono con la versione attuale. Finita la modifica resta approvata: la ripubblichi quando vuoi.</p>' : ""}
      ${item.status === "approved" ? '<p class="hint">Le modifiche si salvano subito e la foto resta approvata. Pubblicala quando hai finito.</p>' : ""}
      ${item.no_derivatives ? '<p class="db-edit-note">Licenza senza opere derivate (ND): la foto è esclusa dal gioco, perché la copia 4:5 la ritaglia.</p>' : ""}
      ${item.copy && !item.copy.crop ? '<p class="db-edit-note">Copia fatta prima del formato 4:5: scegli l\'inquadratura per rifarla, poi potrai approvare o pubblicare.</p>' : ""}
      ${!item.copy && item.status === "new" ? '<p><button type="button" id="library-copy">Prepara la copia di gioco 4:5</button></p>' : ""}
      ${editable ? '<p><button type="button" id="library-crop">Inquadratura</button></p>' : ""}
      ${fields.map(([key, label, max, area]) => `<label>${label}${area
        ? `<textarea data-field="${key}" maxlength="${max}" rows="${key === "caption" ? 2 : 3}" ${editable ? "" : "readonly"}>${escape(item[key])}</textarea>${key === "caption" ? countLine(item.caption) : ""}`
        : `<input data-field="${key}" maxlength="${max}" value="${escape(item[key])}" ${editable ? "" : "readonly"}>`}</label>`).join("")}
      <div class="library-tags"><span>Tag</span>${legend()}<ul>${sortByCategory(item.tags, item.categories).map(t => `<li class="tag-cat tag-cat-${categoryOf(item.categories, t)}" title="${escape(CATEGORY_LABELS[categoryOf(item.categories, t)])}">${escape(t)}${editable ? ` <button type="button" data-tag-remove="${escape(t)}" aria-label="Togli ${escape(t)}">×</button>` : ""}</li>`).join("") || "<li>nessuno</li>"}</ul>
        ${item.origin === "REAL" && !item.tags.some(t => categoryOf(item.categories, t) === "time") ? '<p class="hint" data-no-time>Nessun tag di Tempo: aggiungi il decennio se è noto.</p>' : ""}
        ${editable ? '<div class="library-tag-entry library-inline"><input id="library-tag-input" list="library-tag-list" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="nuovo tag, Invio">' + categorySelect('id="library-tag-category"') + '</div><p id="library-tag-hint" class="hint">Scegli la categoria per un tag nuovo. Maiuscole, accenti e spazi vengono convertiti (São Paulo → sao-paulo); inglese per i nomi comuni.</p>' : ""}</div>
      ${item.status === "new" && item.copy ? `<p class="library-analysis">${analysisLine(item)} ${analysis?.enabled && item.analysis.status !== "running" && item.analysis.status !== "done"
        ? `<button type="button" id="library-analyze">${item.analysis.status === "none" ? "Analizza con IA" : "Riprova l'analisi"} (a pagamento)</button>` : ""}</p>` : ""}
      ${editable && item.generated ? '<p><button type="button" id="library-restore">Ripristina i testi generati</button></p>' : ""}
      ${editable && item.origin === "SLOP" && analysis?.enabled ? `<div class="db-regenerate"><p class="hint">Rigenera l'immagine dal prompt qui sopra con ${escape(models?.image_model || "il modello di immagini")}, qualità ${escape(models?.image_quality || "medium")} (Impostazioni): il generatore riceve solo il testo. Poi tag e didascalia vengono rigenerati dall'analisi. Le statistiche ripartono da zero.</p>
        <div class="library-inline"><button type="button" id="library-regenerate">Rigenera l'immagine (a pagamento)</button></div></div>` : ""}
      <div class="library-actions">${item.status === "new" ? `${item.origin === "REAL" ? `<label><input type="checkbox" id="library-rights" ${item.rights_confirmed ? "checked" : ""}> Ho verificato diritti e licenza</label>` : ""}<button type="button" data-action="approve" class="primary">Approva</button>` : ""}
        ${item.status === "approved" ? '<button type="button" data-action="publish" class="primary">Pubblica nel gioco</button>' : ""}
        ${item.status === "published" ? '<button type="button" data-action="edit" class="primary">Modifica</button><button type="button" data-action="withdraw">Ritira dal gioco</button><button type="button" data-action="remove">Elimina (nel cestino)</button>' : ""}
        ${item.status === "trash" ? '<button type="button" data-action="restore">Ripristina</button><button type="button" data-action="delete" class="danger">Elimina definitivamente</button>'
          : item.status !== "published" ? '<button type="button" data-action="trash">Elimina (nel cestino)</button>' : ""}</div>
      <p id="library-detail-message" role="status" aria-live="polite"></p></div></div>`;
    if (!detail.open) detail.showModal();
    markGameMedia(detail);
  };
  detail.addEventListener("close", () => { open = null; });
  detail.addEventListener("input", event => {
    const field = event.target as HTMLTextAreaElement;
    const line = detail.querySelector<HTMLElement>("[data-caption-count]");
    if (field.dataset.field !== "caption" || !line) return;
    const count = captionCount(field.value);
    line.textContent = count.label; line.classList.toggle("caption-over", count.over);
  });
  const detailMessage = (text: string) => { const el = detail.querySelector("#library-detail-message"); if (el) el.textContent = text; };
  detail.addEventListener("change", async event => {
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
    if (!button || !open || busy || !(button.dataset.tagRemove || button.dataset.action || button.id === "library-copy" || button.id === "library-analyze" || button.id === "library-restore" || button.id === "library-regenerate" || button.id === "library-crop")) return;
    busy = true;
    try {
      if (button.dataset.tagRemove) open = await save(open, { tags: open.tags.filter(t => t !== button.dataset.tagRemove) });
      else if (button.id === "library-copy") { detailMessage("Preparo la copia di gioco…"); open = await prepareLibraryCopy<Item>(open.id); }
      else if (button.id === "library-crop") {
        const crop = await chooseCrop(open.id, open.width, open.height, open.copy?.crop || null, open.title);
        if (!crop) return;
        detailMessage("Rifaccio la copia di gioco…");
        open = await prepareLibraryCopy<Item>(open.id, undefined, crop);
        detailMessage("Inquadratura salvata.");
      }
      else if (button.id === "library-analyze" && analysis) {
        const repeat = open.analysis.status === "uncertain" ? " L'analisi precedente ha un esito incerto e potrebbe essere già stata addebitata." : "";
        if (!window.confirm(`Analizzare «${open.title}» con ${analysis.model}? È una chiamata a pagamento. Tag e didascalia attuali saranno sostituiti.${repeat}`)) return;
        detailMessage("Analisi in corso…");
        open = await call<Item>(`/${encodeURIComponent(open.id)}/analyze`, { method: "POST", body: JSON.stringify({ confirm: true }) });
        void Promise.all([refreshTags(), refreshAnalysis()]);
      }
      else if (button.id === "library-restore" && open.generated) {
        open = await save(open, { tags: open.generated.tags, caption: open.generated.caption }); void refreshTags();
      }
      else if (button.dataset.action === "delete") { await call("/" + encodeURIComponent(open.id), { method: "DELETE" }); detail.close(); open = null; }
      else if (button.dataset.action === "edit") {
        // Owner decision of 2026-11-11: the photo leaves publication as soon as the edit starts.
        if (!window.confirm(`Modificare «${open.title}»? Esce subito dalla pubblicazione e non entra in nuove partite; le partite in corso finiscono con la versione attuale. Finita la modifica resta approvata.`)) return;
        open = await call<Item>(`/${encodeURIComponent(open.id)}/withdraw`, { method: "POST", body: "{}" });
        detailMessage("Modifica avviata: la foto non è più pubblicata.");
      }
      else if (button.dataset.action === "remove") {
        if (!window.confirm(`Eliminare «${open.title}»? Esce dalla pubblicazione e va nel cestino; le partite in corso finiscono con la versione attuale.`)) return;
        await call(`/${encodeURIComponent(open.id)}/withdraw`, { method: "POST", body: "{}" });
        open = await call<Item>(`/${encodeURIComponent(open.id)}/trash`, { method: "POST", body: "{}" });
      }
      else if (button.id === "library-regenerate") {
        const prompt = detail.querySelector<HTMLTextAreaElement>('[data-field="prompt"]')?.value.trim() || "";
        const regenQuality = models?.image_quality || "medium";
        if (!prompt) { detailMessage("Scrivi il prompt."); return; }
        if (!window.confirm(`Rigenerare «${open.title}» con ${models?.image_model || "il modello di immagini"} (qualità ${regenQuality}) e poi analizzarla con ${analysis?.model || "il modello di testo"}? Sono due chiamate a pagamento. L'immagine attuale viene sostituita, tag e didascalia rigenerati, le statistiche ripartono da zero; la foto torna nuova e va approvata.`)) return;
        detailMessage("Generazione dell'immagine…");
        open = await call<Item>(`/${encodeURIComponent(open.id)}/regenerate`, { method: "POST", body: JSON.stringify({ confirm: true, prompt, quality: regenQuality, revision: open.revision }) });
        detailMessage("Copia di gioco…");
        open = await prepareLibraryCopy<Item>(open.id);
        detailMessage("Analisi…");
        open = await call<Item>(`/${encodeURIComponent(open.id)}/analyze`, { method: "POST", body: JSON.stringify({ confirm: true }) });
        void Promise.all([refreshTags(), refreshAnalysis()]);
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
      for (const panel of ["real", "slop", "database", "stats", "settings"])
        $<HTMLElement>("#admin-" + panel).hidden = panel !== tab;
      page.querySelectorAll<HTMLButtonElement>("[data-admin-tab]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
      if (tab === "database") { await load(); if (!$("#db-distribution").hidden) await distribution.refresh(); }
      if (tab === "slop") await slopStudio.refresh();
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
    busy = true;
    try {
      if (button.id === "library-commons-toggle") {
        const panel = $("#library-commons"); panel.hidden = !panel.hidden; button.setAttribute("aria-expanded", String(!panel.hidden));
      } else if (button.id === "library-commons-add") {
        const links = $<HTMLTextAreaElement>("#library-commons-links").value.split(/\s+/).map(s => s.trim()).filter(Boolean);
        if (links.length) { await addCommons(links); $<HTMLTextAreaElement>("#library-commons-links").value = ""; }
      } else if (button.id === "library-commons-pick") {
        const picked = [...page.querySelectorAll<HTMLInputElement>("[data-commons]:checked")].map(i => i.dataset.commons!);
        if (picked.length) await addCommons(picked);
      } else if (button.id === "library-empty-trash") {
        const result = await call<{ deleted: number; postponed: number }>("/trash/empty", { method: "POST", body: "{}" });
        message(`${result.deleted} immagini eliminate definitivamente.` + (result.postponed ? ` ${result.postponed} restano nel cestino finché le partite in corso che le usano non finiscono.` : "")); await Promise.all([load(), refreshTags()]);
      } else if (button.dataset.bulk) {
        const action = button.dataset.bulk;
        if (action === "none") { selected.clear(); render(); return; }
        if (action === "analyze") {
          const ids = items.filter(i => selected.has(i.id) && i.status === "new" && i.copy && i.analysis.status !== "running" && i.analysis.status !== "done").map(i => i.id);
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
        const result = await call<{ done?: number; deleted?: number; postponed?: number; failed?: { error: string }[] }>("/bulk", { method: "POST",
          body: JSON.stringify({ action, ids: [...selected], tags: tag ? [tag] : [], ...(bulkCategory ? { category: bulkCategory } : {}), rights_confirmed: action === "approve" && Boolean($<HTMLInputElement>("#library-bulk-rights")?.checked) }) });
        message(result.deleted !== undefined ? `${result.deleted} eliminate definitivamente.` + (result.postponed ? ` ${result.postponed} in partite in corso: restano nel cestino per ora.` : "") :
          `${result.done} aggiornate.` + (result.failed?.length ? ` ${result.failed.length} non aggiornate: ${[...new Set(result.failed.map(f => f.error))].join("; ")}.` : ""));
        if (action !== "tag-add" && action !== "tag-remove") selected.clear();
        await Promise.all([load(), refreshTags()]);
      }
    } catch (error) { message(String(error instanceof Error ? error.message : error)); }
    finally { busy = false; }
  });
  page.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (target.closest("dialog")) return;
    if (target.dataset.select) { if (target.checked) selected.add(target.dataset.select); else selected.delete(target.dataset.select); render(); }
    else if (target.id === "library-files" && target.files?.length) { void addFiles([...target.files]); target.value = ""; }
    else if (target.id === "library-origin") { filter.origin = target.value; void load(); }
    else if (target.id === "library-tag") addFilterTag(target);
    else if (target.id === "library-tag-match") { filter.match = target.value; void load(); }
    else if (target.dataset.commons) $<HTMLButtonElement>("#library-commons-pick").disabled = !page.querySelector("[data-commons]:checked");
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
  $("#library-tag").addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault(); addFilterTag(event.target as HTMLInputElement);
  });
  let searchTimer = 0;
  $("#library-search").addEventListener("input", event => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { filter.q = (event.target as HTMLInputElement).value.trim(); void load(); }, 250);
  });
  $("#library-commons-search").addEventListener("submit", async event => {
    event.preventDefault();
    const q = new FormData(event.target as HTMLFormElement).get("q");
    const box = $("#library-commons-results");
    box.textContent = "Cerco…";
    try {
      const result = await call<{ files: CommonsHit[] }>("/commons/search?" + new URLSearchParams({ q: String(q) }));
      box.innerHTML = result.files.map(f => `<label class="library-commons-hit"><input type="checkbox" data-commons="${escape(f.page_url)}"><img src="${escape(f.thumb_url)}" alt="" loading="lazy"><span>${escape(f.title.replace(/^File:/, ""))} · ${f.width}×${f.height}</span></label>`).join("") || "Nessun risultato.";
    } catch (error) { box.textContent = String(error instanceof Error ? error.message : error); }
  });
  // Drag and drop anywhere on the page, like a file manager.
  const drop = $("#library-drop");
  page.addEventListener("dragover", event => { if (event.dataTransfer?.types.includes("Files")) { event.preventDefault(); drop.classList.add("is-over"); } });
  page.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  page.addEventListener("drop", event => {
    if (!event.dataTransfer?.files.length) return;
    event.preventDefault(); drop.classList.remove("is-over");
    void addFiles([...event.dataTransfer.files].filter(f => /^image\/(jpeg|png|webp)$/.test(f.type)));
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
  // Model context: three texts, each saved as a new version; an old version can become the current one again.
  const CONTEXT_LABELS: Record<string, [string, string]> = {
    base: ["Base comune", "Inviata in ogni chiamata. Non deve parlare di immagini generate: il modello che scrive tag e didascalie non deve sapere che esistono."],
    analysis: ["Tag e didascalie", "Inviato insieme alla base a ogni generazione di tag e didascalia."],
    slop_prompt: ["Prompt per le SLOP", "Servirà nella fase 3 per scrivere i prompt del generatore di immagini: oggi non viene inviato a nessun modello."],
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
          `<li><span>${escape(when(v.created_at))}</span> · ${v.body.length} caratteri · usata da ${v.used} ${v.used === 1 ? "immagine" : "immagini"}${index === 0 ? " · <strong>attuale</strong>" : ` <button type="button" data-context-restore="${escape(v.id)}">Ripristina</button>`}
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
  await Promise.all([load(), refreshTags(), refreshAnalysis()]).catch(error => message(String(error instanceof Error ? error.message : error)));
  await refreshContexts().catch(error => settingsMessage(String(error instanceof Error ? error.message : error)));
  await refreshModels().catch(error => settingsMessage(String(error instanceof Error ? error.message : error)));
  // Thresholds of the SLOP studio and hours of an open game: numbers checked by the server.
  interface Numbers { values: Record<string, number>; limits: Record<string, { min: number; max: number; default: number }> }
  const renderNumbers = (n: Numbers) => {
    for (const [key, value] of Object.entries(n.values)) {
      const input = page.querySelector<HTMLInputElement>(`[name="${key}"]`);
      if (input) { input.value = String(value); input.min = String(n.limits[key].min); input.max = String(n.limits[key].max); }
    }
  };
  const numbersForm = (selector: string, fields: string[], done: string) => $(selector).addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    try {
      renderNumbers(await call<Numbers>("/settings", { method: "PUT", body: JSON.stringify(Object.fromEntries(fields.map(f => [f, Number((form.elements.namedItem(f) as HTMLInputElement).value)]))) }));
      settingsMessage(done); await slopStudio.refresh(); await autoBox.refresh();
    } catch (error) { settingsMessage(String(error instanceof Error ? error.message : error)); }
  });
  numbersForm("#library-thresholds-form", ["slop_section_min_real", "slop_theme_min_real", "slop_auto_enabled", "slop_auto_threshold_percent"], "Soglie dello studio SLOP salvate.");
  numbersForm("#library-games-form", ["open_game_hours"], "Durata massima di una partita aperta salvata.");
  await call<Numbers>("/settings").then(renderNumbers).catch(error => settingsMessage(String(error instanceof Error ? error.message : error)));
  statsView = mountStats($<HTMLElement>("#stats-body"), period => call<Stats>("/stats?" + new URLSearchParams({ period })));
  // Leaderboard: check a code, hide or show an entry.
  interface Entry { id: string; nickname: string; level_label: string; score: number; photos: number; balanced_accuracy: number; hidden: boolean; created_at: string }
  const entryLine = (e: Entry) => `${escape(e.nickname)} · ${escape(e.level_label)} · ${e.score.toLocaleString("it-IT", { minimumFractionDigits: 1 })} punti · ${Math.round(e.balanced_accuracy * 100)}% · ${escape(when(e.created_at))}${e.hidden ? " · <strong>nascosta</strong>" : ""}`;
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
  distribution = mountDistribution($<HTMLElement>("#db-distribution"), () => call<Distribution>("/distribution"));
  tagPills();
  slopStudio = await mountSlopStudio($<HTMLElement>("#slop-studio"));
  // Automatic SLOP batches: proposal, progress and review (docs/proposta-generazione-slop.v2.0.0.md).
  autoBox = mountSlopAuto($<HTMLElement>("#slop-auto"), {
    review: async batchId => {
      filter.batch = batchId; filter.status = "library"; selected.clear();
      page.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === "library")));
      page.querySelector<HTMLButtonElement>('[data-admin-tab="database"]')!.click();
    },
    changed: async () => { await Promise.all([load(), refreshTags()]); },
    indicator: n => { $("#slop-auto-count").textContent = n ? ` (${n})` : ""; },
  });
  await autoBox.refresh();
  await mountRealWizard($<HTMLElement>("#real-wizard"), async () => { await Promise.all([load(), refreshTags(), refreshAnalysis()]); });
}
