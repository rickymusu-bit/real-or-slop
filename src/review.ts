import { admissionForm, submitAdmission, publicationControls, cyclePublication, type CycleCard } from "./cycle-review";
import { api, content, escape } from "./main";
import { safeUrl } from "./admin";
import { checkTag, UNTAGGED } from "../shared/tags.v1.0.0";
import { prepareReviewCopy } from "./game-copy.v1.0.0";
interface Partner { id: string; origin: string; image: string }
interface GameCopy { sha256: string; width: number; height: number; bytes: number; recipe: string }
interface Card extends CycleCard { id: string; sha256: string; source_sha256: string; revision: number; origin: string; status: string; tags: string[]; image: string; partner: Partner | null; note: string; rejection_reason?: string; details: { title?: string; author?: string; source_url?: string; license_url?: string; previous_decision?: string; previous_owner_note?: string; previous_assessment?: unknown; original_key?: string; cycle_id?: string; game_copy?: GameCopy } }
interface Queue { images: Card[]; total: number; offset: number; limit: number; untagged?: number }
interface Tag { id: string; label: string; photos: number }
interface DeletionPreview { origin: string; count: number; snapshot_token: string }
const endpoint = "/admin/review-inbox";
const label = (origin: string) => origin === "REAL" ? "REAL" : "SLOP";
// v1.1.0 (2026-11-09T05:00:00Z): per-photo tags (spec lotti 1.4.2, section 4). Approval needs at least one real tag.
function tagEditor(image: Card) {
  const published = Boolean(image.publication?.published);
  const chips = image.tags.length ? image.tags.map(tag => `<li><span>${escape(tag)}</span><button type="button" data-tag-remove="${escape(tag)}" aria-label="Togli il tag ${escape(tag)}">×</button></li>`).join("")
    : `<li class="inbox-tag-placeholder"><span>${UNTAGGED}</span></li>`;
  const warning = image.tags.length ? "" : image.status === "rejected" ? "" : published
    ? '<p class="inbox-tag-warning">Foto pubblicata senza tag: resta nel gioco, ma aggiungi almeno un tag.</p>'
    : '<p class="inbox-tag-warning">Aggiungi almeno un tag per poterla approvare.</p>';
  return `<section class="inbox-tags" aria-label="Tag della foto"><h3>Tag</h3><ul id="inbox-tag-list">${chips}</ul>${warning}`+
    `<div class="inbox-tag-add"><input id="inbox-tag-input" list="inbox-tag-vocabulary" maxlength="80" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="es. burning-car" aria-label="Nuovo tag">`+
    `<button type="button" id="inbox-tag-add">Aggiungi tag</button></div><p id="inbox-tag-hint" class="hint">Minuscole, niente spazi, trattino tra le parole. Inglese per i termini comuni, nomi propri in qualunque lingua.</p></section>`;
}
const stateLabel = (state: string) => ({ pending: "Da rivedere", approved: "Approvata", rejected: "Rifiutata" })[state] || state;
export async function showVisualReview() {
  content().innerHTML = `<section class="page visual-review"><div class="eyebrow">REVISIONE PRIVATA</div><h1>Il tuo sguardo decide.</h1><p><a href="/admin/similarity">Verifica duplicati e scene simili →</a></p><p>Tutte le immagini in un’unica coda, compresi gli scarti precedenti. Ogni scelta riguarda una sola immagine; non serve un corrispondente.</p><div class="editorial-toolbar"><label>Mostra<select id="inbox-state"><option value="pending">Da rivedere</option><option value="approved">Approvate</option><option value="rejected">Rifiutate</option><option value="all">Tutte</option><option value="untagged">Senza tag</option></select></label><label>Origine<select id="inbox-origin"><option value="all">REAL e SLOP</option><option value="REAL">REAL</option><option value="AI">SLOP</option></select></label><button id="refresh-review">Aggiorna</button><button id="inbox-delete-all" class="delete-image" hidden>Elimina tutte</button></div><p id="inbox-count" aria-live="polite"></p><div id="visual-queue" aria-live="polite">Caricamento delle immagini…</div><p id="review-message" role="status"></p><nav class="inbox-pagination" aria-label="Pagine delle immagini"><button id="inbox-prev">Pagina precedente</button><button id="inbox-next">Pagina successiva</button></nav><div id="inbox-thumbnails" class="inbox-thumbnails" aria-label="Immagini della pagina"></div><datalist id="inbox-tag-vocabulary"></datalist><details id="tag-vocabulary" class="review-management"><summary>Vocabolario dei tag</summary><p>Tag in inglese per i termini comuni, nomi propri in qualunque lingua. Rimuovere un tag lo toglie da tutte le foto: quelle che restano senza tag tornano in «Senza tag»; le pubblicate restano pubblicate.</p><div id="tag-vocabulary-list"></div></details><details class="review-management"><summary>Gestione avanzata</summary><p>Le approvazioni restano nel database privato. Diritti, provenienza e pubblicazione si verificano separatamente.</p><p><a href="/admin?advanced=1">Schede e pubblicazione</a></p></details><div class="admin-publication-area"><h2>Pubblicazione delle immagini</h2><p>Completa prima la revisione e l'ammissione documentale delle immagini. La pubblicazione richiede un numero uguale di REAL e SLOP.</p>${publicationControls}</div></section>`;
  const page = content().querySelector<HTMLElement>(".visual-review")!, queue = page.querySelector<HTMLElement>("#visual-queue")!, message = page.querySelector<HTMLElement>("#review-message")!;
  const state = page.querySelector<HTMLSelectElement>("#inbox-state")!, origin = page.querySelector<HTMLSelectElement>("#inbox-origin")!;
  const categories = await api<{id:string;name:string}[]>("/categories");
  let items: Card[] = [], index = 0, offset = 0, total = 0, busy = false, loadRequest = 0;
  let deletionPreview: DeletionPreview | null = null;
  // Approval needs a tag and the game copy: the owner approves exactly what players will see.
  const decisionAllowed = (button: HTMLButtonElement, image: Card | undefined) => button.dataset.visualDecision !== "approved" || Boolean(image?.tags.length && image.details.game_copy);
  const copyAttempts = new Set<string>();
  const copyStatus = (image: Card) => {
    const copy = image.details.game_copy;
    if (copy) return `<p id="inbox-copy-status" class="hint">Stai valutando la copia di gioco: WebP ${copy.width}×${copy.height}, ${copy.bytes < 1024 ? copy.bytes + " byte" : Math.round(copy.bytes / 1024) + " kB"}. È ciò che vedranno i giocatori; l’originale resta in archivio.</p>`;
    if (image.status === "rejected" || image.publication?.published) return "";
    return `<p id="inbox-copy-status" class="hint" role="status">Preparo la copia di gioco WebP da approvare…</p>`;
  };
  const ensureCopy = async (image: Card) => {
    if (image.details.game_copy || image.status === "rejected" || image.publication?.published) return;
    // Only while the Review is on screen: a hidden module must not change a photo's identity under another panel.
    if (!queue.checkVisibility()) {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect(); if (items[index] === image) void ensureCopy(image);
      });
      observer.observe(queue); return;
    }
    const key = image.id + ":" + image.source_sha256;
    if (copyAttempts.has(key)) return;
    copyAttempts.add(key);
    try {
      const copy = await prepareReviewCopy(image.id, image.source_sha256);
      if (!page.isConnected) return;
      if (copy.already_prepared || !copy.width || !copy.height || !copy.bytes) { if (!busy) await load(false); return; }
      // Update the open card in place, so a tag being typed is not lost: the copy becomes the file under review.
      image.sha256 = copy.sha256;
      image.details.game_copy = { sha256: copy.sha256, width: copy.width, height: copy.height, bytes: copy.bytes, recipe: "" };
      image.image = image.image.replace(/\?.*$/, "") + "?v=" + copy.sha256.slice(0, 16);
      if (items[index] !== image) return;
      queue.querySelector<HTMLElement>("#inbox-copy-status")?.replaceWith(Object.assign(document.createElement("div"), { innerHTML: copyStatus(image) }).firstElementChild!);
      const preview = queue.querySelector<HTMLImageElement>(".inbox-selected-image");
      if (preview) { preview.src = image.image; await preview.decode().catch(() => {}); }
      if (!busy && !image.publication?.published) queue.querySelectorAll<HTMLButtonElement>("[data-visual-decision]").forEach(button => { button.disabled = !preview?.naturalWidth || !decisionAllowed(button, image); });
    }
    catch (error) {
      const status = queue.querySelector<HTMLElement>("#inbox-copy-status");
      if (status && items[index]?.id === image.id) status.innerHTML = `Copia di gioco non pronta: ${escape(error instanceof Error ? error.message : String(error))}. <button type="button" id="inbox-copy-retry">Riprova</button>`;
    }
  };
  const vocabulary = async () => {
    const data = await api<{ tags: Tag[] }>("/admin/tags");
    page.querySelector<HTMLElement>("#inbox-tag-vocabulary")!.innerHTML = data.tags.map(tag => `<option value="${escape(tag.label)}"></option>`).join("");
    page.querySelector<HTMLElement>("#tag-vocabulary summary")!.textContent = `Vocabolario dei tag (${data.tags.length})`;
    page.querySelector<HTMLElement>("#tag-vocabulary-list")!.innerHTML = data.tags.length ? data.tags.map(tag =>
      `<p class="tag-vocabulary-row"><span>${escape(tag.label)}</span><small>${tag.photos} foto</small><button type="button" data-tag-retire="${escape(tag.id)}" data-tag-label="${escape(tag.label)}">Rimuovi</button></p>`).join("")
      : "<p>Nessun tag ancora. Si creano aggiungendoli alle foto.</p>";
  };
  const changeTags = async (image: Card, change: { add?: string[]; remove?: string[] }) => {
    const result = await api<{ tags: string[] }>(`${endpoint}/${encodeURIComponent(image.id)}/tags`, { method: "POST", body: JSON.stringify(change) });
    image.tags = result.tags;
    await vocabulary();
    message.textContent = result.tags.length ? "Tag aggiornati." : "La foto non ha più tag: è tornata «untagged».";
    await load(false);
  };
  const render = () => {
    const image = items[index];
    const deleteAll = page.querySelector<HTMLButtonElement>("#inbox-delete-all")!;
    deleteAll.hidden = state.value !== "rejected"; deleteAll.disabled = busy || state.value !== "rejected" || total === 0;
    page.querySelector<HTMLElement>("#inbox-count")!.textContent = `${total} immagini · ${state.options[state.selectedIndex].text}${total ? ` · pagina ${Math.floor(offset / 50) + 1}` : ""}`;
    page.querySelector<HTMLButtonElement>("#inbox-prev")!.disabled = busy || offset === 0;
    page.querySelector<HTMLButtonElement>("#inbox-next")!.disabled = busy || offset + items.length >= total;
    page.querySelector<HTMLElement>("#inbox-thumbnails")!.innerHTML = items.map((item, n) => `<button data-inbox-index="${n}" aria-label="Valuta ${escape(label(item.origin))}: ${escape(item.details.title || 'immagine')}" aria-pressed="${n === index}"><img loading="lazy" src="${escape(item.image)}" alt=""><span>${escape(label(item.origin))}</span></button>`).join("");
    if (!image) { queue.innerHTML = "<p>Nessuna immagine in questo filtro. Puoi vedere anche quelle già approvate o rifiutate.</p>"; return; }
    const figure = (row: Partner, selected: boolean) => `<figure><figcaption>${label(row.origin)}${selected ? " · immagine da valutare" : " · stesso brief"}</figcaption><img class="review-image${selected ? ' inbox-selected-image' : ''}" src="${escape(row.image)}" alt="${selected ? 'Immagine candidata da valutare' : 'Corrispondente dello stesso brief'}"></figure>`;
    const current = { id: image.id, origin: image.origin, image: image.image };
    const comparison = image.partner ? (image.origin === "REAL" ? figure(current, true) + figure(image.partner, false) : figure(image.partner, false) + figure(current, true)) : figure(current, true);
    queue.innerHTML = `<article class="visual-review-card"><p class="status">${offset + index + 1} di ${total} · ${label(image.origin)} · ${escape(stateLabel(image.status))}</p><h2>${escape(image.details.title || 'Immagine archiviata')}</h2><div class="inbox-comparison${image.partner ? ' has-partner' : ''}">${comparison}</div>${copyStatus(image)}${tagEditor(image)}<div class="review-actions"><button data-visual-decision="approved" class="primary" disabled>Approva</button><button data-visual-decision="rejected" class="secondary" disabled>Rifiuta</button></div><label>Motivo dell’eventuale rifiuto<select id="inbox-reason"><option value="editorial">Scelta editoriale</option><option value="generation">Difetto di generazione</option><option value="technical">Problema tecnico</option><option value="rights">Diritti o licenza incerti</option><option value="provenance">Autenticità o provenienza incerta</option></select></label><details><summary>Nota e giudizi precedenti</summary><label>La tua nota (facoltativa)<textarea id="inbox-note" maxlength="2000" rows="2">${escape(image.note)}</textarea></label>${image.details.previous_decision ? `<p>Stato nell’archivio precedente: ${escape(image.details.previous_decision)}. Conservato nello storico.</p>` : ''}${image.details.previous_owner_note ? `<p>${escape(image.details.previous_owner_note)}</p>` : ''}${image.details.previous_assessment ? `<pre class="curation-history">${escape(JSON.stringify(image.details.previous_assessment, null, 2))}</pre>` : ''}<button id="inbox-history">Mostra le tue revisioni</button><div id="inbox-history-list"></div></details><details><summary>Dettagli dell’immagine</summary><p>${escape(image.details.author || '')}</p>${image.details.source_url ? `<a href="${safeUrl(image.details.source_url)}" target="_blank" rel="noopener noreferrer">Fonte ↗</a>` : ''} ${image.details.license_url ? `<a href="${safeUrl(image.details.license_url)}" target="_blank" rel="noopener noreferrer">Licenza ↗</a>` : ''}<p>La selezione editoriale non pubblica l’immagine.</p></details>${admissionForm(image, categories)}<div class="studio-actions"><button id="inbox-skip">Vedi la prossima</button>${image.status !== "pending" ? '<button data-visual-decision="pending" disabled>Rimetti da rivedere</button>' : ''}${image.status === "rejected" ? '<button id="inbox-delete" class="delete-image">Elimina definitivamente</button>' : ''}</div></article>`;
    queue.querySelector<HTMLSelectElement>("#inbox-reason")!.value = image.rejection_reason || "editorial";
    const preview = queue.querySelector<HTMLImageElement>(".inbox-selected-image")!;
    const loaded = () => { if (preview.isConnected && !busy && preview.naturalWidth && !image.publication?.published) queue.querySelectorAll<HTMLButtonElement>("[data-visual-decision]").forEach(button => { button.disabled = !decisionAllowed(button, image); }); };
    preview.addEventListener("load", loaded); if (preview.complete) loaded();
    preview.addEventListener("error", () => { message.textContent = "Anteprima non disponibile. Riprova con Aggiorna o passa alla prossima immagine."; });
    void ensureCopy(image);
  };
  const load = async (resetIndex = true) => {
    deletionPreview = null;
    const sequence = ++loadRequest, requestedState = state.value, requestedOrigin = origin.value;
    const data = await api<Queue>(`${endpoint}?state=${requestedState}&origin=${requestedOrigin}&offset=${offset}`);
    if (!page.isConnected || sequence !== loadRequest || state.value !== requestedState || origin.value !== requestedOrigin) return;
    if (offset && !data.images.length) { offset = Math.max(0, offset - 50); return load(); }
    const untaggedOption = state.querySelector<HTMLOptionElement>('option[value="untagged"]');
    if (untaggedOption) untaggedOption.textContent = `Senza tag (${data.untagged ?? 0})`;
    items = data.images; total = data.total; if (resetIndex) index = 0; else index = Math.min(index, Math.max(0, items.length - 1));
    render();
  };
  page.addEventListener("input", event => {
    const input = event.target as HTMLInputElement;
    if (input.id !== "inbox-tag-input") return;
    const hint = page.querySelector<HTMLElement>("#inbox-tag-hint")!, value = input.value.trim();
    if (!value) { hint.textContent = "Minuscole, niente spazi, trattino tra le parole. Inglese per i termini comuni, nomi propri in qualunque lingua."; return; }
    const checked = checkTag(value);
    hint.textContent = checked.ok ? "Formato corretto." : checked.reason + (checked.suggestion ? `. Forma proposta: «${checked.suggestion}»` : ".");
  });
  page.addEventListener("keydown", event => {
    if ((event.target as HTMLElement).id === "inbox-tag-input" && event.key === "Enter") { event.preventDefault(); page.querySelector<HTMLButtonElement>("#inbox-tag-add")?.click(); }
  });
  for (const select of [state, origin]) select.onchange = () => { if (busy) return; offset = 0; void load().catch(error => { message.textContent = String(error); }); };
  page.addEventListener("cancel", event => { if (["inbox-delete-dialog", "inbox-delete-all-dialog"].includes((event.target as HTMLElement).id)) (event.target as HTMLDialogElement).addEventListener("close", () => (event.target as HTMLElement).remove(), { once: true }); }, true);
  page.addEventListener("click", async event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!target || busy) return;
    busy = true; page.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = true; }); state.disabled = origin.disabled = true;
    try {
      const image = items[index];
      if (target.id === "inbox-copy-retry" && image) {
        copyAttempts.delete(image.id + ":" + image.source_sha256); render();
      } else if (target.id === "inbox-tag-add" && image) {
        const input = queue.querySelector<HTMLInputElement>("#inbox-tag-input")!, checked = checkTag(input.value.trim());
        if (!checked.ok) {
          message.textContent = checked.reason + (checked.suggestion ? `. Forma proposta: «${checked.suggestion}» (inserita nel campo, premi di nuovo Aggiungi).` : ".");
          if (checked.suggestion) input.value = checked.suggestion;
        } else await changeTags(image, { add: [checked.tag] });
      } else if (target.dataset.tagRemove && image) {
        await changeTags(image, { remove: [target.dataset.tagRemove] });
      } else if (target.dataset.tagRetire) {
        const impact = await api<{ label: string; photos: number; untagged_published: number; untagged_unpublished: number }>(`/admin/tags/${encodeURIComponent(target.dataset.tagRetire)}/impact`);
        const untagged = impact.untagged_published + impact.untagged_unpublished;
        if (window.confirm(`Rimuovere il tag «${impact.label}» dal vocabolario e da ${impact.photos} foto?` +
          (untagged ? `\n${untagged} foto resteranno senza tag (${impact.untagged_published} pubblicate restano nel gioco, ${impact.untagged_unpublished} non pubblicabili finché non ricevono un tag).` : ""))) {
          await api(`/admin/tags/${encodeURIComponent(target.dataset.tagRetire)}/retire`, { method: "POST", body: JSON.stringify({ label: impact.label, expected_photos: impact.photos }) });
          message.textContent = `Tag «${impact.label}» rimosso.`;
          await vocabulary(); await load(false);
        }
      } else if (target.id === "cycle-admit" && image) {
        if (await submitAdmission(queue.querySelector<HTMLFormElement>("#cycle-admission")!,image)) {
          message.textContent = "Ammessa. La pubblicazione attende un numero uguale di REAL e SLOP ammesse.";
          await load(false);
        }
      } else if (target.id === "cycle-state" || target.id === "cycle-publish") {
        await cyclePublication(page,target.id === "cycle-publish"); await load(false);
      } else if (target.dataset.visualDecision && image) {
        await api(`${endpoint}/${encodeURIComponent(image.id)}/decision`, { method: "POST", body: JSON.stringify({ decision: target.dataset.visualDecision, revision: image.revision, sha256: image.sha256, note: queue.querySelector<HTMLTextAreaElement>("#inbox-note")?.value || "", ...(target.dataset.visualDecision === "rejected" ? {reason:queue.querySelector<HTMLSelectElement>("#inbox-reason")!.value} : {}) }) });
        document.querySelector("#editorial-workspace")?.dispatchEvent(new CustomEvent("workspace-updated"));
        message.textContent = target.dataset.visualDecision === "approved" ? "Approvata." : target.dataset.visualDecision === "rejected" ? "Rifiutata." : "Rimessa da rivedere.";
        await load(false);
      } else if (target.id === "inbox-delete" && image?.status === "rejected") {
        queue.insertAdjacentHTML("beforeend", `<dialog id="inbox-delete-dialog" aria-labelledby="delete-image-title"><h2 id="delete-image-title">Eliminare questa immagine?</h2><p>L’immagine verrà rimossa definitivamente dalla coda di revisione e non ricomparirà. Vengono cancellati anche i suoi file (originale e copia di gioco) caricati o acquisiti dalla dashboard; dossier e giudizi storici restano conservati.</p><div class="studio-actions"><button id="inbox-delete-cancel" autofocus>Annulla</button><button id="inbox-delete-confirm" class="delete-image">Sì, elimina definitivamente</button></div></dialog>`);
        queue.querySelector<HTMLDialogElement>("#inbox-delete-dialog")!.showModal();
      } else if (target.id === "inbox-delete-cancel") {
        queue.querySelector<HTMLDialogElement>("#inbox-delete-dialog")!.close();
        queue.querySelector("#inbox-delete-dialog")!.remove();
        queue.querySelector<HTMLButtonElement>("#inbox-delete")?.focus();
      } else if (target.id === "inbox-delete-confirm" && image) {
        await api(`${endpoint}/${encodeURIComponent(image.id)}`, { method: "DELETE", body: JSON.stringify({ confirm_delete: true, revision: image.revision, sha256: image.sha256 }) });
        message.textContent = "Immagine eliminata definitivamente dal database di revisione.";
        await load(false);
      } else if (target.id === "inbox-delete-all" && state.value === "rejected") {
        deletionPreview = await api<DeletionPreview>(`${endpoint}/delete-rejected?origin=${origin.value}`);
        if (!deletionPreview.count) { message.textContent = "Non ci sono più immagini rifiutate in questo filtro."; await load(false); }
        else {
          const scope = deletionPreview.origin === "all" ? "immagini" : label(deletionPreview.origin);
          queue.insertAdjacentHTML("beforeend", `<dialog id="inbox-delete-all-dialog" aria-labelledby="delete-all-title"><h2 id="delete-all-title">Eliminare tutte le rifiutate?</h2><p>Confermi l’eliminazione definitiva di <strong>${deletionPreview.count} ${scope} rifiutate</strong>, in tutte le pagine di questo filtro?</p><p>Non ricompariranno nella coda. Vengono cancellati anche i loro file (originali e copie di gioco) caricati o acquisiti dalla dashboard; dossier e giudizi storici restano conservati.</p><div class="studio-actions"><button id="inbox-delete-all-cancel" autofocus>Annulla</button><button id="inbox-delete-all-confirm" class="delete-image">Sì, elimina tutte (${deletionPreview.count})</button></div></dialog>`);
          queue.querySelector<HTMLDialogElement>("#inbox-delete-all-dialog")!.showModal();
        }
      } else if (target.id === "inbox-delete-all-cancel") {
        queue.querySelector<HTMLDialogElement>("#inbox-delete-all-dialog")!.close();
        queue.querySelector("#inbox-delete-all-dialog")!.remove(); deletionPreview = null;
        page.querySelector<HTMLButtonElement>("#inbox-delete-all")!.focus();
      } else if (target.id === "inbox-delete-all-confirm" && deletionPreview && state.value === "rejected" && origin.value === deletionPreview.origin) {
        const result = await api<{ deleted: number }>(`${endpoint}/delete-rejected`, { method: "DELETE", body: JSON.stringify({ origin: deletionPreview.origin, snapshot_token: deletionPreview.snapshot_token, confirm_delete: true }) });
        message.textContent = `${result.deleted} immagini rifiutate eliminate definitivamente.`;
        offset = 0; await load();
      } else if (target.id === "inbox-history" && image) {
        const data = await api<{ events: { decision: string; note: string; created_at: string }[] }>(`${endpoint}/${encodeURIComponent(image.id)}/history`);
        queue.querySelector<HTMLElement>("#inbox-history-list")!.innerHTML = data.events.length ? data.events.map(e => `<p>${escape(stateLabel(e.decision))} · ${escape(e.created_at)}<br>${escape(e.note)}</p>`).join('') : '<p>Nessuna nuova revisione registrata.</p>';
      } else if (target.dataset.inboxIndex !== undefined) { index = Number(target.dataset.inboxIndex); render(); }
      else if (target.id === "inbox-skip") { if (index + 1 < items.length) { index++; render(); } else if (offset + items.length < total) { offset += 50; await load(); } else { index = 0; render(); } }
      else if (target.id === "inbox-prev" || target.id === "inbox-next") { offset = Math.max(0, offset + (target.id === "inbox-next" ? 50 : -50)); await load(); }
      else if (target.id === "refresh-review") await load(false);
    } catch (error) { message.textContent = String(error); if (["inbox-delete-confirm", "inbox-delete-all-confirm"].includes(target.id)) await load(false).catch(() => {}); }
    finally {
      busy = false; state.disabled = origin.disabled = false;
      page.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = false; });
      page.querySelector<HTMLButtonElement>("#inbox-prev")!.disabled = offset === 0;
      page.querySelector<HTMLButtonElement>("#inbox-next")!.disabled = offset + items.length >= total;
      page.querySelector<HTMLButtonElement>("#inbox-delete-all")!.disabled = state.value !== "rejected" || total === 0;
      queue.querySelectorAll<HTMLButtonElement>("[data-visual-decision]").forEach(button => { button.disabled = !!items[index]?.publication?.published || !queue.querySelector<HTMLImageElement>(".inbox-selected-image")?.naturalWidth || !decisionAllowed(button, items[index]); });
    }
  });
  await vocabulary().catch(error => { message.textContent = String(error); });
  await load().catch(error => { if (page.isConnected) { message.textContent = String(error); queue.innerHTML = '<p>Caricamento non riuscito. Premi Aggiorna per riprovare.</p>'; } });
}
