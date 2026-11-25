/** REAL wizard (spec `dashboard-admin-wizard-real`, section 4), four steps: select on Commons (search, pages, columns,
 * a tap ticks and adds at once, press and hold for the preview), description (the source text from Commons, metadata,
 * «Togli dal caricamento»), crop, summary and publication. The draft lives in the
 * browser session; photos trashed or deleted elsewhere leave the wizard. */
import "./real-wizard.css";
import { onLongPress, openPreview } from "./image-preview";
import { escape } from "../shared/html";
import { prepareLibraryCopy } from "./game-copy";
import { editFrame } from "./crop-editor";
import { withPhotoProcessing } from "./photo-processing";
import { FORMAT_LABELS, type Crop } from "../shared/game-copy";
import { markGameMedia } from "./media-mark";
import type { VisualDescription } from "../shared/real-description";
import { describePhotos, visualDescription } from "./real-description";

type Stage = 1 | 2 | 3 | 4;
interface Image {
  id: string; gallery_id: string; origin: "REAL" | "SLOP"; status: "new" | "approved" | "published" | "trash";
  revision: number; title: string; description: string;
  visual_description?: VisualDescription | null;
  source_url: string; author: string; license_name: string; license_url: string;
  width: number; height: number; file: string;
  copy: { width: number; height: number; bytes: number; crop: Crop | null } | null;
}
interface Hit { title: string; page_url: string; thumb_url: string; preview_url?: string; width: number; height: number; date?: string; description?: string }
interface Browse { files: Hit[]; next: string | null }
const BASE = "/api/admin/library";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(BASE + path, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...options.headers } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Error(data.error || "Request failed");
  return data;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const short = (value: string, count = 90) => value.length > count ? value.slice(0, count - 1) + "…" : value;

