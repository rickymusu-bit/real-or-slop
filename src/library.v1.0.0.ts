/** Admin image library, a file-system-like view (docs/libreria-immagini.v1.2.0.md). v1.1.0, 2026-11-09T20:30:00Z: vocabulary, aliases and analysis (phase 2).
 * Add files (device or Commons), edit in place, multi-select, trash without confirmations, delete for good. */
import "./library.v1.0.0.css";
import { content, escape } from "./main";
import { prepareLibraryCopy } from "./game-copy.v1.0.0";
import { markGameMedia } from "./media-mark.v1.0.0";
import { checkTag } from "../shared/tags.v2.0.0";

type Status = "new" | "approved" | "published" | "trash";
interface Item {
  id: string; origin: "REAL" | "SLOP"; status: Status; trashed_from: Status | null; title: string; description: string;
  caption: string; explanation: string; source_url: string; author: string; license_name: string; license_url: string;
  prompt: string; model: string; width: number; height: number; copy: { width: number; height: number; bytes: number } | null;
  rights_confirmed: boolean; revision: number; tags: string[]; file: string; updated_at: string;
  analysis: { status: "none" | "running" | "done" | "uncertain" | "failed"; error: string; at: string | null };
}
interface Analysis { enabled: boolean; reason: string; model: string; call_usd: number; total_usd: number; spent_usd: number; remaining_usd: number }
interface Tag { label: string; images: number; aliases: string[] }
interface CommonsHit { title: string; page_url: string; thumb_url: string; width: number; height: number }
const API = "/api/admin/library";
const STATUS_LABEL: Record<string, string> = { library: "Tutte", new: "Nuove", approved: "Approvate", published: "Pubblicate", trash: "Cestino" };
const STATE_LABEL: Record<Status, string> = { new: "nuova", approved: "approvata", published: "pubblicata", trash: "nel cestino" };
const FIELDS: [keyof Item, string, number, boolean][] = [
  ["title", "Titolo", 200, false], ["description", "Descrizione", 1000, true], ["caption", "Didascalia (con l'immagine, nel round)", 160, true],
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
  const filter = { status: "library", origin: "all", tag: "", q: "" };
  let analysis: Analysis | null = null;
  content().innerHTML = `<section class="library page" aria-labelledby="library-title">
    <div class="library-head"><h1 id="library-title">Libreria</h1><p id="library-counts" aria-live="polite"></p><p id="library-analysis" class="hint"></p></div>
    <div class="library-toolbar">
      <nav class="library-views" aria-label="Viste">${Object.entries(STATUS_LABEL).map(([key, label]) =>
        `<button type="button" data-view="${key}" aria-pressed="${key === "library"}">${label}</button>`).join("")}</nav>
      <label>Origine<select id="library-origin"><option value="all">REAL e SLOP</option><option value="REAL">REAL</option><option value="SLOP">SLOP</option></select></label>
      <label>Tag<input id="library-tag" list="library-tag-list" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="es. riot"></label>
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
    <div id="library-selection" class="library-selection" hidden></div>
    <p id="library-message" role="status" aria-live="polite"></p>
    <ul id="library-grid" class="library-grid" aria-label="Immagini"></ul>
    <details id="library-vocabulary" class="library-vocabulary"><summary>Vocabolario dei tag</summary>
      <p class="hint">Un tag sparisce con la sua ultima immagine. «Unisci» sposta le immagini sul tag che resta e trasforma l'altro in alias: chi scrive l'alias ottiene il tag.</p>
      <form id="library-merge" class="library-inline"><label>Unisci<input name="from" list="library-tag-list" required autocapitalize="none"></label><label>in<input name="into" list="library-tag-list" required autocapitalize="none"></label><button>Unisci</button></form>
      <form id="library-alias" class="library-inline"><label>Nuovo alias<input name="alias" required autocapitalize="none"></label><label>del tag<input name="into" list="library-tag-list" required autocapitalize="none"></label><button>Aggiungi alias</button></form>
      <ul id="library-vocabulary-list"></ul></details>
    <dialog id="library-detail" class="library-detail" aria-labelledby="library-detail-title"></dialog>
  </section>`;
  const page = content().querySelector<HTMLElement>(".library")!;
  const $ = <T extends HTMLElement>(selector: string) => page.querySelector<T>(selector)!;
  const message = (text: string) => { $("#library-message").textContent = text; };
  const progress = (text: string) => { $("#library-progress").textContent = text; };

  const refreshTags = async () => {
    const { tags } = await call<{ tags: Tag[] }>("/tags");
    $("#library-tag-list").innerHTML = tags.map(t => `<option value="${escape(t.label)}">${escape(t.label)} (${t.images})</option>`).join("");
    $("#library-vocabulary summary").textContent = `Vocabolario dei tag (${tags.length})`;
    $("#library-vocabulary-list").innerHTML = tags.map(t => `<li><strong>${escape(t.label)}</strong> · ${t.images} ${t.images === 1 ? "immagine" : "immagini"}${t.aliases.length
      ? " · alias: " + t.aliases.map(a => `${escape(a)} <button type="button" data-alias-remove="${escape(a)}" aria-label="Togli l'alias ${escape(a)}">×</button>`).join(" ") : ""}</li>`).join("") || "<li>Nessun tag.</li>";
  };
  const refreshAnalysis = async () => {
    analysis = await call<Analysis>("/analysis");
    $("#library-analysis").textContent = analysis.enabled
      ? `Analisi IA (${analysis.model}): ${analysis.call_usd} $ per immagine · spesi ${analysis.spent_usd} $ su ${analysis.total_usd} $, restano ${analysis.remaining_usd} $ (stime prudenziali).`
      : `Analisi IA non disponibile: ${analysis.reason}.`;
  };
  /** Analyses images one by one after an explicit confirmation of the total estimate. */
  const analyzeMany = async (ids: string[]) => {
    if (!analysis?.enabled || !ids.length) return;
    const estimate = Math.round(ids.length * analysis.call_usd * 1e4) / 1e4;
    if (!window.confirm(`Analizzare ${ids.length} ${ids.length === 1 ? "immagine" : "immagini"} con ${analysis.model}? Costo stimato ${estimate} $ (restano ${analysis.remaining_usd} $).`)) return;
    let done = 0; const errors: string[] = [];
    for (const [index, imageId] of ids.entries()) {
      progress(`Analisi ${index + 1} di ${ids.length}`);
      try { await call(`/${encodeURIComponent(imageId)}/analyze`, { method: "POST", body: JSON.stringify({ confirm_usd: analysis.call_usd }) }); done++; }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); if (/Tetto di spesa/.test(String(error))) break; }
    }
    progress("");
    message(`${done} di ${ids.length} analizzate.` + (errors.length ? " " + [...new Set(errors)].join(" · ") : ""));
    await Promise.all([load(), refreshTags(), refreshAnalysis()]);
  };
  const load = async () => {
    const params = new URLSearchParams(filter);
    const data = await call<{ items: Item[]; counts: { status: string; origin: string; n: number }[] }>("?" + params);
    items = data.items;
    selected = new Set([...selected].filter(id => items.some(item => item.id === id)));
    const count = (status: string) => data.counts.filter(c => c.status === status).reduce((n, c) => n + c.n, 0);
    $("#library-counts").textContent = `${count("new")} nuove · ${count("approved")} approvate · ${count("published")} pubblicate · ${count("trash")} nel cestino`;
    $("#library-empty-trash").hidden = filter.status !== "trash" || !count("trash");
    render();
  };
  const card = (item: Item) => `<li class="library-card${selected.has(item.id) ? " is-selected" : ""}" data-id="${escape(item.id)}">
    <label class="library-check"><input type="checkbox" data-select="${escape(item.id)}" ${selected.has(item.id) ? "checked" : ""} aria-label="Seleziona ${escape(item.title)}"></label>
    <button type="button" class="library-open" data-open="${escape(item.id)}" aria-label="Apri ${escape(item.title)}">
      <img src="${escape(item.file)}" alt="" loading="lazy"><span class="library-badges"><span class="badge badge-${item.origin.toLowerCase()}">${item.origin}</span>
      <span class="badge badge-status">${STATE_LABEL[item.status]}</span>${item.copy ? "" : '<span class="badge badge-warn">senza copia</span>'}</span>
      <span class="library-card-title">${escape(item.title)}</span><span class="library-card-tags">${item.tags.length ? item.tags.map(escape).join(" · ") : "nessun tag"}</span>
    </button></li>`;
  const selectionBar = () => {
    const bar = $("#library-selection"), n = selected.size;
    bar.hidden = !n;
    if (!n) return;
    const trash = filter.status === "trash";
    bar.innerHTML = `<strong>${n} selezionate</strong>` + (trash
      ? '<button data-bulk="restore">Ripristina</button><button data-bulk="delete" class="danger">Elimina definitivamente</button>'
      : '<button data-bulk="trash">Sposta nel cestino</button><label><input type="checkbox" id="library-bulk-rights"> Diritti delle REAL verificati</label><button data-bulk="analyze">Analizza con IA</button><button data-bulk="approve">Approva</button><button data-bulk="publish">Pubblica</button><button data-bulk="withdraw">Ritira dal gioco</button>' +
        '<label>Tag<input id="library-bulk-tag" autocomplete="off" autocapitalize="none" spellcheck="false"></label><button data-bulk="tag-add">Aggiungi tag</button><button data-bulk="tag-remove">Togli tag</button>') +
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
  const save = async (item: Item, change: Partial<Record<keyof Item, unknown>>) => {
    const updated = await call<Item>("/" + encodeURIComponent(item.id), { method: "PATCH", body: JSON.stringify({ revision: item.revision, ...change }) });
    items = items.map(i => i.id === updated.id ? updated : i);
    return updated;
  };
  const analysisLine = (item: Item) => ({ none: "Non ancora analizzata.", running: "Analisi in corso…",
    done: "Analizzata: tag e didascalia proposti dal modello, da rivedere prima di approvare.",
    uncertain: "Esito incerto: " + item.analysis.error, failed: "Analisi non riuscita: " + item.analysis.error })[item.analysis.status];
  const showDetail = (item: Item) => {
    open = item;
    const editable = item.status === "new" || item.status === "approved";
    const fields = FIELDS.filter(([key]) => item.origin === "SLOP" || (key !== "prompt" && key !== "model"));
    detail.innerHTML = `<form method="dialog" class="library-detail-close"><button aria-label="Chiudi">×</button></form>
      <h2 id="library-detail-title">${escape(item.title)}</h2>
      <p class="hint">${item.origin} · ${STATE_LABEL[item.status]} · originale ${item.width}×${item.height}${item.copy ? ` · copia di gioco WebP ${item.copy.width}×${item.copy.height}, ${kb(item.copy.bytes)}: è ciò che vedranno i giocatori` : " · copia di gioco non pronta"}</p>
      <div class="library-detail-body"><div class="game-media-surface library-preview"><img data-game-media draggable="false" src="${escape(item.file)}" alt="${escape(item.title)}"></div>
      <div class="library-fields">${!item.copy && item.status === "new" ? '<p><button type="button" id="library-copy">Prepara la copia di gioco</button></p>' : ""}
      ${fields.map(([key, label, max, area]) => `<label>${label}${area
        ? `<textarea data-field="${key}" maxlength="${max}" rows="${key === "caption" ? 2 : 3}" ${editable ? "" : "readonly"}>${escape(item[key])}</textarea>`
        : `<input data-field="${key}" maxlength="${max}" value="${escape(item[key])}" ${editable ? "" : "readonly"}>`}</label>`).join("")}
      <div class="library-tags"><span>Tag</span><ul>${item.tags.map(t => `<li>${escape(t)}${editable ? ` <button type="button" data-tag-remove="${escape(t)}" aria-label="Togli ${escape(t)}">×</button>` : ""}</li>`).join("") || "<li>nessuno</li>"}</ul>
        ${editable ? '<input id="library-tag-input" list="library-tag-list" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="nuovo tag, Invio"><p id="library-tag-hint" class="hint">Minuscole senza accenti, trattini tra le parole; inglese per i nomi comuni.</p>' : ""}</div>
      ${item.status === "new" && item.copy ? `<p class="library-analysis">${analysisLine(item)} ${analysis?.enabled && item.analysis.status !== "running"
        ? `<button type="button" id="library-analyze">${item.analysis.status === "none" ? "Analizza con IA" : "Rianalizza"} (${analysis.call_usd} $)</button>` : ""}</p>` : ""}
      <div class="library-actions">${item.status === "new" ? `${item.origin === "REAL" ? `<label><input type="checkbox" id="library-rights" ${item.rights_confirmed ? "checked" : ""}> Ho verificato diritti e licenza</label>` : ""}<button type="button" data-action="approve" class="primary">Approva</button>` : ""}
        ${item.status === "approved" ? '<button type="button" data-action="publish" class="primary">Pubblica nel gioco</button>' : ""}
        ${item.status === "published" ? '<button type="button" data-action="withdraw">Ritira dal gioco</button>' : ""}
        ${item.status === "trash" ? '<button type="button" data-action="restore">Ripristina</button><button type="button" data-action="delete" class="danger">Elimina definitivamente</button>'
          : item.status !== "published" ? '<button type="button" data-action="trash">Sposta nel cestino</button>' : ""}</div>
      <p id="library-detail-message" role="status" aria-live="polite"></p></div></div>`;
    if (!detail.open) detail.showModal();
    markGameMedia(detail);
  };
  detail.addEventListener("close", () => { open = null; });
  const detailMessage = (text: string) => { const el = detail.querySelector("#library-detail-message"); if (el) el.textContent = text; };
  detail.addEventListener("change", async event => {
    const field = (event.target as HTMLElement).closest<HTMLInputElement | HTMLTextAreaElement>("[data-field]");
    if (!field || !open || field.readOnly) return;
    try { open = await save(open, { [field.dataset.field!]: field.value }); showDetail(open); detailMessage("Salvato."); render(); }
    catch (error) { detailMessage(String(error instanceof Error ? error.message : error)); }
  });
  detail.addEventListener("keydown", async event => {
    const input = event.target as HTMLInputElement;
    if (input.id !== "library-tag-input" || event.key !== "Enter" || !open) return;
    event.preventDefault();
    const checked = checkTag(input.value.trim());
    if (!checked.ok) { detail.querySelector("#library-tag-hint")!.textContent = checked.reason + (checked.suggestion ? `: prova «${checked.suggestion}»` : ""); return; }
    try { open = await save(open, { tags: [...new Set([...open.tags, checked.tag])] }); showDetail(open); render(); void refreshTags(); detail.querySelector<HTMLInputElement>("#library-tag-input")?.focus(); }
    catch (error) { detailMessage(String(error instanceof Error ? error.message : error)); }
  });
  detail.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button || !open || busy || !(button.dataset.tagRemove || button.dataset.action || button.id === "library-copy" || button.id === "library-analyze")) return;
    busy = true;
    try {
      if (button.dataset.tagRemove) open = await save(open, { tags: open.tags.filter(t => t !== button.dataset.tagRemove) });
      else if (button.id === "library-copy") { detailMessage("Preparo la copia di gioco…"); open = await prepareLibraryCopy<Item>(open.id); }
      else if (button.id === "library-analyze" && analysis) {
        const repeat = open.analysis.status === "uncertain" ? " L'analisi precedente ha un esito incerto e potrebbe essere già stata addebitata." : "";
        if (!window.confirm(`Analizzare «${open.title}» con ${analysis.model}? Costo stimato ${analysis.call_usd} $.${repeat}`)) return;
        detailMessage("Analisi in corso…");
        open = await call<Item>(`/${encodeURIComponent(open.id)}/analyze`, { method: "POST", body: JSON.stringify({ confirm_usd: analysis.call_usd }) });
        void Promise.all([refreshTags(), refreshAnalysis()]);
      }
      else if (button.dataset.action === "delete") { await call("/" + encodeURIComponent(open.id), { method: "DELETE" }); detail.close(); open = null; }
      else if (button.dataset.action) open = await call<Item>(`/${encodeURIComponent(open.id)}/${button.dataset.action}`, { method: "POST",
        body: JSON.stringify(button.dataset.action === "approve" ? { rights_confirmed: Boolean(detail.querySelector<HTMLInputElement>("#library-rights")?.checked) } : {}) });
      await load();
      if (open) showDetail(items.find(i => i.id === open!.id) || open);
    } catch (error) { detailMessage(String(error instanceof Error ? error.message : error)); }
    finally { busy = false; }
  });

  page.addEventListener("click", async event => {
    const target = event.target as HTMLElement, button = target.closest<HTMLButtonElement>("button");
    if (target.closest("dialog")) return;
    const opener = target.closest<HTMLElement>("[data-open]");
    if (opener) { const item = items.find(i => i.id === opener.dataset.open); if (item) showDetail(item); return; }
    if (!button || busy) return;
    busy = true;
    try {
      if (button.dataset.view) {
        filter.status = button.dataset.view; selected.clear();
        page.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b === button)));
        await load();
      } else if (button.id === "library-commons-toggle") {
        const panel = $("#library-commons"); panel.hidden = !panel.hidden; button.setAttribute("aria-expanded", String(!panel.hidden));
      } else if (button.id === "library-commons-add") {
        const links = $<HTMLTextAreaElement>("#library-commons-links").value.split(/\s+/).map(s => s.trim()).filter(Boolean);
        if (links.length) { await addCommons(links); $<HTMLTextAreaElement>("#library-commons-links").value = ""; }
      } else if (button.id === "library-commons-pick") {
        const picked = [...page.querySelectorAll<HTMLInputElement>("[data-commons]:checked")].map(i => i.dataset.commons!);
        if (picked.length) await addCommons(picked);
      } else if (button.id === "library-empty-trash") {
        const result = await call<{ deleted: number }>("/trash/empty", { method: "POST", body: "{}" });
        message(`${result.deleted} immagini eliminate definitivamente.`); await Promise.all([load(), refreshTags()]);
      } else if (button.dataset.bulk) {
        const action = button.dataset.bulk;
        if (action === "none") { selected.clear(); render(); return; }
        if (action === "analyze") {
          const ids = items.filter(i => selected.has(i.id) && i.status === "new" && i.copy && i.analysis.status !== "running").map(i => i.id);
          if (!ids.length) { message("Nessuna immagine nuova con copia di gioco tra le selezionate."); return; }
          await analyzeMany(ids); return;
        }
        const tag = $<HTMLInputElement>("#library-bulk-tag")?.value.trim();
        if ((action === "tag-add" || action === "tag-remove")) {
          const checked = checkTag(tag || "");
          if (!checked.ok) { message(checked.reason + (checked.suggestion ? `: prova «${checked.suggestion}»` : "")); return; }
        }
        const result = await call<{ done?: number; deleted?: number; failed?: { error: string }[] }>("/bulk", { method: "POST",
          body: JSON.stringify({ action, ids: [...selected], tags: tag ? [tag] : [], rights_confirmed: action === "approve" && Boolean($<HTMLInputElement>("#library-bulk-rights")?.checked) }) });
        message(result.deleted !== undefined ? `${result.deleted} eliminate definitivamente.` :
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
    else if (target.id === "library-tag") { filter.tag = target.value.trim(); void load(); }
    else if (target.dataset.commons) $<HTMLButtonElement>("#library-commons-pick").disabled = !page.querySelector("[data-commons]:checked");
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
        message(done); form.reset(); await Promise.all([load(), refreshTags()]);
      } catch (error) { message(String(error instanceof Error ? error.message : error)); }
    });
  tagForm("#library-merge", "/tags/merge", ["from", "into"], "Tag uniti.");
  tagForm("#library-alias", "/tags/alias", ["alias", "into"], "Alias aggiunto.");
  $("#library-vocabulary-list").addEventListener("click", async event => {
    const alias = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-alias-remove]")?.dataset.aliasRemove;
    if (!alias) return;
    try { await call("/tags/alias", { method: "DELETE", body: JSON.stringify({ alias }) }); message("Alias tolto."); await refreshTags(); }
    catch (error) { message(String(error instanceof Error ? error.message : error)); }
  });
  await Promise.all([load(), refreshTags(), refreshAnalysis()]).catch(error => message(String(error instanceof Error ? error.message : error)));
}
