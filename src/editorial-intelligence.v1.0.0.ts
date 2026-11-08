import { api, content, escape } from "./main";
import { visualProfilePreview } from "./editorial-profile-preview.v1.0.0";
import "./editorial-intelligence.v1.0.0.css";

interface Suggestion {id:string;title:string;rationale:string;status:string;description?:string;novelty?:number|null;neighbors_json?:string;screening_reason?:string;screening_status?:string|null;embedding_status?:string;assessment_status?:string|null;assessment_json?:string|null;review_json?:string|null}
interface Proposal {id:string;topic_id:string;kind:string;source_url:string|null;inbox_id:string|null}
interface TopicCount {origin:string;status:string;n:number}
interface Ranked {id:string;sha256:string;tags:string[];score:number;reason:string;has_profile?:boolean;relevance?:{match:string;reason:string}|null}
interface Bank {slot:number;prompt:string;variant:string}
interface PreferenceSnapshot {id:string;origin:string;learner_version:string;observations:number;approved:number;rejected:number;created_at:string}
interface Budget {period_id:number|null;limit_usd:number|null;used_usd:number;remaining_usd:number|null;lifetime_usd:number;reset_amount_usd:number|null;history:Array<{id:number;baseline_usd:number;allowance_usd:number;created_at:string}>}
interface Panel {
  budget:Budget;
  enabled:boolean;generation_enabled:boolean;manual_stage_complete:boolean;topic_discovery_enabled:boolean; cost_per_text_call:string|null;cost_per_image_call:string|null;
  suggestions:Suggestion[];prompts:Bank[];topic_counts:TopicCount[];ranked_real:Ranked[];
  preferences:{real:{observations:number;approved:number;rejected:number;snapshot_id:string};slop:{observations:number;approved:number;rejected:number;snapshot_id:string}};
  reviewed_unprofiled:Array<{id:string;sha256:string;origin:string;status:string}>;
  searches:Array<{topic_id:string;status:string;candidates:number;created_at:string;diagnostics_json?:string}>;
  formats:Array<{origin:string;published:number;format:string;n:number}>;
  format_unknown:Array<{id:string;origin:string;sha256:string;title:string|null;diagnostic:string}>;
  jobs:Array<{kind:string;status:string;topic_id:string|null;created_at:string}>;
  topic_memory:{topics:number;indexed_topics:number;proposals:number;owner_reviewed_proposals:number;quality_validated:false;coverage_validated:false};
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
    '<section id="intel-budget" class="intel-budget" aria-labelledby="intel-budget-heading"><h3 id="intel-budget-heading">Budget operazioni AI</h3><p id="intel-budget-balance"></p><p>Testo, immagini ed embedding condividono questo limite. Le cifre sono prenotazioni prudenziali, non il saldo o la fattura OpenAI.</p><button type="button" data-intel="reset-budget" disabled>Reimposta budget</button><details><summary>Storico dei reset</summary><div id="intel-budget-history"></div></details></section>'+
    '<div class="intel-columns"><section id="intel-topic-discovery"><h3>Topic Discovery</h3><p>Prima argomenti comprensibili e fotograficamente plausibili, poi confronto con lo storico. I vicini aiutano a valutare ripetizioni; una zona vuota o una grande distanza non dimostrano utilità.</p><p id="intel-topic-memory"></p><p>Qualità e copertura non validate: servono un corpus rappresentativo e le tue valutazioni. Puoi continuare a popolare la memoria con Discovery spento. Se non condividi la stima del modello, puoi registrare personalmente il tema nel modulo precedente.</p>' +
    '<div class="intel-discovery-control"><strong id="intel-discovery-state">Disattivato</strong><button type="button" data-intel="toggle-discovery" aria-pressed="false">Attiva Topic Discovery</button></div>' +
    '<button data-intel="suggest">Suggerisci 5 argomenti</button><div id="intel-suggestions"></div></section>' +
    '<section><h3>Fotografie REAL</h3><p>Prima proponi le tue foto nella sezione precedente. Il pianificatore ricava query per parole chiave dal titolo e dalle preferenze REAL. La descrizione semantica non viene aggiunta automaticamente alla ricerca.</p>' +
    '<div id="intel-links"></div><p id="intel-acquisition-feedback" role="status" aria-live="polite"></p><p id="intel-manual-state"></p><div class="intel-buttons"><button data-intel="manual-finished">Ho finito di proporre foto</button><button data-intel="manual-skip">Continua senza foto manuali</button></div><label>Numero di nuove candidate <select id="intel-limit"><option value="3">3</option><option value="5" selected>5</option><option value="10">10</option></select></label><button data-intel="search">Cerca altre REAL con GPT</button><div id="intel-ranking"></div></section>' +
    '<section><h3>Generazione SLOP</h3><p>Prompt indipendenti dal solo titolo e dai feedback storici SLOP congelati. La descrizione semantica non impone una scena; fotografie e giudizi REAL del ciclo restano esclusi.</p><button data-intel="plan">Prepara prompt indipendenti</button><div id="intel-prompts"></div></section></div>' +
    '<details id="intel-preference-audit"><summary>Storico delle preferenze</summary><p>I voti e i profili producono stati immutabili separati per REAL e SLOP. Questi conteggi descrivono le preferenze osservate, non misurano la qualità dei suggerimenti.</p><p id="intel-preference-current"></p><label>Preferenze da mostrare<select id="intel-preference-origin"><option value="all">REAL e SLOP</option><option value="REAL">REAL</option><option value="AI">SLOP</option></select></label><button data-intel="snapshot-history">Carica storico</button><div id="intel-preference-snapshots"></div><pre id="intel-snapshot-detail" class="intel-snapshot-detail" hidden></pre></details>'+
    '<details id="intel-format-audit"><summary>Formati REAL e SLOP</summary><p>Confronta le proporzioni prima di pubblicare: differenze sistematiche possono suggerire la risposta. La lettura EXIF conserva gli originali e non usa modelli AI. Metadati non risolvibili restano sconosciuti.</p><div id="intel-formats"></div><div id="intel-format-unknown"></div></details>'+
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
  let snapshotRows:PreferenceSnapshot[]=[],snapshotOrigin='all';
  const loadSnapshots=async(reset=false)=>{
    const origin=section.querySelector<HTMLSelectElement>('#intel-preference-origin')!.value;
    if(reset || origin!==snapshotOrigin)snapshotRows=[];
    snapshotOrigin=origin;
    const result=await api<{snapshots:PreferenceSnapshot[];total:number}>(base+'/preferences/snapshots?'+new URLSearchParams({origin,offset:String(snapshotRows.length)}));
    snapshotRows.push(...result.snapshots);
    section.querySelector<HTMLElement>('#intel-preference-snapshots')!.innerHTML=snapshotRows.map(s=>
      '<article><strong>'+(s.origin==='AI'?'SLOP':'REAL')+' · versione '+escape(s.learner_version)+'</strong><p>'+s.observations+' giudizi usati: '+s.approved+' approvati, '+s.rejected+' rifiutati.</p><p>'+escape(s.created_at)+'</p><button data-intel="snapshot-detail" data-id="'+escape(s.id)+'">Apri stato '+escape(s.id.slice(0,8))+'</button></article>').join('') || '<p>Nessuno stato archiviato.</p>';
    const button=section.querySelector<HTMLButtonElement>('[data-intel="snapshot-history"]')!;
    button.textContent=snapshotRows.length<result.total?'Carica altri stati':'Aggiorna storico';
    button.dataset.reset=snapshotRows.length<result.total?'0':'1';
  };
  const busyState=(next:boolean)=>{
    busy=next;
    section.querySelectorAll<HTMLButtonElement>("[data-intel]").forEach(button=>{
      button.disabled=next || (!panel?.enabled && button.dataset.intel!=="acquire" && button.dataset.intel!=="accept" &&
        button.dataset.intel!=="reject" && button.dataset.intel!=="defer" && button.dataset.intel!=="toggle-discovery" && !["reset-budget","geometry","snapshot-history","snapshot-detail"].includes(button.dataset.intel || "") && !button.dataset.intel?.startsWith("manual-")) ||
        (button.dataset.intel==='reset-budget' && panel?.budget.reset_amount_usd==null) ||
        (button.dataset.intel==="search" && !panel?.manual_stage_complete) ||
        (button.dataset.intel==="accept" && button.dataset.screened==="0") ||
        (button.dataset.intel==="suggest" && !panel?.topic_discovery_enabled) ||
        (button.dataset.intel==="generate" && (!panel?.generation_enabled || button.dataset.capacity==="0"));
    });
    section.querySelector<HTMLSelectElement>('#intel-preference-origin')!.disabled=next;
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
    const money=(value:number|null)=>value===null?'non configurato':new Intl.NumberFormat('it-IT',{style:'currency',currency:'USD',maximumFractionDigits:6}).format(value);
    const budget=state.budget;
    section.querySelector<HTMLElement>('#intel-budget-balance')!.textContent='Disponibile: '+money(budget.remaining_usd)+' · Prenotato nel periodo: '+money(budget.used_usd)+' · Limite: '+money(budget.limit_usd)+'. Totale storico prenotato: '+money(budget.lifetime_usd)+'.';
    section.querySelector<HTMLButtonElement>('[data-intel="reset-budget"]')!.textContent=budget.reset_amount_usd===null?'Reset non configurato':'Reimposta budget a '+money(budget.reset_amount_usd);
    section.querySelector<HTMLElement>('#intel-budget-history')!.innerHTML=budget.history.length?budget.history.map(h=>'<p>Periodo '+h.id+' · '+escape(h.created_at)+' · disponibilità iniziale '+escape(money(h.allowance_usd))+' · storico precedente '+escape(money(h.baseline_usd))+'</p>').join(''):'<p>Nessun reset registrato.</p>';
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
    const memory=state.topic_memory;
    section.querySelector<HTMLElement>('#intel-preference-current')!.textContent='Stati correnti: REAL '+state.preferences.real.snapshot_id.slice(0,8)+'; SLOP '+state.preferences.slop.snapshot_id.slice(0,8)+'.';
    section.querySelector<HTMLElement>('#intel-topic-memory')!.textContent='Memoria in popolamento: '+memory.topics+' argomenti registrati, '+memory.indexed_topics+' indicizzati; '+memory.owner_reviewed_proposals+' proposte valutate da te su '+memory.proposals+'. Il numero di vettori non certifica la qualità.';
    const buttonLabel=state.enabled?"":" — IA non configurata";
    suggestions.innerHTML=state.topic_discovery_enabled ? state.suggestions.filter(s=>s.status==="suggested"||s.status==="deferred").slice(0,8)
      .map(s=>'<article><strong>'+escape(s.title)+'</strong><p>'+escape(s.description || s.rationale)+'</p><p>'+escape(s.screening_reason || s.rationale)+'</p>'+
        '<p>Stima del modello: '+escape(s.assessment_status==='eligible'?'ammissibile, da valutare':s.assessment_status==='ineligible'?'non ammissibile':s.assessment_status?'verifica incompleta':'proposta precedente senza questa verifica')+' — '+escape((()=>{try{const a=JSON.parse(s.review_json || s.assessment_json || '{}') as {reason?:string};return a.reason || 'nessuna valutazione strutturata disponibile';}catch{return 'valutazione non disponibile';}})())+'</p>'+
        '<p>Indicizzazione: '+escape(s.embedding_status || 'non disponibile')+'; distanza dal vicino storico: '+(typeof s.novelty==='number'&&Number.isFinite(s.novelty)?s.novelty.toFixed(3)+' (solo confronto semantico)':'non disponibile')+'</p>'+
        '<p>Vicini storici: '+escape((()=>{try{return (JSON.parse(s.neighbors_json || '[]') as Array<{title:string}>).map(n=>n.title).join('; ') || 'nessuno compatibile; copertura non deducibile';}catch{return 'non disponibili';}})())+'</p><div class="intel-buttons">'+
        '<button data-intel="accept" data-id="'+escape(s.id)+'" data-screened="'+(s.description?.trim()&&(!s.screening_status||s.screening_status==='ready')&&(!s.assessment_status||s.assessment_status==='eligible')?'1':'0')+'">Esplora</button>'+
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
    section.querySelector<HTMLElement>('#intel-format-unknown')!.innerHTML=state.format_unknown.map(f=>
      '<article><p>'+escape(f.title || f.id)+' — '+escape(f.diagnostic)+'</p><button data-intel="geometry" data-id="'+escape(f.id)+'" data-sha="'+escape(f.sha256)+'">Leggi geometria ed EXIF</button></article>').join('') || '<p>Nessun formato sconosciuto nella coda.</p>';
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
    if(action==='reset-budget'){
      const budget=panel?.budget;
      if(!budget || budget.reset_amount_usd===null)return;
      if(!window.confirm('Reimpostare la disponibilità a '+budget.reset_amount_usd+' USD? Il residuo attuale viene sostituito, senza accumularlo. Storico, prenotazioni ed esiti incerti restano conservati. Non ricarica il conto OpenAI e non avvia chiamate AI.'))return;
      busyState(true);
      try{
        await api(base+'/budget/reset',{method:'POST',body:JSON.stringify({operation_id:crypto.randomUUID(),expected_period_id:budget.period_id,amount_usd:budget.reset_amount_usd})});
        status.textContent='Budget reimpostato. Storico conservato; nessuna chiamata AI avviata.';
      }catch(error){status.textContent=String(error);}
      finally{try{await refresh();}catch(error){status.textContent+=' '+String(error);}busyState(false);}
      return;
    }
    if(action==='snapshot-history' || action==='snapshot-detail'){
      busyState(true);
      try{
        if(action==='snapshot-history')await loadSnapshots(button.dataset.reset==='1');
        else{
          const value=await api(base+'/preferences/snapshots/'+encodeURIComponent(button.dataset.id || ''));
          const detail=section.querySelector<HTMLElement>('#intel-snapshot-detail')!;detail.hidden=false;detail.textContent=JSON.stringify(value,null,2);
        }
        status.textContent='Stato delle preferenze letto dall’archivio privato.';
      }catch(error){status.textContent=String(error);}finally{busyState(false);}return;
    }
    const paid=["suggest","search","plan","profile","relevance","generate"].includes(action);
    if(!topicId && action!=="suggest" && !["accept","reject","defer","toggle-discovery","geometry"].includes(action)){
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
      else if(action==='geometry'){path=base+'/formats/analyze';payload={inbox_id:button.dataset.id,sha256:button.dataset.sha};}
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
      if(action==="acquire"){
        section.querySelector<HTMLElement>("#intel-acquisition-feedback")!.textContent=
          "Fotografia acquisita in quarantena. Apri Revisione per valutarla.";
        workspace.dispatchEvent(new CustomEvent("workspace-request-refresh"));
      }
      status.textContent=action==="toggle-discovery"
        ? (result.topic_discovery_enabled ? "Topic Discovery attivo. I suggerimenti partiranno soltanto se li richiedi." :
          "Topic Discovery disattivato. Puoi continuare a inserire argomenti e gestire REAL/SLOP.")
        : "Operazione registrata: "+JSON.stringify(result).slice(0,700);
      await refresh();
      if(action==="acquire"||action==="search"||action==="generate")
        document.querySelector<HTMLButtonElement>("#refresh-review")?.click();
    } catch(error) {
      status.textContent=String(error);
      if(action==="acquire")section.querySelector<HTMLElement>("#intel-acquisition-feedback")!.textContent=
        "Acquisizione non riuscita: "+String(error)+". La proposta rimane registrata.";
    } finally{busyState(false);}
  });
  const selector=workspace.querySelector<HTMLSelectElement>("#workspace-topic-select");
  section.querySelector<HTMLSelectElement>('#intel-preference-origin')!.addEventListener('change',()=>{
    if(busy)return;busyState(true);void loadSnapshots(true).catch(error=>{status.textContent=String(error);}).finally(()=>busyState(false));
  });
  selector?.addEventListener("change",()=>void refresh().catch(error=>{status.textContent=String(error);}));
  workspace.addEventListener("workspace-updated",()=>void refresh().catch(error=>{status.textContent=String(error);}));
  try{await refresh();}catch(error){status.textContent="Workspace non disponibile: verificare le migrazioni fino alla 0026. "+String(error);busyState(true);}
}
