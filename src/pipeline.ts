/** One gallery wizard: description → variation → scene → generation → review → game copy. */
import type { Metrics } from "../shared/copy-treatment";
import { escape } from "../shared/html";
import { VISUAL_SECTIONS } from "../shared/real-description";
import { AXES, PARAMETERS, PARAMETER_KEYS, type Profile, type PipelineSettings, type Proposal, type Review } from "../shared/pipeline";
import { measureMissing, prepareItemCopy, type TreatableItem } from "./game-copy";
import { editFrame } from "./crop-editor";
import { chooseTreatment } from "./treatment-editor";
import { galleryPhotosPath } from "./gallery-paths";
import "./pipeline.css";

interface Source { id: string; title: string; metrics?:Metrics|null;copy?:{sha256:string|null}|null; profile: Profile | null; described: boolean }
interface Job { format:{requested_ratio:string;actual_width:number;actual_height:number}|null; id: string; source_id: string | null; state: string; proposal: Proposal | null; evaluation: Review | null;
  file: string | null; previous_key: string | null; error: string; snapshot: { variation?: {selected: string[]}; operation: string } }
interface Image extends TreatableItem { width: number; height: number; revision: number; status: string; file: string; original: string }
interface State { stats: {real_count:number;slop_count:number;rows:{key:string;real:Record<string,number>;slop:Record<string,number>}[]}; index: { images: {id:string;title:string;max_calls:number}[] }; settings: PipelineSettings; sources: Source[]; jobs: Job[]; paid_calls: boolean; images: Image[] }
const LABELS: Record<string,string> = { queued: "In attesa sul server", dispatching:"Avvio sul server", working: "Elaborazione sul server", proposal: "Scena da confermare", candidate: "Immagine da vedere",
  review: "Valutazione disponibile", attention: "Richiede attenzione", failed: "Avvio non riuscito", accepting: "Accettazione in corso" };

