import { admissionForm, submitAdmission, publicationControls, cyclePublication, type CycleCard } from "./cycle-review";
import { api, content, escape } from "./main";
import { safeUrl } from "./admin";
interface Partner { id: string; origin: string; image: string }
interface Card extends CycleCard { id: string; sha256: string; revision: number; origin: string; status: string; image: string; partner: Partner | null; note: string; rejection_reason?: string; details: { title?: string; author?: string; source_url?: string; license_url?: string; previous_decision?: string; previous_owner_note?: string; previous_assessment?: unknown; original_key?: string; cycle_id?: string } }
interface Queue { images: Card[]; total: number; offset: number; limit: number }
interface DeletionPreview { origin: string; count: number; snapshot_token: string }
const endpoint = "/admin/review-inbox";
const label = (origin: string) => origin === "REAL" ? "REAL" : "SLOP";
const stateLabel = (state: string) => ({ pending: "Da rivedere", approved: "Approvata", rejected: "Rifiutata" })[state] || state;
export async function showVisualReview() {
  content().innerHTML = `<section class="page visual-review"><div class="eyebrow">REVISIONE PRIVATA</div><h1>Il tuo sguardo decide.</h1><p><a href="/admin/similarity">Verifica duplicati e scene simili →</a></p><p>Tutte le immagini in un’unica coda, compresi gli scarti precedenti. Ogni scelta riguarda una sola immagine; non serve un corrispondente.</p><div class="editorial-toolbar"><label>Mostra<select id="inbox-state"><option value="pending">Da rivedere</option><option value="approved">Approvate</option><option value="rejected">Rifiutate</option><option value="all">Tutte</option></select></label><label>Origine<select id="inbox-origin"><option value="all">REAL e SLOP</option><option value="REAL">REAL</option><option value="AI">SLOP</option></select></label><button id="refresh-review">Aggiorna</button><button id="inbox-delete-all" class="delete-image" hidden>Elimina tutte</button></div><p id="inbox-count" aria-live="polite"></p><div id="visual-queue" aria-live="polite">Caricamento delle immagini…</div><p id="review-message" role="status"></p><nav class="inbox-pagination" aria-label="Pagine delle immagini"><button id="inbox-prev">Pagina precedente</button><button id="inbox-next">Pagina successiva</button></nav><div id="inbox-thumbnails" class="inbox-thumbnails" aria-label="Immagini della pagina"></div><details class="review-management"><summary>Gestione avanzata</summary><p>Le approvazioni restano nel database privato. Diritti, provenienza e pubblicazione si verificano separatamente.</p><p><a href="/admin?advanced=1">Schede e pubblicazione</a></p></details><div class="admin-publication-area"><h2>Pubblicazione delle immagini</h2><p>Completa prima la revisione e l'ammissione documentale delle immagini. La pubblicazione richiede un numero uguale di REAL e SLOP.</p>${publicationControls}</div></section>`;
  const page = content().querySelector<HTMLElement>(".visual-review")!, queue = page.querySelector<HTMLElement>("#visual-queue")!, message = page.querySelector<HTMLElement>("#review-message")!;
  const state = page.querySelector<HTMLSelectElement>("#inbox-state")!, origin = page.querySelector<HTMLSelectElement>("#inbox-origin")!;
  const categories = await api<{id:string;name:string}[]>("/categories");
  let items: Card[] = [], index = 0, offset = 0, total = 0, busy = false, loadRequest = 0;
  let deletionPreview: DeletionPreview | null = null;
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
    queue.innerHTML = `<article class="visual-review-card"><p class="status">${offset + index + 1} di ${total} · ${label(image.origin)} · ${escape(stateLabel(image.status))}</p><h2>${escape(image.details.title || 'Immagine archiviata')}</h2><div class="inbox-comparison${image.partner ? ' has-partner' : ''}">${comparison}</div><div class="review-actions"><button data-visual-decision="approved" class="primary" disabled>Approva</button><button data-visual-decision="rejected" class="secondary" disabled>Rifiuta</button></div><label>Motivo dell’eventuale rifiuto<select id="inbox-reason"><option value="editorial">Scelta editoriale</option><option value="generation">Difetto di generazione</option><option value="technical">Problema tecnico</option><option value="rights">Diritti o licenza incerti</option><option value="provenance">Autenticità o provenienza incerta</option></select></label><details><summary>Nota e giudizi precedenti</summary><label>La tua nota (facoltativa)<textarea id="inbox-note" maxlength="2000" rows="2">${escape(image.note)}</textarea></label>${image.details.previous_decision ? `<p>Stato nell’archivio precedente: ${escape(image.details.previous_decision)}. Conservato nello storico.</p>` : ''}${image.details.previous_owner_note ? `<p>${escape(image.details.previous_owner_note)}</p>` : ''}${image.details.previous_assessment ? `<pre class="curation-history">${escape(JSON.stringify(image.details.previous_assessment, null, 2))}</pre>` : ''}<button id="inbox-history">Mostra le tue revisioni</button><div id="inbox-history-list"></div></details><details><summary>Dettagli dell’immagine</summary><p>${escape(image.details.author || '')}</p>${image.details.source_url ? `<a href="${safeUrl(image.details.source_url)}" target="_blank" rel="noopener noreferrer">Fonte ↗</a>` : ''} ${image.details.license_url ? `<a href="${safeUrl(image.details.license_url)}" target="_blank" rel="noopener noreferrer">Licenza ↗</a>` : ''}<p>La selezione editoriale non pubblica l’immagine.</p></details>${admissionForm(image, categories)}<div class="studio-actions"><button id="inbox-skip">Vedi la prossima</button>${image.status !== "pending" ? '<button data-visual-decision="pending" disabled>Rimetti da rivedere</button>' : ''}${image.status === "rejected" ? '<button id="inbox-delete" class="delete-image">Elimina definitivamente</button>' : ''}</div></article>`;
    queue.querySelector<HTMLSelectElement>("#inbox-reason")!.value = image.rejection_reason || "editorial";
    const preview = queue.querySelector<HTMLImageElement>(".inbox-selected-image")!;
    const loaded = () => { if (preview.isConnected && !busy && preview.naturalWidth && !image.publication?.published) queue.querySelectorAll<HTMLButtonElement>("[data-visual-decision]").forEach(button => { button.disabled = false; }); };
    preview.addEventListener("load", loaded); if (preview.complete) loaded();
    preview.addEventListener("error", () => { message.textContent = "Anteprima non disponibile. Riprova con Aggiorna o passa alla prossima immagine."; });
  };
  const load = async (resetIndex = true) => {
    deletionPreview = null;
    const sequence = ++loadRequest, requestedState = state.value, requestedOrigin = origin.value;
    const data = await api<Queue>(`${endpoint}?state=${requestedState}&origin=${requestedOrigin}&offset=${offset}`);
    if (!page.isConnected || sequence !== loadRequest || state.value !== requestedState || origin.value !== requestedOrigin) return;
    if (offset && !data.images.length) { offset = Math.max(0, offset - 50); return load(); }
    items = data.images; total = data.total; if (resetIndex) index = 0; else index = Math.min(index, Math.max(0, items.length - 1));
    render();
  };
  for (const select of [state, origin]) select.onchange = () => { if (busy) return; offset = 0; void load().catch(error => { message.textContent = String(error); }); };
  page.addEventListener("cancel", event => { if (["inbox-delete-dialog", "inbox-delete-all-dialog"].includes((event.target as HTMLElement).id)) (event.target as HTMLDialogElement).addEventListener("close", () => (event.target as HTMLElement).remove(), { once: true }); }, true);
  page.addEventListener("click", async event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!target || busy) return;
    busy = true; page.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = true; }); state.disabled = origin.disabled = true;
    try {
      const image = items[index];
      if (target.id === "cycle-admit" && image) {
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
        queue.insertAdjacentHTML("beforeend", `<dialog id="inbox-delete-dialog" aria-labelledby="delete-image-title"><h2 id="delete-image-title">Eliminare questa immagine?</h2><p>L’immagine verrà rimossa definitivamente dal database di revisione e non ricomparirà. Dossier e giudizi storici restano conservati.</p><div class="studio-actions"><button id="inbox-delete-cancel" autofocus>Annulla</button><button id="inbox-delete-confirm" class="delete-image">Sì, elimina definitivamente</button></div></dialog>`);
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
          queue.insertAdjacentHTML("beforeend", `<dialog id="inbox-delete-all-dialog" aria-labelledby="delete-all-title"><h2 id="delete-all-title">Eliminare tutte le rifiutate?</h2><p>Confermi l’eliminazione definitiva di <strong>${deletionPreview.count} ${scope} rifiutate</strong>, in tutte le pagine di questo filtro?</p><p>Non ricompariranno nella coda. Dossier e giudizi storici restano conservati.</p><div class="studio-actions"><button id="inbox-delete-all-cancel" autofocus>Annulla</button><button id="inbox-delete-all-confirm" class="delete-image">Sì, elimina tutte (${deletionPreview.count})</button></div></dialog>`);
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
      queue.querySelectorAll<HTMLButtonElement>("[data-visual-decision]").forEach(button => { button.disabled = !!items[index]?.publication?.published || !queue.querySelector<HTMLImageElement>(".inbox-selected-image")?.naturalWidth; });
    }
  });
  await load().catch(error => { if (page.isConnected) { message.textContent = String(error); queue.innerHTML = '<p>Caricamento non riuscito. Premi Aggiorna per riprovare.</p>'; } });
}
