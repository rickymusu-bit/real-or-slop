/** Editorial studio: textual briefs, bounded full-image evaluation, accepted copies and manual review. */
import "./slop-studio.css";
import { prepareItemCopy, saveFrame, type TreatableItem } from "./game-copy";
import { chooseTreatment } from "./treatment-editor";
import { chooseFrame } from "./crop-editor";
import { escape } from "../shared/html";
import { BRIEF_KEYS, type Brief, type Evaluation } from "../shared/editorial";
import type { InspirationItem } from "../shared/slop-proposals";
import { tagFromInput } from "../shared/tag-input";
import { onLongPress, openPreview } from "./image-preview";
import { startPills } from "./tag-ui";
interface Config { max_generation_attempts: number; editorial_tolerance: number; text_model: string; image_model: string; quality: string; mode?: "manual" | "automatic" }
interface Image extends TreatableItem { id: string; status: string; revision: number; tags: string[]; categories: Record<string,string>; file: string; original: string;
  width: number; height: number; copy: Parameters<typeof chooseFrame>[3]; prompt: string; analysis: { status: string; error: string } }
interface Attempt {id: string; number: number; prompt: string; status: string; evaluation: Evaluation | null; file: string | null}
interface Process {id: string; slot: number; state: string; prompt: string; snapshot?: {mode?: string}; brief: Brief | null; attempts: Attempt[]; error: string; calls: number; image_id: string | null}
interface Batch {origin: string; id: string; items: InspirationItem[]; prompts: {prompt: string; brief?: Brief}[]; processes: Process[]; config: Config | null; max_calls: number;
  runner: {id: string; status: string | null; updated_at: string | null; alive: boolean} | null;
  pipeline_version: number; prompts_status: string; prompts_error: string; images: Image[]}
interface Waiting {id: string; title: string; file: string; described: boolean; tags: InspirationItem["tags"]}
interface Attention extends Process {title: string; batch_id: string; updated_at: string}
interface State {thresholds: {section: number; max_batch: number}; real_total: number; waiting: Waiting[]; attention: Attention[]}
const STATE_LABELS: Record<string, string> = {exhausted: "tentativi esauriti senza SLOP", review_needed: "il valutatore chiede la tua revisione",
  failed: "non riuscito", uncertain: "esito incerto, nessuna chiamata ripetuta"};