export async function mountPipeline(root: HTMLElement, gallery: string) {
  const api = `/api/admin/pipeline/${encodeURIComponent(gallery)}`;
  let state: State | null = null, busy = false, notice = "", selected = new Set<string>(), initialized = false;
  const call = async <T>(path = "", data?: unknown, base = api): Promise<T> => {
    const response = await fetch(base + path, { method: data === undefined ? "GET" : "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
    const value = await response.json(); if (!response.ok) throw Error(value.error || "Richiesta non riuscita"); return value as T;
  };
  const confirmation = (action: string, count: number) => count > 0 && window.confirm(`${action}? Massimo ${count} ${count === 1 ? "chiamata" : "chiamate"} a pagamento. Esiti incerti non ripetuti automaticamente.`);
  const confirmMask = async (job:Job, index:number):Promise<string|null> => {
    const correction=job.evaluation!.corrections[index],bitmap=await createImageBitmap(await fetch(job.file!).then(r=>r.blob()));
    const dialog=document.createElement("dialog");dialog.className="pipeline-mask";
    dialog.innerHTML=`<h2>Correzione locale · massimo 1 chiamata</h2><p>${escape(correction.defect)}</p><p>Beneficio: ${escape(correction.benefit)}</p><p>Rischio: ${escape(correction.risk)}</p><canvas aria-label="Zona da correggere evidenziata in rosso"></canvas><p>La foto intera sarà inviata al modello. La maschera non garantisce la conservazione dei pixel esterni.</p><div class="pipeline-probabilities">${[["x","Sinistra"],["y","Alto"],["width","Larghezza"],["height","Altezza"]].map(([key,label])=>`<label>${label} (%)<input type="number" min="0" max="100" step=".1" data-region="${key}" value="${correction.region[key as keyof typeof correction.region]*100}"></label>`).join("")}</div><p role="alert" data-mask-error></p><button data-mask-confirm>Conferma correzione (1 chiamata)</button><button data-mask-cancel>Annulla</button>`;
    document.body.append(dialog);const canvas=dialog.querySelector("canvas")!,ctx=canvas.getContext("2d")!;canvas.width=bitmap.width;canvas.height=bitmap.height;
    const region=()=>Object.fromEntries([...dialog.querySelectorAll<HTMLInputElement>("[data-region]")].map(input=>[input.dataset.region!,Number(input.value)/100])) as typeof correction.region;
    const draw=()=>{const r=region();ctx.drawImage(bitmap,0,0);ctx.fillStyle="rgba(240,30,50,.35)";ctx.fillRect(r.x*canvas.width,r.y*canvas.height,r.width*canvas.width,r.height*canvas.height);};
    dialog.addEventListener("input",draw);draw();dialog.showModal();
    return new Promise(resolve=>{
      const finish=(value:string|null)=>{bitmap.close();dialog.close();dialog.remove();resolve(value);};
      dialog.querySelector("[data-mask-cancel]")!.addEventListener("click",()=>finish(null));dialog.addEventListener("cancel",event=>{event.preventDefault();finish(null);});
      dialog.querySelector("[data-mask-confirm]")!.addEventListener("click",()=>{
        const r=region();if(Object.values(r).some(x=>!Number.isFinite(x)||x<0||x>1)||r.width<=0||r.height<=0||r.x+r.width>1||r.y+r.height>1){dialog.querySelector("[data-mask-error]")!.textContent="La zona deve stare dentro la fotografia.";return;}
        ctx.fillStyle="#000";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.clearRect(Math.floor(r.x*canvas.width),Math.floor(r.y*canvas.height),Math.ceil(r.width*canvas.width),Math.ceil(r.height*canvas.height));
        finish(canvas.toDataURL("image/png").split(",")[1]);
      });
    });
  };
  const payload = (extra: Record<string,unknown> = {}) => ({ confirm: true, request: crypto.randomUUID(), ...extra });
  const profileFields = (profile:Profile, scope:string) => `<fieldset data-profile-scope="${scope}"><label>Genere fotografico<input data-profile-genre value="${escape(profile.genre)}"></label>${PARAMETER_KEYS.map(key=>`<details><summary>${PARAMETERS[key]}</summary><label>Valore osservato o previsto<textarea data-value="${key}" rows="2">${escape(profile.parameters[key].value)}</textarea></label><label>Categoria per il bilanciamento<input data-category="${key}" value="${escape(profile.parameters[key].category)}"></label></details>`).join("")}<h4>Particolarità</h4>${profile.peculiarities.map((x,i)=>`<label>${escape(x.description)}<select data-policy="${i}">${[["preserve","Preserva fedelmente"],["vary","Varia coerentemente"],["draw","Segui l’estrazione del parametro"]].map(([k,v])=>`<option value="${k}" ${x.policy===k?"selected":""}>${v}</option>`).join("")}</select></label>`).join("")}</fieldset>`;
  const readProfile = (profile:Profile, scope:string) => {
    const value=structuredClone(profile),form=root.querySelector<HTMLElement>(`[data-profile-scope="${scope}"]`)!;
    value.genre=form.querySelector<HTMLInputElement>("[data-profile-genre]")!.value;
    for(const key of PARAMETER_KEYS) {value.parameters[key].value=form.querySelector<HTMLTextAreaElement>(`[data-value="${key}"]`)!.value;value.parameters[key].category=form.querySelector<HTMLInputElement>(`[data-category="${key}"]`)!.value;}
    value.peculiarities.forEach((x,i)=>{x.policy=form.querySelector<HTMLSelectElement>(`[data-policy="${i}"]`)!.value as typeof x.policy;});return value;
  };
  const description = (job: Job) => `<details><summary>Scena inglese e parametri</summary><p>Estratti: ${escape(job.snapshot.variation?.selected.map(k => PARAMETERS[k as keyof typeof PARAMETERS] || k).join(", ") || "nessuno")}</p>${job.proposal ? `<p>${escape(job.proposal.changes)}</p><p>${escape(job.proposal.dependencies)}</p><fieldset data-scene="${job.id}"><label>Genere di destinazione<input data-scene-genre value="${escape(job.proposal.genre)}"></label><label>Rapporto larghezza:altezza<input data-scene-ratio value="${escape(job.proposal.aspect_ratio)}"></label>${AXES.map(axis=>`<label>${VISUAL_SECTIONS[axis]}<textarea data-axis="${axis}" rows="3" lang="en">${escape(job.proposal!.scene[axis])}</textarea></label>`).join("")}<details><summary>Parametri previsti dopo le variazioni</summary>${profileFields(job.proposal.profile,job.id)}</details></fieldset>${job.state === "proposal" ? `<button data-action="scene" data-job="${job.id}">Salva la scena</button>` : ""}` : ""}</details>`;
  const readScene=(job:Job):Proposal=>{
    const form=root.querySelector<HTMLElement>(`[data-scene="${job.id}"]`)!,proposal=structuredClone(job.proposal!);
    for(const axis of AXES)proposal.scene[axis]=form.querySelector<HTMLTextAreaElement>(`[data-axis="${axis}"]`)!.value;
    proposal.genre=form.querySelector<HTMLInputElement>("[data-scene-genre]")!.value;proposal.aspect_ratio=form.querySelector<HTMLInputElement>("[data-scene-ratio]")!.value;proposal.profile=readProfile(proposal.profile,job.id);return proposal;
  };
  const render = () => {
    if (!state) { root.innerHTML = `<p role="status">${escape(notice || "Caricamento…")}</p>`; return; }
    const activeSources = new Set(state.jobs.map(j => j.source_id));
    const pending = state.sources.filter(s => !s.profile && !activeSources.has(s.id));
    const prepared = state.sources.filter(s => s.profile && s.described && !activeSources.has(s.id) && selected.has(s.id));
    root.innerHTML = `<section class="pipeline"><button data-action="refresh">Aggiorna stato</button><p><a href="/docs/pipeline-slop.svg" target="_blank" rel="noopener">Schema completo della pipeline</a> · <a href="${galleryPhotosPath(gallery)}">Foto della galleria</a></p>
      <p role="status" data-pipeline-notice>${escape(notice)}</p>
      <h2>1. Prepara la galleria</h2><button data-action="stop" ${state.jobs.some(j=>["queued","dispatching"].includes(j.state))?"":"disabled"}>Interrompi le richieste in attesa</button><p>${state.sources.length} REAL · ${pending.length} senza parametri · ${state.jobs.filter(j => ["working","dispatching","queued"].includes(j.state)).length} elaborazioni in corso.</p>
      <button data-action="prepare" ${pending.length && !busy && state.paid_calls ? "" : "disabled"}>Descrivi e prepara tutte le REAL mancanti (${pending.length})</button>
      <button data-action="index" ${state.index.images.length && !busy && state.paid_calls ? "" : "disabled"}>Indicizza gli ambienti (${state.index.images.length})</button><p>Una chiamata per originale intero: descrizione inglese, genere, parametri e particolarità. I dettagli temporanei identificativi vengono variati; quelli del modello o dell’edizione vengono preservati.</p>
      <details><summary>REAL e particolarità</summary><label><input type="checkbox" data-all ${state.sources.every(s => selected.has(s.id)) ? "checked" : ""}> Seleziona tutte</label>${state.sources.map(s => `<div class="pipeline-source"><label><input type="checkbox" data-source="${s.id}" ${selected.has(s.id) ? "checked" : ""}> ${escape(s.title)} ${s.profile ? "✓" : "— parametri mancanti"}</label>${s.profile ? `<details><summary>${escape(s.profile.genre)} · ${s.profile.peculiarities.length} particolarità</summary>${profileFields(s.profile,s.id)}<button data-action="profile" data-source-id="${s.id}">Salva parametri e particolarità</button></details>` : ""}</div>`).join("")}</details>
      <h2>2. Variazioni della galleria</h2><details><summary>Composizione della galleria</summary><p>${state.stats.real_count} REAL annotate; ${state.stats.slop_count} SLOP con parametri previsti salvati. I dati delle SLOP descrivono ciò che è stato richiesto, non una misura garantita delle immagini prodotte. Controlla anche le ricorrenze visive.</p><div class="pipeline-table"><table><thead><tr><th>Caratteristica</th><th>Osservata nelle REAL</th><th>Prevista nelle SLOP</th></tr></thead><tbody>${state.stats.rows.map(r=>`<tr><th>${escape(PARAMETERS[r.key as keyof typeof PARAMETERS] || "Genere fotografico")}</th><td>${escape(Object.entries(r.real).map(([k,n])=>`${k}: ${n}`).join(" · "))}</td><td>${escape(Object.entries(r.slop).map(([k,n])=>`${k}: ${n}`).join(" · ") || "Nessuna" )}</td></tr>`).join("")}</tbody></table></div></details><details><summary>Regole e probabilità</summary><label>Regole per questa galleria<textarea data-rules rows="6">${escape(state.settings.rules)}</textarea></label>
      <label>Ambiente e genere<select data-environment>${[["keep","Mantieni ambiente e luce"],["same_genre","Cambia ambiente, stesso genere"],["change_genre","Cambia ambiente e genere"]].map(([k,v]) => `<option value="${k}" ${state!.settings.environment===k?"selected":""}>${v}</option>`).join("")}</select></label>
      <label>Possibilità di valori nuovi plausibili (%)<input type="number" min="0" max="100" data-novelty value="${state.settings.novelty*100}"></label>
      <p>Lascia vuota una probabilità per usare la stima dalla composizione delle REAL. Anche i valori ordinari e l’assenza di un tratto vengono campionati. Zero variazioni è consentito. Le frequenze sono una stima, da rivedere insieme ai risultati.</p>
      <div class="pipeline-probabilities">${PARAMETER_KEYS.map(k => `<label>${PARAMETERS[k]} (%)<input type="number" min="0" max="100" data-probability="${k}" placeholder="Automatico" value="${state!.settings.probabilities[k]===undefined ? "" : state!.settings.probabilities[k]!*100}"></label>`).join("")}</div><button data-action="settings">Salva regole e probabilità</button></details>
      <button data-action="plan" ${prepared.length && !busy && state.paid_calls ? "" : "disabled"}>Prepara ${prepared.length} scene dalle REAL selezionate</button>
      <h2>3. Scene e immagini da revisionare</h2><div class="pipeline-actions"><button data-action="generate-all" ${state.jobs.some(j => j.state==="proposal")&&!busy?"":"disabled"}>Genera tutte le scene confermate</button><button data-action="evaluate-all" ${state.jobs.some(j => j.state==="candidate")&&!busy?"":"disabled"}>Valuta tutte le nuove candidate</button></div>
      ${state.jobs.map(j => `<article class="pipeline-job" data-job-card="${j.id}"><h3>${escape(state!.sources.find(s=>s.id===j.source_id)?.title || "SLOP")} · ${escape(LABELS[j.state] || j.state)}</h3>${j.error?`<p role="alert">${escape(j.error)}</p>`:""}${description(j)}
      ${j.format?`<p>Rapporto richiesto: ${escape(j.format.requested_ratio)}. Dimensioni ricevute: ${j.format.actual_width} × ${j.format.actual_height}.</p>`:""}${j.file?`<div class="pipeline-views"><figure><img src="${escape(j.file)}" alt="Candidata intera"><figcaption>Candidata intera</figcaption></figure>${j.previous_key?`<figure><img src="${api}/${j.id}/file?previous=1" alt="Prima della correzione"><figcaption>Prima della correzione</figcaption></figure>`:""}</div>`:""}
      ${j.evaluation?`<section><h4>Valutazione originale</h4><p>${escape(j.evaluation.assessment)}</p><ul>${j.evaluation.findings.map(x=>`<li>${escape(x)}</li>`).join("")}</ul><p>Incertezze: ${escape(j.evaluation.uncertainties.join(" · ") || "nessuna")}</p>${j.evaluation.corrections.map((c,i)=>`<details><summary>Proposta: ${escape(c.defect)}</summary><p>Beneficio: ${escape(c.benefit)}</p><p>Rischio: ${escape(c.risk)}</p><textarea data-instruction="${j.id}-${i}" rows="4" aria-label="Istruzione di correzione">${escape(c.instruction)}</textarea><p>La maschera copre la zona indicata dal valutatore. L’API può modificare anche pixel esterni: controlla l’immagine intera dopo l’intervento.</p><button data-action="edit" data-job="${j.id}" data-correction="${i}" ${["candidate","review"].includes(j.state)?"":"disabled"}>Conferma questa correzione (1 chiamata)</button></details>`).join("")}</section>`:""}
      <div class="pipeline-actions">${j.state==="proposal"?`<button data-action="generate" data-job="${j.id}">Conferma la generazione</button>`:""}${["candidate","review"].includes(j.state)?`<button data-action="evaluate" data-job="${j.id}">Chiedi una valutazione (1 chiamata)</button>`:""}${j.file && ["candidate","review","attention"].includes(j.state)?`<button data-action="accept" data-job="${j.id}">Accetta l’immagine intera</button>`:""}${!["queued","dispatching","working","accepting"].includes(j.state)?`<button data-action="close" data-job="${j.id}">Scarta e chiudi</button>`:""}</div></article>`).join("")}
      <h2>4. Trattamento e copie di gioco</h2><p>Regola il trattamento se serve, verifica l’inquadratura e la copia 4:5, poi approva e pubblica. Il riferimento tecnico è campionato tra REAL misurate dello stesso genere; senza riferimento la copia parte senza trattamento.</p>
      ${state.images.map(i=>`<article class="pipeline-job" data-accepted-image="${i.id}"><h3>SLOP · ${escape(i.status)}</h3><div class="pipeline-views"><img src="${escape(i.original)}" alt="Originale accettato"><img src="${escape(i.file)}" alt="Copia di gioco da controllare"></div><div class="pipeline-actions"><button data-action="copy" data-image="${i.id}">Prepara copia 4:5</button><button data-action="frame" data-image="${i.id}">Inquadratura</button><button data-action="treatment" data-image="${i.id}" ${i.treatment || i.generation?.slot?.target_metrics ? "" : "disabled"}>Regola trattamento</button>${i.status==="new"?`<button data-action="approve" data-image="${i.id}" ${i.copy?"":"disabled"}>Approva dopo controllo</button>`:""}${i.status==="approved"?`<button data-action="publish" data-image="${i.id}">Pubblica</button>`:""}</div></article>`).join("")}</section>`;
    root.querySelectorAll<HTMLButtonElement>("button").forEach(b => { if(busy) b.disabled=true; });
  };
  const refresh = async () => { state = await call<State>(); if(!initialized && await measureMissing(state.sources)) state=await call<State>(); if(!initialized) {selected=new Set(state.sources.map(s=>s.id));initialized=true;} render(); };
  const act = async (work:()=>Promise<void>) => { if(busy)return;busy=true;root.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLButtonElement|HTMLSelectElement>("input,textarea,button,select").forEach(control=>{control.disabled=true;});try {await work();notice="Stato aggiornato.";}catch(e){notice=e instanceof Error?e.message:String(e);}finally{busy=false;await refresh().catch(e=>{notice=String(e);render();});} };
  root.addEventListener("change",event=>{ const input=event.target as HTMLInputElement;if(input.dataset.source){if(input.checked)selected.add(input.dataset.source);else selected.delete(input.dataset.source);}if(input.hasAttribute("data-all")){selected=input.checked?new Set(state!.sources.map(s=>s.id)):new Set();render();} });
  root.addEventListener("click",event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");if(!button||busy||!state)return;
    const action=button.dataset.action!,job=state.jobs.find(j=>j.id===button.dataset.job), image=state.images.find(i=>i.id===button.dataset.image);
    void act(async()=>{
      if(action==="refresh")return;
      if(action==="stop"){if(window.confirm("Annullare le richieste non ancora inviate? Quelle già in corso terminano senza altri passi automatici."))await call("/stop",{confirm:true});return;}
      if(action==="settings"){
        const probabilities:PipelineSettings["probabilities"]={};root.querySelectorAll<HTMLInputElement>("[data-probability]").forEach(input=>{if(input.value!=="")probabilities[input.dataset.probability as keyof typeof probabilities]=Number(input.value)/100;});
        await call("/settings",{rules:root.querySelector<HTMLTextAreaElement>("[data-rules]")!.value,probabilities,environment:root.querySelector<HTMLSelectElement>("[data-environment]")!.value,novelty:Number(root.querySelector<HTMLInputElement>("[data-novelty]")!.value)/100});return;
      }
      if(action==="profile") { const source=button.dataset.sourceId!;await call("/profile",{id:source,profile:readProfile(state!.sources.find(s=>s.id===source)!.profile!,source)});return; }
      if(action==="index") {const targets=state!.index.images;const count=targets.reduce((n,x)=>n+x.max_calls,0);if(!confirmation("Indicizzare gli ambienti delle REAL",count))return;for(const item of targets)await call("/index",payload({id:item.id,max_calls:item.max_calls}));return;}
      if(action==="prepare"||action==="plan"){
        const active=new Set(state!.jobs.map(j=>j.source_id));const ids=state!.sources.filter(s=>!active.has(s.id)&&(action==="prepare"?!s.profile:(selected.has(s.id)&&s.profile&&s.described))).map(s=>s.id);
        if(!confirmation(action==="prepare"?"Descrivere e preparare le REAL mancanti":"Preparare le scene inglesi",ids.length))return;
        for(let at=0;at<ids.length;at+=500){const chunk=ids.slice(at,at+500);await call("/"+action,payload({ids:chunk,max_calls:chunk.length}));}return;
      }
      if(action==="generate-all"||action==="evaluate-all"){
        const op=action==="generate-all"?"generate":"evaluate",jobs=state!.jobs.filter(j=>j.state===(op==="generate"?"proposal":"candidate"));
        if(op==="generate")for(const j of jobs){const proposal=readScene(j);await call(`/${j.id}/scene`,payload({proposal}));j.proposal=proposal;}
        if(!confirmation(op==="generate"?"Generare tutte le scene salvate":"Valutare tutte le candidate",jobs.length))return;
        for(const j of jobs)await call(`/${j.id}/${op}`,payload({max_calls:1,...(op==="generate"?{proposal:j.proposal}:{})}));return;
      }
      if(job){
        if(action==="scene"){await call(`/${job.id}/scene`,payload({proposal:readScene(job)}));return;}
        if(action==="generate"||action==="evaluate"){if(action==="generate"){job.proposal=readScene(job);await call(`/${job.id}/scene`,payload({proposal:job.proposal}));}if(!confirmation(action==="generate"?"Generare la scena salvata":"Valutare l’immagine intera",1))return;await call(`/${job.id}/${action}`,payload({max_calls:1,...(action==="generate"?{proposal:job.proposal}:{})}));return;}
        if(action==="edit"){
          const index=Number(button.dataset.correction),mask=await confirmMask(job,index);if(!mask)return;
          await call(`/${job.id}/edit`,payload({max_calls:1,instruction:root.querySelector<HTMLTextAreaElement>(`[data-instruction="${job.id}-${index}"]`)!.value,mask}));return;
        }
        if(action==="accept"||action==="close") {if(!window.confirm(action==="accept"?"Accettare questa immagine intera? Le segnalazioni del valutatore restano da considerare.":"Scartare questa lavorazione e i suoi file?"))return;await call(`/${job.id}/${action}`,payload());return;}
      }
      if(image){
        if(action==="copy"){await prepareItemCopy(image);return;}
        if(action==="frame"){await editFrame(image);return;}
        if(action==="treatment"){const result=await chooseTreatment(image);if(result)await prepareItemCopy(image,undefined,{settings:result.settings});return;}
        if(action==="approve"||action==="publish") {if(!window.confirm(action==="publish"?"Pubblicare la copia controllata?":"Confermi di avere controllato originale e copia finale?"))return;await call(`/${image.id}/${action}`,{revision:image.revision},"/api/admin/library");return;}
      }
    });
  });
  await refresh();
  const timer=window.setInterval(()=>{if(!root.isConnected){clearInterval(timer);return;}if(!busy && state?.jobs.some(j=>["queued","dispatching","working","accepting"].includes(j.state)) && !(root.contains(document.activeElement) && (document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLSelectElement || document.activeElement instanceof HTMLInputElement && document.activeElement.type!=="checkbox")))void refresh().catch(e=>{notice=String(e);});},3000);
  return {refresh};
}
