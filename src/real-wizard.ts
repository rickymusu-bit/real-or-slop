/** REAL wizard (spec `dashboard-admin-wizard-real`, section 4), four steps: select on Commons (search, pages, columns,
 * a tap ticks and adds at once, press and hold for the preview, pasted links), tags (editable description, tags with categories,
 * paid generation once per image, restore, «Togli dal caricamento»), crop, summary and publication. The draft lives in the
 * browser session; photos trashed or deleted elsewhere leave the wizard. */
import "./real-wizard.css";
import { descriptionFields, readDescription } from "./editorial-ui";
import type { RealDescription } from "../shared/editorial";
import { onLongPress, openPreview } from "./image-preview";
import { escape } from "../shared/html";
import { CATEGORY_LABELS, isCategory, type Category } from "../shared/tag-categories";
import { categoryOf, categorySelect, legend, pill, sortByCategory, suggestedCategory } from "./tag-ui";
import { tagFromInput } from "../shared/tag-input";
import { prepareLibraryCopy, saveFrame } from "./game-copy";
import { chooseFrame } from "./crop-editor";
import { FORMAT_LABELS, type Crop } from "../shared/game-copy";
import { markGameMedia } from "./media-mark";

type Stage = 1 | 2 | 3 | 4;
interface Image {
  id: string; origin: "REAL" | "SLOP"; status: "new" | "approved" | "published" | "trash";
  commons_description: string | null; real_description: RealDescription | null; revision: number; title: string; description: string; tags: string[];
  source_url: string; author: string; license_name: string; license_url: string;
  width: number; height: number; file: string;
  copy: { width: number; height: number; bytes: number; crop: Crop | null } | null;
  analysis: { status: string; error: string };
  categories: Record<string, string>;
  generated: { tags: string[] } | null;
}
interface Hit { title: string; page_url: string; thumb_url: string; preview_url?: string; width: number; height: number; date?: string; description?: string }
interface Browse { files: Hit[]; next: string | null }
interface Analysis { enabled: boolean; reason: string; model: string }
const BASE = "/api/admin/library", DRAFT_KEY = "ros-real-wizard-v1.0.0";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(BASE + path, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Error(data.error || "Richiesta non riuscita");
  return data;
}
function commonsLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !["commons.wikimedia.org", "upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname)) return null;
    if (url.username || url.password || url.port) return null;
    return url.href;
  } catch { return null; }
}
/** Paid generation runs once, only on new images with a game copy and no analysis in progress. */
const generable = (i: Image) => i.status === "new" && !!i.copy && i.analysis.status !== "running" && i.analysis.status !== "done";
/** Preselected: never generated, or refused without charge. «uncertain» may already have been paid. */
const freshForGeneration = (i: Image) => generable(i) && (i.analysis.status === "none" || i.analysis.status === "failed");
const generationNote = (i: Image) => i.status !== "new" ? "approvata" : !i.copy ? "WebP non pronto"
  : ({ running: "in corso", done: "già generata", uncertain: "esito incerto, forse già addebitata", failed: "non riuscita" } as Record<string, string>)[i.analysis.status] || "";
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const short = (value: string, count = 90) => value.length > count ? value.slice(0, count - 1) + "…" : value;