const BRIEF_LABELS = {required:"Ancoraggi obbligatori",preferred:"Preferenze",flexible:"Elementi liberi",exclusions:"Esclusioni"};
const API = "/api/admin/library/slop/", LIBRARY = "/api/admin/library", DRAFT = "ros-editorial-studio-v1";
async function call<T>(path: string, body?: unknown, method?: string, base = API): Promise<T> {
  const response = await fetch(base + path, {credentials: "same-origin", method: method || (body === undefined ? "GET" : "POST"),
    headers: {"Content-Type":"application/json"}, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json() as T & {error?: string};
  if (!response.ok) throw Error(data.error || "Richiesta non riuscita"); return data;
}
export async function mountSlopStudio(root: HTMLElement, onAttention: (n: number) => void = () => {}): Promise<{refresh: () => Promise<void>}> {
  let state: State | null = null, batch: Batch | null = null, config: Config | null = null, page = 1, busy = false, notice = "", progress = "";
  const manual = {prompt: "", tags: "", required: "", preferred: "", flexible: "", exclusions: ""};
  let batchId = sessionStorage.getItem(DRAFT) || "", recent: {id: string; count: number}[] = [];
  const loadBatch = async () => { if (batchId) batch = await call<Batch>("batches/" + batchId); };
  const evaluation = (a: Attempt, open = false) => `<details${open ? " open" : ""}><summary>Tentativo ${a.number}: ${escape(a.evaluation?.decision || a.status)}</summary>` +
    (a.file ? `<img src="${escape(a.file)}" alt="Candidata intera del tentativo ${a.number}" style="max-width:100%;max-height:360px;object-fit:contain">` : "") +
    `<p lang="en">${escape(a.prompt)}</p>` + (a.evaluation ? `<p>${escape(a.evaluation.action_reason)}</p><p>Difetti critici: ${escape(a.evaluation.critical_findings.join("; ") || "nessuno")}</p><p>Difetti minori: ${escape(a.evaluation.minor_findings.join("; ") || "nessuno")}</p><p>Incertezze: ${escape(a.evaluation.uncertainty_notes.join("; ") || "nessuna")}</p><p>Vincoli editoriali: ${a.evaluation.editorial_constraints_met ? "rispettati" : "non rispettati"}</p>` : "") + "</details>";
  const summary = () => batch?.config ? `<p class="hint">${batch.config.max_generation_attempts} tentativi massimi per SLOP; tolleranza ${["rigorosa","normale","permissiva"][batch.config.editorial_tolerance]}. Massimo ${batch.max_calls} chiamate (${batch.config.mode === "manual" ? "generazioni, valutazioni e tag dopo accettazione" : "brief+prompt, generazioni, valutazioni e tag dopo accettazione, più eventuali riscritture confermate"}). Effettive: ${batch.processes.reduce((n,p) => n+p.calls,0)}. Modelli: ${escape(batch.config.text_model)}, ${escape(batch.config.image_model)}, qualità ${escape(batch.config.quality)}.</p>` : "";
  const first = () => `<div class="studio-intro"><h3>Generazione manuale</h3><p>Scrivi prompt, tag di partenza e ancoraggi. Non viene scelta una REAL e non viene chiesto al modello di scrivere il prompt.</p></div>
    <label>Prompt in inglese<textarea data-manual="prompt" rows="6" maxlength="4000" required>${escape(manual.prompt)}</textarea></label>
    <label>Tag di partenza (separati da virgole)<textarea data-manual="tags" rows="2" required>${escape(manual.tags)}</textarea></label>
    <p class="hint">I tag finali descriveranno l'immagine effettivamente generata: quelli di partenza restano disponibili per il confronto.</p>` +
    BRIEF_KEYS.map(k => `<label>${BRIEF_LABELS[k]} (una voce per riga)<textarea data-manual="${k}" rows="2" ${k === "required" ? "required" : ""}>${escape(manual[k])}</textarea></label>`).join("") +
    (config ? `<p>Fino a ${config.max_generation_attempts} tentativi con valutazione e analisi finale dei tag: massimo ${1+2*config.max_generation_attempts} chiamate. La preparazione è gratuita.</p>` : "") +
    '<button type="button" data-slop="manual-draft" class="primary">Prepara generazione</button>' +
    (recent.length ? `<label>Riprendi una generazione<select data-recent><option value="">Scegli…</option>${recent.map(b => `<option value="${b.id}">${escape(b.id.slice(0,8))} / ${b.count} SLOP</option>`).join("")}</select></label>` : "");
  const second = () => summary() + (batch?.pipeline_version !== 2 ? '<p>Batch precedente: sola revisione. Avvia un nuovo batch per la nuova pipeline.</p>' :
    '<p>Brief e prompt sono revisionabili prima del primo tentativo. Il brief resta poi congelato.</p><ol class="slop-prompts">' + (batch?.processes || []).map(p => {
      const locked = batch?.origin === "auto" || p.attempts.length > 0 || !["draft","ready","failed"].includes(p.state);
      return `<li><h3>${escape(batch!.items[p.slot]?.title || "SLOP")}</h3><div class="rw-pills">${startPills(batch!.items[p.slot])}</div>` +
        BRIEF_KEYS.map(k => `<label>${BRIEF_LABELS[k]} (una voce per riga)<textarea data-brief="${p.slot}" data-key="${k}" rows="2" ${locked ? "disabled" : ""}>${escape(p.brief?.[k].join("\n") || "")}</textarea></label>`).join("") +
        `<label>Prompt in inglese<textarea data-prompt="${p.slot}" rows="6" maxlength="4000" ${locked ? "disabled" : ""}>${escape(p.prompt)}</textarea></label><p>${escape(p.state)} ${escape(p.error)}</p>` +
        (!locked && p.snapshot?.mode !== "manual" ? `<button data-slop="rewrite" data-slot="${p.slot}">Riscrivi brief e prompt</button>` : "") + '</li>';
    }).join("") + '</ol>' + (batch?.origin === "auto" ? '<p>Il batch si gestisce dalla modalità automatica.</p>' : '<div class="rw-actions"><button data-slop="save">Salva brief e prompt</button><button data-slop="images" class="primary">Genera e valuta</button></div>')) + '<button data-slop="to-review">Vai alla revisione</button><button data-slop="new-batch">Nuovo batch</button>';
  const divergence = (image: Image) => {
    const anchors = batch?.processes.find(p=>p.image_id===image.id)?.brief?.required || [];
    const missing = anchors.filter(a=>/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a) && !image.tags.includes(a));
    return missing.length ? `<p class="slop-closed">Ancoraggi non rilevati nei tag: ${escape(missing.join(", "))}. Verifica la divergenza; i tag descrivono ciò che si vede.</p>` : "";
  };
  const fourth = () => summary() + '<p>Accettazione del modello e approvazione dell’owner sono separate. Controlla l’originale intero e la copia 4:5; pubblica solo dopo revisione.</p>' +
    (batch?.images || []).map(image => `<article class="rw-final slop-review" data-image="${image.id}"><h3>SLOP ${escape(image.status)}</h3><div class="rw-preview-grid"><figure><img data-slop-original="${image.id}" data-long-press src="${escape(image.original)}" alt="Originale SLOP intero" style="max-width:100%;max-height:420px;object-fit:contain"><figcaption>Originale intero valutato</figcaption></figure><figure><img data-slop-copy="${image.id}" data-long-press src="${escape(image.file)}" alt="Copia di gioco 4:5" style="max-width:100%;max-height:420px;object-fit:contain"><figcaption>Copia 4:5${image.copy ? "" : " da preparare"}</figcaption></figure></div><p>Tag effettivi: ${escape(image.tags.join(", "))}</p>${divergence(image)}<p class="hint">Confronta i tag rilevati con gli ancoraggi del brief qui sotto: eventuali divergenze restano visibili e non modificano i tag.</p><p lang="en">${escape(image.prompt)}</p>` +
      `<div class="rw-actions">${image.status === "new" || image.status === "approved" ? `<button data-slop="frame" data-id="${image.id}">Inquadratura</button><button data-slop="${image.treatment?.off ? "treatment-on" : "treatment-off"}" data-id="${image.id}">${image.treatment?.off ? "Con trattamento" : "Senza trattamento"}</button>${image.treatment ? `<button data-slop="treatment-edit" data-id="${image.id}">Regola il trattamento</button>` : ""}` : ""}` +
      (image.status === "new" ? `${image.analysis.status === "none" || image.analysis.status === "failed" ? `<button data-slop="analyze" data-id="${image.id}">Analizza</button>` : ""}<button data-slop="approve" data-id="${image.id}" ${image.copy && image.tags.length ? "" : "disabled"}>Approva</button>` : "") +
      (image.status === "approved" ? `<button data-slop="publish" data-id="${image.id}">Pubblica</button>` : "") +
      (image.status !== "published" && image.status !== "trash" ? `<button data-slop="trash" data-id="${image.id}">Cestino</button>` : "") + '</div></article>').join("") +
    (batch?.processes || []).map(p => `<section><h3>${escape(batch!.items[p.slot]?.title || "SLOP")}: ${escape(p.state)}</h3>${p.error ? `<p role="status">${escape(p.error)}</p>` : ""}${p.brief ? `<p>Ancoraggi obbligatori: ${escape(p.brief.required.join("; "))}. Esclusioni: ${escape(p.brief.exclusions.join("; "))}</p>` : ""}${p.attempts.map(a => evaluation(a)).join("")}</section>`).join("") +
    '<div class="rw-actions"><button data-slop="to-prompts">Brief e prompt / ripresa</button><button data-slop="new-batch">Nuovo batch</button></div>';
  /** A candidate the owner may accept after a review: evaluated, saved whole, with no critical defect. Constraints the evaluator
   * could not confirm, without a critical defect, are a doubt for the owner to settle, not a defect. */
  const acceptable = (a: Attempt) => a.status === "completed" && !!a.file && !!a.evaluation && !a.evaluation.critical_findings.length;
  // Processes that ended without a SLOP are exceptional: they stay on top, with every attempt, until the owner closes them.
  const attentionView = () => {
    const list = state?.attention || [];
    onAttention(list.length);
    if (!list.length) return "";
    return `<section class="slop-attention" aria-labelledby="slop-attention-title"><h3 id="slop-attention-title">Da vedere: ${list.length} ${list.length === 1 ? "processo senza SLOP" : "processi senza SLOP"}</h3>` +
      list.map(p => `<details class="slop-closed" data-attention="${escape(p.id)}"><summary>${escape(p.title)}: ${escape(STATE_LABELS[p.state] || p.state)}</summary>` +
        `<p>${p.attempts.length} ${p.attempts.length === 1 ? "tentativo" : "tentativi"}, ${p.calls} chiamate registrate.${p.error ? " " + escape(p.error) : ""}</p>` +
        (p.brief ? `<p>Ancoraggi obbligatori: ${escape(p.brief.required.join("; "))}. Esclusioni: ${escape(p.brief.exclusions.join("; ") || "nessuna")}</p>` : "") +
        p.attempts.map(a => evaluation(a, false)).join("") +
        `<div class="rw-actions">${p.state === "review_needed" ? p.attempts.filter(acceptable).map(a => `<button data-slop="accept-process" data-process="${escape(p.id)}" data-attempt="${escape(a.id)}">Accetta il tentativo ${a.number}</button>`).join("") : ""}` +
        `<button data-slop="close-process" data-process="${escape(p.id)}">Chiudi: ho visto</button></div></details>`).join("") + "</section>";
  };
  const render = () => {
    const expanded = [...root.querySelectorAll<HTMLDetailsElement>("details[data-attention][open]")].map(d => d.dataset.attention);
    root.innerHTML = `<div class="rw slop">${attentionView()}<ol class="rw-steps">${["Prompt, tag e ancoraggi","Controlla il prompt","Generazione e valutazione","Revisione"].map((l,i) => `<li ${page===i+1?'aria-current="step"':""}>${i+1}. ${l}</li>`).join("")}</ol><p role="status" aria-live="polite">${escape(notice)}</p>` +
      (busy ? `<p role="status">${escape(progress || "Operazione in corso…")}</p>` : "") + [first, second, () => summary() + `<p role="status">${escape(progress)}</p>` + (working() ? '<p class="hint">La generazione continua sul server anche se chiudi questa pagina.</p><button data-slop="stop-run">Interrompi</button>' : ""), fourth][page-1]() + '</div>';
    for (const d of root.querySelectorAll<HTMLDetailsElement>("details[data-attention]")) d.open = expanded.includes(d.dataset.attention);
    if (busy) root.querySelectorAll<HTMLButtonElement>("button:not([data-slop=stop-run])").forEach(b => b.disabled = true);
  };
  const refresh = async () => {
    try {
      batchId = sessionStorage.getItem(DRAFT) || batchId;
      state = await call<State>("state");
      const values = await call<{values: {max_generation_attempts: number; editorial_tolerance: number}}>("/settings", undefined, "GET", LIBRARY);
      const models = await call<{text_model: string; image_model: string; image_quality: string}>("/models", undefined, "GET", LIBRARY);
      config = {...values.values, ...models, quality: models.image_quality};
      recent = (await call<{batches: typeof recent}>("batches")).batches;
      await loadBatch(); if (batch) page = working() ? 3 : 4;
    } catch (e) { notice = String(e); } render();
    // Following an existing server job must not hold the dashboard's initial loading promise.
    // busy also prevents a second polling loop when the owner reopens this section.
    if (working() && !busy) {
      busy = true; render();
      void follow().catch(error => { notice = String(error); }).finally(async () => {
        busy = false; page = batch?.processes.some(p => p.attempts.length) ? 4 : 2;
        state = await call<State>("state").catch(() => state); render();
      });
    }
  };
  const save = async () => {
    if (!batch || batch.processes.some(p => p.attempts.length || !["draft","ready","failed"].includes(p.state))) return;
    const prompts = batch.processes.map(p => root.querySelector<HTMLTextAreaElement>(`[data-prompt="${p.slot}"]`)?.value || p.prompt);
    const briefs = batch.processes.map(p => Object.fromEntries(BRIEF_KEYS.map(k => [k, (root.querySelector<HTMLTextAreaElement>(`[data-brief="${p.slot}"][data-key="${k}"]`)?.value || "").split("\n").map(s => s.trim()).filter(Boolean)])));
    batch = await call<Batch>("batches/"+batchId, {prompts, briefs}, "PUT");
  };
  const finish = async (image: Image) => {
    if (!image.copy) await prepareItemCopy(image);
    if (image.analysis.status === "none") await call("/"+image.id+"/analyze", {confirm:true}, "POST", LIBRARY);
  };
  /** The loop runs on Cloudflare (briefs, attempts, tags): this page only follows it; leaving it stops nothing. */
  const working = () => !!batch?.runner?.alive;
  const follow = async () => {
    while (batch && working()) {
      const writing = batch.processes.filter(p => p.state === "draft" || p.state === "prompting").length;
      const attempts = batch.processes.reduce((n, p) => n + p.attempts.length, 0), accepted = batch.processes.filter(p => p.state === "accepted").length;
      progress = writing ? `Sul server: brief e prompt, ${batch.items.length - writing} di ${batch.items.length}…`
        : `Sul server: ${attempts} ${attempts === 1 ? "tentativo" : "tentativi"} (generazione e valutazione dell’immagine intera), ${accepted} di ${batch.items.length} ${accepted === 1 ? "accettata" : "accettate"}…`;
      render();
      await new Promise(resolve => window.setTimeout(resolve, 2500));
      await loadBatch();
    }
    progress = "";
    // Game copies of the accepted images are made here (browser, free); their tags come from the server.
    for (const image of batch?.images || []) if (image.status === "new" && !image.copy) await finish(image).catch(e => { notice += " " + String(e); });
    await loadBatch();
  };
  onLongPress(root, "[data-slop-waiting]", element => {const w = state?.waiting.find(w => w.id === element.dataset.slopWaiting); if(w) openPreview({src:w.file,title:w.title,alt:w.title});});
  onLongPress(root, "[data-slop-original], [data-slop-copy]", element => {
    const image = batch?.images.find(i=>i.id===(element.dataset.slopOriginal || element.dataset.slopCopy));
    if(image) openPreview({src:element.dataset.slopOriginal ? image.original : image.file, title:"SLOP / "+image.status,
      alt:element.dataset.slopOriginal ? "Originale intero" : "Copia 4:5", extra:`<p lang="en">${escape(image.prompt)}</p><p>Tag effettivi: ${escape(image.tags.join(", "))}</p>`});
  });
  root.addEventListener("input", event => {
    const input = event.target as HTMLTextAreaElement;
    const key = input.dataset.manual as keyof typeof manual | undefined;
    if (key && key in manual) manual[key] = input.value;
  });
  root.addEventListener("change", event => {
    const input = event.target as HTMLInputElement;
    if (input.matches("[data-recent]") && input.value) {batchId=input.value;sessionStorage.setItem(DRAFT,batchId);void loadBatch().then(()=>{page=4;render();});}
  });
  root.addEventListener("click", async event => {
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-slop]");if(!button)return;
    if(button.dataset.slop==="stop-run"){button.disabled=true;try{batch=await call<Batch>("batches/"+batchId+"/stop",{});notice="Il server si ferma prima della prossima chiamata.";}catch(e){notice=String(e);}render();return;}
    if(busy)return;
    const action=button.dataset.slop!, slot=Number(button.dataset.slot), image=batch?.images.find(i=>i.id===button.dataset.id);
    if(action==="accept-process"){
      const doubt=state?.attention.find(p=>p.id===button.dataset.process)?.attempts.find(a=>a.id===button.dataset.attempt)?.evaluation?.editorial_constraints_met===false;
      if(!window.confirm((doubt?"Il valutatore non ha potuto confermare i vincoli editoriali: rileggi le sue incertezze. ":"")+"Accettare questa candidata? Entra nella libreria come SLOP nuova, da approvare dopo la copia 4:5; poi una chiamata a pagamento per i tag."))return;
      busy=true;notice="Accettazione e analisi dei tag…";render();
      try{const done=await call<{attention: Attention[]; tags_error: string}>("processes/"+button.dataset.process+"/accept",{confirm:true,attempt:button.dataset.attempt});
        state={...state!,attention:done.attention};notice=done.tags_error?`SLOP accettata; analisi dei tag non riuscita: ${done.tags_error}. Si ripete dal Database.`:"SLOP accettata: la trovi nella revisione del suo batch.";}
      catch(e){notice=String(e);}finally{busy=false;} render();return;}
    if(action==="close-process"){
      if(!window.confirm("Chiudere questo processo? Sparisce dall'elenco e le immagini dei suoi tentativi vengono cancellate dopo sette giorni."))return;
      try{state={...state!,...await call<{attention: Attention[]}>("processes/"+button.dataset.process+"/close",{})};notice="Processo chiuso.";}
      catch(e){notice=String(e);} render();return;}
    if(action==="new-batch"){batch=null;batchId="";sessionStorage.removeItem(DRAFT);page=1;notice="";await refresh();return;}
    if(action==="to-prompts"||action==="to-review"){page=action==="to-prompts"?2:4;render();return;}
    try {
      if(action==="manual-draft") {
        for (const input of root.querySelectorAll<HTMLTextAreaElement>("[data-manual]")) if (!input.reportValidity()) return;
        const tags = manual.tags.split(",").map(t=>tagFromInput(t));
        if (tags.some(t=>!t.ok)) throw Error(tags.find(t=>!t.ok)!.reason);
        const brief = Object.fromEntries(BRIEF_KEYS.map(k=>[k, manual[k].split("\n").map(t=>t.trim()).filter(Boolean)]));
        busy=true;render();
        batch=await call<Batch>("batches",{mode:"manual",prompt:manual.prompt,tags:tags.filter(t=>t.ok).map(t=>t.tag),brief});
        batchId=batch.id;sessionStorage.setItem(DRAFT,batchId);page=2;notice="Pronta: controlla e avvia quando vuoi.";
        return;
      }
      if(action==="images"||action==="save") await save();
      const messages:Record<string,string>={
        rewrite:`Riscrivere brief e prompt della REAL ${slot+1}? Una chiamata a pagamento con ${batch?.config?.text_model}, in più rispetto al massimo del batch, che sale a ${(batch?.max_calls || 0)+1}.`,
        images:`Avviare/riprendere il loop? Massimo ${batch?.config ? batch.items.length*(1+2*batch.config.max_generation_attempts) : 0} chiamate ulteriori: generazioni e valutazioni più tag solo dopo accettazione. ${batch?.config?.image_model}, qualità ${batch?.config?.quality}; valutatore e tag ${batch?.config?.text_model}. Stop alla prima accettazione.`,
        analyze:"Analizzare questa SLOP? Una chiamata a pagamento."};
      if(messages[action]&&!window.confirm(messages[action]))return;
      busy=true;notice="";render();
      if(action==="rewrite"){batch=await call<Batch>("batches/"+batchId+"/prompts",{confirm:true,index:slot});}
      else if(action==="images"){page=3;batch=await call<Batch>("batches/"+batchId+"/run",{confirm:true,phase:"images"});await follow();page=4;state=await call<State>("state");}
      else if(action==="save")notice="Brief e prompt salvati.";
      else if(image){
        if(action==="frame"){const choice=await chooseFrame(image.id,image.width,image.height,image.copy);if(choice)await saveFrame(image,choice);}
        else if(action==="treatment-edit"){const choice=await chooseTreatment(image);if(choice)await prepareItemCopy(image,image.copy?.crop || undefined,choice);}
        else if(action==="treatment-off"||action==="treatment-on")await prepareItemCopy(image,image.copy?.crop || undefined,{off:action==="treatment-off"});
        else await call("/"+image.id+"/"+action,action==="analyze"?{confirm:true}:{},"POST",LIBRARY);
        await loadBatch();
      }
    }catch(e){notice=String(e);if(page===3)page=4;await loadBatch().catch(()=>{});}finally{busy=false;progress="";render();}
  });
  await refresh();return {refresh};
}

