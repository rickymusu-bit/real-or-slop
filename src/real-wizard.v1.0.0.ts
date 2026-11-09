/** Guided REAL ingestion, editing, paid generation and publishing. v1.0.0.
 * 2026-11-09T20:45:00Z. Draft items are private until approved and published. */
import "./real-wizard.v1.0.0.css";
import { escape } from "../shared/html";
import { checkTag } from "../shared/tags.v2.0.0";
import { prepareLibraryCopy } from "./game-copy.v1.0.0";
import { markGameMedia } from "./media-mark.v1.0.0";

type Stage = 1 | 2 | 3;
type Target = "tags" | "caption";
interface Image {
  id: string; origin: "REAL" | "SLOP"; status: "new" | "approved" | "published" | "trash";
  revision: number; title: string; description: string; caption: string; tags: string[];
  source_url: string; author: string; license_name: string; license_url: string;
  width: number; height: number; file: string;
  copy: { width: number; height: number; bytes: number } | null;
  analysis: { status: string; error: string };
}
interface Hit { title: string; page_url: string; thumb_url: string; width: number; height: number; date?: string; description?: string }
interface Browse { files: Hit[]; next: string | null }
interface Analysis { enabled: boolean; reason: string; model: string; call_usd: number; remaining_usd: number }
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
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const short = (value: string, count = 90) => value.length > count ? value.slice(0, count - 1) + "…" : value;