export interface RealWizard { sync(): Promise<void> }
export async function mountRealWizard(root: HTMLElement, galleryId: string, paidCalls: boolean): Promise<RealWizard> {
  const draftKey = "ros-real-wizard-v2:" + galleryId;
  let stage: Stage = 1, images: Image[] = [], notice = "", busy = false, query = "", sort = "relevance";
  /** Pages of Commons results already loaded: files and the offset of the following page. */
  /** Columns of the Commons results: 0 = automatic, otherwise 1 to 6; kept in this browser. */
  const COLUMNS_KEY = "ros-real-wizard-columns";
  let columns = 0;
  try { const saved = Number(localStorage.getItem(COLUMNS_KEY)); if (Number.isInteger(saved) && saved >= 1 && saved <= 6) columns = saved; } catch { /* private browsing */ }
  let searchPages: { files: Hit[]; next: string | null }[] = [], page = 0, searched = false;
  const knownHits = new Map<string, Hit>();
  let searchCategories: string[] = [];
  const pending = new Map<string, Hit>();
  const acquisition = document.createElement("dialog");
  acquisition.className = "rw-dialog rw-acquisition";
  acquisition.setAttribute("aria-labelledby", "rw-acquisition-title");
  acquisition.innerHTML = '<h2 id="rw-acquisition-title" tabindex="-1" autofocus>Private import</h2>' +
    '<p role="status"></p><progress aria-label="Progresso acquisizione photos REAL"></progress><p class="hint"></p>';
  const acquisitionCount = acquisition.querySelector<HTMLParagraphElement>('[role="status"]')!;
  const acquisitionProgress = acquisition.querySelector<HTMLProgressElement>("progress")!;
  const acquisitionPhase = acquisition.querySelector<HTMLParagraphElement>(".hint")!;
  acquisition.addEventListener("cancel", event => event.preventDefault());
  root.after(acquisition);
  const editable = (item: Image) => item.origin === "REAL" && item.gallery_id === galleryId && (item.status === "new" || item.status === "approved");
  const staged = () => images.filter(i => i.origin === "REAL" && (i.status === "new" || i.status === "approved"));
  const persist = () => {
    try { sessionStorage.setItem(draftKey, JSON.stringify({ ids: staged().map(i => i.id), stage, pending: [...pending.values()] })); } catch { /* private browsing */ }
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
        return { item, fresh, gone: !editable(fresh) };
      } catch { return { item, fresh: null, gone: false }; }
    }));
    const gone = new Set(checks.filter(c => c.gone).map(c => c.item.id));
    images = images.filter(i => !gone.has(i.id)).map(i => checks.find(c => c.item.id === i.id && c.fresh)?.fresh || i);
    if (!staged().length && stage !== 1) stage = 1;
    persist();
    return gone.size;
  };
  const goneNotice = (count: number) => count ? (count === 1 ? "One photo was removed from this import" : count + " photos were removed from this import") +
    ": moved, published or deleted from the gallery." : "";
  /** Edits go one after the other, each with the latest revision of its photo: two fields saved one after the other never
   * conflict. */
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
  const progress = () => '<ol class="rw-steps" aria-label="Fasi del caricamento">' +
    ["Select images", "Description", "Framing", "Summary and publication"].map((label, index) =>
      '<li ' + (stage === index + 1 ? 'aria-current="step"' : "") + '><span>' + (index + 1) + "</span>" + label + "</li>").join("") + "</ol>";
  /** A chosen photo: its thumbnail, which opens the Commons page in a new tab, and × to remove it. */
  const cardSelected = () => [...pending.entries()].map(([url, hit]) => { const name = hit.title.replace(/^File:/, "");
    return '<li class="rw-pick"><a href="' + escape(url) + '" target="_blank" rel="noopener noreferrer" title="' + escape(name) +
      ' (opens the Commons page in a new tab)"><img src="' + escape(hit.thumb_url) + '" alt="' + escape(name) + '" loading="lazy"></a><button type="button" data-rw="remove-pending" data-url="' +
      escape(url) + '" aria-label="Remove ' + escape(short(name, 60)) + ' from selection">×</button></li>'; }).join("");
  const selectedSection = () => '<h3>Selected images (' + pending.size + ')</h3>' +
    (pending.size ? '<ul class="rw-picks">' + cardSelected() + "</ul>" : '<p>Tap photos in the results.</p>') +
    (images.length ? '<p class="hint">Already imported in this session: ' + staged().length + ' images under review.</p>' : "");
  const importDisabled = () => !pending.size && !staged().length;
  const importButton = () => '<button type="button" class="primary" data-rw="import" ' + (importDisabled() ? "disabled" : "") + '>Next: description</button>';
  const first = () => '<div class="rw-stack">' +
    '<section class="rw-panel"><h3>Search Commons</h3><form id="rw-search" class="rw-search">' +
    '<label>Search terms<span class="rw-search-field"><input name="q" type="search" minlength="2" maxlength="200" required value="' + escape(query) +
      '" placeholder="Subject, location, event"><button type="button" class="rw-search-clear" data-rw-clear-search aria-label="Clear search"' +
      (query ? "" : " disabled") + '>×</button></span></label>' +
    '<label>Sort by<select name="sort"><option value="relevance" ' + (sort === "relevance" ? "selected" : "") + '>Relevance</option>' +
    '<option value="recent" ' + (sort === "recent" ? "selected" : "") + '>Most recent</option></select></label>' +
    '<button type="submit">Search</button></form>' +
    (searchCategories.length ? '<details class="rw-categories"><summary>Related categories (' + searchCategories.length + ')</summary><ul>' +
      searchCategories.map(c => "<li>" + escape(c.replace(/^Category:/, "")) + "</li>").join("") + "</ul></details>" : "") +
    (current().length ? '<label class="rw-columns-pick">Columns<select id="rw-columns">' +
      [0, 1, 2, 3, 4, 5, 6].map(n => '<option value="' + n + '" ' + (columns === n ? "selected" : "") + ">" + (n || "Automatic") + "</option>").join("") +
      "</select></label>" : "") +
    '<div class="rw-results" aria-live="polite"' + (columns ? ' style="grid-template-columns:repeat(' + columns + ',minmax(0,1fr))"' : "") + ">" + (searched && !current().length ? "<p>No results.</p>" : "") +
    current().map(hit => { const name = hit.title.replace(/^File:/, "");
      return '<label class="rw-hit" data-long-press data-rw-preview="' + escape(hit.page_url) + '" title="' + escape(name) + '"><input type="checkbox" data-rw-hit="' + escape(hit.page_url) + '" ' +
        (pending.has(hit.page_url) ? "checked" : "") + ' aria-label="Select ' + escape(short(name, 80)) + '"><img src="' + escape(hit.thumb_url) + '" alt="' + escape(name) + '" loading="lazy" draggable="false"></label>'; }).join("") + '</div>' +
    (current().length ? '<p class="hint rw-hold-hint">Tap a photo to select it; press and hold to enlarge it and read its title and description.</p>' : "") +
    (current().length || page > 0 ? '<nav class="rw-pager" aria-label="Results pages">' +
      '<button type="button" data-rw="prev-results" aria-label="Previous page" ' + (page > 0 ? "" : "disabled") + '>←</button>' +
      '<span aria-current="page">Page ' + (page + 1) + '</span>' +
      '<button type="button" data-rw="next-results" aria-label="Next page" ' + (searchPages[page]?.next ? "" : "disabled") + '>→</button></nav>' : "") +
    "</section></div>" +
    '<div class="rw-selected">' + selectedSection() + '</div><div class="rw-actions rw-bottom">' +
    importButton() + '</div>';
  const metadata = (item: Image) => '<details class="rw-metadata"><summary>Title and metadata</summary><dl>' +
    [["Commons title", item.title], ["Author", item.author],
      ["License", item.license_name], ["Original dimensions", item.width + " × " + item.height],
      ["WebP copy", item.copy ? item.copy.width + " × " + item.copy.height : "Not prepared"]]
      .map(([term, value]) => '<dt>' + escape(term) + '</dt><dd>' + escape(value || "Unavailable") + "</dd>").join("") +
    '<dt>Source</dt><dd><a href="' + escape(item.source_url) +
    '" target="_blank" rel="noopener noreferrer">Open the original Commons page</a></dd>' +
    (item.license_url ? '<dt>License</dt><dd><a target="_blank" rel="noopener noreferrer" href="' + escape(item.license_url) +
      '">Open license terms</a></dd>' : "") + "</dl></details>";
  const second = () => '<p class="hint">The source description comes from Commons: edit it if needed. It remains in the catalog and ' +
    'provides context for the photo.</p>' +
    (paidCalls && staged().some(i => !i.visual_description)
      ? '<p><button type="button" data-rw="describe">Generate missing visual descriptions</button></p>' : "") +
    '<div class="rw-editor-grid">' + staged().map(item => '<article class="rw-editor" data-rw-image="' + escape(item.id) + '">' +
      '<div class="rw-image"><img src="' + escape(item.file) + '" alt="' + escape(item.title) + '" loading="lazy"></div>' +
      '<div class="rw-editor-fields"><h3>' + escape(short(item.title, 90)) + '</h3>' +
      '<label class="rw-description">Source description <small>(catalog context)</small><textarea data-rw-description="' +
        escape(item.id) + '" maxlength="1000" rows="3" placeholder="What the photo shows, where and when">' + escape(item.description) + '</textarea></label>' +
      (item.visual_description ? visualDescription(item.visual_description) : '<p class="hint">Visual description not generated yet.</p>') +
      '<div class="rw-actions">' +
      (paidCalls && !item.visual_description ? '<button type="button" data-rw="describe" data-id="' + escape(item.id) +
        '">Generate description (1 call)</button>' : "") +
      '<button type="button" data-rw="discard" data-id="' + escape(item.id) + '">Remove from import</button>' +
      '</div>' + metadata(item) + '</div></article>').join("") + '</div>' +
    '<div class="rw-actions rw-bottom"><button type="button" data-rw="back">Back</button>' +
    '<button type="button" data-rw="to-crop" class="primary">Next: framing</button></div>';
  /** Step 3: the game copy of each photo, cut to the nearest common format at acquisition; the owner may change format and crop. */
  const third = () => '<p class="hint">Each photo has a portrait 4:5 copy. Check that it preserves the subjects and details essential to ' +
    'players; move or resize the frame if needed. Players see the entire copy.</p>' +
    '<div class="rw-preview-grid">' + staged().map(i => '<article class="rw-final rw-crop" data-rw-crop-image="' + escape(i.id) + '">' +
      (i.copy ? '<div class="game-media-surface rw-final-image"><img data-game-media src="' + escape(i.file) + '" alt="' + escape(i.title) + '"></div>'
        : '<p class="hint">Game copy not ready.</p>') +
      '<h3>' + escape(short(i.title, 70)) + '</h3>' +
      '<p class="hint">' + escape(i.copy ? (i.copy.crop ? FORMAT_LABELS[i.copy.crop.format] + " · " : "") + "WebP " + i.copy.width + " × " + i.copy.height : "Not prepared") + '</p>' +
      '<div class="rw-actions">' + (i.copy ? '<button type="button" data-rw="crop" data-id="' + escape(i.id) + '">Change frame</button>'
        : '<button type="button" data-rw="copy" data-id="' + escape(i.id) + '">Prepare game copy</button>') +
      '<button type="button" data-rw="discard" data-id="' + escape(i.id) + '">Remove from import</button></div></article>').join("") + "</div>" +
    '<div class="rw-actions rw-bottom"><button type="button" data-rw="back">Back: description</button>' +
    '<button type="button" data-rw="review" class="primary">Next: summary</button></div>';
  const fourth = () => '<p class="hint">Preview of the actual WebP copy served by the game, in its format. The RS mark is overlaid ' +
    'on the image and is not embedded in the WebP pixels.</p>' +
    '<div class="rw-preview-grid">' + staged().map(i => {
      return '<article class="rw-final">' +
      '<div class="game-media-surface rw-final-image"><img data-game-media src="' + escape(i.file) +
      '" alt="' + escape(i.title) + '"></div>' +
      '<p class="rw-final-credits">' + escape(i.title) + (i.author ? " · " + escape(i.author) : "") + (i.license_name ? " · " + escape(i.license_name) : "") + '</p>' +
      '<small>' + escape(i.copy ? "WebP · " + i.copy.width + " × " + i.copy.height : "Copy not ready") + '</small></article>';
    }).join("") + "</div>" +
    '<div class="rw-confirm"><label><input type="checkbox" id="rw-rights"> I have checked the authenticity, source and usage rights of ' +
    'the selected photos, including the license attribution terms.</label></div>' +
    '<p class="hint">Images are published individually: errors will be shown without repeating successful publications.</p>' +
    '<div class="rw-actions rw-bottom"><button type="button" data-rw="back">Back: framing</button>' +
    '<button type="button" class="primary" data-rw="publish">Confirm and publish</button></div>';
  /** Selector that finds the focused control again after innerHTML replaces it. */
  const focusKey = (): string | null => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !root.contains(active)) return null;
    if (active.id) return "#" + CSS.escape(active.id);
    for (const name of ["data-rw-hit", "data-rw-description"])
      if (active.hasAttribute(name)) return "[" + name + '="' + CSS.escape(active.getAttribute(name)!) + '"]';
    if (active.dataset.rw) return '[data-rw="' + CSS.escape(active.dataset.rw) + '"]' +
      (active.dataset.id ? '[data-id="' + CSS.escape(active.dataset.id) + '"]' : "");
    return null;
  };
  let renderedStage: Stage | undefined;
  const render = () => {
    const focused = focusKey();
    // A description being typed (not yet saved) survives a redraw.
    const drafts = [...root.querySelectorAll<HTMLTextAreaElement>("[data-rw-description]")].map(t => [t.dataset.rwDescription!, t.value] as const);
    root.innerHTML = '<div class="rw">' + progress() +
      '<p class="rw-message" role="status" aria-live="polite" tabindex="-1">' + escape(notice) + '</p>' +
      (busy ? '<p class="rw-busy" role="status">Working…</p>' : "") +
      (stage === 1 ? first() : stage === 2 ? second() : stage === 3 ? third() : fourth()) +
      '<div class="rw-actions rw-reset"><button type="button" data-rw="new">Start a new import</button></div></div>';
    if (stage >= 3) markGameMedia(root);
    for (const [id, value] of drafts) {
      const field = [...root.querySelectorAll<HTMLTextAreaElement>("[data-rw-description]")].find(t => t.dataset.rwDescription === id);
      if (field) field.value = value;
    }
    const target = focused ? root.querySelector<HTMLElement>(focused) : null;
    if (target && target.closest("dialog") === root.closest("dialog")) target.focus({ preventScroll: true });
    else if (focused) root.querySelector<HTMLElement>(".rw-message")?.focus({ preventScroll: true });
    if (renderedStage !== undefined && renderedStage !== stage) root.scrollIntoView({ block: "start" });
    renderedStage = stage;
  };
  /** Redraws only the chosen photos and the button under them, so that the results keep their scroll. */
  const renderSelected = () => {
    const section = root.querySelector<HTMLElement>(".rw-selected"), next = root.querySelector<HTMLButtonElement>('[data-rw="import"]');
    if (!section || !next || stage !== 1) { render(); return; }
    section.innerHTML = selectedSection();
    next.disabled = importDisabled();
    const message = root.querySelector<HTMLElement>(".rw-message");
    if (message) message.textContent = notice;
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
    notice = following ? "" : result.files.length + (result.files.length === 1 ? " result found." : " results found.");
    render();
  };
  const acquire = async () => {
    const urls = [...pending.keys()];
    if (!urls.length) {
      if (staged().length) { stage = 2; persist(); }
      return;
    }
    const failures: string[] = [];
    let acquired = 0;
    const countText = () => `Photos imported: ${acquired} of ${urls.length}`;
    acquisitionCount.textContent = countText();
    acquisitionProgress.max = urls.length;
    acquisitionProgress.value = 0;
    acquisitionPhase.textContent = "Importing photos…";
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = true; };
    acquisition.showModal();
    window.addEventListener("beforeunload", warnBeforeLeaving);
    try {
      for (const url of urls) {
        acquisitionPhase.textContent = "Importing photos…";
        try {
          const item = await api<Image>("/commons", { method: "POST", body: JSON.stringify({ url, gallery_id: galleryId }) });
          images.push(item); pending.delete(url); persist();
          acquired++;
          acquisitionCount.textContent = countText();
          acquisitionProgress.value = acquired;
          acquisitionPhase.textContent = "Preparing game copy…";
          try { replace(await prepareLibraryCopy<Image>(item.id)); }
          catch (copyError) { failures.push(short(item.title, 40) + ": game copy not ready (" + errorText(copyError) + ")"); }
        } catch (error) { failures.push(short(url, 40) + ": " + errorText(error)); }
      }
      stage = staged().length ? 2 : 1;
      notice = countText() + "." + (failures.length ? " Errors: " + failures.join(" | ") : "");
      persist();
    } finally {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      acquisition.close();
    }
  };
  const publish = async () => {
    const incomplete = staged().filter(i => !i.copy);
    if (incomplete.length) { stage = 3; notice = "Prepare WebP copies for: " +
      incomplete.map(i => short(i.title, 45)).join("; "); render(); return; }
    const rights = root.querySelector<HTMLInputElement>("#rw-rights");
    if (!rights?.checked) { notice = "Confirm that you have checked authenticity, provenance and rights."; render(); return; }
    const failures: string[] = []; let done = 0;
    for (const original of staged()) {
      notice = "Publishing " + (done + failures.length + 1) + " of " + staged().length + "…"; render();
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
    stage = failures.length ? 4 : 1;
    if (!failures.length) { images = []; pending.clear(); }
    notice = done + (done === 1 ? " image published." : " images published.") + (failures.length ? " Errors to fix: " + failures.join(" | ") : "");
    persist(); render();
  };
  root.addEventListener("input", event => {
    const target = event.target as HTMLTextAreaElement;
    if (target.matches('#rw-search [name="q"]')) {
      const clear = root.querySelector<HTMLButtonElement>("[data-rw-clear-search]");
      if (clear) clear.disabled = !target.value;
    }
  });
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
      else if (pending.size >= 100) { target.checked = false; notice = "The limit of 100 images per import has been reached."; }
      else { const hit = knownHits.get(url); if (hit) pending.set(url, hit); notice = ""; }
      persist();
      renderSelected();
      return;
    }
    if (target.matches("[data-rw-description]")) {
      const item = images.find(i => i.id === target.dataset.rwDescription);
      const value = target.value.trim();
      if (!item || value === item.description) return;
      void update(item, { description: value }).then(() => { notice = "Description saved."; })
        .catch(error => { notice = errorText(error); })
        .finally(() => { const message = root.querySelector<HTMLElement>(".rw-message"); if (message) message.textContent = notice; });
      return;
    }
  });
  onLongPress(root, "[data-rw-preview]", element => {
    if (acquisition.open) return;
    const hit = knownHits.get(element.dataset.rwPreview || "");
    if (!hit) return;
    openPreview({ src: hit.preview_url || hit.thumb_url, alt: hit.title.replace(/^File:/, ""), title: hit.title.replace(/^File:/, ""),
      description: hit.description || "", link: { href: hit.page_url, label: "Open Commons page" } });
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
    busy = true;
    try {
      if (action === "remove-pending") {
        const url = button.dataset.url!;
        pending.delete(url); notice = "";
        const box = [...root.querySelectorAll<HTMLInputElement>("[data-rw-hit]")].find(c => c.dataset.rwHit === url);
        if (box) box.checked = false;
        persist();
        renderSelected();
      } else if (action === "next-results") await browse(true);
      else if (action === "prev-results" && page > 0) { page--; notice = ""; render(); }
      else if (action === "import") await acquire();
      else if (action === "describe") {
        await saving.catch(() => {});
        const targets = staged().filter(item => !item.visual_description && (!id || item.id === id));
        const result = await describePhotos(targets, galleryId, api<Image>, replace);
        if (result !== null) notice = result;
      }
      else if (action === "back") { stage = stage > 1 ? (stage - 1) as Stage : 1; notice = ""; persist(); render(); }
      else if (action === "to-crop") {
        const dropped = await syncStaged();
        if (dropped && !staged().length) { notice = goneNotice(dropped); render(); return; }
        stage = 3; persist();
        notice = dropped ? goneNotice(dropped) : "";
        render();
      } else if (action === "review") {
        const dropped = await syncStaged();
        if (dropped && !staged().length) { notice = goneNotice(dropped); render(); return; }
        const invalid = staged().filter(i => !i.copy);
        if (invalid.length) notice = (dropped ? goneNotice(dropped) + " " : "") + "Before the summary, prepare game copies for: " +
          invalid.map(i => short(i.title, 40)).join("; ");
        else { stage = 4; persist(); notice = dropped ? goneNotice(dropped) : ""; }
        render();
      } else if (action === "copy") {
        const copy = await withPhotoProcessing("Preparing game copy…", () => prepareLibraryCopy<Image>(id));
        replace(copy); notice = "Game copy ready."; render();
      } else if (action === "crop") {
        const item = images.find(i => i.id === id)!;
        const updated = await editFrame(item, item.title);
        if (updated) { replace(updated); notice = "Frame saved."; render(); }
      } else if (action === "discard") {
        const item = images.find(i => i.id === id)!;
        if (!window.confirm("Remove “" + short(item.title, 60) + "” from this import? The photo will be moved to Trash and can be restored there.")) return;
        await saving.catch(() => {});
        await api("/" + encodeURIComponent(id) + "/trash", { method: "POST", body: "{}" });
        images = images.filter(i => i.id !== id);
        if (!staged().length) stage = 1;
        persist(); notice = "Photo removed from import and moved to Trash."; render();
      } else if (action === "publish") {
        const dropped = await syncStaged();
        if (dropped) { notice = goneNotice(dropped) + (staged().length ? " Check the summary and publish again." : ""); render(); }
        else await publish();
      }
      else if (action === "new") {
        images = []; pending.clear(); searchPages = []; page = 0; knownHits.clear();
        searched = false; stage = 1;
        notice = "New import. Unpublished images remain in the private library.";
        persist(); render();
      }
    } catch (error) { notice = errorText(error); render(); }
    finally { busy = false; render(); }
  });
  try {
    const raw = sessionStorage.getItem(draftKey) ?? sessionStorage.getItem("ros-real-wizard-v2");
    if (raw) {
      const draft = JSON.parse(raw) as { ids?: string[]; stage?: Stage; pending?: Hit[] };
      const ids = Array.isArray(draft.ids) ? draft.ids.filter(x => typeof x === "string").slice(0, 100) : [];
      for (const hit of Array.isArray(draft.pending) ? draft.pending.slice(0, 100) : []) {
        if (typeof hit?.page_url === "string" && hit.page_url.startsWith("https://commons.wikimedia.org/") && typeof hit.title === "string")
          pending.set(hit.page_url, hit);
      }
      let dropped = 0;
      for (const id of ids) {
        try {
          const response = await fetch(BASE + "/" + encodeURIComponent(id), { cache: "no-store" });
          if (response.status === 404) dropped++;
          if (response.ok) {
            const item = await response.json() as Image;
            if (editable(item)) images.push(item);
            else dropped++;
          }
        } catch { /* inaccessible draft */ }
      }
      if (dropped) notice = goneNotice(dropped);
      stage = images.length && (draft.stage === 2 || draft.stage === 3 || draft.stage === 4) ? draft.stage : 1;
    }
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
