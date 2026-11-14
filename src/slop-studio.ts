/** SLOP studio (spec `generazione-slop`, sections 3–7): group (genre and decade) with an optional theme, editable slots, prompts
 * with their format, images with their treated copy and analysis, review with the expected tags not found and press-and-hold
 * preview. Every paid call is confirmed. */
import "./slop-studio.css";
import { prepareItemCopy, type TreatableItem } from "./game-copy";
import { FORMAT_LABELS, FORMATS, isFormat, type Format } from "../shared/game-copy";
import { markGameMedia } from "./media-mark";
import { onLongPress, openPreview } from "./image-preview";
import { escape } from "../shared/html";
import { CATEGORY_LABELS, VISUAL, type Category } from "../shared/tag-categories";
import { SLOT_ORDER, type Slot } from "../shared/slot-extraction";
import { categoryOf as categoryOfImage, legend, pill, sortByCategory } from "./tag-ui";

interface SpreadTag { label: string; category: Category; real: number; slop: number; spread: number }
interface SpreadGroup { key: string; genre: string; time: string; real: number; slop: number; fresh: number; spread: number; missing_real: number; room: number }
interface Spread { thresholds: { section: number; group: number; max_slots: number }; real_total: number; slop_total: number; tags: SpreadTag[]; groups: SpreadGroup[] }
interface Slots { group: string; theme: string[]; reference: number; slots: Slot[] }
interface Image { id: string; status: string; revision: number; tags: string[]; categories: Record<string, string>; file: string;
  copy: unknown; prompt: string; analysis: { status: string; error: string };
  generation: { batch: string; slot: { index: number; group?: string | null; theme: string[]; tags: Slot } } | null }