export async function mountRealWizard(root: HTMLElement, onPublished: () => Promise<void>): Promise<void> {
  let stage: Stage = 1, images: Image[] = [], notice = "", busy = false, query = "", sort = "relevance";
  let searchResults: Hit[] = [], next: string | null = null, searched = false, generating: Target = "tags";
  const selectedHits = new Set<string>(); let searchCategories: string[] = [], vocabulary: string[] = [];
  let analysis: Analysis | null = null;
  const pending = new Map<string, Hit | null>();
  const generated = new Map<string, { tags?: string[]; caption?: string }>();
  const captionDrafts = new Map<string, string>();
  const staged = () => images.filter(i => i.origin === "REAL" && (i.status === "new" || i.status === "approved"));
  const persist = () => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ids: staged().map(i => i.id), stage, generated: [...generated.entries()] })); } catch { /* private browsing */ }
  };
  const replace = (updated: Image) => { images = images.map(i => i.id === updated.id ? updated : i); persist(); };
  const update = async (image: Image, changes: Record<string, unknown>) => {
    const updated = await api<Image>("/" + encodeURIComponent(image.id), {
      method: "PATCH", body: JSON.stringify({ revision: image.revision, ...changes }),
    });
    replace(updated);
    return updated;
  };
  const flushCaptions = async () => {
    for (const [id, caption] of [...captionDrafts]) {
      const item = images.find(i => i.id === id);
      if (item && item.caption !== caption) await update(item, { caption: caption.trim() });
      captionDrafts.delete(id);
    }
  };
  const refreshMeta = async () => {
    const [tags, status] = await Promise.all([
      api<{ tags: { label: string }[] }>("/tags"), api<Analysis>("/analysis"),
    ]);
    vocabulary = tags.tags.map(t => t.label);
    analysis = status;
  };
  const progress = () => '<ol class="rw-steps" aria-label="Fasi del caricamento">' +
    ["Seleziona le immagini", "Tag e didascalie", "Riepilogo e pubblicazione"].map((label, index) =>
      '<li ' + (stage === index + 1 ? 'aria-current="step"' : "") + '><span>' + (index + 1) + "</span>" + label + "</li>").join("") + "</ol>";
  const cardSelected = () => [...pending.entries()].map(([url, hit]) =>
    '<li class="rw-pick"><img src="' + escape(hit?.thumb_url || "") + '" alt="" ' + (hit ? "" : "hidden") +
    '><span>' + escape(short(hit?.title || url)) + '</span><button type="button" data-rw="remove-pending" data-url="' +
    escape(url) + '" aria-label="Rimuovi dalla selezione">×</button></li>').join("");
  const first = () => '<div class="rw-columns"><section class="rw-panel"><h3>Link di Wikimedia Commons</h3>' +
    '<p class="hint">Incolla più collegamenti, uno per riga. Non vengono pubblicati finché non confermi il riepilogo.</p>' +
    '<label for="rw-links">Link delle immagini</label><textarea id="rw-links" rows="5" placeholder="https://commons.wikimedia.org/wiki/File:..."></textarea>' +
    '<button type="button" data-rw="add-links">Aggiungi alla selezione</button></section>' +
    '<section class="rw-panel"><h3>Cerca su Commons</h3><form id="rw-search" class="rw-search">' +
    '<label>Termini di ricerca<input name="q" type="search" minlength="2" maxlength="200" required value="' + escape(query) + '" placeholder="Soggetto, luogo, evento"></label>' +
    '<label>Ordina per<select name="sort"><option value="relevance" ' + (sort === "relevance" ? "selected" : "") + '>Rilevanza</option>' +
    '<option value="recent" ' + (sort === "recent" ? "selected" : "") + '>Data recente</option></select></label>' +
    '<button type="submit">Cerca</button></form>' +
    (searchCategories.length ? '<p class="hint">Categorie correlate: ' + searchCategories.map(escape).join(", ") + "</p>" : "") +
    '<div class="rw-results" aria-live="polite">' + (searched && !searchResults.length ? "<p>Nessun risultato.</p>" : "") +
    searchResults.map(hit => '<label class="rw-hit"><input type="checkbox" data-rw-hit="' + escape(hit.page_url) + '" ' +
      (selectedHits.has(hit.page_url) ? "checked" : "") + '><img src="' + escape(hit.thumb_url) + '" alt="" loading="lazy">' +
      '<span>' + escape(short(hit.title.replace(/^File:/, ""), 60)) + '</span></label>').join("") + '</div>' +
    (searchResults.length ? '<div class="rw-actions"><label><input type="checkbox" id="rw-search-all"> Seleziona tutti i risultati</label>' +
      '<button type="button" data-rw="pick-hits">Aggiungi le selezionate</button>' +
      (next ? '<button type="button" data-rw="more-results">Altri risultati</button>' : "") + "</div>" : "") + "</section></div>" +
    '<div class="rw-selected"><h3>Immagini selezionate (' + pending.size + ')</h3>' +
    (pending.size ? '<ul class="rw-picks">' + cardSelected() + "</ul>" : '<p>Seleziona le fotografie dai risultati oppure incolla i link.</p>') +
    (images.length ? '<p class="hint">Già acquisite in questa sessione: ' + staged().length + ' immagini in revisione.</p>' : "") +
    '</div><div class="rw-actions rw-bottom"><button type="button" class="primary" data-rw="import" ' +
    (!pending.size && !staged().length ? "disabled" : "") + '>Avanti: tag e didascalie</button></div>';
  const metadata = (item: Image) => '<details class="rw-metadata"><summary>Titolo, descrizione e metadati</summary><dl>' +
    [["Titolo Commons", item.title], ["Descrizione", item.description], ["Autore", item.author],
      ["Licenza", item.license_name], ["Dimensioni originali", item.width + " × " + item.height],
      ["Copia WebP", item.copy ? item.copy.width + " × " + item.copy.height : "Da preparare"]]
      .map(([term, value]) => '<dt>' + escape(term) + '</dt><dd>' + escape(value || "Non disponibile") + "</dd>").join("") +
    '<dt>Fonte</dt><dd><a href="' + escape(item.source_url) +
    '" target="_blank" rel="noopener noreferrer">Apri la pagina originale su Commons</a></dd>' +
    (item.license_url ? '<dt>Licenza</dt><dd><a target="_blank" rel="noopener noreferrer" href="' + escape(item.license_url) +
      '">Apri il testo della licenza</a></dd>' : "") + "</dl></details>";
  const second = () => '<div class="rw-actions"><button type="button" data-rw="choose-tags" ' +
    (!analysis?.enabled ? "disabled" : "") + '>Genera tag con IA</button>' +
    '<button type="button" data-rw="choose-caption" ' + (!analysis?.enabled ? "disabled" : "") +
    '>Genera didascalie con IA</button><span class="hint">' +
    (analysis?.enabled ? 'Massimo ' + analysis.call_usd + ' $ per immagine, residuo ' + analysis.remaining_usd + ' $.' :
      'Generazione non disponibile: ' + escape(analysis?.reason || "configurazione mancante")) + "</span></div>" +
    '<datalist id="rw-existing-tags">' + vocabulary.map(t => '<option value="' + escape(t) + '"></option>').join("") + '</datalist>' +
    '<div class="rw-editor-grid">' + staged().map(item => '<article class="rw-editor" data-rw-image="' + escape(item.id) + '">' +
      '<div class="rw-image"><img src="' + escape(item.file) + '" alt="' + escape(item.title) + '" loading="lazy"></div>' +
      '<div class="rw-editor-fields"><h3>' + escape(short(item.title, 90)) + '</h3>' +
      '<label>Didascalia (max 160 caratteri)<textarea data-rw-caption="' + escape(item.id) +
        '" maxlength="160" rows="3" placeholder="Testo visualizzato durante la partita">' +
        escape(captionDrafts.get(item.id) ?? item.caption) + '</textarea></label>' +
      '<label>Tag</label><div class="rw-tagbox"><div class="rw-pills">' +
        (item.tags.length ? item.tags.map(t => '<span class="rw-pill">' + escape(t) +
          '<button type="button" data-rw="remove-tag" data-id="' + escape(item.id) + '" data-tag="' +
          escape(t) + '" aria-label="Rimuovi tag ' + escape(t) + '">×</button></span>').join("") : '<small>Nessun tag</small>') +
        '</div><div class="rw-tag-entry"><input data-rw-new-tag="' + escape(item.id) +
          '" list="rw-existing-tags" autocomplete="off" spellcheck="false" autocapitalize="none" placeholder="Nuovo tag">' +
          '<button type="button" data-rw="add-tag" data-id="' + escape(item.id) + '">Aggiungi</button></div></div>' +
      '<div class="rw-actions">' +
      (generated.has(item.id) ? '<button type="button" data-rw="reset" data-id="' + escape(item.id) +
        '">Ripristina i testi generati</button>' : "") +
      (item.copy ? "" : '<button type="button" data-rw="copy" data-id="' + escape(item.id) + '">Prepara WebP</button>') +
      '</div>' + metadata(item) + '</div></article>').join("") + '</div>' +
    '<div class="rw-actions rw-bottom"><button type="button" data-rw="back">Indietro</button>' +
    '<button type="button" data-rw="review" class="primary">Avanti: riepilogo</button></div>' +
    '<dialog id="rw-generation-dialog" class="rw-dialog"><h3>Seleziona le immagini</h3><p id="rw-generation-label"></p>' +
    '<label><input type="checkbox" id="rw-generation-all"> Seleziona tutte</label>' +
    '<div class="rw-gen-list">' + staged().map(i => '<label><input type="checkbox" data-rw-gen="' +
      escape(i.id) + '" ' + (i.copy && i.status === "new" ? "checked" : "disabled") + '> ' + escape(short(i.title)) +
      '</label>').join("") + '</div><div class="rw-actions"><button type="button" data-rw="close-gen">Annulla</button>' +
      '<button type="button" class="primary" data-rw="run-gen">Genera</button></div></dialog>';
  const third = () => '<p class="hint">Anteprima della copia WebP effettivamente servita dal gioco. Il marchio RS è sovrapposto ' +
    'all’immagine, mentre la didascalia compare sotto: nessuno dei due viene incorporato nei pixel del WebP.</p>' +
    '<div class="rw-preview-grid">' + staged().map(i => '<article class="rw-final">' +
      '<div class="game-media-surface rw-final-image"><img data-game-media src="' + escape(i.file) +
      '" alt="' + escape(i.title) + '"></div><p class="play-caption">' + escape(i.caption) + '</p>' +
      '<p class="hint">' + escape(i.tags.join(", ")) + '</p>' +
      '<small>' + escape(i.copy ? "WebP · " + i.copy.width + " × " + i.copy.height : "Copia non pronta") + '</small></article>').join("") + "</div>" +
    '<div class="rw-confirm"><label><input type="checkbox" id="rw-rights"> Ho verificato autenticità, fonte e diritti di ' +
    'utilizzo delle fotografie selezionate, incluse le condizioni di attribuzione della licenza.</label></div>' +
    '<p class="hint">La pubblicazione avviene immagine per immagine: eventuali errori saranno indicati senza ripetere quelle già pubblicate.</p>' +
    '<div class="rw-actions rw-bottom"><button type="button" data-rw="back">Indietro: modifica</button>' +
    '<button type="button" class="primary" data-rw="publish">Conferma e pubblica</button></div>';
  const render = () => {
    root.innerHTML = '<div class="rw"><h2>Caricamento REAL</h2>' + progress() +
      '<p class="rw-message" role="status" aria-live="polite">' + escape(notice) + '</p>' +
      (busy ? '<p class="rw-busy" role="status">Operazione in corso…</p>' : "") +
      (stage === 1 ? first() : stage === 2 ? second() : third()) +
      '<div class="rw-actions rw-reset"><button type="button" data-rw="new">Inizia un nuovo caricamento</button></div></div>';
    if (stage === 3) markGameMedia(root);
  };
  const addLinks = (links: string[], hits = new Map<string, Hit>()) => {
    const invalid: string[] = [];
    for (const source of links) {
      const url = commonsLink(source);
      if (url && pending.size < 100) pending.set(url, hits.get(source) || null);
      else invalid.push(source);
    }
    notice = invalid.length ? "Link non validi oppure limite di 100 superato: " + invalid.map(s => short(s, 80)).join("; ") :
      pending.size + " immagini nella selezione.";
    render();
  };
  const browse = async (append: boolean) => {
    const args = new URLSearchParams({ q: query, sort });
    if (append && next) args.set("offset", next);
    const result = await api<Browse & { categories?: string[] }>("/commons/search?" + args);
    searchResults = append ? [...searchResults, ...result.files] : result.files;
    next = result.next;
    searchCategories = append ? searchCategories : result.categories || [];
    searched = true;
    notice = result.files.length + " risultati " + (append ? "aggiunti." : "trovati.");
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
    notice = done + " immagini acquisite e preparate in WebP." + (failures.length ? " Errori: " + failures.join(" | ") : "");
    persist(); render();
  };
  const generate = async (target: Target, ids: string[]) => {
    if (!analysis?.enabled || !ids.length) { notice = "Nessuna immagine selezionata o generazione non disponibile."; render(); return; }
    const max = Math.round(ids.length * analysis.call_usd * 1e4) / 1e4;
    if (max > analysis.remaining_usd) { notice = "Budget insufficiente: occorrono fino a " + max + " $."; render(); return; }
    const overwriting = target === "caption" ? " Le didascalie già presenti saranno sostituite." : " I tag presenti saranno conservati.";
    if (!window.confirm("Confermi " + ids.length + " chiamate a " + analysis.model +
      " per " + (target === "tags" ? "i tag" : "le didascalie") + "? Costo massimo " + max +
      " $; budget residuo " + analysis.remaining_usd + " $." + overwriting)) return;
    const failures: string[] = []; let done = 0;
    for (const id of ids) {
      const item = images.find(i => i.id === id);
      if (!item || item.status !== "new" || !item.copy) continue;
      notice = "Generazione " + (done + failures.length + 1) + " di " + ids.length + "…"; render();
      try {
        const result = await api<Image>("/" + encodeURIComponent(id) + "/analyze", {
          method: "POST", body: JSON.stringify({ confirm_usd: analysis.call_usd, target }),
        });
        replace(result);
        const previous = generated.get(id) || {};
        generated.set(id, target === "tags" ? { ...previous, tags: [...result.tags] } : { ...previous, caption: result.caption });
        persist(); done++;
      } catch (error) {
        failures.push(short(item.title, 35) + ": " + errorText(error));
        if (/OpenAI:|Tetto di spesa/.test(errorText(error))) break;
      }
    }
    try { await refreshMeta(); } catch { /* show per-image errors, if any */ }
    notice = done + " immagini elaborate." + (failures.length ? " Problemi: " + failures.join(" | ") : "");
    render();
  };
  const publish = async () => {
    const incomplete = staged().filter(i => !i.copy || !i.tags.length || !i.caption.trim());
    if (incomplete.length) { stage = 2; notice = "Completa copia WebP, didascalia e almeno un tag per: " +
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
    stage = failures.length ? 3 : 1;
    if (!failures.length) { images = []; pending.clear(); generated.clear(); captionDrafts.clear(); }
    notice = done + " immagini pubblicate." + (failures.length ? " Errori da correggere: " + failures.join(" | ") : "");
    persist(); render();
  };
  root.addEventListener("input", event => {
    const target = event.target as HTMLTextAreaElement;
    if (target.matches("[data-rw-caption]")) captionDrafts.set(target.dataset.rwCaption!, target.value);
  });
  root.addEventListener("change", event => {
    const target = event.target as HTMLInputElement;
    if (target.matches("[data-rw-hit]")) {
      if (target.checked) selectedHits.add(target.dataset.rwHit!); else selectedHits.delete(target.dataset.rwHit!);
    }
    if (target.id === "rw-search-all") {
      root.querySelectorAll<HTMLInputElement>("[data-rw-hit]").forEach(c => {
        c.checked = target.checked;
        if (c.checked) selectedHits.add(c.dataset.rwHit!); else selectedHits.delete(c.dataset.rwHit!);
      });
    }
    if (target.id === "rw-generation-all") {
      root.querySelectorAll<HTMLInputElement>("[data-rw-gen]:not(:disabled)").forEach(c => { c.checked = target.checked; });
    }
    if (target.matches("[data-rw-caption]") && !busy) {
      busy = true;
      void flushCaptions().catch(error => { notice = errorText(error); }).finally(() => { busy = false; render(); });
    }
  });
  root.addEventListener("submit", event => {
    if ((event.target as HTMLElement).id !== "rw-search") return;
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.target as HTMLFormElement);
    query = String(data.get("q") || "").trim(); sort = data.get("sort") === "recent" ? "recent" : "relevance";
    selectedHits.clear(); busy = true; render();
    void browse(false).catch(error => { notice = errorText(error); render(); }).finally(() => { busy = false; render(); });
  });
  root.addEventListener("keydown", event => {
    const input = event.target as HTMLInputElement;
    if (!input.matches("[data-rw-new-tag]") || event.key !== "Enter") return;
    event.preventDefault(); root.querySelector<HTMLButtonElement>('button[data-rw="add-tag"][data-id="' + input.dataset.rwNewTag + '"]')?.click();
  });
  root.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-rw]");
    if (!button || busy) return;
    const action = button.dataset.rw!, id = button.dataset.id || "";
    if (action === "close-gen") { root.querySelector<HTMLDialogElement>("#rw-generation-dialog")?.close(); return; }
    if (action === "choose-tags" || action === "choose-caption") {
      generating = action === "choose-tags" ? "tags" : "caption";
      const dialog = root.querySelector<HTMLDialogElement>("#rw-generation-dialog")!;
      dialog.querySelector<HTMLElement>("#rw-generation-label")!.textContent =
        "Scegli le immagini per generare " + (generating === "tags" ? "i tag." : "la didascalia.");
      dialog.showModal(); return;
    }
    if (action === "run-gen") {
      const ids = [...root.querySelectorAll<HTMLInputElement>("[data-rw-gen]:checked")].map(x => x.dataset.rwGen!);
      root.querySelector<HTMLDialogElement>("#rw-generation-dialog")?.close();
      busy = true;
      try { await flushCaptions(); await generate(generating, ids); } catch (error) { notice = errorText(error); render(); }
      finally { busy = false; render(); }
      return;
    }
    busy = true;
    try {
      if (action === "add-links") {
        const input = root.querySelector<HTMLTextAreaElement>("#rw-links")!;
        addLinks(input.value.split(/\s+/).filter(Boolean));
      } else if (action === "remove-pending") { pending.delete(button.dataset.url!); notice = ""; render(); }
      else if (action === "pick-hits") {
        const hits = new Map(searchResults.map(h => [h.page_url, h]));
        addLinks([...selectedHits], hits); selectedHits.clear();
      } else if (action === "more-results" && next) await browse(true);
      else if (action === "import") await acquire();
      else if (action === "back") { await flushCaptions(); stage = stage === 3 ? 2 : 1; persist(); render(); }
      else if (action === "review") {
        await flushCaptions();
        const invalid = staged().filter(i => !i.copy || !i.caption.trim() || !i.tags.length);
        if (invalid.length) notice = "Prima del riepilogo completa WebP, didascalia e almeno un tag per: " +
          invalid.map(i => short(i.title, 40)).join("; ");
        else { stage = 3; notice = ""; persist(); }
        render();
      } else if (action === "add-tag") {
        const text = root.querySelector<HTMLInputElement>('[data-rw-new-tag="' + id + '"]')!.value.trim();
        const checked = checkTag(text);
        if (!checked.ok) notice = checked.reason + (checked.suggestion ? ". Prova «" + checked.suggestion + "»" : "");
        else { await flushCaptions(); const latest = images.find(i => i.id === id)!;
          await update(latest, { tags: [...new Set([...latest.tags, checked.tag])] }); notice = "Tag salvato."; }
        render();
      } else if (action === "remove-tag") {
        await flushCaptions();
        const item = images.find(i => i.id === id)!;
        await update(item, { tags: item.tags.filter(t => t !== button.dataset.tag) }); notice = "Tag rimosso."; render();
      } else if (action === "reset") {
        await flushCaptions();
        const item = images.find(i => i.id === id)!, snapshot = generated.get(id);
        if (snapshot) { await update(item, { ...(snapshot.tags ? { tags: snapshot.tags } : {}),
          ...(snapshot.caption !== undefined ? { caption: snapshot.caption } : {}) }); notice = "Testi generati ripristinati senza costi."; render(); }
      } else if (action === "copy") {
        const copy = await prepareLibraryCopy<Image>(id);
        replace(copy); notice = "Copia WebP pronta."; render();
      } else if (action === "publish") await publish();
      else if (action === "new") {
        images = []; pending.clear(); generated.clear(); captionDrafts.clear(); searchResults = [];
        searched = false; next = null; stage = 1;
        notice = "Nuovo caricamento. Le immagini non pubblicate restano nella libreria privata.";
        persist(); render();
      }
    } catch (error) { notice = errorText(error); render(); }
    finally { busy = false; }
  });
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      const draft = JSON.parse(raw) as { ids?: string[]; stage?: Stage; generated?: [string, { tags?: string[]; caption?: string }][] };
      const ids = Array.isArray(draft.ids) ? draft.ids.filter(x => typeof x === "string").slice(0, 100) : [];
      for (const id of ids) {
        try {
          const item = await api<Image>("/" + encodeURIComponent(id));
          if (item.origin === "REAL" && (item.status === "new" || item.status === "approved")) images.push(item);
        } catch { /* inaccessible draft */ }
      }
      if (Array.isArray(draft.generated)) for (const [id, snapshot] of draft.generated) {
        if (images.some(i => i.id === id) && snapshot && typeof snapshot === "object") generated.set(id, snapshot);
      }
      stage = images.length && (draft.stage === 2 || draft.stage === 3) ? draft.stage : 1;
    }
    await refreshMeta();
  } catch (error) { notice = errorText(error); }
  persist(); render();
}
