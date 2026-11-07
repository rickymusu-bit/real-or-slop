import { api, content, escape } from "./main";
import { visualProfilePreview } from "./editorial-profile-preview.v1.0.0";
import "./editorial-intelligence.v1.0.0.css";

interface Suggestion {id:string;title:string;rationale:string;status:string;description?:string;novelty?:number|null;neighbors_json?:string;screening_reason?:string;screening_status?:string|null;embedding_status?:string}
interface Proposal {id:string;topic_id:string;kind:string;source_url:string|null;inbox_id:string|null}
interface TopicCount {origin:string;status:string;n:number}
interface Ranked {id:string;sha256:string;tags:string[];score:number;reason:string;has_profile?:boolean;relevance?:{match:string;reason:string}|null}
interface Bank {slot:number;prompt:string;variant:string}
interface Panel {
  enabled:boolean;generation_enabled:boolean;manual_stage_complete:boolean;topic_discovery_enabled:boolean; cost_per_text_call:string|null;cost_per_image_call:string|null;
  suggestions:Suggestion[];prompts:Bank[];topic_counts:TopicCount[];ranked_real:Ranked[];
  preferences:{real:{observations:number;approved:number;rejected:number};slop:{observations:number;approved:number;rejected:number}};
  reviewed_unprofiled:Array<{id:string;sha256:string;origin:string;status:string}>;
  searches:Array<{topic_id:string;status:string;candidates:number;created_at:string;diagnostics_json?:string}>;
  formats:Array<{origin:string;published:number;format:string;n:number}>;
  jobs:Array<{kind:string;status:string;topic_id:string|null;created_at:string}>;
}
const base="/admin/editorial/intelligence";
function activeTopic():string {
  return document.querySelector<HTMLSelectElement>("#workspace-topic-select")?.value || "";
}
export async function mountEditorialIntelligence() {
  const parent=content(),workspace=parent.querySelector<HTMLElement>("#editorial-workspace");
  if(!workspace)return;
  const section=document.createElement("section");
  section.id="editorial-intelligence";
  section.className="editorial-intelligence";
  section.innerHTML =
    '<div class="eyebrow">SCOPERTA E APPRENDIMENTO</div><h2>Esplora, valuta, affina.</h2>' +
    '<p>Le tre componenti imparano dai tuoi giudizi, ma solo tu avvii ricerche, analisi o generazioni a pagamento. Le immagini non vengono pubblicate automaticamente.</p>' +
    '<div id="intel-overview" class="intel-overview">Caricamento...</div>' +
    '<div class="intel-columns"><section><h3>Topic Discovery</h3><p>Facoltativo: per ora puoi scegliere personalmente tutti gli argomenti. Nessun suggerimento viene avviato automaticamente.</p>' +
    '<div class="intel-discovery-control"><strong id="intel-discovery-state">Disattivato</strong><button type="button" data-intel="toggle-discovery" aria-pressed="false">Attiva Topic Discovery</button></div>' +
    '<button data-intel="suggest">Suggerisci 5 argomenti</button><div id="intel-suggestions"></div></section>' +
    '<section><h3>Fotografie REAL</h3><p>Prima proponi le tue foto nella sezione precedente. Puoi acquisire link Commons o richiedere una ricerca limitata.</p>' +
    '<div id="intel-links"></div><p id="intel-manual-state"></p><div class="intel-buttons"><button data-intel="manual-finished">Ho finito di proporre foto</button><button data-intel="manual-skip">Continua senza foto manuali</button></div><label>Numero di nuove candidate <select id="intel-limit"><option value="3">3</option><option value="5" selected>5</option><option value="10">10</option></select></label><button data-intel="search">Cerca altre REAL con GPT</button><div id="intel-ranking"></div></section>' +
    '<section><h3>Generazione SLOP</h3><p>Il modello usa solo l’argomento e lo storico SLOP congelato: non riceve fotografie REAL del ciclo.</p><button data-intel="plan">Prepara prompt indipendenti</button><div id="intel-prompts"></div></section></div>' +
    '<details><summary>Formati REAL e SLOP</summary><p>Confronta le proporzioni prima di pubblicare: differenze sistematiche possono suggerire la risposta. I formati sconosciuti restano da verificare.</p><div id="intel-formats"></div></details>'+
    '<details class="intel-audit"><summary>Storico delle operazioni</summary><div id="intel-history"></div></details>' +
    '<p id="intel-status" role="status" aria-live="polite"></p>';
  workspace.insertAdjacentElement("afterend",section);
  const status=section.querySelector<HTMLElement>("#intel-status")!;
  const overview=section.querySelector<HTMLElement>("#intel-overview")!;
  const suggestions=section.querySelector<HTMLElement>("#intel-suggestions")!;
  const links=section.querySelector<HTMLElement>("#intel-links")!;
  const ranking=section.querySelector<HTMLElement>("#intel-ranking")!;
  const prompts=section.querySelector<HTMLElement>("#intel-prompts")!;
  const history=section.querySelector<HTMLElement>("#intel-history")!;
  let panel:Panel|null=null, busy=false, refreshSequence=0;
  const busyState=(next:boolean)=>{
    busy=next;
    section.querySelectorAll<HTMLButtonElement>("[data-intel]").forEach(button=>{
      button.disabled=next || (!panel?.enabled && button.dataset.intel!=="acquire" && button.dataset.intel!=="accept" &&
        button.dataset.intel!=="reject" && button.dataset.intel!=="defer" && button.dataset.intel!=="toggle-discovery" && !button.dataset.intel?.startsWith("manual-")) ||
        (button.dataset.intel==="search" && !panel?.manual_stage_complete) ||
        (button.dataset.intel==="accept" && button.dataset.screened==="0") ||
        (button.dataset.intel==="suggest" && !panel?.topic_discovery_enabled) ||
        (button.dataset.intel==="generate" && (!panel?.generation_enabled || button.dataset.capacity==="0"));
    });
  };
  async function refresh() {
    const sequence=++refreshSequence,topic=activeTopic();
    const [state,workspaceData]=await Promise.all([
      api<Panel>(base+(topic?"?topic_id="+encodeURIComponent(topic):"")),
      api<{proposals:Proposal[]}>("/admin/editorial/workspace")
    ]);
    if(sequence!==refreshSequence || topic!==activeTopic() || !section.isConnected)return;
    const expanded=new Set([...section.querySelectorAll<HTMLDetailsElement>('details[open]')]
      .map(details=>details.querySelector('summary')?.textContent));
    panel=state;
    const approvedReal=state.topic_counts.filter(x=>x.origin==="REAL"&&x.status==="approved")
      .reduce((n,x)=>n+x.n,0);
    const slopReady=state.topic_counts.filter(x=>x.origin==="AI"&&["approved","pending"].includes(x.status))
      .reduce((n,x)=>n+x.n,0);
    const deficit=Math.max(0,approvedReal-slopReady);
    overview.innerHTML =
      '<div><strong>Argomento attivo</strong><span>'+(topic?"Selezionato nella sezione precedente":"Nessun argomento selezionato")+'</span></div>' +
      '<div><strong>Preferenze REAL</strong><span>'+state.preferences.real.observations+' giudizi con profilo</span></div>' +
      '<div><strong>Preferenze SLOP</strong><span>'+state.preferences.slop.observations+' giudizi con profilo</span></div>' +
      '<div><strong>SLOP mancanti</strong><span>'+deficit+' sulla base dei voti correnti</span></div>';
    const discovery=section.querySelector<HTMLButtonElement>('[data-intel="toggle-discovery"]');
    const discoveryStatus=section.querySelector<HTMLElement>("#intel-discovery-state");
    if(discovery){
      discovery.textContent=state.topic_discovery_enabled?"Disattiva Topic Discovery":"Attiva Topic Discovery";
      discovery.setAttribute("aria-pressed",String(state.topic_discovery_enabled));
    }
    if(discoveryStatus) discoveryStatus.textContent=state.topic_discovery_enabled?"Attivo (solo su richiesta)":"Disattivato";
    const buttonLabel=state.enabled?"":" — IA non configurata";
    suggestions.innerHTML=state.topic_discovery_enabled ? state.suggestions.filter(s=>s.status==="suggested"||s.status==="deferred").slice(0,8)
      .map(s=>'<article><strong>'+escape(s.title)+'</strong><p>'+escape(s.description || s.rationale)+'</p><p>'+escape(s.screening_reason || s.rationale)+'</p>'+
        '<p>Indicizzazione: '+escape(s.embedding_status || 'non disponibile')+'; novità: '+(typeof s.novelty==='number'?Math.round(s.novelty*100)+'% distanza dal vicino':'non misurata')+'</p>'+
        '<p>Vicini: '+escape((()=>{try{return (JSON.parse(s.neighbors_json || '[]') as Array<{title:string}>).map(n=>n.title).join('; ') || 'nessuno compatibile';}catch{return 'non disponibili';}})())+'</p><div class="intel-buttons">'+
        '<button data-intel="accept" data-id="'+escape(s.id)+'" data-screened="'+(!s.screening_status||s.screening_status==='ready'?'1':'0')+'">Esplora</button>'+
        '<button data-intel="defer" data-id="'+escape(s.id)+'">Rimanda</button>'+
        '<button data-intel="reject" data-id="'+escape(s.id)+'">Scarta</button></div></article>').join("") ||
      '<p>Nessun suggerimento nuovo. Generarli richiede un comando esplicito.</p>' :
      '<p>Topic Discovery è spento. Continua a popolare l’archivio scegliendo i tuoi argomenti: nulla viene generato automaticamente.</p>';
    const submitted=workspaceData.proposals.filter(p=>p.topic_id===topic && p.kind==="link" && !p.inbox_id);
    links.innerHTML=submitted.length ? '<h4>Link da acquisire</h4>'+
      submitted.map(p=>'<div class="intel-proposal"><span>'+escape(p.source_url || "")+'</span>'+(/^https:\/\/(commons|upload|thumb)\.wikimedia\.org\//.test(p.source_url || '')?'<button data-intel="acquire" data-id="'+escape(p.id)+'">Acquisisci da Commons</button>':'<p>Apri la fonte e carica il file dal dispositivo. L’acquisizione automatica supporta Commons.</p>')+'</div>').join("")
      : '<p>Nessun link proposto per questo argomento.</p>';
    section.querySelector<HTMLElement>('#intel-manual-state')!.textContent=state.manual_stage_complete?'Fase manuale completata. La ricerca resta facoltativa.':'Proponi le tue foto, poi conferma di aver terminato oppure continua senza foto manuali.';
    ranking.innerHTML='<details><summary>REAL in coda: ordine suggerito</summary>'+
      (state.ranked_real.length?state.ranked_real.slice(0,15).map((r,i)=>
        '<article><img class="intel-ranked-preview" loading="lazy" alt="Fotografia REAL candidata" src="/api/admin/review-inbox/'+encodeURIComponent(r.id)+'/image">'+
        '<span>'+Number(i+1)+'. '+escape(r.id)+' — '+Math.round(r.score*100)+'% stima editoriale</span>'+
        '<p>'+escape(r.reason)+'</p><p>Pertinenza al tema: '+escape(r.relevance ? r.relevance.match+' — '+r.relevance.reason : 'non valutata')+'</p>'+
        (r.has_profile?'<button data-intel="relevance" data-id="'+escape(r.id)+'" data-sha="'+escape(r.sha256)+'">Confronta con argomento</button>':'')+'<button data-intel="profile" data-id="'+escape(r.id)+'" data-sha="'+escape(r.sha256)+'">Analizza i pixel</button></article>'
      ).join(""):'<p>La coda REAL è vuota.</p>')+'</details>'+ 
      '<details><summary>Foto già votate senza profilo (apprendimento)</summary>'+ 
      (state.reviewed_unprofiled.length ? state.reviewed_unprofiled.slice(0,25).map(photo => 
        '<article>'+escape(photo.origin)+' — '+escape(photo.status)+' — '+escape(photo.id)+ 
        '<button data-intel="profile" data-id="'+escape(photo.id)+'" data-sha="'+escape(photo.sha256)+'">Analizza questi pixel</button></article>').join('') 
        :'<p>Tutti i voti recenti disponibili hanno un profilo.</p>')+'</details>';
    prompts.innerHTML=(state.prompts.length?
      '<p>'+state.prompts.length+' prompt congelati. Ogni generazione richiede un comando separato.</p>'+
      state.prompts.map(p=>'<article><strong>Variante '+Number(p.slot+1)+' — '+escape(p.variant)+'</strong>'+
        '<p>'+escape(p.prompt)+'</p><button data-intel="generate" data-slot="'+Number(p.slot)+'" data-capacity="'+(deficit>0?'1':'0')+'"'+(deficit===0?' disabled':'')+
        '>Genera questa SLOP</button></article>').join("")
      : '<p>Nessun prompt congelato per questo argomento.</p>');
    const labels:Record<string,string>={square:"quadrate",landscape:"orizzontali",portrait:"verticali",panorama:"panoramiche",unknown:"sconosciute"};
    section.querySelector<HTMLElement>("#intel-formats")!.textContent=state.formats.map(f=>(f.origin==="AI"?"SLOP":"REAL")+" "+(f.published?"pubblicate":"private")+": "+f.n+" "+(labels[f.format] || f.format)).join(" · ") || "Nessuna fotografia registrata.";
    history.innerHTML=(state.searches.length?state.searches.slice(0,10).map(s=>'<p>Ricerca REAL: '+escape(s.status)+' — '+s.candidates+' candidate — '+escape((()=>{try{const d=JSON.parse(s.diagnostics_json || '{}') as {errors?:unknown[];skipped?:number};return d.errors?.length?d.errors.length+' problemi provider/acquisizione; '+(d.skipped || 0)+' file esclusi':'nessun errore segnalato';}catch{return 'diagnostica non disponibile';}})())+' — '+escape(s.created_at)+'</p>').join(""):"")+
      (state.jobs.length ? state.jobs.slice(0,20).map(j=>'<p>'+escape(j.kind)+' — '+
      escape(j.status)+' — '+escape(j.created_at)+'</p>').join("") : '<p>Nessuna chiamata registrata.</p>');
    const hint=section.querySelector<HTMLButtonElement>('[data-intel="suggest"]');
    if(hint)hint.title="Costo prenotato per chiamata testo: "+String(state.cost_per_text_call || "da configurare")+buttonLabel;
    section.querySelectorAll<HTMLDetailsElement>('details').forEach(details=>{
      if(expanded.has(details.querySelector('summary')?.textContent))details.open=true;
    });
    busyState(busy);
  }
  section.addEventListener("click",async event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("button[data-intel]");
    if(!button || busy || button.disabled)return;
    const action=button.dataset.intel||"",topicId=activeTopic();
    const paid=["suggest","search","plan","profile","relevance","generate"].includes(action);
    if(!topicId && action!=="suggest" && !["accept","reject","defer","toggle-discovery"].includes(action)){
      status.textContent="Registra o seleziona prima un argomento.";return;
    }
    if(paid){
      const cost=action==="generate"?panel?.cost_per_image_call:panel?.cost_per_text_call;
      const approved=window.confirm("Confermi questa operazione? Può consumare credito API. Prenotazione massima configurata: "+
        (cost || "non disponibile")+" USD. "+(action==="suggest"?"Fino a 2 chiamate testo e 5 embedding separati entro i budget dedicati. ":"")+"Nessuna pubblicazione automatica.");
      if(!approved)return;
    }
    busyState(true);status.textContent="Operazione in corso, nessun nuovo invio automatico...";
    try {
      let path="",payload:Record<string,unknown>={};
      if(action.startsWith("manual-")){
        path="/admin/editorial/workspace/manual-stage";payload={topic_id:topicId,decision:action==="manual-finished"?"finished":"skip"};
      } else if(action==="toggle-discovery"){
        path=base+"/topic-discovery/settings";
        payload={enabled:!panel?.topic_discovery_enabled};
      } else if(["accept","reject","defer"].includes(action)){
        path=base+"/suggestions/"+encodeURIComponent(button.dataset.id||"")+"/decision";
        payload={decision:action==="accept"?"accepted":action==="reject"?"rejected":"deferred"};
      } else if(action==="acquire"){path=base+"/acquire";payload={proposal_id:button.dataset.id};}
      else if(action==="suggest"){path=base+"/suggest";payload={operation_id:crypto.randomUUID()};}
      else if(action==="search"){path=base+"/search";payload={topic_id:topicId,limit:Number(section.querySelector<HTMLSelectElement>("#intel-limit")!.value),
        operation_id:crypto.randomUUID()};}
      else if(action==="relevance"){path=base+"/relevance";payload={inbox_id:button.dataset.id,sha256:button.dataset.sha};}
      else if(action==="profile"){path=base+"/profile";status.textContent="Preparo una miniatura proporzionale dalla fotografia originale...";
        payload={inbox_id:button.dataset.id,sha256:button.dataset.sha,
          preview_base64:await visualProfilePreview(button.dataset.id || "")};}
      else if(action==="plan"){path=base+"/slop/plan";payload={topic_id:topicId};}
      else if(action==="generate"){path=base+"/slop/generate";payload={topic_id:topicId,slot:Number(button.dataset.slot)};}
      if(!path)throw Error("Comando sconosciuto");
      const result=await api<Record<string,unknown>>(path,{method:"POST",body:JSON.stringify(payload)});
      if(action==="accept"){window.location.reload();return;}
      status.textContent=action==="toggle-discovery"
        ? (result.topic_discovery_enabled ? "Topic Discovery attivo. I suggerimenti partiranno soltanto se li richiedi." :
          "Topic Discovery disattivato. Puoi continuare a inserire argomenti e gestire REAL/SLOP.")
        : "Operazione registrata: "+JSON.stringify(result).slice(0,700);
      await refresh();
      if(action==="acquire"||action==="search"||action==="generate")
        document.querySelector<HTMLButtonElement>("#refresh-review")?.click();
    } catch(error) {
      status.textContent=String(error);
    } finally{busyState(false);}
  });
  const selector=workspace.querySelector<HTMLSelectElement>("#workspace-topic-select");
  selector?.addEventListener("change",()=>void refresh().catch(error=>{status.textContent=String(error);}));
  workspace.addEventListener("workspace-updated",()=>void refresh().catch(error=>{status.textContent=String(error);}));
  try{await refresh();}catch(error){status.textContent="Workspace non disponibile: verificare la migrazione 0020. "+String(error);busyState(true);}
}