interface Batch { id: string; group: string | null; theme: string[]; slots: Slot[]; prompts: { prompt: string; used: string[]; format?: Format }[]; prompts_status: string; prompts_error: string; images: Image[] }
interface Models { text_model: string; image_model: string; image_quality: string; image_models: { id: string; qualities: string[] }[] }
const API = "/api/admin/library/slop/", LIBRARY = "/api/admin/library", DRAFT = "ros-slop-studio-v2";

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
  let group = "", theme: string[] = [], count = 5, reference: number | null = null, slots: Slot[] = [];
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT) || "{}") as { group?: string; theme?: string[]; count?: number; slots?: Slot[]; page?: number; batch?: string; quality?: string };
    group = typeof draft.group === "string" ? draft.group : "";
    batchId = typeof draft.batch === "string" ? draft.batch : "";
    quality = typeof draft.quality === "string" ? draft.quality : "medium";
    theme = Array.isArray(draft.theme) ? draft.theme.filter(t => typeof t === "string") : [];
    count = typeof draft.count === "number" ? Math.min(10, Math.max(1, draft.count)) : 5;
    slots = Array.isArray(draft.slots) ? draft.slots : [];
    page = typeof draft.page === "number" && draft.page >= 2 && draft.page <= 5 && slots.length ? (draft.page > 2 && !batchId ? 2 : draft.page) : 1;
  } catch { /* no draft */ }
  const persist = () => { try { sessionStorage.setItem(DRAFT, JSON.stringify({ group, theme, count, slots, page, batch: batchId, quality })); } catch { /* private browsing */ } };
  const chosen = () => data?.groups.find(g => g.key === group) || null;
  const categoryOf = (label: string): Category => data?.tags.find(t => t.label === label)?.category || "other";

  const steps = () => '<ol class="rw-steps slop-steps" aria-label="Fasi della generazione">' +
    ["Gruppo", "Slot", "Prompt", "Immagini", "Revisione"].map((label, i) =>
      "<li " + (page === i + 1 ? 'aria-current="step"' : "") + "><span>" + (i + 1) + "</span>" + label + "</li>").join("") + "</ol>";

  const groupTable = () => {
    if (!data?.groups.length) return '<p class="hint">Nessun gruppo: servono REAL approvate o pubblicate con un tag di Genere e uno di Tempo. ' +
      "Completa Genere, Colore e Supporto dal Database.</p>";
    return '<div class="slot-table-wrap"><table class="slot-table slop-groups"><thead><tr><th scope="col">Genere</th><th scope="col">Decennio</th>' +
      '<th scope="col">REAL</th><th scope="col">SLOP</th><th scope="col">Nuove</th><th scope="col">Spread</th><th scope="col">Stato</th><th scope="col"></th></tr></thead><tbody>' +
      data.groups.map(g => '<tr' + (g.key === group ? ' class="slop-group-chosen"' : "") + '><td class="tag-cat tag-cat-genre">' + escape(g.genre) +
        '</td><td class="tag-cat tag-cat-time">' + escape(g.time) + "</td><td>" + g.real + "</td><td>" + g.slop + "</td><td>" + g.fresh + "</td><td>" +
        signed(g.spread) + "</td><td>" + (g.missing_real ? "mancano " + g.missing_real + " REAL" : g.room ? g.room + " SLOP possibili" : "in equilibrio") +
        '</td><td><button type="button" data-slop-group="' + escape(g.key) + '" aria-pressed="' + (g.key === group) + '"' +
        (g.missing_real ? " disabled" : "") + ">Scegli</button></td></tr>").join("") + "</tbody></table></div>";
  };
  const first = () => {
    if (!data) return '<p class="hint">Caricamento…</p>';
    const closed = data.real_total < data.thresholds.section, current = chosen();
    return '<p class="slop-totals">Immagini approvate o pubblicate: REAL <strong>' + data.real_total + "</strong>, SLOP <strong>" +
      data.slop_total + "</strong>. Un gruppo riunisce le REAL dello stesso genere e decennio; genera con almeno " + data.thresholds.group +
      " REAL e al massimo tante SLOP quante sono le sue REAL. Lo spread è REAL meno SLOP.</p>" +
      (closed ? '<p class="slop-closed">REAL approvate o pubblicate: ' + data.real_total + " su " + data.thresholds.section +
        ". La generazione si apre da " + data.thresholds.section + " REAL.</p>" : "") +
      groupTable() +
      '<section class="slop-theme"><h3>Tema (facoltativo)</h3><p class="hint">' + (current ? "Gruppo scelto: <strong>" + escape(current.genre) +
        "</strong>, <strong>" + escape(current.time) + "</strong>. " : "Scegli prima un gruppo. ") +
      "I tag del tema compaiono in tutti i prompt e restringono le REAL di riferimento a quelle che li hanno tutti.</p>" +
      '<div class="rw-pills">' + (theme.length ? theme.map(t => '<span class="rw-pill tag-cat tag-cat-' + categoryOf(t) + '">' + escape(t) +
        '<button type="button" data-slop-remove="' + escape(t) + '" aria-label="Togli ' + escape(t) + ' dal tema">×</button></span>').join("") : "<small>Nessun tag nel tema</small>") + "</div>" +
      '<div class="rw-tag-entry"><input data-slop-theme list="slop-tags" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Tag del tema">' +
      '<button type="button" data-slop="add">Aggiungi</button></div><datalist id="slop-tags">' +
      data.tags.map(t => '<option value="' + escape(t.label) + '"></option>').join("") + "</datalist>" +
      (current ? '<p class="slop-reference">' + (reference === null ? "…" : reference + " REAL di riferimento su " + data.thresholds.group +
        " necessarie") + "; SLOP ancora possibili nel gruppo: " + current.room + "</p>" : "") +
      '<label>Immagini da generare<select data-slop-count>' + Array.from({ length: data.thresholds.max_slots }, (_, i) => i + 1)
        .map(n => '<option value="' + n + '"' + (n === count ? " selected" : "") + ">" + n + "</option>").join("") + "</select></label>" +
      (current && count > current.room ? '<p class="hint">Più SLOP di quante ne mancano al gruppo: il gruppo supererà le sue REAL.</p>' : "") +
      '<div class="rw-actions rw-bottom"><button type="button" class="primary" data-slop="slots"' +
      (closed || !current || (reference ?? 0) < data.thresholds.group ? " disabled" : "") + ">Prepara gli slot</button></div></section>";
  };
  const second = () => {
    const vocabulary = (c: Category) => (data?.tags || []).filter(t => t.category === c).map(t => t.label).sort();
    const covered = new Set(theme.map(categoryOf));
    return '<p class="hint">Gruppo: <strong>' + escape(group) + "</strong>" + (theme.length ? ", tema: <strong>" + theme.map(escape).join(", ") + "</strong>" : "") +
      ". Ogni riga è un'immagine: al massimo un tag per categoria, estratto dalle REAL del gruppo. Puoi cambiare ogni casella o ripescare; " +
      "la REAL campione del trattamento della copia resta quella estratta.</p>" + legend() +
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
  const groupPills = () => { const [genre, time] = group.split("/"); return genre && time ? pill(genre, "genre", "rw-pill") + pill(time, "time", "rw-pill") : ""; };
  const slotLine = (slot: Slot | undefined) => groupPills() + theme.concat(SLOT_ORDER.map(c => slot?.[c] || "").filter(Boolean))
    .map(t => pill(t, categoryOf(t), "rw-pill")).join("");
  const third = () => {
    const prompts = batch?.prompts || [];
    return '<p class="hint">Prompt in inglese, uno per immagine. Puoi modificarli: si salvano uscendo dal campo. «Riscrivi» chiede al modello ' +
      "un nuovo prompt per quello slot (a pagamento).</p>" +
      (batch?.prompts_status === "uncertain" || batch?.prompts_status === "failed" ? '<p class="slop-closed">' + escape(batch.prompts_error) + "</p>" : "") +
      '<ol class="slop-prompts">' + slots.map((slot, i) => '<li><div class="rw-pills">' + slotLine(slot) + "</div>" +
        '<textarea data-prompt="' + i + '" rows="4" maxlength="4000" aria-label="Prompt dell\'immagine ' + (i + 1) + '">' + escape(prompts[i]?.prompt || "") + "</textarea>" +
        (prompts[i] ? '<label class="slop-format">Formato<select data-prompt-format="' + i + '">' + (prompts[i].format ? "" : '<option value="">3:4 (prompt senza formato)</option>') +
          FORMATS.map(f => '<option value="' + f + '"' + (prompts[i].format === f ? " selected" : "") + ">" + FORMAT_LABELS[f] + "</option>").join("") + "</select></label>" : "") +
        '<button type="button" data-slop="rewrite" data-slot="' + i + '">Riscrivi</button></li>').join("") + "</ol>" +
      '<div class="slop-generate library-inline"><span>Modello di immagini: <strong>' + escape(models?.image_model || "") + "</strong></span>" +
      "<span>Qualità: <strong>" + escape(quality) + "</strong> (si cambia nelle Impostazioni)</span></div>" +
      '<div class="rw-actions rw-bottom"><button type="button" data-slop="to-slots">Indietro: slot</button>' +
      '<button type="button" class="primary" data-slop="images"' + (prompts.length === slots.length && prompts.every(p => p.prompt) ? "" : " disabled") +
      ">Genera immagini e analizza</button></div>";
  };
  const fourth = () => '<p class="hint">Per ogni immagine: generazione, trattamento e copia di gioco WebP nel browser, analisi dei tag.</p>' +
    '<p class="slop-progress" role="status">' + escape(progress) + "</p>" +
    '<div class="rw-actions rw-bottom"><button type="button" data-slop="to-review"' + (busy ? " disabled" : "") + ">Vai alla revisione</button></div>";
  /** Expected tags (group, theme and slot) the analysis did not find on the image, and those that make it miss its aim: the theme,
   * the group, Color and Medium. */
  const missing = (image: Image) => {
    const slot = image.generation?.slot;
    if (!slot) return { lost: [], serious: [] };
    const groupTags = (slot.group || "").split("/").filter(Boolean);
    const lost = groupTags.concat(slot.theme, SLOT_ORDER.map(c => slot.tags?.[c] || "").filter(Boolean)).filter(t => !image.tags.includes(t));
    const key = new Set([...groupTags, ...slot.theme, ...VISUAL.map(c => slot.tags?.[c] || "").filter(Boolean)]);
    return { lost, serious: lost.filter(t => key.has(t)) };
  };
  const fifth = () => {
    const images = batch?.images || [];
    return '<p class="hint">I tag finali sono quelli dell\'analisi. «Previsti ma non rilevati» confronta lo slot con ciò che l\'analisi ha visto; ' +
      "se manca un tag del gruppo o del tema, o il Colore o il Supporto non sono quelli dello slot, l'immagine ha mancato l'obiettivo. Approvare non pubblica: la pubblicazione resta un passo separato.</p>" +
      (images.length ? '<div class="rw-preview-grid">' + images.map(image => {
        const { lost, serious: themeLost } = missing(image), index = image.generation?.slot.index ?? 0;
        return '<article class="rw-final slop-review" data-image="' + escape(image.id) + '"><div class="game-media-surface rw-final-image" data-long-press data-slop-preview="' +
          escape(image.id) + '"><img data-game-media draggable="false" src="' +
          escape(image.file) + '" alt="Immagine ' + (index + 1) + '"></div>' +
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
    if (!group) return;
    try { reference = (await call<{ reference: number }>("reference", { group, theme })).reference; } catch (error) { notice = errorText(error); }
  };
  const loadBatch = async () => { if (batchId) batch = await call<Batch>("batches/" + encodeURIComponent(batchId)); };
  const refresh = async () => {
    try {
      data = await call<Spread>("spread"); await refreshReference();
      models = await call<Models>("/models", undefined, "GET", LIBRARY);
      quality = models.image_quality;
      await loadBatch();
    } catch (error) { notice = errorText(error); }
    render();
  };
  /** Copy in the browser, then the paid analysis (already confirmed with the generation). */
  const finish = async (imageId: string) => {
    await prepareItemCopy(await call<TreatableItem>("/" + encodeURIComponent(imageId), undefined, "GET", LIBRARY));
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
  const draw = async (n: number, existing: Slot[]) => (await call<Slots>("slots", { group, theme, count: n, existing })).slots;

  // Press and hold an image of the review: prompt, starting tags and tags of the analysis, large.
  onLongPress(root, "[data-slop-preview]", element => {
    const image = batch?.images.find(i => i.id === element.dataset.slopPreview);
    if (!image) return;
    const slot = image.generation?.slot, theme = slot?.theme || [], [genre, time] = (slot?.group || "").split("/");
    const start = slot ? (genre && time ? pill(genre, "genre", "rw-pill", " <small>gruppo</small>") + pill(time, "time", "rw-pill", " <small>gruppo</small>") : "") +
      theme.map(t => pill(t, categoryOf(t), "rw-pill", " <small>tema</small>")).join("") +
      SLOT_ORDER.filter(c => slot.tags?.[c] && !theme.includes(slot.tags[c]!)).map(c => pill(slot.tags[c]!, c, "rw-pill")).join("") : "";
    const index = slot?.index ?? 0;
    openPreview({ src: image.file, alt: "Immagine " + (index + 1), title: "Immagine " + (index + 1),
      extra: (image.prompt ? '<p><span class="image-preview-label">Prompt</span><br><q lang="en">' + escape(image.prompt) + "</q></p>" : "") +
        (start ? '<p class="image-preview-label">Tag di partenza</p><div class="image-preview-tags">' + start + "</div>" : "") +
        '<p class="image-preview-label">Tag dell\'analisi</p><div class="image-preview-tags">' +
        (sortByCategory(image.tags, image.categories).map(t => pill(t, categoryOfImage(image.categories, t), "rw-pill")).join("") || '<span class="hint">Nessuno.</span>') + "</div>" });
  });
  root.addEventListener("click", async event => {
    const target = event.target as HTMLElement;
    const pick = target.closest<HTMLButtonElement>("[data-slop-group]");
    if (pick && !busy) { group = pick.dataset.slopGroup!; theme = []; notice = ""; persist(); await refreshReference(); render(); return; }
    const remove = target.closest<HTMLButtonElement>("[data-slop-remove]");
    if (remove) { theme = theme.filter(t => t !== remove.dataset.slopRemove); persist(); await refreshReference(); render(); return; }
    const button = target.closest<HTMLButtonElement>("button[data-slop]");
    if (!button || busy) return;
    const action = button.dataset.slop!;
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
        batch = batchId ? await call<Batch>("batches/" + encodeURIComponent(batchId), { slots }, "PUT") : await call<Batch>("batches", { group, theme, slots });
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
    if (target.matches("[data-slop-count]")) { count = Number(target.value); persist(); render(); }
    else if (target.matches("[data-prompt]") && batch) {
      // Owner's edit of a prompt: free, saved at once.
      const texts = slots.map((_, i) => root.querySelector<HTMLTextAreaElement>('[data-prompt="' + i + '"]')?.value ?? batch!.prompts[i]?.prompt ?? "");
      void call<Batch>("batches/" + encodeURIComponent(batchId), { prompts: texts }, "PUT")
        .then(updated => { batch = updated; notice = "Prompt salvato."; const m = root.querySelector(".slop-message"); if (m) m.textContent = notice; })
        .catch(error => { notice = errorText(error); render(); });
    }
    else if (target.matches("[data-prompt-format]") && batch) {
      // Owner's choice of a format: free, saved at once.
      const formats = batch.prompts.map((p, i) => i === Number(target.dataset.promptFormat) ? target.value : p.format || "3:4");
      if (!formats.every(isFormat)) return;
      void call<Batch>("batches/" + encodeURIComponent(batchId), { formats }, "PUT")
        .then(updated => { batch = updated; notice = "Formato salvato."; const m = root.querySelector(".slop-message"); if (m) m.textContent = notice; })
        .catch(error => { notice = errorText(error); render(); });
    }
    else if (target.matches("[data-slot]")) {
      const i = Number(target.dataset.slot), c = target.dataset.slotCat as Category;
      slots[i] = { ...slots[i] };
      if (target.value) slots[i][c] = target.value; else delete slots[i][c];
      persist();
    }
  });
  root.addEventListener("keydown", event => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-slop-theme]") && event.key === "Enter") { event.preventDefault(); void addTheme(target.value); }
  });
  render();
  await refresh();
  return { refresh };
}
