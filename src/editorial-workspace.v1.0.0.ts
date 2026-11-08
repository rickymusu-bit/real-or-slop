import "./editorial-workspace.v1.0.0.css";
import { api, content as mainContent, escape } from "./main";
import { imageMime, sourcePageUrl } from "../shared/editorial-workspace.v1.0.0";

interface Topic { id: string; title: string; created_at: string; description?:string|null; embedding_status?: string|null; input_sha256?:string|null;error_code?:string|null }
interface Proposal { id: string; topic_id: string; kind: "link" | "upload"; source_url: string | null; inbox_id: string | null; note: string; review_status: string | null }
interface DescriptionDraft {id:string;title:string;status:string;description:string|null;ambiguity:string|null;proposal_sha256:string|null}
interface Workspace { topics: Topic[]; proposals: Proposal[];embedding_enabled?:boolean;embedding_cost?:string|null;description_cost?:string|null;description_drafts?:DescriptionDraft[] }

export async function mountEditorialWorkspace() {
  const root = mainContent();
  const section = document.createElement("section");
  section.id = "editorial-workspace";
  section.className = "editorial-workspace";
  section.innerHTML =
    '<div class="eyebrow">AMMINISTRAZIONE PRIVATA</div>' +
    '<h1>Studio editoriale.</h1>' +
    '<p>Decidi tu gli argomenti e proponi le fotografie prima della ricerca GPT. I file vengono conservati in quarantena: non sono automaticamente autentici, autorizzati o pubblicati.</p>' +
    '<form id="workspace-topic-form"><label>Nuovo argomento specifico<input name="title" maxlength="200" minlength="6" required placeholder="Proteste a Parigi, ottobre 2026"></label>'+
    '<label>Descrizione in inglese (massimo 500 caratteri)<textarea name="description" maxlength="500" rows="3" placeholder="Scrivila tu oppure lascia vuoto per ricevere una proposta GPT da approvare."></textarea></label>'+
    '<p class="workspace-hint">Con il solo titolo, Continua richiede una proposta GPT a pagamento: nessun argomento o embedding prima della tua approvazione. Con una descrizione scritta da te, registra e indicizza direttamente entro i limiti configurati. Funziona anche con Topic Discovery spento.</p>'+
    '<button type="submit">Continua</button><div id="workspace-description-preview" hidden><h2>Rivedi la descrizione proposta</h2><p>Proposta GPT non verificata: modifica il testo qui sopra prima di approvare. Non è una ricerca documentale né una fonte. Se cambi il titolo, annulla la bozza e richiedine una nuova.</p><p id="workspace-description-ambiguity"></p><div class="workspace-draft-actions"><button type="button" data-description="approve">Approva e registra</button><button type="button" data-description="regenerate">Rigenera con GPT</button><button type="button" data-description="cancel">Annulla</button></div></div></form>' +
    '<p id="workspace-topic-status" role="status" aria-live="polite"></p><div id="workspace-description-drafts"></div>' +
    '<label>Argomento corrente<select id="workspace-topic-select" aria-label="Argomento corrente"></select></label>' +
    '<form id="workspace-semantic-form"><h2>Memoria dell’argomento corrente</h2><p id="workspace-semantic-state"></p><label>Descrizione semantica<textarea name="description" maxlength="500" rows="3"></textarea></label><button type="submit">Salva descrizione / indicizza argomento</button><p>Conserva le revisioni precedenti. Se il servizio è configurato, questa azione autorizza un embedding entro il tetto indicato. Nessun reinvio di esiti incerti.</p></form>' +
    '<div class="workspace-columns"><form id="workspace-link-form"><h2>Proponi una fotografia tramite link</h2><label>Pagina o immagine originale HTTPS<input name="source_url" type="url" required placeholder="https://commons.wikimedia.org/wiki/File:..."></label><label>Nota facoltativa<textarea name="note" maxlength="1000" rows="2"></textarea></label><button type="submit">Salva proposta</button><p class="workspace-hint">Il link viene registrato, ma non entra nella coda di valutazione finché non viene acquisito e verificato il file originale.</p></form>' +
    '<form id="workspace-upload-form"><h2>Proponi fotografie dal dispositivo</h2><label>Fotografie originali<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required></label><label>Nota facoltativa<textarea name="note" maxlength="1000" rows="2"></textarea></label><button type="submit">Carica nella coda privata</button><p class="workspace-hint">Solo per l’amministratore. Nessun ritaglio: ogni file conserva proporzioni e pixel originali. Limite di 12 MB per file.</p></form></div>' +
    '<h2>Le tue proposte</h2><div id="workspace-proposals"><p>Caricamento…</p></div>' +
    '<p class="workspace-hint">Ricerca GPT, analisi visiva e generazione SLOP richiedono i comandi espliciti della sezione seguente. Puoi terminare il lotto con le sole foto manuali.</p>' +
    '<p id="workspace-status" role="status" aria-live="polite"></p>';
  root.insertBefore(section, root.firstChild);
  const topicForm = section.querySelector<HTMLFormElement>("#workspace-topic-form")!;
  const semanticForm=section.querySelector<HTMLFormElement>("#workspace-semantic-form")!;
  const linkForm = section.querySelector<HTMLFormElement>("#workspace-link-form")!;
  const uploadForm = section.querySelector<HTMLFormElement>("#workspace-upload-form")!;
  const select = section.querySelector<HTMLSelectElement>("#workspace-topic-select")!;
  const output = section.querySelector<HTMLElement>("#workspace-proposals")!;
  const status = section.querySelector<HTMLElement>("#workspace-status")!;
  const reportTopic=(message:string)=>{status.textContent=message;section.querySelector<HTMLElement>('#workspace-topic-status')!.textContent=message;};
  let workspace: Workspace = { topics: [], proposals: [] };
  let draft:DescriptionDraft|null=null;
  let descriptionOperation:{title:string;id:string}|null=null;
  const preview=section.querySelector<HTMLElement>('#workspace-description-preview')!;
  const topicTitleInput=topicForm.querySelector<HTMLInputElement>('input[name=title]')!;
  const topicDescription=topicForm.querySelector<HTMLTextAreaElement>('textarea')!;
  const showDraft=(proposal:DescriptionDraft|null)=>{
    draft=proposal;preview.hidden=!draft;
    topicForm.querySelector<HTMLButtonElement>('button[type=submit]')!.hidden=!!draft;
    if(draft){
      topicTitleInput.value=draft.title;topicDescription.value=draft.description || '';
      section.querySelector<HTMLElement>('#workspace-description-ambiguity')!.textContent=draft.ambiguity?
        'Ambiguità da valutare: '+draft.ambiguity:'Il testo resta una proposta da verificare.';
      topicDescription.focus();
    }
  };
  let busy = false;
  const setBusy = (enabled: boolean) => {
    busy = enabled;
    section.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = enabled);
    topicForm.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea').forEach(field=>field.disabled=enabled);
    select.disabled = enabled || !workspace.topics.length;
    if(!enabled)renderProposals();
  };
  const renderProposals = () => {
    const topic=workspace.topics.find(t=>t.id===select.value);
    semanticForm.querySelector<HTMLTextAreaElement>('textarea')!.value=topic?.description || "";
    const locked=!!topic && ["uncertain","submitting"].includes(topic.embedding_status || "");
    semanticForm.querySelector<HTMLButtonElement>('button')!.disabled=busy || !topic || locked;
    section.querySelector<HTMLElement>('#workspace-semantic-state')!.textContent=topic ?
      "Stato embedding: "+(topic.embedding_status || "non indicizzato")+". "+(!topic.description?"Descrizione mancante. ":"")+
      (topic.error_code?"Diagnostica: "+topic.error_code+". ":"")+
      (workspace.embedding_enabled?"Tetto per chiamata: "+workspace.embedding_cost+" USD.":"Servizio non configurato: il testo resta in attesa.") : "Seleziona un argomento.";
    const proposals = workspace.proposals.filter(p => p.topic_id === select.value);
    output.innerHTML = proposals.length ? proposals.map(p => {
      const detail = p.kind === "link" && p.source_url
        ? '<a href="' + escape(p.source_url) + '" target="_blank" rel="noopener noreferrer">Apri la fonte originale</a> — '+(p.inbox_id?'acquisita, revisione: '+escape(p.review_status || 'da rivedere'):'da acquisire')
        : 'File nell’archivio privato — revisione: ' + escape(p.review_status || "da rivedere");
      return '<article class="workspace-proposal"><strong>' + (p.kind === "link" ? "Link proposto" : "Fotografia caricata") +
        '</strong><p>' + detail + '</p>' + (p.note ? '<p>' + escape(p.note) + '</p>' : "") + '</article>';
    }).join("") : '<p>Nessuna proposta per questo argomento.</p>';
  };
  const refresh = async (prefer?: string) => {
    workspace = await api<Workspace>("/admin/editorial/workspace");
    const selected = prefer || select.value;
    select.innerHTML = workspace.topics.length
      ? workspace.topics.map(t => '<option value="' + escape(t.id) + '">' + escape(t.title) + (t.embedding_status==="ready"?" ✓":t.embedding_status==="uncertain"?" (embedding incerto)":" (non indicizzato)") + '</option>').join("")
      : '<option value="">Registra prima un argomento</option>';
    if (workspace.topics.some(t => t.id === selected)) select.value = selected;
    select.disabled = busy || !workspace.topics.length;
    renderProposals();
    section.querySelector<HTMLElement>('#workspace-description-drafts')!.innerHTML=(workspace.description_drafts || []).map(d=>
      '<p>Bozza: '+escape(d.title)+' — '+escape(d.status)+(d.status==='ready'?'<button type="button" data-resume-description="'+escape(d.id)+'">Riprendi la descrizione</button>':' — Puoi scrivere una descrizione manuale; nessun reinvio automatico.')+'</p>').join('');
    section.dispatchEvent(new CustomEvent("workspace-updated"));
  };
  select.addEventListener("change", renderProposals);
  semanticForm.addEventListener("submit",async event=>{
    event.preventDefault();if(busy)return;
    const topic=workspace.topics.find(t=>t.id===select.value);if(!topic)return;
    if(workspace.embedding_enabled && !window.confirm("Salvare e indicizzare questo argomento? Tetto: "+workspace.embedding_cost+" USD. Nessun suggerimento o ricerca verrà avviato."))return;
    setBusy(true);
    status.textContent='Salvataggio della memoria semantica…';
    try{
      const result=await api<{embedding_status:string}>("/admin/editorial/workspace/topics/"+encodeURIComponent(topic.id)+"/semantics",{
        method:"POST",body:JSON.stringify({description:String(new FormData(semanticForm).get("description") || ""),expected_sha256:topic.input_sha256 || null})});
      await refresh(topic.id);status.textContent="Testo conservato. Stato embedding: "+result.embedding_status;
    }catch(error){status.textContent=String(error);}finally{setBusy(false);renderProposals();}
  });
  const registered=async(result:{id:string;already_exists?:boolean;embedding_status?:string})=>{
    showDraft(null);descriptionOperation=null;
    await refresh(result.id);topicForm.reset();
    const indexing=result.embedding_status==='ready'?'Embedding calcolato e archiviato.':
      result.embedding_status==='uncertain'?'Embedding incerto: nessun nuovo tentativo automatico.':'Embedding in attesa di configurazione o budget: testo conservato.';
    reportTopic((result.already_exists?'Argomento già registrato: selezionato. ':'Argomento registrato. ')+indexing+' Puoi proporre le fotografie.');
  };
  topicForm.addEventListener("submit", async event => {
    event.preventDefault(); if (busy || draft) return;
    const title=topicTitleInput.value,description=topicDescription.value;
    if(!description.trim() && !window.confirm('Richiedere una descrizione GPT? È una chiamata a pagamento, tetto '+(workspace.description_cost || 'non configurato')+' USD. Nessun embedding prima della tua approvazione.'))return;
    if(description.trim() && workspace.embedding_enabled && !window.confirm('Registrare e indicizzare il testo? Tetto embedding: '+workspace.embedding_cost+' USD.'))return;
    if(!descriptionOperation || descriptionOperation.title!==title)descriptionOperation={title,id:crypto.randomUUID()};
    setBusy(true);
    reportTopic(description.trim()?'Registrazione dell’argomento…':'Preparazione della proposta GPT…');
    try {
      const result = await api<{id:string;already_exists?:boolean;embedding_status?:string;proposal?:DescriptionDraft}>("/admin/editorial/workspace/topics",
        {method:'POST',body:JSON.stringify({title,description,operation_id:descriptionOperation.id})});
      if(result.proposal){showDraft(result.proposal);reportTopic('Proposta pronta: rivedi e approva esplicitamente. Nessun argomento o embedding creato.');await refresh();}
      else await registered(result);
    } catch (error) { reportTopic(String(error)+'. Il testo resta qui: puoi scrivere la descrizione e registrarla senza GPT.');await refresh().catch(()=>{}); }
    finally { setBusy(false); }
  });
  section.addEventListener('click',async event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('[data-description],[data-resume-description]');
    if(!button || busy)return;
    if(button.dataset.resumeDescription){
      const candidate=workspace.description_drafts?.find(d=>d.id===button.dataset.resumeDescription);
      if(candidate){showDraft(candidate);topicForm.scrollIntoView({block:'start'});}return;
    }
    if(!draft)return;
    const action=button.dataset.description;
    if(action==='regenerate' && !window.confirm('Rigenerare la descrizione? Nuova chiamata GPT a pagamento, tetto '+(workspace.description_cost || 'non configurato')+' USD. La proposta precedente non sarà più approvabile.'))return;
    if(action==='approve' && workspace.embedding_enabled && !window.confirm('Approvare questo testo e indicizzarlo? Tetto embedding: '+workspace.embedding_cost+' USD.'))return;
    const payload:Record<string,unknown>={title:action==='cancel'?draft.title:topicTitleInput.value,expected_sha256:draft.proposal_sha256};
    if(action==='approve')payload.description=topicDescription.value;
    if(action==='regenerate')payload.operation_id=crypto.randomUUID();
    setBusy(true);
    reportTopic(action==='approve'?'Registrazione del testo approvato…':action==='regenerate'?'Preparazione di una nuova proposta GPT…':'Annullamento della bozza…');
    try{
      const result=await api<{id:string;embedding_status?:string;already_exists?:boolean;proposal?:DescriptionDraft}>(
        '/admin/editorial/workspace/topic-descriptions/'+draft.id+'/'+action,{method:'POST',body:JSON.stringify(payload)});
      if(action==='cancel'){showDraft(null);topicDescription.value='';descriptionOperation=null;await refresh();reportTopic('Bozza annullata. Nessun argomento o embedding creato.');}
      else if(result.proposal){showDraft(result.proposal);await refresh();reportTopic('Nuova proposta pronta: nessuna registrazione o indicizzazione.');}
      else await registered(result);
    }catch(error){
      reportTopic(String(error));await refresh().catch(()=>{});
      if(draft && !workspace.description_drafts?.some(d=>d.id===draft?.id && d.status==='ready'))showDraft(null);
    }
    finally{setBusy(false);}
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
      document.querySelector<HTMLButtonElement>("#refresh-review")?.click();
    } catch (error) {
      await refresh(select.value);
      status.textContent = String(error) + ". Le foto precedenti eventualmente caricate restano in revisione.";
    } finally { setBusy(false); }
  });
  try { await refresh(); } catch (error) {
    output.textContent = "Workspace non disponibile: verificare le migrazioni D1 fino alla 0024. " + String(error);
    setBusy(true);
  }
}
