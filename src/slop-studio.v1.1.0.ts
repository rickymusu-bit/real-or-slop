/** SLOP studio (docs/wizard-slop.v1.4.0.md): theme with the spread chart, editable slots, prompts, images with their
 * analysis, review. v1.1.0, 2026-11-11T05:40:53Z: paid part (prompts, images, analysis, review); every paid call is confirmed.
 * v1.0.0, 2026-11-10T22:11:48Z: free part.
 * The chart: one diverging bar per tag, spread = REAL − SLOP among approved and published images; colour = category,
 * with the tag name written beside each bar, so identity never rests on colour alone. */
import "./slop-studio.v1.1.0.css";
import { prepareLibraryCopy } from "./game-copy.v1.0.0";
import { markGameMedia } from "./media-mark.v1.0.0";
import { escape } from "../shared/html";
import { CATEGORY_LABELS, isCategory, type Category } from "../shared/tag-categories.v1.0.0";
import { SLOT_ORDER, type Slot } from "../shared/slot-extraction.v1.0.0";
import { categoryOf as categoryOfImage, legend, pill, sortByCategory } from "./tag-ui.v1.1.0";

interface SpreadTag { label: string; category: Category; real: number; slop: number; spread: number }
interface Spread { thresholds: { section: number; theme: number; max_slots: number }; real_total: number; slop_total: number; tags: SpreadTag[] }
interface Slots { theme: string[]; reference: number; slots: Slot[] }
interface Image { id: string; status: string; revision: number; caption: string; tags: string[]; categories: Record<string, string>; file: string;
  copy: unknown; prompt: string; analysis: { status: string; error: string }; generation: { batch: string; slot: { index: number; theme: string[]; tags: Slot } } | null }
interface Batch { id: string; theme: string[]; slots: Slot[]; prompts: { prompt: string; used: string[] }[]; prompts_status: string; prompts_error: string; images: Image[] }
interface Models { text_model: string; image_model: string; image_models: { id: string; qualities: string[] }[] }
const API = "/api/admin/library/slop/", LIBRARY = "/api/admin/library", DRAFT = "ros-slop-studio-v1.0.0";

