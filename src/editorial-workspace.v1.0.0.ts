import "./editorial-workspace.v1.0.0.css";
import { api, content as mainContent, escape } from "./main";
import { imageMime } from "../shared/editorial-workspace.v1.0.0";
import { canAcquireCommons, parseLinkLines } from "../shared/editorial-link-batch.v1.0.0";
import { proposeLotTitle } from "../shared/editorial-lots.v1.0.0";

// v1.1.0 (2026-11-08T20:00:26Z): lots, phase 1 of docs/lotti-editoriali.v1.3.1.md. No GPT or embedding to create a lot.
interface Topic { id: string; title: string; created_at: string; notes:string; lot_status:string; lot_revision:number }
interface Proposal { id: string; topic_id: string; kind: "link" | "upload"; source_url: string | null; inbox_id: string | null; note: string; review_status: string | null }
interface Workspace { topics: Topic[]; proposals: Proposal[] }
interface CommonsFile { title:string; page_url:string; thumb_url:string; width:number; height:number; author:string; license:string; categories:string[] }
interface CommonsPage { files:CommonsFile[]; categories:string[]; next:string|null }

export async function mountEditorialWorkspace() {
  const root = mainContent();
  const section = document.createElement("section");
  section.id = "editorial-workspace";
  section.className = "editorial-workspace";
  section.innerHTML =
    '<div class="eyebrow">AMMINISTRAZIONE PRIVATA</div>' +
    '<h1>Studio editoriale.</h1>' +
    '<p>Ogni lotto è una galleria monotematica di fotografie REAL scelte da te. I file vengono conservati in quarantena: non sono automaticamente autentici, autorizzati o pubblicati.</p>' +
    '<form id="workspace-topic-form"><h2>Nuovo lotto</h2><label>Titolo breve<input name="title" maxlength="200" minlength="6" required placeholder="Es. Canali di Venezia"></label>'+
    '<label>Note per la generazione (facoltative, massimo 500 caratteri)<textarea name="notes" maxlength="500" rows="3" placeholder="Solo se serve: contesto che le foto non mostrano o indicazioni per le SLOP."></textarea></label>'+
    '<p class="workspace-hint">Crea il lotto senza chiamate a pagamento. Puoi aggiungere le foto da Esplora Commons, con i link o dal dispositivo.</p>'+
    '<button type="submit">Crea lotto</button></form>' +
    '<p id="workspace-topic-status" role="status" aria-live="polite"></p>' +
    '<label>Lotto corrente<select id="workspace-topic-select" aria-label="Lotto corrente"></select></label>' +
    '<form id="workspace-lot-notes-form"><h2>Note del lotto corrente</h2><p id="workspace-lot-state"></p><label>Note per la generazione<textarea name="notes" maxlength="500" rows="3"></textarea></label><button type="submit">Salva note</button><p class="workspace-hint">Le note precedenti restano nello storico. Nessuna chiamata a pagamento.</p></form>' +
    '<div id="workspace-topic-removal"><button type="button" id="workspace-topic-remove">Rimuovi lotto inutilizzato</button><p class="workspace-hint">Rimuove soltanto lotti senza fotografie, link, ricerche, prompt SLOP o operazioni AI registrate, liberando il titolo. I lotti con lavoro collegato restano intatti.</p></div>' +
    '<section id="workspace-commons-explorer"><h2>Esplora Commons</h2>'+
    '<form id="workspace-commons-search"><label>Cerca fotografie o categorie<input name="q" minlength="2" maxlength="200" required placeholder="Es. Venice canals"></label><button type="submit">Cerca</button></form>'+
    '<p id="workspace-commons-context" class="workspace-hint"></p><div id="workspace-commons-categories"></div><div id="workspace-commons-results"></div>'+
    '<div class="workspace-commons-actions"><button type="button" id="workspace-commons-more" hidden>Altri risultati</button>'+
    '<label class="workspace-inline"><input type="checkbox" id="workspace-commons-acquire" checked> Acquisisci subito le foto aggiunte</label>'+
    '<button type="button" id="workspace-commons-add" disabled>Aggiungi le selezionate al lotto corrente</button>'+
    '<button type="button" id="workspace-commons-new-lot" disabled>Crea un lotto con le selezionate</button></div>'+
    '<p id="workspace-commons-status" role="status" aria-live="polite"></p></section>' +
    '<div class="workspace-columns"><form id="workspace-link-form"><h2>Proponi fotografie tramite link</h2><label>URL HTTPS, uno per riga (massimo 20)<textarea name="source_urls" rows="6" required placeholder="https://commons.wikimedia.org/wiki/File:...&#10;https://commons.wikimedia.org/wiki/File:..."></textarea></label><label>Nota comune facoltativa<textarea name="note" maxlength="1000" rows="2"></textarea></label><button type="submit">Registra i link</button><p class="workspace-hint">I duplicati vengono saltati. Anteprime, file originali e link del visualizzatore di Commons vengono ricondotti alla pagina File:. Registrare un link non significa acquisire o approvare la fotografia.</p><p id="workspace-link-feedback" role="status" aria-live="polite"></p></form>' +
    '<form id="workspace-upload-form"><h2>Proponi fotografie dal dispositivo</h2><label>Fotografie originali<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required></label><label>Nota facoltativa<textarea name="note" maxlength="1000" rows="2"></textarea></label><button type="submit">Carica nella coda privata</button><p class="workspace-hint">Solo per l’amministratore. Nessun ritaglio: ogni file conserva proporzioni e pixel originali. Limite di 12 MB per file.</p></form></div>' +
    '<h2>Le tue proposte</h2><p id="workspace-acquire-status" role="status" aria-live="polite"></p><div id="workspace-proposals"><p>Caricamento…</p></div>' +
    '<p class="workspace-hint">Ricerca GPT, analisi visiva e generazione SLOP richiedono i comandi espliciti della sezione seguente. Puoi terminare il lotto con le sole foto manuali.</p>' +
    '<p id="workspace-status" role="status" aria-live="polite"></p>';
  root.insertBefore(section, root.firstChild);
  const topicForm = section.querySelector<HTMLFormElement>("#workspace-topic-form")!;
  const notesForm=section.querySelector<HTMLFormElement>("#workspace-lot-notes-form")!;
  const linkForm = section.querySelector<HTMLFormElement>("#workspace-link-form")!;
  const uploadForm = section.querySelector<HTMLFormElement>("#workspace-upload-form")!;
  const select = section.querySelector<HTMLSelectElement>("#workspace-topic-select")!;
  const output = section.querySelector<HTMLElement>("#workspace-proposals")!;
  const status = section.querySelector<HTMLElement>("#workspace-status")!;
  const reportTopic=(message:string)=>{status.textContent=message;section.querySelector<HTMLElement>('#workspace-topic-status')!.textContent=message;};
  let workspace: Workspace = { topics: [], proposals: [] };
  const selected=new Map<string,CommonsFile>();
  let busy = false;
  const updateExplorerButtons=()=>{
    section.querySelector<HTMLButtonElement>('#workspace-commons-add')!.disabled=busy || !selected.size || !select.value;
    section.querySelector<HTMLButtonElement>('#workspace-commons-new-lot')!.disabled=busy || !selected.size;
  };
  const setBusy = (enabled: boolean) => {
    busy = enabled;
    section.querySelectorAll<HTMLButtonElement>("button").forEach(button => button.disabled = enabled);
    topicForm.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea').forEach(field=>field.disabled=enabled);
    select.disabled = enabled || !workspace.topics.length;
    if(!enabled)renderProposals();
  };
  const renderProposals = () => {
    const topic=workspace.topics.find(t=>t.id===select.value);
    notesForm.querySelector<HTMLTextAreaElement>('textarea')!.value=topic?.notes || "";
    notesForm.querySelector<HTMLButtonElement>('button')!.disabled=busy || !topic;
    section.querySelector<HTMLButtonElement>('#workspace-topic-remove')!.disabled=busy || !topic;
    section.querySelector<HTMLElement>('#workspace-lot-state')!.textContent=topic ?
      "Lotto "+(topic.lot_status==="closed"?"chiuso":"aperto")+". "+(topic.notes?"":"Nessuna nota: bastano le foto e il titolo.") : "Seleziona un lotto.";
    const proposals = workspace.proposals.filter(p => p.topic_id === select.value);
    output.innerHTML = proposals.length ? proposals.map(p => {
      const detail = p.kind === "link" && p.source_url
        ? '<a href="' + escape(p.source_url) + '" target="_blank" rel="noopener noreferrer">Apri la fonte originale</a> — '+(p.inbox_id?'acquisita, revisione: '+escape(p.review_status || 'da rivedere'):'da acquisire')
        : 'File nell’archivio privato — revisione: ' + escape(p.review_status || "da rivedere");
      const acquire = p.kind === "link" && p.source_url && !p.inbox_id
        ? (canAcquireCommons(p.source_url)
          ? '<button type="button" data-workspace-acquire="' + escape(p.id) + '">Acquisisci fotografia da Commons</button>'
          : '<p class="workspace-hint">Fonte non supportata per l’acquisizione automatica: scarica l’originale autorizzato e caricalo dal dispositivo.</p>')
        : "";
      const dismiss = p.kind === "link" && !p.inbox_id ? '<button type="button" data-workspace-dismiss="' + escape(p.id) + '">Scarta link</button>' : "";
      return '<article class="workspace-proposal"><strong>' + (p.kind === "link" ? "Link proposto" : "Fotografia caricata") +
        '</strong><p>' + detail + '</p>' + acquire + dismiss + (p.note ? '<p>' + escape(p.note) + '</p>' : "") + '</article>';
    }).join("") : '<p>Nessuna proposta per questo lotto.</p>';
    updateExplorerButtons();
  };
  const refresh = async (prefer?: string) => {
    workspace = await api<Workspace>("/admin/editorial/workspace");
    const current = prefer ?? select.value;
    select.innerHTML = '<option value="">' + (workspace.topics.length ? 'Seleziona un lotto…' : 'Crea prima un lotto') + '</option>' +
      workspace.topics.map(t => '<option value="' + escape(t.id) + '">' + escape(t.title) + (t.lot_status==="closed"?" (chiuso)":"") + '</option>').join("");
    select.value = workspace.topics.some(t => t.id === current) ? current : "";
    select.disabled = busy || !workspace.topics.length;
    renderProposals();
    section.dispatchEvent(new CustomEvent("workspace-updated"));
  };
  select.addEventListener("change", renderProposals);
  section.querySelector<HTMLButtonElement>('#workspace-topic-remove')!.addEventListener('click',async()=>{
    const topic=workspace.topics.find(t=>t.id===select.value);if(!topic || busy)return;
    if(!window.confirm('Rimuovere definitivamente «'+topic.title+'»? Funziona solo se il lotto non ha fotografie, link, ricerche o operazioni AI collegate. Nessuna chiamata a pagamento.'))return;
    setBusy(true);status.textContent='Rimozione del lotto…';
    try{
      await api("/admin/editorial/workspace/topics/"+encodeURIComponent(topic.id)+"/remove",{method:"POST",body:JSON.stringify({title:topic.title})});
      select.value="";await refresh("");reportTopic('Lotto «'+topic.title+'» rimosso: il titolo può essere registrato di nuovo.');
    }catch(error){status.textContent=String(error);}finally{setBusy(false);}
  });
  const createLot=async(title:string,notes:string)=>{
    const result=await api<{id:string;already_exists?:boolean}>("/admin/editorial/workspace/lots",{method:'POST',body:JSON.stringify({title,notes})});
    await refresh(result.id);
    return result;
  };
  topicForm.addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return;
    const data=new FormData(topicForm);
    setBusy(true);reportTopic('Creazione del lotto…');
    try {
      const result=await createLot(String(data.get('title') || ''),String(data.get('notes') || ''));
      topicForm.reset();
      reportTopic(result.already_exists?'Lotto già esistente: selezionato. Le note non sono state modificate.':'Lotto creato e selezionato. Aggiungi le fotografie.');
    } catch (error) { reportTopic(String(error)+'. Il testo resta nel modulo.'); }
    finally { setBusy(false); }
  });
  notesForm.addEventListener("submit",async event=>{
    event.preventDefault();if(busy)return;
    const topic=workspace.topics.find(t=>t.id===select.value);if(!topic)return;
    setBusy(true);status.textContent='Salvataggio delle note…';
    try{
      const result=await api<{changed:boolean}>("/admin/editorial/workspace/lots/"+encodeURIComponent(topic.id)+"/notes",{
        method:"POST",body:JSON.stringify({notes:String(new FormData(notesForm).get("notes") || ""),expected_revision:topic.lot_revision})});
      await refresh(topic.id);status.textContent=result.changed?"Note salvate.":"Nessuna modifica alle note.";
    }catch(error){status.textContent=String(error);}finally{setBusy(false);}
  });
  // Commons explorer: read-only browsing through the Worker; selections become proposals of the chosen lot.
  const explorer=section.querySelector<HTMLElement>("#workspace-commons-explorer")!;
  const results=explorer.querySelector<HTMLElement>("#workspace-commons-results")!;
  const categoryList=explorer.querySelector<HTMLElement>("#workspace-commons-categories")!;
  const explorerStatus=explorer.querySelector<HTMLElement>("#workspace-commons-status")!;
  const more=explorer.querySelector<HTMLButtonElement>("#workspace-commons-more")!;
  let context:{kind:"search"|"category";value:string;next:string|null}|null=null;
  const shown=new Map<string,CommonsFile>();
  const renderFiles=(files:CommonsFile[],append:boolean)=>{
    if(!append){results.innerHTML="";shown.clear();}
    for(const file of files){
      if(shown.has(file.page_url))continue;
      shown.set(file.page_url,file);
      const card=document.createElement("label");
      card.className="workspace-commons-file";
      card.innerHTML='<input type="checkbox" data-commons-select="'+escape(file.page_url)+'"'+(selected.has(file.page_url)?' checked':'')+'>'+
        '<img src="'+escape(file.thumb_url)+'" alt="" loading="lazy" referrerpolicy="no-referrer">'+
        '<span><strong>'+escape(file.title.replace(/^File:/,""))+'</strong><small>'+escape([file.author,file.license,file.width&&file.height?file.width+"×"+file.height:""].filter(Boolean).join(" · "))+'</small></span>'+
        '<a href="'+escape(file.page_url)+'" target="_blank" rel="noopener noreferrer">Apri su Commons</a>';
      results.append(card);
    }
    if(!shown.size)results.innerHTML='<p>Nessuna fotografia JPEG, PNG o WebP in questa pagina.</p>';
  };
  const load=async(next:{kind:"search"|"category";value:string},append=false)=>{
    if(busy)return;
    const params=new URLSearchParams(next.kind==="search"?{q:next.value}:{name:next.value});
    if(append && context?.next)params.set(next.kind==="search"?"offset":"continue",context.next);
    explorerStatus.textContent="Caricamento da Commons…";more.disabled=true;
    try{
      const page=await api<CommonsPage>("/admin/editorial/workspace/commons/"+next.kind+"?"+params);
      context={...next,next:page.next};
      renderFiles(page.files,append);
      if(!append)categoryList.innerHTML=page.categories.length?'<p class="workspace-hint">'+(next.kind==="search"?"Categorie trovate":"Sottocategorie")+':</p>'+
        page.categories.map(c=>'<button type="button" data-commons-category="'+escape(c)+'">'+escape(c.replace(/^Category:/,""))+'</button>').join(""):"";
      explorer.querySelector<HTMLElement>("#workspace-commons-context")!.textContent=next.kind==="search"?"Risultati per «"+next.value+"»":"Categoria: "+next.value.replace(/^Category:/,"");
      more.hidden=!page.next;more.disabled=false;
      explorerStatus.textContent=selected.size+" fotografie selezionate.";
    }catch(error){explorerStatus.textContent="Commons non raggiungibile: "+String(error);more.disabled=false;}
  };
  explorer.querySelector<HTMLFormElement>("#workspace-commons-search")!.addEventListener("submit",event=>{
    event.preventDefault();
    void load({kind:"search",value:String(new FormData(event.target as HTMLFormElement).get("q") || "").trim()});
  });
  more.addEventListener("click",()=>{if(context)void load(context,true);});
  explorer.addEventListener("click",event=>{
    const category=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-commons-category]");
    if(category)void load({kind:"category",value:category.dataset.commonsCategory || ""});
  });
  explorer.addEventListener("change",event=>{
    const box=(event.target as HTMLElement).closest<HTMLInputElement>("[data-commons-select]");
    if(!box)return;
    const file=shown.get(box.dataset.commonsSelect || "");
    if(file && box.checked)selected.set(file.page_url,file);else selected.delete(box.dataset.commonsSelect || "");
    explorerStatus.textContent=selected.size+" fotografie selezionate.";
    updateExplorerButtons();
  });
  const addSelection=async(topicId:string)=>{
    const files=[...selected.values()];
    const acquire=explorer.querySelector<HTMLInputElement>("#workspace-commons-acquire")!.checked;
    let saved=0,present=0,acquired=0,failed=0;
    for(let i=0;i<files.length;i+=20){
      const result=await api<{saved:number;already_present:number}>("/admin/editorial/workspace/links/batch",{
        method:"POST",body:JSON.stringify({topic_id:topicId,source_urls:files.slice(i,i+20).map(f=>f.page_url)})});
      saved+=result.saved;present+=result.already_present;
    }
    await refresh(topicId);
    if(acquire){
      const urls=new Set(files.map(f=>f.page_url));
      const pending=workspace.proposals.filter(p=>p.topic_id===topicId && p.kind==="link" && !p.inbox_id && p.source_url && urls.has(p.source_url));
      for(const [index,proposal] of pending.entries()){
        explorerStatus.textContent="Acquisizione "+(index+1)+" di "+pending.length+"…";
        try{await api("/admin/editorial/intelligence/acquire",{method:"POST",body:JSON.stringify({proposal_id:proposal.id})});acquired++;}
        catch{failed++;}
      }
      await refresh(topicId);
      document.querySelector<HTMLButtonElement>("#refresh-review")?.click();
    }
    selected.clear();
    results.querySelectorAll<HTMLInputElement>("[data-commons-select]").forEach(box=>box.checked=false);
    explorerStatus.textContent=saved+" link aggiunti, "+present+" già presenti"+(acquire?"; "+acquired+" fotografie acquisite"+(failed?", "+failed+" non acquisite (restano tra le proposte)":""):"")+".";
    status.textContent=explorerStatus.textContent;
  };
  explorer.querySelector<HTMLButtonElement>("#workspace-commons-add")!.addEventListener("click",async()=>{
    if(busy || !select.value || !selected.size)return;
    setBusy(true);
    try{await addSelection(select.value);}catch(error){explorerStatus.textContent="Aggiunta non completata: "+String(error);}
    finally{setBusy(false);}
  });
  explorer.querySelector<HTMLButtonElement>("#workspace-commons-new-lot")!.addEventListener("click",async()=>{
    if(busy || !selected.size)return;
    const proposal=proposeLotTitle([...selected.values()],context?.value || "");
    const title=window.prompt("Titolo del nuovo lotto (proposto dalle categorie Commons, modificabile):",proposal);
    if(title===null)return;
    setBusy(true);
    try{
      const lot=await createLot(title,"");
      reportTopic(lot.already_exists?"Lotto già esistente: le foto vengono aggiunte a quello.":"Lotto creato dalla selezione.");
      await addSelection(lot.id);
    }catch(error){explorerStatus.textContent="Lotto non creato: "+String(error);}
    finally{setBusy(false);}
  });
  section.addEventListener("click",async event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-workspace-dismiss]");
    if(!button || busy)return;
    if(!window.confirm("Scartare questo link? Resta nello storico ma non compare più tra le proposte."))return;
    const message=section.querySelector<HTMLElement>("#workspace-acquire-status")!;
    setBusy(true);
    try{
      await api("/admin/editorial/workspace/proposals/"+encodeURIComponent(button.dataset.workspaceDismiss || "")+"/dismiss",{method:"POST",body:"{}"});
      await refresh(select.value);message.textContent="Link scartato.";
    }catch(error){message.textContent="Scarto non riuscito: "+String(error);}
    finally{setBusy(false);}
  });
  linkForm.addEventListener("submit", async event => {
    event.preventDefault(); if (busy) return;
    const feedback=section.querySelector<HTMLElement>("#workspace-link-feedback")!;
    if (!select.value) { feedback.textContent="Seleziona prima un argomento."; return; }
    const data=new FormData(linkForm);
    let urls:string[];
    try { urls=parseLinkLines(String(data.get("source_urls") || "")); }
    catch(error) { feedback.textContent=String(error); return; }
    setBusy(true);
    feedback.textContent="Registrazione di "+urls.length+" link in corso…";
    try {
      const result=await api<{saved:number;already_present:number}>("/admin/editorial/workspace/links/batch",{
        method:"POST",body:JSON.stringify({topic_id:select.value,source_urls:urls,note:String(data.get("note") || "")})
      });
      await refresh(select.value);linkForm.reset();
      feedback.textContent=result.saved+" link registrati; "+result.already_present+
        " già presenti. Non ancora acquisiti o approvati: usa «Acquisisci» accanto ai link Commons.";
      status.textContent=feedback.textContent;
    }catch(error){feedback.textContent="Registrazione non completata: "+String(error)+". I link restano nel campo.";}
    finally{setBusy(false);}
  });
  section.addEventListener("click",async event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-workspace-acquire]");
    if(!button || busy)return;
    const message=section.querySelector<HTMLElement>("#workspace-acquire-status")!;
    const proposalId=button.dataset.workspaceAcquire || "";
    const proposal=workspace.proposals.find(p=>p.id===proposalId && p.topic_id===select.value);
    if(!proposal || !proposal.source_url || !canAcquireCommons(proposal.source_url)){
      message.textContent="L’acquisizione automatica supporta soltanto file Wikimedia Commons.";return;
    }
    setBusy(true);message.textContent="Acquisizione della fotografia in corso…";
    try{
      const result=await api<{already_acquired?:boolean}>("/admin/editorial/intelligence/acquire",{
        method:"POST",body:JSON.stringify({proposal_id:proposalId})
      });
      await refresh(select.value);
      message.textContent=result.already_acquired?
        "Fotografia già acquisita: controlla la Revisione.":
        "Fotografia acquisita in quarantena. Apri Revisione per valutarla.";
      document.querySelector<HTMLButtonElement>("#refresh-review")?.click();
    }catch(error){
      message.textContent="Acquisizione non riuscita: "+String(error)+
        ". La proposta rimane registrata; verifica il link Commons e i diritti.";
    }finally{setBusy(false);}
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
  section.addEventListener("workspace-request-refresh",()=>void refresh(select.value).catch(error=>{
    section.querySelector<HTMLElement>("#workspace-acquire-status")!.textContent=String(error);
  }));
  try { await refresh(); } catch (error) {
    output.textContent = "Workspace non disponibile: verificare le migrazioni D1 fino alla 0024. " + String(error);
    setBusy(true);
  }
}