export interface RealWizard { sync(): Promise<void> }
export async function mountRealWizard(root: HTMLElement, onPublished: () => Promise<void>): Promise<RealWizard> {
  let stage: Stage = 1, images: Image[] = [], notice = "", busy = false, query = "", sort = "relevance";
  /** Pages of Commons results already loaded: files and the offset of the following page. */
  /** Columns of the Commons results: 0 = automatic, otherwise 1 to 6; kept in this browser. */
  const COLUMNS_KEY = "ros-real-wizard-columns";
  let columns = 0;
  try { const saved = Number(localStorage.getItem(COLUMNS_KEY)); if (Number.isInteger(saved) && saved >= 1 && saved <= 6) columns = saved; } catch { /* private browsing */ }
  const editorialDrafts = new Map<string, {id:string;key:string;value:string}>();
  let linksOpen = false;
  let searchPages: { files: Hit[]; next: string | null }[] = [], page = 0, searched = false;
  const knownHits = new Map<string, Hit>();
  let searchCategories: string[] = [], vocabulary: string[] = [];
  let tagCategories = new Map<string, Category>();
  let analysis: Analysis | null = null;
  const pending = new Map<string, Hit | null>();
  const staged = () => images.filter(i => i.origin === "REAL" && (i.status === "new" || i.status === "approved"));
  const persist = () => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ids: staged().map(i => i.id), stage })); } catch { /* private browsing */ }
  };
  let saving: Promise<unknown> = Promise.resolve();
  const replace = (updated: Image) => { images = images.map(i => i.id === updated.id ? updated : i); persist(); };
  /** Reloads the staged photos from the library and drops those moved to the trash, published or deleted elsewhere. A photo that
   * cannot be checked (network) stays. Returns how many left the wizard. */
  const syncStaged = async () => {
    await saving.catch(() => {}); // a description still being saved must not be overwritten by an older read
    const checks = await Promise.all(staged().map(async item => {
      try {
        const response = await fetch(BASE + "/" + encodeURIComponent(item.id), { credentials: "same-origin", cache: "no-store" });
        if (response.status === 404) return { item, fresh: null, gone: true };
        if (!response.ok) return { item, fresh: null, gone: false };
        const fresh = await response.json() as Image;
        return { item, fresh, gone: fresh.origin !== "REAL" || (fresh.status !== "new" && fresh.status !== "approved") };
      } catch { return { item, fresh: null, gone: false }; }
    }));
    const gone = new Set(checks.filter(c => c.gone).map(c => c.item.id));
    images = images.filter(i => !gone.has(i.id)).map(i => checks.find(c => c.item.id === i.id && c.fresh)?.fresh || i);
    if (!staged().length && stage !== 1) stage = 1;
    persist();
    return gone.size;
  };
  const goneNotice = (count: number) => count ? (count === 1 ? "Una foto è stata tolta dal caricamento" : count + " foto sono state tolte dal caricamento") +
    ": è nel cestino, pubblicata o eliminata nella sezione Database." : "";
  /** Edits go one after the other, each with the latest revision of its photo: a description saved on leaving the field and a tag
   * added with the next tap never conflict. */
  const update = (image: Image, changes: Record<string, unknown>) => {
    const run = saving.catch(() => {}).then(async () => {
      const latest = images.find(i => i.id === image.id) || image;
      const updated = await api<Image>("/" + encodeURIComponent(image.id), {
        method: "PATCH", body: JSON.stringify({ revision: latest.revision, ...changes }),
      });
      replace(updated);
      return updated;
    });
    saving = run;
    return run;
  };
  const refreshMeta = async () => {
    const [tags, status] = await Promise.all([
      api<{ tags: { label: string; category: string }[] }>("/tags"), api<Analysis>("/analysis"),
    ]);
    vocabulary = tags.tags.map(t => t.label);
    tagCategories = new Map(tags.tags.map(t => [t.label, isCategory(t.category) ? t.category : "other"]));
    analysis = status;
  };
  const progress = () => '<ol class="rw-steps" aria-label="Fasi del caricamento">' +
    ["Seleziona le immagini", "Tag", "Inquadratura", "Riepilogo e pubblicazione"].map((label, index) =>
      '<li ' + (stage === index + 1 ? 'aria-current="step"' : "") + '><span>' + (index + 1) + "</span>" + label + "</li>").join("") + "</ol>";
  /** A chosen photo: its thumbnail, which opens the Commons page in a new tab, and × to remove it. Pasted links have no thumbnail. */
  const cardSelected = () => [...pending.entries()].map(([url, hit]) => { const name = (hit?.title || url).replace(/^File:/, "");
    return '<li class="rw-pick"><a href="' + escape(url) + '" target="_blank" rel="noopener noreferrer" title="' + escape(name) +
      ' (apre la pagina di Commons in una nuova scheda)">' + (hit ? '<img src="' + escape(hit.thumb_url) + '" alt="' + escape(name) + '" loading="lazy">'
      : '<span class="rw-pick-link">Pagina Commons</span>') + '</a><button type="button" data-rw="remove-pending" data-url="' +
      escape(url) + '" aria-label="Rimuovi ' + escape(short(name, 60)) + ' dalla selezione">×</button></li>'; }).join("");
  const selectedSection = () => '<h3>Immagini selezionate (' + pending.size + ')</h3>' +
    (pending.size ? '<ul class="rw-picks">' + cardSelected() + "</ul>" : '<p>Tocca le fotografie nei risultati oppure incolla i link.</p>') +
    (images.length ? '<p class="hint">Già acquisite in questa sessione: ' + staged().length + ' immagini in revisione.</p>' : "");
  const importButton = () => '<button type="button" class="primary" data-rw="import" ' + (!pending.size && !staged().length ? "disabled" : "") + '>Avanti: tag</button>';
  const first = () => '<div class="rw-stack">' +
    '<section class="rw-panel"><h3>Cerca su Commons</h3><form id="rw-search" class="rw-search">' +
    '<label>Termini di ricerca<span class="rw-search-field"><input name="q" type="search" minlength="2" maxlength="200" required value="' + escape(query) +
      '" placeholder="Soggetto, luogo, evento"><button type="button" class="rw-search-clear" data-rw-clear-search aria-label="Cancella la ricerca"' +
      (query ? "" : " disabled") + '>×</button></span></label>' +
    '<label>Ordina per<select name="sort"><option value="relevance" ' + (sort === "relevance" ? "selected" : "") + '>Rilevanza</option>' +
    '<option value="recent" ' + (sort === "recent" ? "selected" : "") + '>Data recente</option></select></label>' +
    '<button type="submit">Cerca</button></form>' +
    (searchCategories.length ? '<details class="rw-categories"><summary>Categorie correlate (' + searchCategories.length + ')</summary><ul>' +
      searchCategories.map(c => "<li>" + escape(c.replace(/^Category:/, "")) + "</li>").join("") + "</ul></details>" : "") +
    (current().length ? '<label class="rw-columns-pick">Colonne<select id="rw-columns">' +
      [0, 1, 2, 3, 4, 5, 6].map(n => '<option value="' + n + '" ' + (columns === n ? "selected" : "") + ">" + (n || "Automatiche") + "</option>").join("") +
      "</select></label>" : "") +
    '<div class="rw-results" aria-live="polite"' + (columns ? ' style="grid-template-columns:repeat(' + columns + ',minmax(0,1fr))"' : "") + ">" + (searched && !current().length ? "<p>Nessun risultato.</p>" : "") +
    current().map(hit => { const name = hit.title.replace(/^File:/, "");
      return '<label class="rw-hit" data-long-press data-rw-preview="' + escape(hit.page_url) + '" title="' + escape(name) + '"><input type="checkbox" data-rw-hit="' + escape(hit.page_url) + '" ' +
        (pending.has(hit.page_url) ? "checked" : "") + ' aria-label="Seleziona ' + escape(short(name, 80)) + '"><img src="' + escape(hit.thumb_url) + '" alt="' + escape(name) + '" loading="lazy" draggable="false"></label>'; }).join("") + '</div>' +
    (current().length ? '<p class="hint rw-hold-hint">Tocca una foto per selezionarla; tienila premuta per ingrandirla e leggerne titolo e descrizione.</p>' : "") +
    (current().length || page > 0 ? '<nav class="rw-pager" aria-label="Pagine dei risultati">' +
      '<button type="button" data-rw="prev-results" aria-label="Pagina precedente" ' + (page > 0 ? "" : "disabled") + '>←</button>' +
      '<span aria-current="page">Pagina ' + (page + 1) + '</span>' +
      '<button type="button" data-rw="next-results" aria-label="Pagina successiva" ' + (searchPages[page]?.next ? "" : "disabled") + '>→</button></nav>' : "") +
    "</section>" +
    '<details class="rw-panel rw-links" id="rw-links-section" ' + (linksOpen ? "open" : "") + '><summary><h3>Aggiungi link di Wikimedia Commons</h3></summary>' +
    '<p class="hint">Incolla più collegamenti, uno per riga. Non vengono pubblicati finché non confermi il riepilogo.</p>' +
    '<label for="rw-links">Link delle immagini</label><textarea id="rw-links" rows="5" placeholder="https://commons.wikimedia.org/wiki/File:..."></textarea>' +
    '<button type="button" data-rw="add-links">Aggiungi alla selezione</button></details></div>' +
    '<div class="rw-selected">' + selectedSection() + '</div><div class="rw-actions rw-bottom">' + importButton() + '</div>';
  const metadata = (item: Image) => '<details class="rw-metadata"><summary>Titolo e metadati</summary><dl>' +
    [["Titolo Commons", item.title], ["Autore", item.author],
      ["Licenza", item.license_name], ["Dimensioni originali", item.width + " × " + item.height],
      ["Copia WebP", item.copy ? item.copy.width + " × " + item.copy.height : "Da preparare"]]
      .map(([term, value]) => '<dt>' + escape(term) + '</dt><dd>' + escape(value || "Non disponibile") + "</dd>").join("") +
    '<dt>Fonte</dt><dd><a href="' + escape(item.source_url) +
    '" target="_blank" rel="noopener noreferrer">Apri la pagina originale su Commons</a></dd>' +
    (item.license_url ? '<dt>Licenza</dt><dd><a target="_blank" rel="noopener noreferrer" href="' + escape(item.license_url) +
      '">Apri il testo della licenza</a></dd>' : "") + "</dl></details>";
  const second = () => '<div class="rw-actions"><button type="button" data-rw="choose-generation" ' +
    (!analysis?.enabled ? "disabled" : "") + '>Genera tag e descrizione con IA</button><span class="hint">' +
    (analysis?.enabled ? 'Modello: ' + escape(analysis.model) + '. Una chiamata a pagamento per immagine, con conferma.' :
      'Generazione non disponibile: ' + escape(analysis?.reason || "configurazione mancante")) + "</span>" +
    (staged().some(i => i.generated) ? '<button type="button" data-rw="choose-reset">Ripristina i tag generati</button>' : "") + "</div>" +
    '<datalist id="rw-existing-tags">' + vocabulary.map(t => '<option value="' + escape(t) + '"></option>').join("") + '</datalist>' +
    legend() + '<div class="rw-editor-grid">' + staged().map(item => '<article class="rw-editor" data-rw-image="' + escape(item.id) + '">' +
      '<div class="rw-image"><img src="' + escape(item.file) + '" alt="' + escape(item.title) + '" loading="lazy"></div>' +
      '<div class="rw-editor-fields"><h3>' + escape(short(item.title, 90)) + '</h3>' +
      '<label class="rw-description">Descrizione <small>(la leggono i giocatori alla fine della partita)</small><textarea data-rw-description="' +
        escape(item.id) + '" maxlength="1000" rows="3" placeholder="Che cosa mostra la foto, dove e quando">' + escape(item.description) + '</textarea></label>' +
      descriptionFields(item.id, item.real_description, false, item.commons_description || "") +
      '<label>Tag</label><div class="rw-tagbox"><div class="rw-pills">' +
        (item.tags.length ? sortByCategory(item.tags, item.categories).map(t => pill(t, categoryOf(item.categories, t), "rw-pill",
          '<button type="button" data-rw="remove-tag" data-id="' + escape(item.id) + '" data-tag="' +
          escape(t) + '" aria-label="Rimuovi tag ' + escape(t) + '">×</button>')).join("") : '<small>Nessun tag</small>') +
        '</div>' + (item.origin === "REAL" && !item.tags.some(t => categoryOf(item.categories, t) === "time")
          ? '<small class="rw-no-time" data-rw-no-time>Nessun tag di Tempo: aggiungi il decennio se è noto.</small>' : "") +
        '<div class="rw-tag-entry"><input data-rw-new-tag="' + escape(item.id) +
          '" list="rw-existing-tags" autocomplete="off" spellcheck="false" autocapitalize="none" placeholder="Nuovo tag">' +
          categorySelect('data-rw-tag-category="' + escape(item.id) + '"') +
          '<button type="button" data-rw="add-tag" data-id="' + escape(item.id) + '">Aggiungi</button></div></div>' +
      '<div class="rw-actions">' +
      (item.generated ? '<button type="button" data-rw="reset" data-id="' + escape(item.id) +
        '">Ripristina i tag generati</button>' : "") +
      '<button type="button" data-rw="discard" data-id="' + escape(item.id) + '">Togli dal caricamento</button>' +
      '</div>' + metadata(item) + '</div></article>').join("") + '</div>' +
    '<div class="rw-actions rw-bottom"><button type="button" data-rw="back">Indietro</button>' +
    '<button type="button" data-rw="to-crop" class="primary">Avanti: inquadratura</button></div>' +
    '<dialog id="rw-generation-dialog" class="rw-dialog"><h3>Seleziona le immagini</h3><p>Seleziona le immagini per generare i tag. ' +
    'I tag attuali delle immagini scelte saranno sostituiti; le altre non cambiano. Ogni immagine si genera una sola volta.</p>' +
    '<label><input type="checkbox" id="rw-generation-all"> Seleziona tutte</label>' +
    '<div class="rw-gen-list">' + staged().map(i => '<label><input type="checkbox" data-rw-gen="' +
      escape(i.id) + '" ' + (!generable(i) ? "disabled" : freshForGeneration(i) ? "checked" : "") + '> ' + escape(short(i.title)) +
      (generationNote(i) ? ' <small>(' + escape(generationNote(i)) + ')</small>' : "") +
      '</label>').join("") + '</div><div class="rw-actions"><button type="button" data-rw="close-gen">Annulla</button>' +
      '<button type="button" class="primary" data-rw="run-gen">Genera</button></div></dialog>' +
    '<dialog id="rw-reset-dialog" class="rw-dialog"><h3>Ripristina i tag generati</h3><p>Le immagini scelte tornano ai tag ' +
    'generati, senza costi; le tue modifiche su quelle immagini vanno perse. Le altre non cambiano.</p>' +
    '<label><input type="checkbox" id="rw-reset-all"> Seleziona tutte</label>' +
    '<div class="rw-gen-list">' + staged().filter(i => i.generated).map(i => '<label><input type="checkbox" data-rw-restore="' +
      escape(i.id) + '"> ' + escape(short(i.title)) + '</label>').join("") + '</div><div class="rw-actions">' +
    '<button type="button" data-rw="close-reset">Annulla</button><button type="button" class="primary" data-rw="run-reset">Ripristina</button></div></dialog>';
  /** Step 3: the game copy of each photo, cut to the nearest common format at acquisition; the owner may change format and crop. */
  const third = () => '<p class="hint">Ogni foto ha una copia verticale 4:5 centrata. Controlla che conservi soggetti ed elementi fondamentali per ' +
    'i giocatori e, se serve, sposta o ridimensiona il ritaglio. Il giocatore vede tutta la copia.</p>' +
    '<div class="rw-preview-grid">' + staged().map(i => '<article class="rw-final rw-crop" data-rw-crop-image="' + escape(i.id) + '">' +
      (i.copy ? '<div class="game-media-surface rw-final-image"><img data-game-media src="' + escape(i.file) + '" alt="' + escape(i.title) + '"></div>'
        : '<p class="hint">Copia di gioco non pronta.</p>') +
      '<h3>' + escape(short(i.title, 70)) + '</h3>' +
      '<p class="hint">' + escape(i.copy ? (i.copy.crop ? FORMAT_LABELS[i.copy.crop.format] + " · " : "") + "WebP " + i.copy.width + " × " + i.copy.height : "Da preparare") + '</p>' +
      '<div class="rw-actions">' + (i.copy ? '<button type="button" data-rw="crop" data-id="' + escape(i.id) + '">Cambia inquadratura</button>'
        : '<button type="button" data-rw="copy" data-id="' + escape(i.id) + '">Prepara la copia di gioco</button>') +
      '<button type="button" data-rw="discard" data-id="' + escape(i.id) + '">Togli dal caricamento</button></div></article>').join("") + "</div>" +
    '<div class="rw-actions rw-bottom"><button type="button" data-rw="back">Indietro: tag</button>' +
    '<button type="button" data-rw="review" class="primary">Avanti: riepilogo</button></div>';
  const fourth = () => '<p class="hint">Anteprima della copia WebP effettivamente servita dal gioco, nel suo formato. Il marchio RS è sovrapposto ' +
    'all’immagine e non viene incorporato nei pixel del WebP.</p>' +
    '<div class="rw-preview-grid">' + staged().map(i => '<article class="rw-final">' +
      '<div class="game-media-surface rw-final-image"><img data-game-media src="' + escape(i.file) +
      '" alt="' + escape(i.title) + '"></div>' +
      (i.description ? '<p class="rw-final-description">' + escape(i.description) + '</p>' : '<p class="hint">Nessuna descrizione.</p>') +
      '<p class="hint">' + escape(i.tags.join(", ")) + '</p>' +
      '<small>' + escape(i.copy ? "WebP · " + i.copy.width + " × " + i.copy.height : "Copia non pronta") + '</small></article>').join("") + "</div>" +
    '<div class="rw-confirm"><label><input type="checkbox" id="rw-rights"> Ho verificato autenticità, fonte e diritti di ' +
    'utilizzo delle fotografie selezionate, incluse le condizioni di attribuzione della licenza.</label></div>' +
    '<p class="hint">La pubblicazione avviene immagine per immagine: eventuali errori saranno indicati senza ripetere quelle già pubblicate.</p>' +
    '<div class="rw-actions rw-bottom"><button type="button" data-rw="back">Indietro: inquadratura</button>' +
    '<button type="button" class="primary" data-rw="publish">Conferma e pubblica</button></div>';
  /** Selector that finds the focused control again after innerHTML replaces it. */
  const focusKey = (): string | null => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !root.contains(active)) return null;
    if (active.id) return "#" + CSS.escape(active.id);
    if (active.dataset.editorial && active.dataset.editorialId) return `[data-editorial="${CSS.escape(active.dataset.editorial)}"][data-editorial-id="${CSS.escape(active.dataset.editorialId)}"]`;
    for (const name of ["data-rw-new-tag", "data-rw-hit", "data-rw-description"])
      if (active.hasAttribute(name)) return "[" + name + '="' + CSS.escape(active.getAttribute(name)!) + '"]';
    if (active.dataset.rw) return '[data-rw="' + CSS.escape(active.dataset.rw) + '"]' +
      (active.dataset.id ? '[data-id="' + CSS.escape(active.dataset.id) + '"]' : "");
    return null;
  };
  const render = () => {
    const focused = focusKey();
    // A description being typed (not yet saved) survives a redraw.
    const drafts = [...root.querySelectorAll<HTMLTextAreaElement>("[data-rw-description]")].map(t => [t.dataset.rwDescription!, t.value] as const);
    root.innerHTML = '<div class="rw"><h2>Caricamento REAL</h2>' + progress() +
      '<p class="rw-message" role="status" aria-live="polite" tabindex="-1">' + escape(notice) + '</p>' +
      (busy ? '<p class="rw-busy" role="status">Operazione in corso…</p>' : "") +
      (stage === 1 ? first() : stage === 2 ? second() : stage === 3 ? third() : fourth()) +
      '<div class="rw-actions rw-reset"><button type="button" data-rw="new">Inizia un nuovo caricamento</button></div></div>';
    if (stage >= 3) markGameMedia(root);
    for (const d of editorialDrafts.values()) {
      const field = [...root.querySelectorAll<HTMLTextAreaElement>("[data-editorial]")].find(t => t.dataset.editorialId === d.id && t.dataset.editorial === d.key);
      if (field) field.value = d.value;
    }
    for (const [id, value] of drafts) {
      const field = [...root.querySelectorAll<HTMLTextAreaElement>("[data-rw-description]")].find(t => t.dataset.rwDescription === id);
      if (field) field.value = value;
    }
    const target = focused ? root.querySelector<HTMLElement>(focused) : null;
    if (target && !target.closest("dialog")) target.focus({ preventScroll: true });
    else if (focused) root.querySelector<HTMLElement>(".rw-message")?.focus({ preventScroll: true });
  };
  /** Redraws only the chosen photos and the button under them, so that the results keep their scroll. */
  const renderSelected = () => {
    const section = root.querySelector<HTMLElement>(".rw-selected"), bottom = root.querySelector<HTMLElement>(".rw-bottom");
    if (!section || !bottom || stage !== 1) { render(); return; }
    section.innerHTML = selectedSection();
    bottom.innerHTML = importButton();
    const message = root.querySelector<HTMLElement>(".rw-message");
    if (message) message.textContent = notice;
  };
  const addLinks = (links: string[], hits = new Map<string, Hit>()) => {
    const invalid: string[] = [];
    for (const source of links) {
      const url = commonsLink(source);
      if (url && pending.size < 100) pending.set(url, hits.get(source) || null);
      else invalid.push(source);
    }
    notice = invalid.length ? "Link non validi oppure limite di 100 superato: " + invalid.map(s => short(s, 80)).join("; ") :
      pending.size + (pending.size === 1 ? " immagine" : " immagini") + " nella selezione.";
    render();
  };
  /** First page of a new search, or the page after the current one (fetched once, then kept). */
  const current = () => searchPages[page]?.files || [];
  const browse = async (following: boolean) => {
    if (following && searchPages[page + 1]) { page++; notice = ""; render(); return; }
    const args = new URLSearchParams({ q: query, sort });
    const offset = following ? searchPages[page]?.next : null;
    if (following && !offset) return;
    if (offset) args.set("offset", offset);
    const result = await api<Browse & { categories?: string[] }>("/commons/search?" + args);
    for (const hit of result.files) knownHits.set(hit.page_url, hit);
    if (following) { searchPages.push({ files: result.files, next: result.next }); page = searchPages.length - 1; }
    else { searchPages = [{ files: result.files, next: result.next }]; page = 0; searchCategories = result.categories || []; }
    searched = true;
    notice = following ? "" : result.files.length + (result.files.length === 1 ? " risultato trovato." : " risultati trovati.");
    render();
  };
  const acquire = async () => {
    if (!pending.size && staged().length) { stage = 2; persist(); render(); return; }
    const failures: string[] = [];
    let done = 0;
    for (const [url] of [...pending]) {
      try {
        notice = "Acquisizione privata " + (done + failures.length + 1) + " di " + pending.size + "…";
        render();
        const item = await api<Image>("/commons", { method: "POST", body: JSON.stringify({ url }) });
        images.push(item); pending.delete(url); persist(); done++;
        try { const copied = await prepareLibraryCopy<Image>(item.id); replace(copied); }
        catch (copyError) { failures.push(short(item.title, 40) + ": WebP non pronto (" + errorText(copyError) + ")"); }
      } catch (error) { failures.push(short(url, 40) + ": " + errorText(error)); }
    }
    stage = staged().length ? 2 : 1;
    notice = done + (done === 1 ? " immagine acquisita e preparata" : " immagini acquisite e preparate") + " in WebP." + (failures.length ? " Errori: " + failures.join(" | ") : "");
    persist(); render();
  };
  let conflictNotes: string[] = [];
  const generate = async (ids: string[]) => {
    if (!analysis?.enabled || !ids.length) { notice = "Nessuna immagine selezionata o generazione non disponibile."; render(); return; }
    const chosen = images.filter(i => ids.includes(i.id));
    const uncertain = chosen.filter(i => i.analysis.status === "uncertain").length;
    const repeat = uncertain ? " " + uncertain + (uncertain === 1 ? " immagine ha" : " immagini hanno") + " un esito incerto che potrebbe essere già stato addebitato." : "";
    if (!window.confirm("Confermi " + ids.length + (ids.length === 1 ? " chiamata a " : " chiamate a ") + analysis.model +
      " per generare i tag? Sono chiamate a pagamento. I tag attuali di queste immagini saranno sostituiti; ogni immagine si genera una sola volta." + repeat)) return;
    const failures: string[] = []; let done = 0;
    for (const id of ids) {
      const item = images.find(i => i.id === id);
      if (!item || !generable(item)) continue;
      notice = "Generazione " + (done + failures.length + 1) + " di " + ids.length + "…"; render();
      try {
        const result = await api<Image>("/" + encodeURIComponent(id) + "/analyze", {
          method: "POST", body: JSON.stringify({ confirm: true }),
        });
        replace(result); done++;
        const extra = result as Image & { tag_conflicts?: { label: string; proposed: Category; existing: Category }[] };
        for (const c of extra.tag_conflicts || []) conflictNotes.push("«" + c.label + "» proposto come " + CATEGORY_LABELS[c.proposed] + ", nel vocabolario è " + CATEGORY_LABELS[c.existing]);
      } catch (error) {
        failures.push(short(item.title, 35) + ": " + errorText(error));
        if (/OpenAI:/.test(errorText(error))) break;
      }
    }
    try { await refreshMeta(); } catch { /* show per-image errors, if any */ }
    const conflicts = conflictNotes; conflictNotes = [];
    notice = done + (done === 1 ? " immagine elaborata." : " immagini elaborate.") +
      (conflicts.length ? " Categorie da verificare: " + conflicts.join("; ") + "." : "") +
      (failures.length ? " Problemi: " + failures.join(" | ") : "");
    render();
  };
  /** Brings the chosen images back to their generated tags: a plain edit, no paid call. */
  const restore = async (ids: string[]) => {
    const failures: string[] = []; let done = 0;
    for (const id of ids) {
      const item = images.find(i => i.id === id);
      if (!item?.generated) continue;
      try { await update(item, { tags: item.generated.tags }); done++; }
      catch (error) { failures.push(short(item.title, 35) + ": " + errorText(error)); }
    }
    notice = (done ? done + (done === 1 ? " immagine riportata" : " immagini riportate") + " ai tag generati, senza costi." : "Nessuna immagine selezionata.") +
      (failures.length ? " Problemi: " + failures.join(" | ") : "");
    render();
  };
  const publish = async () => {
    const incomplete = staged().filter(i => !i.copy || !i.tags.length);
    if (incomplete.length) { stage = incomplete.some(i => !i.tags.length) ? 2 : 3; notice = "Completa copia WebP e almeno un tag per: " +
      incomplete.map(i => short(i.title, 45)).join("; "); render(); return; }
    const rights = root.querySelector<HTMLInputElement>("#rw-rights");
    if (!rights?.checked) { notice = "Devi confermare la verifica di autenticità, provenienza e diritti."; render(); return; }
    const failures: string[] = []; let done = 0;
    for (const original of staged()) {
      notice = "Pubblicazione " + (done + failures.length + 1) + " di " + staged().length + "…"; render();
      try {
        let item = original;
        if (item.status === "new") {
          item = await api<Image>("/" + encodeURIComponent(item.id) + "/approve", {
            method: "POST", body: JSON.stringify({ rights_confirmed: true }),
          });
          replace(item);
        }
        item = await api<Image>("/" + encodeURIComponent(item.id) + "/publish", { method: "POST", body: "{}" });
        replace(item);
        done++;
      } catch (error) { failures.push(short(original.title, 40) + ": " + errorText(error)); }
    }
    await onPublished();
    stage = failures.length ? 4 : 1;
    if (!failures.length) { images = []; pending.clear(); }
    notice = done + (done === 1 ? " immagine pubblicata." : " immagini pubblicate.") + (failures.length ? " Errori da correggere: " + failures.join(" | ") : "");
    persist(); render();
  };
  root.addEventListener("input", event => {
    const target = event.target as HTMLTextAreaElement;
    if (target.matches("[data-editorial]")) editorialDrafts.set(target.dataset.editorialId!+":"+target.dataset.editorial!,
      {id:target.dataset.editorialId!,key:target.dataset.editorial!,value:target.value});
    if (target.matches("[data-rw-new-tag]")) {
      // The picker follows what is typed: the vocabulary's category for an existing tag, Time for a decade.
      const checked = tagFromInput(target.value);
      const suggested = checked.ok ? suggestedCategory(checked.tag, tagCategories) : "";
      const picker = root.querySelector<HTMLSelectElement>('[data-rw-tag-category="' + target.dataset.rwNewTag + '"]');
      if (picker && suggested) picker.value = suggested;
    }
    if (target.matches('#rw-search [name="q"]')) {
      const clear = root.querySelector<HTMLButtonElement>("[data-rw-clear-search]");
      if (clear) clear.disabled = !target.value;
    }
  });
  // «toggle» does not bubble: listen in the capture phase to keep the links section open across re-renders.
  root.addEventListener("toggle", event => {
    const section = event.target as HTMLDetailsElement;
    if (section.id === "rw-links-section") linksOpen = section.open;
  }, true);
  root.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (target.id === "rw-columns") {
      const n = Number(target.value);
      columns = Number.isInteger(n) && n >= 1 && n <= 6 ? n : 0;
      try { if (columns) localStorage.setItem(COLUMNS_KEY, String(columns)); else localStorage.removeItem(COLUMNS_KEY); } catch { /* private browsing */ }
      const grid = root.querySelector<HTMLElement>(".rw-results");
      if (grid) grid.style.gridTemplateColumns = columns ? "repeat(" + columns + ",minmax(0,1fr))" : "";
      return;
    }
    if (target.matches("[data-rw-hit]")) {
      // A tap ticks the photo and puts it among the chosen ones at once; unticking takes it out.
      const url = target.dataset.rwHit!;
      if (!target.checked) { pending.delete(url); notice = ""; }
      else if (pending.size >= 100) { target.checked = false; notice = "Limite di 100 immagini per caricamento raggiunto."; }
      else { pending.set(url, knownHits.get(url) || null); notice = ""; }
      renderSelected();
      return;
    }
    if (target.matches("[data-editorial]")) {
      const item = staged().find(i => i.id === target.dataset.editorialId);
      if (item) {
        const key = item.id+":"+target.dataset.editorial!, value=target.value;
        void update(item, {real_description:readDescription(root,item.id)}).then(()=>{
          if(editorialDrafts.get(key)?.value===value)editorialDrafts.delete(key);
        }).catch(error=>{notice=String(error);render();});
      }
      return;
    }
    if (target.matches("[data-rw-description]")) {
      const item = images.find(i => i.id === target.dataset.rwDescription);
      const value = target.value.trim();
      if (!item || value === item.description) return;
      void update(item, { description: value }).then(() => { notice = "Descrizione salvata."; })
        .catch(error => { notice = errorText(error); })
        .finally(() => { const message = root.querySelector<HTMLElement>(".rw-message"); if (message) message.textContent = notice; });
      return;
    }
    if (target.id === "rw-reset-all") {
      root.querySelectorAll<HTMLInputElement>("[data-rw-restore]").forEach(c => { c.checked = target.checked; });
    }
    if (target.id === "rw-generation-all") {
      root.querySelectorAll<HTMLInputElement>("[data-rw-gen]:not(:disabled)").forEach(c => { c.checked = target.checked; });
    }
  });
  onLongPress(root, "[data-rw-preview]", element => {
    const hit = knownHits.get(element.dataset.rwPreview || "");
    if (!hit) return;
    openPreview({ src: hit.preview_url || hit.thumb_url, alt: hit.title.replace(/^File:/, ""), title: hit.title.replace(/^File:/, ""),
      description: hit.description || "", link: { href: hit.page_url, label: "Apri la pagina su Commons" } });
  });
  root.addEventListener("submit", event => {
    if ((event.target as HTMLElement).id !== "rw-search") return;
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.target as HTMLFormElement);
    query = String(data.get("q") || "").trim(); sort = data.get("sort") === "recent" ? "recent" : "relevance";
    busy = true; render();
    void browse(false).catch(error => { notice = errorText(error); render(); }).finally(() => { busy = false; render(); });
  });
  root.addEventListener("keydown", event => {
    const input = event.target as HTMLInputElement;
    if (!input.matches("[data-rw-new-tag]") || event.key !== "Enter") return;
    event.preventDefault(); root.querySelector<HTMLButtonElement>('button[data-rw="add-tag"][data-id="' + input.dataset.rwNewTag + '"]')?.click();
  });
  root.addEventListener("click", async event => {
    // The button at the end of the Commons search field empties it; results and selection stay.
    const clear = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-rw-clear-search]");
    if (clear) {
      const input = root.querySelector<HTMLInputElement>('#rw-search [name="q"]');
      if (input) { input.value = ""; input.focus(); }
      query = ""; clear.disabled = true;
      return;
    }
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-rw]");
    if (!button || busy) return;
    const action = button.dataset.rw!, id = button.dataset.id || "";
    if (action === "close-reset") { root.querySelector<HTMLDialogElement>("#rw-reset-dialog")?.close(); return; }
    if (action === "choose-reset") { root.querySelector<HTMLDialogElement>("#rw-reset-dialog")!.showModal(); return; }
    if (action === "close-gen") { root.querySelector<HTMLDialogElement>("#rw-generation-dialog")?.close(); return; }
    if (action === "choose-generation") {
      root.querySelector<HTMLDialogElement>("#rw-generation-dialog")!.showModal();
      return;
    }
    if (action === "run-gen") {
      const ids = [...root.querySelectorAll<HTMLInputElement>("[data-rw-gen]:checked")].map(x => x.dataset.rwGen!);
      root.querySelector<HTMLDialogElement>("#rw-generation-dialog")?.close();
      busy = true;
      try { await generate(ids); } catch (error) { notice = errorText(error); render(); }
      finally { busy = false; render(); }
      return;
    }
    busy = true;
    try {
      if (action === "add-links") {
        const input = root.querySelector<HTMLTextAreaElement>("#rw-links")!;
        addLinks(input.value.split(/\s+/).filter(Boolean));
      } else if (action === "remove-pending") {
        const url = button.dataset.url!;
        pending.delete(url); notice = "";
        const box = [...root.querySelectorAll<HTMLInputElement>("[data-rw-hit]")].find(c => c.dataset.rwHit === url);
        if (box) box.checked = false;
        renderSelected();
      } else if (action === "next-results") await browse(true);
      else if (action === "prev-results" && page > 0) { page--; notice = ""; render(); }
      else if (action === "import") await acquire();
      else if (action === "back") { stage = stage > 1 ? (stage - 1) as Stage : 1; notice = ""; persist(); render(); }
      else if (action === "to-crop") {
        const dropped = await syncStaged();
        if (dropped && !staged().length) { notice = goneNotice(dropped); render(); return; }
        const invalid = staged().filter(i => !i.tags.length);
        if (invalid.length) notice = (dropped ? goneNotice(dropped) + " " : "") + "Prima dell'inquadratura aggiungi almeno un tag a: " +
          invalid.map(i => short(i.title, 40)).join("; ");
        else {
          stage = 3; persist();
          const noTime = staged().filter(i => i.origin === "REAL" && !i.tags.some(t => categoryOf(i.categories, t) === "time")).length;
          notice = noTime ? noTime + (noTime === 1 ? " immagine non ha" : " immagini non hanno") + " un tag di Tempo: puoi continuare comunque." : "";
          if (dropped) notice = goneNotice(dropped) + (notice ? " " + notice : "");
        }
        render();
      } else if (action === "review") {
        const dropped = await syncStaged();
        if (dropped && !staged().length) { notice = goneNotice(dropped); render(); return; }
        const invalid = staged().filter(i => !i.copy);
        if (invalid.length) notice = (dropped ? goneNotice(dropped) + " " : "") + "Prima del riepilogo prepara la copia di gioco di: " +
          invalid.map(i => short(i.title, 40)).join("; ");
        else { stage = 4; persist(); notice = dropped ? goneNotice(dropped) : ""; }
        render();
      } else if (action === "add-tag") {
        const text = root.querySelector<HTMLInputElement>('[data-rw-new-tag="' + id + '"]')!.value;
        const chosen = root.querySelector<HTMLSelectElement>('[data-rw-tag-category="' + id + '"]')?.value || "";
        const checked = tagFromInput(text);
        const existing = checked.ok ? tagCategories.get(checked.tag) : undefined;
        const category = existing && !chosen ? existing : chosen;
        if (!checked.ok) notice = checked.reason;
        else if (!isCategory(category)) notice = "Scegli la categoria del tag.";
        else if (existing && existing !== category && !window.confirm("«" + checked.tag + "» è già un tag della categoria " + CATEGORY_LABELS[existing] +
          ". Vuoi spostarlo in " + CATEGORY_LABELS[category] + "? Il cambio vale per tutte le immagini che lo usano. Altrimenti usa una parola più specifica."))
          notice = "Tag non aggiunto: usa una parola più specifica.";
        else {
          if (existing && existing !== category) {
            await api("/tags/category", { method: "PUT", body: JSON.stringify({ label: checked.tag, category }) });
            await refreshMeta();
            const fresh = await Promise.all(staged().map(i => api<Image>("/" + encodeURIComponent(i.id))));
            for (const updated of fresh) replace(updated);
          }
          const latest = images.find(i => i.id === id)!;
          await update(latest, { tags: [...new Set([...latest.tags, checked.tag])], tag_categories: { [checked.tag]: category } });
          if (!existing) tagCategories.set(checked.tag, category);
          notice = "Tag salvato.";
        }
        render();
      } else if (action === "remove-tag") {
        const item = images.find(i => i.id === id)!;
        await update(item, { tags: item.tags.filter(t => t !== button.dataset.tag) }); notice = "Tag rimosso."; render();
      } else if (action === "run-reset" || action === "reset") {
        const ids = action === "reset" ? [id]
          : [...root.querySelectorAll<HTMLInputElement>("[data-rw-restore]:checked")].map(x => x.dataset.rwRestore!);
        root.querySelector<HTMLDialogElement>("#rw-reset-dialog")?.close();
        await restore(ids);
      } else if (action === "copy") {
        const copy = await prepareLibraryCopy<Image>(id);
        replace(copy); notice = "Copia di gioco pronta."; render();
      } else if (action === "crop") {
        const item = images.find(i => i.id === id)!;
        const choice = await chooseFrame(id, item.width, item.height, item.copy ? { crop: item.copy.crop } : null, item.title);
        if (choice) { replace(await saveFrame<Image>(item, choice)); notice = "Inquadratura salvata."; render(); }
      } else if (action === "discard") {
        const item = images.find(i => i.id === id)!;
        if (!window.confirm("Togliere «" + short(item.title, 60) + "» dal caricamento? La foto va nel cestino e si può ripristinare dalla sezione Database.")) return;
        await api("/" + encodeURIComponent(id) + "/trash", { method: "POST", body: "{}" });
        images = images.filter(i => i.id !== id);
        if (!staged().length) stage = 1;
        persist(); notice = "Foto tolta dal caricamento e spostata nel cestino."; render();
      } else if (action === "publish") {
        const dropped = await syncStaged();
        if (dropped) { notice = goneNotice(dropped) + (staged().length ? " Controlla il riepilogo e pubblica di nuovo." : ""); render(); }
        else await publish();
      }
      else if (action === "new") {
        images = []; pending.clear(); searchPages = []; page = 0; knownHits.clear();
        searched = false; stage = 1;
        notice = "Nuovo caricamento. Le immagini non pubblicate restano nella libreria privata.";
        persist(); render();
      }
    } catch (error) { notice = errorText(error); render(); }
    finally { busy = false; render(); }
  });
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      const draft = JSON.parse(raw) as { ids?: string[]; stage?: Stage };
      const ids = Array.isArray(draft.ids) ? draft.ids.filter(x => typeof x === "string").slice(0, 100) : [];
      for (const id of ids) {
        try {
          const item = await api<Image>("/" + encodeURIComponent(id));
          if (item.origin === "REAL" && (item.status === "new" || item.status === "approved")) images.push(item);
        } catch { /* inaccessible draft */ }
      }
      stage = images.length && (draft.stage === 2 || draft.stage === 3 || draft.stage === 4) ? draft.stage : 1;
    }
    await refreshMeta();
  } catch (error) { notice = errorText(error); }
  persist(); render();
  return {
    async sync() {
      if (busy) return;
      const dropped = await syncStaged();
      if (dropped) notice = goneNotice(dropped);
      render();
    },
  };
}
