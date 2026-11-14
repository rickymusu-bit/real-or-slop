/** SLOP studio (spec `generazione-slop`, sections 3–6): choice of the REAL to twin, prompts with their format, images with
 * their treated copy and analysis, review with what the twin was meant to keep of its REAL and press-and-hold preview. Every paid
 * call is confirmed. */
import "./slop-studio.css";
import { prepareItemCopy, type TreatableItem } from "./game-copy";
import { FORMAT_LABELS, FORMATS, isFormat, type Format } from "../shared/game-copy";
import { markGameMedia } from "./media-mark";
import { onLongPress, openPreview } from "./image-preview";
import { escape } from "../shared/html";
import { VISUAL, type Category } from "../shared/tag-categories";
import type { TwinItem } from "../shared/twins";
import { categoryOf as categoryOfImage, pill, sortByCategory, startPills, startTagList, type StartSlot } from "./tag-ui";

interface Waiting { id: string; title: string; tags: { label: string; category: Category }[]; measured: boolean; file: string }
interface State { thresholds: { section: number; max_batch: number }; real_total: number; slop_total: number; twinned: number; waiting: Waiting[] }
interface Image { id: string; status: string; revision: number; tags: string[]; categories: Record<string, string>; file: string;
  copy: unknown; prompt: string; analysis: { status: string; error: string }; generation: { batch: string; slot: StartSlot | null } | null }
interface Batch { id: string; items: TwinItem[]; prompts: { prompt: string; used: string[]; format?: Format }[]; prompts_status: string; prompts_error: string; images: Image[] }
interface Models { text_model: string; image_model: string; image_quality: string }
const API = "/api/admin/library/slop/", LIBRARY = "/api/admin/library", DRAFT = "ros-slop-studio-v3";
/** What a twin must keep of its REAL: decade, genre, colour and medium (missing: the image missed its aim), event and place. */
const KEPT: readonly Category[] = ["time", "genre", "color", "medium", "event", "place"], SERIOUS: readonly Category[] = ["time", ...VISUAL];