async function call<T>(path: string, body?: unknown, method?: string, base = API): Promise<T> {
  const response = await fetch(base + path, { credentials: "same-origin", method: method || (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Error(data.error || "Richiesta non riuscita");
  return data;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const signed = (n: number) => (n > 0 ? "+" : "") + n;

export async function mountSlopStudio(root: HTMLElement): Promise<{ refresh: () => Promise<void> }> {
  let data: Spread | null = null, page = 1, notice = "", busy = false;
  let batch: Batch | null = null, batchId = "", models: Models | null = null, quality = "medium", progress = "";
  let hidden = new Set<Category>(), expanded = false, topN = 10, search = "";
  let theme: string[] = [], count = 5, reference: number | null = null, slots: Slot[] = [];
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT) || "{}") as { theme?: string[]; count?: number; slots?: Slot[]; page?: number; batch?: string; quality?: string };
    batchId = typeof draft.batch === "string" ? draft.batch : "";
    quality = typeof draft.quality === "string" ? draft.quality : "medium";
    theme = Array.isArray(draft.theme) ? draft.theme.filter(t => typeof t === "string") : [];
    count = typeof draft.count === "number" ? Math.min(10, Math.max(1, draft.count)) : 5;
    slots = Array.isArray(draft.slots) ? draft.slots : [];
    page = typeof draft.page === "number" && draft.page >= 2 && draft.page <= 5 && slots.length ? (draft.page > 2 && !batchId ? 2 : draft.page) : 1;
  } catch { /* no draft */ }
  const persist = () => { try { sessionStorage.setItem(DRAFT, JSON.stringify({ theme, count, slots, page, batch: batchId, quality })); } catch { /* private browsing */ } };
  const categoryOf = (label: string): Category => data?.tags.find(t => t.label === label)?.category || "other";

  const steps = () => '<ol class="rw-steps slop-steps" aria-label="Fasi della generazione">' +
    ["Tema", "Slot", "Prompt", "Immagini", "Revisione"].map((label, i) =>
      "<li " + (page === i + 1 ? 'aria-current="step"' : "") + "><span>" + (i + 1) + "</span>" + label + "</li>").join("") + "</ol>";

  /** Rows shown: filtered by category; compact view = first n by spread, expanded = all, with search. */
  const rows = () => {
    const visible = (data?.tags || []).filter(t => !hidden.has(t.category) && (!expanded || !search || t.label.includes(search)));
    return expanded ? visible : visible.slice(0, topN);
  };
  const chart = () => {
    const list = rows();
    const max = Math.max(1, ...list.map(t => Math.abs(t.spread)));
    return '<div class="spread-chart' + (expanded ? " spread-expanded" : "") + '" role="list" aria-label="Spread dei tag: REAL meno SLOP">' +
      (list.length ? list.map(t => {
        const width = Math.abs(t.spread) / max * 100;
        const text = t.label + ", " + CATEGORY_LABELS[t.category] + ": REAL " + t.real + ", SLOP " + t.slop + ", spread " + signed(t.spread);
        return '<div class="spread-row" role="listitem"><button type="button" class="spread-hit" data-slop-tag="' + escape(t.label) +
          '" aria-label="' + escape(text + ". Aggiungi al tema") + '" data-tip="' + escape(text) + '">' +
          '<span class="spread-label">' + escape(t.label) + "</span>" +
          '<span class="spread-track"><span class="spread-half spread-neg">' +
          (t.spread < 0 ? '<span class="spread-bar tag-cat-' + t.category + '" style="width:' + width.toFixed(1) + '%"></span>' : "") +
          '</span><span class="spread-half spread-pos">' +
          (t.spread > 0 ? '<span class="spread-bar tag-cat-' + t.category + '" style="width:' + width.toFixed(1) + '%"></span>' : "") +
          '</span></span><span class="spread-value">' + signed(t.spread) + "</span></button></div>";
      }).join("") : '<p class="hint">Nessun tag da mostrare con questi filtri.</p>') +
      '<div class="spread-tip" role="tooltip" hidden></div></div>';
  };
  const first = () => {
    if (!data) return '<p class="hint">Caricamento…</p>';
    const closed = data.real_total < data.thresholds.section;
    return '<p class="slop-totals">Immagini approvate o pubblicate: REAL <strong>' + data.real_total + "</strong>, SLOP <strong>" +
      data.slop_total + "</strong>. Lo spread di un tag è il numero di REAL meno il numero di SLOP che lo portano: positivo dove mancano SLOP.</p>" +
      (closed ? '<p class="slop-closed">REAL approvate o pubblicate: ' + data.real_total + " su " + data.thresholds.section +
        ". La generazione si apre da " + data.thresholds.section + " REAL.</p>" : "") +
      '<div class="slop-filters" role="group" aria-label="Filtra per categoria">' +
      SLOT_ORDER.concat(["other"]).map(c => '<button type="button" class="tag-legend-item tag-cat tag-cat-' + c + '" data-slop-cat="' + c +
        '" aria-pressed="' + !hidden.has(c) + '">' + escape(CATEGORY_LABELS[c]) + "</button>").join("") +
      '<button type="button" data-slop-cat="all">Tutte</button></div>' +
      '<div class="slop-view library-inline">' + (expanded
        ? '<label>Cerca<input type="search" data-slop-search value="' + escape(search) + '" autocomplete="off" autocapitalize="none" spellcheck="false"></label>' +
          '<button type="button" data-slop="compact">Vista compatta</button>'
        : '<label>Primi<select data-slop-top>' + [5, 10, 20, 30].map(n => '<option value="' + n + '"' + (n === topN ? " selected" : "") + ">" + n + "</option>").join("") +
          '</select> tag</label><button type="button" data-slop="expand">Mostra tutti</button>') + "</div>" +
      chart() +
      '<section class="slop-theme"><h3>Tema</h3><p class="hint">I tag del tema compaiono in tutti i prompt. Clic su una barra per aggiungerlo.</p>' +
      '<div class="rw-pills">' + (theme.length ? theme.map(t => '<span class="rw-pill tag-cat tag-cat-' + categoryOf(t) + '">' + escape(t) +
        '<button type="button" data-slop-remove="' + escape(t) + '" aria-label="Togli ' + escape(t) + ' dal tema">×</button></span>').join("") : "<small>Nessun tag nel tema</small>") + "</div>" +
      '<div class="rw-tag-entry"><input data-slop-theme list="slop-tags" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Tag del tema">' +
      '<button type="button" data-slop="add">Aggiungi</button></div><datalist id="slop-tags">' +
      data.tags.map(t => '<option value="' + escape(t.label) + '"></option>').join("") + "</datalist>" +
      (theme.length ? '<p class="slop-reference">' + (reference === null ? "…" : reference + " REAL contengono tutto il tema su " +
        data.thresholds.theme + " necessarie") + "</p>" : "") +
      '<label>Immagini da generare<select data-slop-count>' + Array.from({ length: data.thresholds.max_slots }, (_, i) => i + 1)
        .map(n => '<option value="' + n + '"' + (n === count ? " selected" : "") + ">" + n + "</option>").join("") + "</select></label>" +
      '<div class="rw-actions rw-bottom"><button type="button" class="primary" data-slop="slots"' +
      (closed || !theme.length || (reference ?? 0) < data.thresholds.theme ? " disabled" : "") + ">Prepara gli slot</button></div></section>";
  };
  const second = () => {
    const vocabulary = (c: Category) => (data?.tags || []).filter(t => t.category === c).map(t => t.label).sort();
    const covered = new Set(theme.map(categoryOf));
    return '<p class="hint">Tema: <strong>' + theme.map(escape).join(", ") + "</strong>. Ogni riga è un'immagine: il tema più al massimo un tag per " +
      "categoria, estratto dalle REAL che contengono il tema. Puoi cambiare ogni casella o ripescare.</p>" + legend() +
      '<div class="slot-table-wrap"><table class="slot-table"><thead><tr><th scope="col">#</th>' +
      SLOT_ORDER.map(c => '<th scope="col">' + escape(CATEGORY_LABELS[c]) + "</th>").join("") + "</tr></thead><tbody>" +
      // «Ripesca» sits by the number, so that it stays on screen when the table scrolls sideways on a phone.
      slots.map((slot, i) => '<tr><th scope="row"><span>' + (i + 1) + '</span> <button type="button" data-slop="reroll" data-slot="' + i +
        '" aria-label="Ripesca l\'immagine ' + (i + 1) + '">Ripesca</button></th>' + SLOT_ORDER.map(c => {
        if (covered.has(c)) return '<td class="tag-cat tag-cat-' + c + '">' + escape(theme.filter(t => categoryOf(t) === c).join(", ")) + " <small>(tema)</small></td>";
        const options = vocabulary(c);
        return '<td><select class="tag-cat tag-cat-' + c + '" data-slot="' + i + '" data-slot-cat="' + c + '" aria-label="' +
          escape(CATEGORY_LABELS[c] + ", immagine " + (i + 1)) + '"><option value="">—</option>' +
          options.map(o => '<option value="' + escape(o) + '"' + (slot[c] === o ? " selected" : "") + ">" + escape(o) + "</option>").join("") + "</select></td>";
      }).join("") + "</tr>").join("") +
      "</tbody></table></div>" +
      '<div class="rw-actions rw-bottom"><button type="button" data-slop="back">Indietro: tema</button>' +
      '<button type="button" data-slop="reroll-all">Ripesca tutti</button>' +
      '<button type="button" class="primary" data-slop="prompts">Genera prompt</button></div>' +
      '<p class="hint">«Genera prompt» è una chiamata a pagamento a ' + escape(models?.text_model || "modello di testo") + ", con conferma.</p>";
  };
  const slotLine = (slot: Slot | undefined) => theme.concat(SLOT_ORDER.map(c => slot?.[c] || "").filter(Boolean))
    .map(t => pill(t, categoryOf(t), "rw-pill")).join("");
  const qualities = () => models?.image_models.find(m => m.id === models?.image_model)?.qualities || ["medium"];
  const third = () => {
    const prompts = batch?.prompts || [];
    return '<p class="hint">Prompt in inglese, uno per immagine. Puoi modificarli: si salvano uscendo dal campo. «Riscrivi» chiede al modello ' +
      "un nuovo prompt per quello slot (a pagamento).</p>" +
      (batch?.prompts_status === "uncertain" || batch?.prompts_status === "failed" ? '<p class="slop-closed">' + escape(batch.prompts_error) + "</p>" : "") +
      '<ol class="slop-prompts">' + slots.map((slot, i) => '<li><div class="rw-pills">' + slotLine(slot) + "</div>" +
        '<textarea data-prompt="' + i + '" rows="4" maxlength="4000" aria-label="Prompt dell\'immagine ' + (i + 1) + '">' + escape(prompts[i]?.prompt || "") + "</textarea>" +
        '<button type="button" data-slop="rewrite" data-slot="' + i + '">Riscrivi</button></li>').join("") + "</ol>" +
      '<div class="slop-generate library-inline"><span>Modello di immagini: <strong>' + escape(models?.image_model || "") + "</strong></span>" +
      '<label>Qualità<select data-slop-quality>' + qualities().map(q => '<option value="' + q + '"' + (q === quality ? " selected" : "") + ">" + q + "</option>").join("") + "</select></label></div>" +
      '<div class="rw-actions rw-bottom"><button type="button" data-slop="to-slots">Indietro: slot</button>' +
      '<button type="button" class="primary" data-slop="images"' + (prompts.length === slots.length && prompts.every(p => p.prompt) ? "" : " disabled") +
      ">Genera immagini e analizza</button></div>";
  };
  const fourth = () => '<p class="hint">Per ogni immagine: generazione, copia di gioco WebP nel browser, analisi di tag e didascalia.</p>' +
    '<p class="slop-progress" role="status">' + escape(progress) + "</p>" +
    '<div class="rw-actions rw-bottom"><button type="button" data-slop="to-review"' + (busy ? " disabled" : "") + ">Vai alla revisione</button></div>";
  /** Expected tags (theme and slot) the analysis did not find on the image. */
  const missing = (image: Image) => {
    const slot = image.generation?.slot;
    return slot ? slot.theme.concat(SLOT_ORDER.map(c => slot.tags?.[c] || "").filter(Boolean)).filter(t => !image.tags.includes(t)) : [];
  };
  const fifth = () => {
    const images = batch?.images || [];
    return '<p class="hint">I tag finali sono quelli dell\'analisi. «Previsti ma non rilevati» confronta lo slot con ciò che l\'analisi ha visto; ' +
      "se manca un tag del tema l'immagine ha mancato l'obiettivo. Approvare non pubblica: la pubblicazione resta un passo separato.</p>" +
      (images.length ? '<div class="rw-preview-grid">' + images.map(image => {
        const lost = missing(image), index = image.generation?.slot.index ?? 0, themeLost = lost.filter(t => image.generation?.slot.theme.includes(t));
        return '<article class="rw-final slop-review" data-image="' + escape(image.id) + '"><div class="game-media-surface rw-final-image"><img data-game-media src="' +
          escape(image.file) + '" alt="Immagine ' + (index + 1) + '"></div>' +
          '<p class="play-caption">' + escape(image.caption || "(senza didascalia)") + "</p>" +
          '<div class="rw-pills">' + sortByCategory(image.tags, image.categories).map(t => pill(t, categoryOfImage(image.categories, t), "rw-pill")).join("") + "</div>" +
          (lost.length ? '<p class="' + (themeLost.length ? "slop-closed" : "hint") + '">Previsti ma non rilevati: ' + lost.map(escape).join(", ") + "</p>" : '<p class="hint">Tutti i tag previsti sono stati rilevati.</p>') +
          '<p class="hint">Immagine ' + (index + 1) + " · " + escape(image.status) + (image.analysis.status !== "done" ? " · analisi: " + escape(image.analysis.status) : "") + "</p>" +
          '<div class="rw-actions">' +
          (image.status === "new" && image.copy && image.analysis.status !== "done" ? '<button type="button" data-slop="analyze" data-id="' + escape(image.id) + '">Analizza</button>' : "") +
          (image.status === "new" ? '<button type="button" class="primary" data-slop="approve" data-id="' + escape(image.id) + '"' + (image.tags.length && image.copy ? "" : " disabled") + ">Approva</button>" : "") +
          (image.status === "approved" ? '<button type="button" class="primary" data-slop="publish" data-id="' + escape(image.id) + '">Pubblica</button>' : "") +
          (image.status === "new" || image.status === "approved" ? '<button type="button" data-slop="trash" data-id="' + escape(image.id) + '">Cestino</button>' : "") +
          '<button type="button" data-slop="regenerate" data-slot="' + index + '">Rigenera</button></div></article>';
      }).join("") + "</div>" : "<p>Nessuna immagine generata in questo gruppo.</p>") +
      '<div class="rw-actions rw-bottom"><button type="button" data-slop="to-prompts">Indietro: prompt</button>' +
      '<button type="button" data-slop="new-batch">Nuovo gruppo</button></div>';
  };
  const render = () => {
    root.innerHTML = '<div class="rw slop"><h2>Generazione SLOP</h2>' + steps() +
      '<p class="slop-message" role="status" aria-live="polite">' + escape(notice) + "</p>" +
      (busy ? '<p class="rw-busy" role="status">Operazione in corso…</p>' : "") +
      [first, second, third, fourth, fifth][page - 1]() + "</div>";
    if (page === 5) markGameMedia(root);
  };
  const refreshReference = async () => {
    reference = null;
    if (!theme.length) return;
    try { reference = (await call<{ reference: number }>("theme", { theme })).reference; } catch (error) { notice = errorText(error); }
  };
  const loadBatch = async () => { if (batchId) batch = await call<Batch>("batches/" + encodeURIComponent(batchId)); };
  const refresh = async () => {
    try {
      data = await call<Spread>("spread"); await refreshReference();
      models = await call<Models>("/models", undefined, "GET", LIBRARY);
      if (!qualities().includes(quality)) quality = qualities().includes("medium") ? "medium" : qualities()[0];
      await loadBatch();
    } catch (error) { notice = errorText(error); }
    render();
  };
  /** Copy in the browser, then the paid analysis (already confirmed with the generation). */
  const finish = async (imageId: string) => {
    await prepareLibraryCopy(imageId);
    await call("/" + encodeURIComponent(imageId) + "/analyze", { confirm: true }, "POST", LIBRARY);
  };
  /** Generates, prepares and analyses the images of the given slots, one by one; an OpenAI account problem stops the run. */
  const produce = async (indexes: number[]) => {
    const failures: string[] = [];
    for (const [n, i] of indexes.entries()) {
      progress = "Immagine " + (i + 1) + " (" + (n + 1) + " di " + indexes.length + "): generazione…"; render();
      try {
        const image = await call<Image>("batches/" + encodeURIComponent(batchId) + "/images", { confirm: true, index: i, quality });
        progress = "Immagine " + (i + 1) + ": copia di gioco e analisi…"; render();
        await finish(image.id);
      } catch (error) {
        failures.push("immagine " + (i + 1) + ": " + errorText(error));
        if (/OpenAI:/.test(errorText(error))) break;
      }
    }
    await loadBatch();
    progress = (indexes.length - failures.length) + " di " + indexes.length + " immagini pronte." + (failures.length ? " Problemi: " + failures.join(" | ") : "");
    notice = progress;
  };
  const addTheme = async (label: string) => {
    const tag = label.trim();
    if (!tag) return;
    if (!data?.tags.some(t => t.label === tag)) { notice = "«" + tag + "» non è tra i tag delle immagini approvate o pubblicate."; render(); return; }
    if (!theme.includes(tag)) theme = [...theme, tag];
    notice = ""; persist(); await refreshReference(); render();
  };
  const draw = async (n: number, existing: Slot[]) => (await call<Slots>("slots", { theme, count: n, existing })).slots;

  root.addEventListener("click", async event => {
    const target = event.target as HTMLElement;
    const bar = target.closest<HTMLButtonElement>("[data-slop-tag]");
    if (bar) { await addTheme(bar.dataset.slopTag!); return; }
    const chip = target.closest<HTMLButtonElement>("[data-slop-cat]");
    if (chip) {
      const c = chip.dataset.slopCat!;
      if (c === "all") hidden = new Set();
      else if (isCategory(c)) { if (hidden.has(c)) hidden.delete(c); else hidden.add(c); }
      render(); return;
    }
    const remove = target.closest<HTMLButtonElement>("[data-slop-remove]");
    if (remove) { theme = theme.filter(t => t !== remove.dataset.slopRemove); persist(); await refreshReference(); render(); return; }
    const button = target.closest<HTMLButtonElement>("button[data-slop]");
    if (!button || busy) return;
    const action = button.dataset.slop!;
    if (action === "expand" || action === "compact") { expanded = action === "expand"; render(); return; }
    if (action === "add") { await addTheme(root.querySelector<HTMLInputElement>("[data-slop-theme]")!.value); return; }
    if (action === "back") { page = 1; persist(); render(); return; }
    if (action === "to-slots") { page = 2; persist(); render(); return; }
    if (action === "to-prompts") { page = 3; persist(); render(); return; }
    if (action === "to-review") { page = 5; persist(); await loadBatch(); render(); return; }
    if (action === "new-batch") { batchId = ""; batch = null; page = 1; notice = ""; persist(); render(); return; }
    const paid: Record<string, () => string> = {
      prompts: () => "Scrivere " + slots.length + " prompt con " + (models?.text_model || "il modello di testo") + "? È una chiamata a pagamento.",
      rewrite: () => "Riscrivere il prompt dell'immagine " + (Number(button.dataset.slot) + 1) + " con " + (models?.text_model || "il modello di testo") + "? È una chiamata a pagamento.",
      images: () => "Generare " + slots.length + " immagini con " + (models?.image_model || "il modello di immagini") + " in qualità " + quality +
        " e analizzarle con " + (models?.text_model || "il modello di testo") + "? Sono " + slots.length * 2 + " chiamate a pagamento.",
      regenerate: () => "Generare un'altra immagine per lo slot " + (Number(button.dataset.slot) + 1) + " con " + (models?.image_model || "il modello di immagini") +
        " in qualità " + quality + " e analizzarla? Sono 2 chiamate a pagamento; l'immagine attuale resta, puoi spostarla nel cestino.",
      analyze: () => "Analizzare questa immagine con " + (models?.text_model || "il modello di testo") + "? È una chiamata a pagamento.",
    };
    if (paid[action] && !window.confirm(paid[action]())) return;
    busy = true; render();
    try {
      if (action === "slots" || action === "reroll-all") { slots = await draw(count, []); page = 2; notice = ""; batchId = ""; batch = null; }
      else if (action === "prompts") {
        // A group per set of slots: created on the first prompts, its slots updated when the owner changed them.
        batch = batchId ? await call<Batch>("batches/" + encodeURIComponent(batchId), { slots }, "PUT") : await call<Batch>("batches", { theme, slots });
        batchId = batch.id;
        batch = await call<Batch>("batches/" + encodeURIComponent(batchId) + "/prompts", { confirm: true });
        page = 3; notice = "Prompt scritti.";
      } else if (action === "rewrite") {
        batch = await call<Batch>("batches/" + encodeURIComponent(batchId) + "/prompts", { confirm: true, index: Number(button.dataset.slot) });
        notice = "Prompt dell'immagine " + (Number(button.dataset.slot) + 1) + " riscritto.";
      } else if (action === "images") {
        page = 4; persist(); await produce(slots.map((_, i) => i)); page = 5;
      } else if (action === "regenerate") {
        await produce([Number(button.dataset.slot)]);
      } else if (action === "analyze") {
        await call("/" + encodeURIComponent(button.dataset.id!) + "/analyze", { confirm: true }, "POST", LIBRARY); await loadBatch(); notice = "Analisi completata.";
      } else if (action === "approve" || action === "publish" || action === "trash") {
        await call("/" + encodeURIComponent(button.dataset.id!) + "/" + action, {}, "POST", LIBRARY); await loadBatch();
        notice = { approve: "Immagine approvata.", publish: "Immagine pubblicata.", trash: "Immagine nel cestino." }[action];
      }
      else if (action === "reroll") {
        const i = Number(button.dataset.slot);
        [slots[i]] = await draw(1, slots.filter((_, j) => j !== i));
        notice = "Immagine " + (i + 1) + " ripescata.";
      }
      persist();
    } catch (error) { notice = errorText(error); }
    finally { busy = false; render(); }
  });
  root.addEventListener("change", event => {
    const target = event.target as HTMLSelectElement;
    if (target.matches("[data-slop-top]")) { topN = Number(target.value); render(); }
    else if (target.matches("[data-slop-count]")) { count = Number(target.value); persist(); }
    else if (target.matches("[data-slop-quality]")) { quality = target.value; persist(); }
    else if (target.matches("[data-prompt]") && batch) {
      // Owner's edit of a prompt: free, saved at once.
      const texts = slots.map((_, i) => root.querySelector<HTMLTextAreaElement>('[data-prompt="' + i + '"]')?.value ?? batch!.prompts[i]?.prompt ?? "");
      void call<Batch>("batches/" + encodeURIComponent(batchId), { prompts: texts }, "PUT")
        .then(updated => { batch = updated; notice = "Prompt salvato."; const m = root.querySelector(".slop-message"); if (m) m.textContent = notice; })
        .catch(error => { notice = errorText(error); render(); });
    }
    else if (target.matches("[data-slot]")) {
      const i = Number(target.dataset.slot), c = target.dataset.slotCat as Category;
      slots[i] = { ...slots[i] };
      if (target.value) slots[i][c] = target.value; else delete slots[i][c];
      persist();
    }
  });
  root.addEventListener("input", event => {
    const target = event.target as HTMLInputElement;
    if (!target.matches("[data-slop-search]")) return;
    search = target.value.trim().toLowerCase();
    const chartNode = root.querySelector(".spread-chart");
    if (chartNode) chartNode.outerHTML = chart();
  });
  root.addEventListener("keydown", event => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-slop-theme]") && event.key === "Enter") { event.preventDefault(); void addTheme(target.value); }
  });
  // Tooltip: counts of the bar under the pointer or with the focus.
  const tip = (target: EventTarget | null, x?: number, y?: number) => {
    const bar = (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-tip]");
    const box = root.querySelector<HTMLElement>(".spread-tip"), chartNode = root.querySelector<HTMLElement>(".spread-chart");
    if (!box || !chartNode) return;
    if (!bar) { box.hidden = true; return; }
    box.textContent = bar.dataset.tip!;
    box.hidden = false;
    const area = chartNode.getBoundingClientRect(), rect = bar.getBoundingClientRect();
    const left = (x ?? rect.left + rect.width / 2) - area.left, top = (y ?? rect.top) - area.top + chartNode.scrollTop;
    box.style.left = Math.max(0, Math.min(left + 12, area.width - box.offsetWidth)) + "px";
    box.style.top = (top - box.offsetHeight - 8 < chartNode.scrollTop ? top + 24 : top - box.offsetHeight - 8) + "px";
  };
  root.addEventListener("pointermove", event => tip(event.target, event.clientX, event.clientY));
  root.addEventListener("pointerleave", () => tip(null));
  root.addEventListener("focusin", event => tip(event.target));
  render();
  await refresh();
  return { refresh };
}
