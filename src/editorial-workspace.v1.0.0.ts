import { api, content as mainContent, escape } from "./main";
import { imageMime, sourcePageUrl } from "../shared/editorial-workspace.v1.0.0";

interface Topic { id: string; title: string; created_at: string }
interface Proposal { id: string; topic_id: string; kind: "link" | "upload"; source_url: string | null; inbox_id: string | null; note: string; review_status: string | null }
interface Workspace { topics: Topic[]; proposals: Proposal[] }

export async function mountEditorialWorkspace() {
  const root = mainContent();
  const section = document.createElement("section");
  section.id = "editorial-workspace";
  section.className = "editorial-workspace";
  section.innerHTML =
    '<div class="eyebrow">AMMINISTRAZIONE PRIVATA</div>' +
    '<h1>Studio editoriale.</h1>' +
    '<p>Decidi tu gli argomenti e proponi le fotografie prima della ricerca GPT. I file vengono conservati in quarantena: non sono automaticamente autentici, autorizzati o pubblicati.</p>' +
    '<form id="workspace-topic-form"><label>Nuovo argomento specifico<input name="title" maxlength="200" minlength="6" required placeholder="Proteste a Parigi, ottobre 2026"></label><button type="submit">Registra argomento</button></form>' +
    '<label>Argomento corrente<select id="workspace-topic-select" aria-label="Argomento corrente"></select></label>' +
    '<div class="workspace-columns"><form id="workspace-link-form"><h2>Proponi una fotografia tramite link</h2><label>Pagina o immagine originale HTTPS<input name="source_url" type="url" required placeholder="https://commons.wikimedia.org/wiki/File:..."></label><label>Nota facoltativa<textarea name="note" maxlength="1000" rows="2"></textarea></label><button type="submit">Salva proposta</button><p class="workspace-hint">Il link viene registrato, ma non entra nella coda di valutazione finché non viene acquisito e verificato il file originale.</p></form>' +
    '<form id="workspace-upload-form"><h2>Proponi fotografie dal dispositivo</h2><label>Fotografie originali<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required></label><label>Nota facoltativa<textarea name="note" maxlength="1000" rows="2"></textarea></label><button type="submit">Carica nella coda privata</button><p class="workspace-hint">Solo per l’amministratore. Nessun ritaglio: ogni file conserva proporzioni e pixel originali. Limite di 12 MB per file.</p></form></div>' +
    '<h2>Le tue proposte</h2><div id="workspace-proposals"><p>Caricamento…</p></div>' +
    '<p class="workspace-hint">Ricerca GPT, suggerimento di nuovi argomenti e generazione SLOP saranno attivati in incrementi successivi, con comandi e limiti di costo espliciti. Nessuna attività a pagamento parte da questa pagina.</p>' +
    '<p id="workspace-status" role="status" aria-live="polite"></p>';
  root.insertBefore(section, root.firstChild);
  const topicForm = section.querySelector<HTMLFormElement>("#workspace-topic-form")!;
  const linkForm = section.querySelector<HTMLFormElement>("#workspace-link-form")!;
  const uploadForm = section.querySelector<HTMLFormElement>("#workspace-upload-form")!;
  const select = section.querySelector<HTMLSelectElement>("#workspace-topic-select")!;
  const output = section.querySelector<HTMLElement>("#workspace-proposals")!;
  const status = section.querySelector<HTMLElement>("#workspace-status")!;
  let workspace: Workspace = { topics: [], proposals: [] };
  let busy = false;
  const setBusy = (enabled: boolean) => {
    busy = enabled;
    section.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = enabled);
    select.disabled = enabled || !workspace.topics.length;
  };
  const renderProposals = () => {
    const proposals = workspace.proposals.filter(p => p.topic_id === select.value);
    output.innerHTML = proposals.length ? proposals.map(p => {
      const detail = p.kind === "link" && p.source_url
        ? '<a href="' + escape(p.source_url) + '" target="_blank" rel="noopener noreferrer">Apri la fonte originale</a> — da acquisire'
        : 'File nell’archivio privato — revisione: ' + escape(p.review_status || "da rivedere");
      return '<article class="workspace-proposal"><strong>' + (p.kind === "link" ? "Link proposto" : "Fotografia caricata") +
        '</strong><p>' + detail + '</p>' + (p.note ? '<p>' + escape(p.note) + '</p>' : "") + '</article>';
    }).join("") : '<p>Nessuna proposta per questo argomento.</p>';
  };
  const refresh = async (prefer?: string) => {
    workspace = await api<Workspace>("/admin/editorial/workspace");
    const selected = prefer || select.value;
    select.innerHTML = workspace.topics.length
      ? workspace.topics.map(t => '<option value="' + escape(t.id) + '">' + escape(t.title) + '</option>').join("")
      : '<option value="">Registra prima un argomento</option>';
    if (workspace.topics.some(t => t.id === selected)) select.value = selected;
    select.disabled = busy || !workspace.topics.length;
    renderProposals();
  };
  select.addEventListener("change", renderProposals);
  topicForm.addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return; setBusy(true);
    try {
      const title = String(new FormData(topicForm).get("title") || "");
      const result = await api<{ id: string; already_exists?: boolean }>("/admin/editorial/workspace/topics",
        { method: "POST", body: JSON.stringify({ title }) });
      await refresh(result.id);
      topicForm.reset();
      status.textContent = result.already_exists ? "Argomento già registrato: selezionato." : "Argomento registrato. Puoi proporre le fotografie.";
    } catch (error) { status.textContent = String(error); } finally { setBusy(false); }
  });
  linkForm.addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return;
    if (!select.value) { status.textContent = "Registra prima un argomento."; return; }
    setBusy(true);
    try {
      const data = new FormData(linkForm);
      const source_url = sourcePageUrl(String(data.get("source_url") || ""));
      await api("/admin/editorial/workspace/links", { method: "POST",
        body: JSON.stringify({ topic_id: select.value, source_url, note: String(data.get("note") || "") }) });
      await refresh(select.value); linkForm.reset();
      status.textContent = "Link registrato: è ancora da acquisire e verificare, non è una REAL approvata.";
    } catch (error) { status.textContent = String(error); } finally { setBusy(false); }
  });
  uploadForm.addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return;
    if (!select.value) { status.textContent = "Registra prima un argomento."; return; }
    const files = [...(uploadForm.querySelector<HTMLInputElement>('input[type="file"]')?.files || [])];
    if (!files.length) return;
    const note = String(new FormData(uploadForm).get("note") || "");
    setBusy(true);
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (file.size > 12_000_000) throw new Error(file.name + ": file oltre 12 MB");
        const signature = imageMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
        if (!signature) throw new Error(file.name + ": solo JPEG, PNG o WebP");
        status.textContent = "Caricamento " + (index + 1) + " di " + files.length + "…";
        const params = new URLSearchParams({ topic_id: select.value, title: file.name.slice(0, 200), note });
        const response = await fetch("/api/admin/editorial/workspace/uploads?" + params, {
          method: "POST", headers: { "Content-Type": signature }, body: file,
        });
        const result = await response.json() as { error?: string };
        if (!response.ok) throw new Error(result.error || "Caricamento non riuscito");
      }
      await refresh(select.value);
      uploadForm.reset();
      status.textContent = files.length + " fotografie consegnate alla coda privata, ancora da verificare.";
      section.nextElementSibling?.querySelector<HTMLButtonElement>("#refresh-review")?.click();
    } catch (error) {
      await refresh(select.value);
      status.textContent = String(error) + ". Le foto precedenti eventualmente caricate restano in revisione.";
    } finally { setBusy(false); }
  });
  try { await refresh(); } catch (error) {
    output.textContent = "Workspace non disponibile: verificare la migrazione D1 0019. " + String(error);
    setBusy(true);
  }
}