async function call<T>(path: string, body?: unknown, method?: string, base = API): Promise<T> {
  const response = await fetch(base + path, { credentials: "same-origin", method: method || (body === undefined ? "GET" : "POST"),
    headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Error(data.error || "Richiesta non riuscita");
  return data;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function mountSlopStudio(root: HTMLElement): Promise<{ refresh: () => Promise<void> }> {
  let data: State | null = null, page = 1, notice = "", busy = false;
  let batch: Batch | null = null, batchId = "", models: Models | null = null, quality = "medium", progress = "";
  let chosen: string[] = [];
  try {
    const draft = JSON.parse(sessionStorage.getItem(DRAFT) || "{}") as { chosen?: string[]; page?: number; batch?: string };
    batchId = typeof draft.batch === "string" ? draft.batch : "";
    chosen = Array.isArray(draft.chosen) ? draft.chosen.filter(t => typeof t === "string") : [];
    page = typeof draft.page === "number" && draft.page >= 2 && draft.page <= 4 && batchId ? draft.page : 1;
  } catch { /* no draft */ }
  const persist = () => { try { sessionStorage.setItem(DRAFT, JSON.stringify({ chosen, page, batch: batchId })); } catch { /* private browsing */ } };
  const count = () => batch?.items.length || 0;

  const steps = () => '<ol class="rw-steps slop-steps" aria-label="Fasi della generazione">' +
    ["REAL", "Prompt", "Immagini", "Revisione"].map((label, i) =>
      "<li " + (page === i + 1 ? 'aria-current="step"' : "") + "><span>" + (i + 1) + "</span>" + label + "</li>").join("") + "</ol>";

  const first = () => {
    if (!data) return '<p class="hint">Caricamento…</p>';
    const closed = data.real_total < data.thresholds.section, max = data.thresholds.max_batch;
    chosen = chosen.filter(id => data!.waiting.some(w => w.id === id));
    return '<p class="slop-totals">Ogni SLOP è la gemella di una REAL: un\'altra fotografia dello stesso evento, scritta dai tag e dalla descrizione ' +
      "di quella REAL. REAL approvate o pubblicate: <strong>" + data.real_total + "</strong>; con una gemella approvata o pubblicata: <strong>" +
      data.twinned + "</strong>; in attesa di una gemella: <strong>" + data.waiting.length + "</strong>.</p>" +
      (closed ? '<p class="slop-closed">REAL approvate o pubblicate: ' + data.real_total + " su " + data.thresholds.section +
        ". La generazione si apre da " + data.thresholds.section + " REAL.</p>" : "") +
      (data.waiting.length ? '<p class="hint">Scegli fino a ' + max + " REAL. La pressione prolungata apre l'anteprima.</p>" +
        '<ul class="slop-waiting" aria-label="REAL in attesa di una gemella">' + data.waiting.map(w =>
          '<li class="' + (chosen.includes(w.id) ? "is-chosen" : "") + '"><label><input type="checkbox" data-slop-pick="' + escape(w.id) + '"' +
          (chosen.includes(w.id) ? " checked" : "") + (!chosen.includes(w.id) && chosen.length >= max ? " disabled" : "") + ">" +
          '<img src="' + escape(w.file) + '" alt="" loading="lazy" draggable="false" data-long-press data-slop-waiting="' + escape(w.id) + '">' +
          '<span class="slop-waiting-title">' + escape(w.title) + "</span></label></li>").join("") + "</ul>"
        : '<p class="hint">Ogni REAL approvata o pubblicata ha già la sua gemella.</p>') +
      '<div class="rw-actions rw-bottom"><button type="button" data-slop="first"' + (closed || !data.waiting.length ? " disabled" : "") +
      ">Scegli le prime " + Math.min(max, data.waiting.length) + '</button><button type="button" class="primary" data-slop="prompts"' +
      (closed || !chosen.length ? " disabled" : "") + ">Genera " + (chosen.length || "") + " prompt</button></div>" +
      '<p class="hint">«Genera prompt» è una chiamata a pagamento a ' + escape(models?.text_model || "modello di testo") + ", con conferma.</p>";
  };
  const second = () => {
    const prompts = batch?.prompts || [], items = batch?.items || [];
    return '<p class="hint">Prompt in inglese, uno per immagine, sotto i tag della sua REAL. Puoi modificarli: si salvano uscendo dal campo. ' +
      "«Riscrivi» chiede al modello un nuovo prompt per quella REAL (a pagamento).</p>" +
      (batch?.prompts_status === "uncertain" || batch?.prompts_status === "failed" ? '<p class="slop-closed">' + escape(batch.prompts_error) + "</p>" : "") +
      '<ol class="slop-prompts">' + items.map((item, i) => "<li><p><strong>" + escape(item.title) + '</strong></p><div class="rw-pills">' + startPills(item) + "</div>" +
        '<textarea data-prompt="' + i + '" rows="6" maxlength="4000" aria-label="Prompt dell\'immagine ' + (i + 1) + '">' + escape(prompts[i]?.prompt || "") + "</textarea>" +
        (prompts[i] ? '<p class="hint" data-prompt-length="' + i + '">' + prompts[i].prompt.length + " caratteri</p>" +
          '<label class="slop-format">Formato<select data-prompt-format="' + i + '">' + (prompts[i].format ? "" : '<option value="">3:4 (prompt senza formato)</option>') +
          FORMATS.map(f => '<option value="' + f + '"' + (prompts[i].format === f ? " selected" : "") + ">" + FORMAT_LABELS[f] + "</option>").join("") + "</select></label>" : "") +
        '<button type="button" data-slop="rewrite" data-slot="' + i + '">Riscrivi</button></li>').join("") + "</ol>" +
      '<div class="slop-generate library-inline"><span>Modello di immagini: <strong>' + escape(models?.image_model || "") + "</strong></span>" +
      "<span>Qualità: <strong>" + escape(quality) + "</strong> (si cambia nelle Impostazioni)</span></div>" +
      '<div class="rw-actions rw-bottom"><button type="button" data-slop="new-batch">Abbandona il batch</button>' +
      '<button type="button" class="primary" data-slop="images"' + (items.length && prompts.length === items.length && prompts.every(p => p.prompt) ? "" : " disabled") +
      ">Genera immagini e analizza</button></div>";
  };
  const third = () => '<p class="hint">Per ogni immagine: generazione, trattamento e copia di gioco WebP nel browser, analisi dei tag.</p>' +
    '<p class="slop-progress" role="status">' + escape(progress) + "</p>" +
    '<div class="rw-actions rw-bottom"><button type="button" data-slop="to-review"' + (busy ? " disabled" : "") + ">Vai alla revisione</button></div>";
  /** Tags of the source REAL the twin was meant to keep and the analysis did not find; the serious ones make it miss its aim. */
  const missing = (image: Image) => {
    const kept = startTagList(image.generation?.slot).filter(t => KEPT.includes(t.category) || t.note), lost = kept.filter(t => !image.tags.includes(t.label));
    return { lost: lost.map(t => t.label), serious: lost.filter(t => SERIOUS.includes(t.category) || t.note).map(t => t.label) };
  };
  const fourth = () => {
    const images = batch?.images || [];
    return '<p class="hint">I tag finali sono quelli dell\'analisi. «Previsti ma non rilevati» confronta decennio, genere, colore, supporto, evento e luogo ' +
      "della REAL di origine con ciò che l'analisi ha visto: se mancano decennio, genere, colore o supporto la gemella ha mancato l'obiettivo. " +
      "Approvare non pubblica: la pubblicazione resta un passo separato.</p>" +
      (images.length ? '<div class="rw-preview-grid">' + images.map(image => {
        const { lost, serious } = missing(image), index = image.generation?.slot?.index ?? 0;
        return '<article class="rw-final slop-review" data-image="' + escape(image.id) + '"><div class="game-media-surface rw-final-image" data-long-press data-slop-preview="' +
          escape(image.id) + '"><img data-game-media draggable="false" src="' +
          escape(image.file) + '" alt="Immagine ' + (index + 1) + '"></div>' +
          '<div class="rw-pills">' + sortByCategory(image.tags, image.categories).map(t => pill(t, categoryOfImage(image.categories, t), "rw-pill")).join("") + "</div>" +
          (lost.length ? '<p class="' + (serious.length ? "slop-closed" : "hint") + '">Previsti ma non rilevati: ' + lost.map(escape).join(", ") + "</p>" : '<p class="hint">Tutti i tag previsti sono stati rilevati.</p>') +
          '<p class="hint">Immagine ' + (index + 1) + " · " + escape(image.status) + (image.analysis.status !== "done" ? " · analisi: " + escape(image.analysis.status) : "") + "</p>" +
          '<div class="rw-actions">' +
          (image.status === "new" && image.copy && image.analysis.status !== "done" ? '<button type="button" data-slop="analyze" data-id="' + escape(image.id) + '">Analizza</button>' : "") +
          (image.status === "new" ? '<button type="button" class="primary" data-slop="approve" data-id="' + escape(image.id) + '"' + (image.tags.length && image.copy ? "" : " disabled") + ">Approva</button>" : "") +
          (image.status === "approved" ? '<button type="button" class="primary" data-slop="publish" data-id="' + escape(image.id) + '">Pubblica</button>' : "") +
          (image.status === "new" || image.status === "approved" ? '<button type="button" data-slop="trash" data-id="' + escape(image.id) + '">Cestino</button>' : "") +
          (count() ? '<button type="button" data-slop="regenerate" data-slot="' + index + '">Rigenera</button>' : "") + "</div></article>";
      }).join("") + "</div>" : "<p>Nessuna immagine generata in questo batch.</p>") +
      '<div class="rw-actions rw-bottom"><button type="button" data-slop="to-prompts">Indietro: prompt</button>' +
      '<button type="button" data-slop="new-batch">Nuovo batch</button></div>';
  };
  const render = () => {
    root.innerHTML = '<div class="rw slop"><h2>Generazione SLOP</h2>' + steps() +
      '<p class="slop-message" role="status" aria-live="polite">' + escape(notice) + "</p>" +
      (busy ? '<p class="rw-busy" role="status">Operazione in corso…</p>' : "") +
      [first, second, third, fourth][page - 1]() + "</div>";
    if (page === 4) markGameMedia(root);
  };
  const loadBatch = async () => { if (batchId) batch = await call<Batch>("batches/" + encodeURIComponent(batchId)); };
  const refresh = async () => {
    try {
      data = await call<State>("state");
      models = await call<Models>("/models", undefined, "GET", LIBRARY);
      quality = models.image_quality;
      await loadBatch();
    } catch (error) { notice = errorText(error); }
    render();
  };
  /** Treated copy in the browser, then the paid analysis (already confirmed with the generation). */
  const finish = async (imageId: string) => {
    await prepareItemCopy(await call<TreatableItem>("/" + encodeURIComponent(imageId), undefined, "GET", LIBRARY));
    await call("/" + encodeURIComponent(imageId) + "/analyze", { confirm: true }, "POST", LIBRARY);
  };
  /** Generates, prepares and analyses the given images, one by one; an OpenAI account problem stops the run. */
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

  // Press and hold: a waiting REAL large, or an image of the review with its prompt, starting tags and tags of the analysis.
  onLongPress(root, "[data-slop-waiting]", element => {
    const real = data?.waiting.find(w => w.id === element.dataset.slopWaiting);
    if (real) openPreview({ src: real.file, alt: real.title, title: real.title,
      extra: '<div class="image-preview-tags">' + real.tags.map(t => pill(t.label, t.category, "rw-pill")).join("") + "</div>" });
  });
  onLongPress(root, "[data-slop-preview]", element => {
    const image = batch?.images.find(i => i.id === element.dataset.slopPreview);
    if (!image) return;
    const start = startPills(image.generation?.slot), index = image.generation?.slot?.index ?? 0;
    openPreview({ src: image.file, alt: "Immagine " + (index + 1), title: "Immagine " + (index + 1),
      extra: (image.prompt ? '<p><span class="image-preview-label">Prompt</span><br><q lang="en">' + escape(image.prompt) + "</q></p>" : "") +
        (start ? '<p class="image-preview-label">Tag di partenza</p><div class="image-preview-tags" data-start-tags>' + start + "</div>" : "") +
        '<p class="image-preview-label">Tag dell\'analisi</p><div class="image-preview-tags">' +
        (sortByCategory(image.tags, image.categories).map(t => pill(t, categoryOfImage(image.categories, t), "rw-pill")).join("") || '<span class="hint">Nessuno.</span>') + "</div>" });
  });
  root.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-slop]");
    if (!button || busy) return;
    const action = button.dataset.slop!;
    if (action === "first" && data) { chosen = data.waiting.slice(0, data.thresholds.max_batch).map(w => w.id); persist(); render(); return; }
    if (action === "to-prompts") { page = 2; persist(); render(); return; }
    if (action === "to-review") { page = 4; persist(); await loadBatch(); render(); return; }
    if (action === "new-batch") { batchId = ""; batch = null; chosen = []; page = 1; notice = ""; persist(); await refresh(); return; }
    const slot = Number(button.dataset.slot);
    const paid: Record<string, () => string> = {
      prompts: () => "Scrivere " + chosen.length + " prompt con " + (models?.text_model || "il modello di testo") + "? È una chiamata a pagamento.",
      rewrite: () => "Riscrivere il prompt dell'immagine " + (slot + 1) + " con " + (models?.text_model || "il modello di testo") + "? È una chiamata a pagamento.",
      images: () => "Generare " + count() + " immagini con " + (models?.image_model || "il modello di immagini") + " in qualità " + quality +
        " e analizzarle con " + (models?.text_model || "il modello di testo") + "? Sono " + count() * 2 + " chiamate a pagamento.",
      regenerate: () => "Generare un'altra immagine per la REAL " + (slot + 1) + " con " + (models?.image_model || "il modello di immagini") +
        " in qualità " + quality + " e analizzarla? Sono 2 chiamate a pagamento; l'immagine attuale resta, puoi spostarla nel cestino.",
      analyze: () => "Analizzare questa immagine con " + (models?.text_model || "il modello di testo") + "? È una chiamata a pagamento.",
    };
    if (paid[action] && !window.confirm(paid[action]())) return;
    busy = true; render();
    try {
      if (action === "prompts") {
        batch = await call<Batch>("batches", { sources: chosen });
        batchId = batch.id; page = 2; persist();
        batch = await call<Batch>("batches/" + encodeURIComponent(batchId) + "/prompts", { confirm: true });
        notice = "Prompt scritti.";
      } else if (action === "rewrite") {
        batch = await call<Batch>("batches/" + encodeURIComponent(batchId) + "/prompts", { confirm: true, index: slot });
        notice = "Prompt dell'immagine " + (slot + 1) + " riscritto.";
      } else if (action === "images") {
        page = 3; persist(); await produce((batch?.items || []).map((_, i) => i)); page = 4;
      } else if (action === "regenerate") {
        await produce([slot]);
      } else if (action === "analyze") {
        await call("/" + encodeURIComponent(button.dataset.id!) + "/analyze", { confirm: true }, "POST", LIBRARY); await loadBatch(); notice = "Analisi completata.";
      } else if (action === "approve" || action === "publish" || action === "trash") {
        await call("/" + encodeURIComponent(button.dataset.id!) + "/" + action, {}, "POST", LIBRARY); await loadBatch();
        notice = { approve: "Immagine approvata.", publish: "Immagine pubblicata.", trash: "Immagine nel cestino." }[action];
      }
      persist();
    } catch (error) { notice = errorText(error); }
    finally { busy = false; render(); }
  });
  root.addEventListener("change", event => {
    const target = event.target as HTMLSelectElement & HTMLInputElement;
    if (target.matches("[data-slop-pick]")) {
      const id = target.dataset.slopPick!;
      chosen = target.checked ? [...new Set([...chosen, id])].slice(0, data?.thresholds.max_batch || 10) : chosen.filter(c => c !== id);
      persist(); render();
    }
    else if (target.matches("[data-prompt]") && batch) {
      // Owner's edit of a prompt: free, saved at once.
      const texts = batch.items.map((_, i) => root.querySelector<HTMLTextAreaElement>('[data-prompt="' + i + '"]')?.value ?? batch!.prompts[i]?.prompt ?? "");
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
  });
  render();
  await refresh();
  return { refresh };
}
