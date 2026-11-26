/** One gallery wizard: description → variation → scene → generation → review → game copy. */
import type { Metrics } from "../shared/copy-treatment";
import { escape } from "../shared/html";
import { VISUAL_SECTIONS } from "../shared/real-description";
import { AXES, PARAMETERS, PARAMETER_KEYS, type Profile, type PipelineSettings, type Proposal, type Review } from "../shared/pipeline";
import { measureMissing, prepareItemCopy, type TreatableItem } from "./game-copy";
import { editFrame } from "./crop-editor";
import { chooseTreatment } from "./treatment-editor";
import { galleryPhotosPath } from "./gallery-paths";
import { withPhotoProcessing } from "./photo-processing";
import "./pipeline.css";

interface Source { id: string; title: string; metrics?:Metrics|null;copy?:{sha256:string|null}|null; profile: Profile | null; described: boolean }
interface Job { format:{requested_ratio:string;actual_width:number;actual_height:number}|null; id: string; source_id: string | null; state: string; proposal: Proposal | null; evaluation: Review | null;
  file: string | null; previous_key: string | null; error: string; snapshot: { variation?: {selected: string[]}; operation: string } }
interface Image extends TreatableItem { width: number; height: number; revision: number; status: string; file: string; original: string }
interface State { stats: {real_count:number;slop_count:number;rows:{key:string;real:Record<string,number>;slop:Record<string,number>}[]}; settings: PipelineSettings; sources: Source[]; jobs: Job[]; paid_calls: boolean; images: Image[] }
const LABELS: Record<string,string> = { queued: "Queued on server", dispatching:"Starting on server", working: "Processing on server", proposal: "Scene awaiting confirmation", candidate: "Image awaiting review",
  review: "Evaluation available", attention: "Needs attention", failed: "Failed to start", accepting: "Accepting image" };
const ACTIVE_PAID = new Set(["queued", "dispatching", "working"]);

export async function mountPipeline(root: HTMLElement, gallery: string) {
  const api = `/api/admin/pipeline/${encodeURIComponent(gallery)}`;
  let state: State | null = null, busy = false, notice = "", selected = new Set<string>(), initialized = false;
  const call = async <T>(path = "", data?: unknown, base = api): Promise<T> => {
    const response = await fetch(base + path, { method: data === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
    const value = await response.json(); if (!response.ok) throw Error(value.error || "Request failed"); return value as T;
  };
  const confirmation = (action: string, count: number) => count > 0 && window.confirm(`${action}? Maximum ${count} paid ${count === 1 ? "call" : "calls"}. Uncertain outcomes are not retried automatically.`);
  const stopQueued = async () => {
    if (!window.confirm("Cancel requests that have not been sent yet? Operations already in progress will finish without further automatic steps.")) return false;
    await call("/stop", { confirm: true }); return true;
  };
  /** Submit once, then only observe the approved Workflows. The modal outlives the enqueue response. */
  const paidWork = async (label: string, submit: (jobs: Set<string>) => Promise<void>) => {
    let finishSubmission!: () => void;
    const submitted = new Promise<void>(resolve => { finishSubmission = resolve; });
    return withPhotoProcessing(
    `${label}. Sending confirmed requests… Work continues on the server if you switch tabs or close this page.`, async progress => {
      const jobs = new Set<string>();
      let submissionError: unknown;
      try { await submit(jobs); }
      catch (error) {
        submissionError = error;
        // A lost enqueue response can still mean the server accepted work. Observe it, never send again.
        let current: State;
        try { current = await call<State>(); }
        catch { throw Error("Cannot confirm server progress. Work may continue on the server; reload to check without repeating paid calls."); }
        for (const job of current.jobs) if (ACTIVE_PAID.has(job.state)) jobs.add(job.id);
      } finally { finishSubmission(); }
      const total = jobs.size, failures: string[] = [];
      while (jobs.size && root.isConnected) {
        try { state = await call<State>(); }
        catch { throw Error("Cannot read server progress. Work continues on the server; reload to resume observation without repeating paid calls."); }
        for (const id of jobs) {
          const job = state.jobs.find(item => item.id === id);
          if (job && ACTIVE_PAID.has(job.state)) continue;
          if (job && ["attention", "failed"].includes(job.state)) failures.push(job.error || LABELS[job.state]);
          jobs.delete(id);
        }
        progress(`${label}: ${total - jobs.size} of ${total} finished; ${jobs.size} pending on the server.` +
          " Work continues if you switch tabs or close this page.");
        if (jobs.size) await new Promise<void>(resolve => window.setTimeout(resolve, 1000));
      }
      if (submissionError) throw submissionError;
      if (failures.length) throw Error(`${failures.length} operations need attention. ${failures.slice(0, 3).join(" / ")}`);
    }, [{ label: "Stop queued requests", run: async () => {
      if (!window.confirm("Cancel requests that have not been sent yet? Operations already in progress will finish without further automatic steps.")) return false;
      // Wait until the confirmed batch is persisted so the stop request cannot race its enqueue.
      await submitted; await call("/stop", { confirm: true }); return true;
    } }]);
  };
  const confirmMask = async (job:Job, index:number):Promise<string|null> => {
    const correction=job.evaluation!.corrections[index],bitmap=await createImageBitmap(await fetch(job.file!).then(r=>r.blob()));
    const dialog=document.createElement("dialog");dialog.className="pipeline-mask";
    dialog.innerHTML=`<h2>Local correction · maximum 1 call</h2><p>${escape(correction.defect)}</p><p>Benefit: ${escape(correction.benefit)}</p><p>Risk: ${escape(correction.risk)}</p><canvas aria-label="Correction area highlighted in red"></canvas><p>The entire photo will be sent to the model. The mask does not guarantee preservation of pixels outside it.</p><div class="pipeline-probabilities">${[["x","Left"],["y","Top"],["width","Width"],["height","Height"]].map(([key,label])=>`<label>${label} (%)<input type="number" min="0" max="100" step=".1" data-region="${key}" value="${correction.region[key as keyof typeof correction.region]*100}"></label>`).join("")}</div><p role="alert" data-mask-error></p><button data-mask-confirm>Confirm correction (1 call)</button><button data-mask-cancel>Cancel</button>`;
    document.body.append(dialog);const canvas=dialog.querySelector("canvas")!,ctx=canvas.getContext("2d")!;canvas.width=bitmap.width;canvas.height=bitmap.height;
    const region=()=>Object.fromEntries([...dialog.querySelectorAll<HTMLInputElement>("[data-region]")].map(input=>[input.dataset.region!,Number(input.value)/100])) as typeof correction.region;
    const draw=()=>{const r=region();ctx.drawImage(bitmap,0,0);ctx.fillStyle="rgba(240,30,50,.35)";ctx.fillRect(r.x*canvas.width,r.y*canvas.height,r.width*canvas.width,r.height*canvas.height);};
    dialog.addEventListener("input",draw);draw();dialog.showModal();
    return new Promise(resolve=>{
      const finish=(value:string|null)=>{bitmap.close();dialog.close();dialog.remove();resolve(value);};
      dialog.querySelector("[data-mask-cancel]")!.addEventListener("click",()=>finish(null));dialog.addEventListener("cancel",event=>{event.preventDefault();finish(null);});
      dialog.querySelector("[data-mask-confirm]")!.addEventListener("click",()=>{
        const r=region();if(Object.values(r).some(x=>!Number.isFinite(x)||x<0||x>1)||r.width<=0||r.height<=0||r.x+r.width>1||r.y+r.height>1){dialog.querySelector("[data-mask-error]")!.textContent="The area must fit inside the photo.";return;}
        ctx.fillStyle="#000";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.clearRect(Math.floor(r.x*canvas.width),Math.floor(r.y*canvas.height),Math.ceil(r.width*canvas.width),Math.ceil(r.height*canvas.height));
        finish(canvas.toDataURL("image/png").split(",")[1]);
      });
    });
  };
  const payload = (extra: Record<string,unknown> = {}) => ({ confirm: true, request: crypto.randomUUID(), ...extra });
  const profileFields = (profile:Profile, scope:string) => `<fieldset data-profile-scope="${scope}"><label>Photographic genre<input data-profile-genre value="${escape(profile.genre)}"></label>${PARAMETER_KEYS.map(key=>`<details><summary>${PARAMETERS[key]}</summary><label>Observed or intended value<textarea data-value="${key}" rows="2">${escape(profile.parameters[key].value)}</textarea></label><label>Category for balancing<input data-category="${key}" value="${escape(profile.parameters[key].category)}"></label></details>`).join("")}<h4>Peculiarities</h4>${profile.peculiarities.map((x,i)=>`<label>${escape(x.description)}<select data-policy="${i}">${[["preserve","Preserve faithfully"],["vary","Vary coherently"],["draw","Follow the parameter draw"]].map(([k,v])=>`<option value="${k}" ${x.policy===k?"selected":""}>${v}</option>`).join("")}</select></label>`).join("")}</fieldset>`;
  const readProfile = (profile:Profile, scope:string) => {
    const value=structuredClone(profile),form=root.querySelector<HTMLElement>(`[data-profile-scope="${scope}"]`)!;
    value.genre=form.querySelector<HTMLInputElement>("[data-profile-genre]")!.value;
    for(const key of PARAMETER_KEYS) {value.parameters[key].value=form.querySelector<HTMLTextAreaElement>(`[data-value="${key}"]`)!.value;value.parameters[key].category=form.querySelector<HTMLInputElement>(`[data-category="${key}"]`)!.value;}
    value.peculiarities.forEach((x,i)=>{x.policy=form.querySelector<HTMLSelectElement>(`[data-policy="${i}"]`)!.value as typeof x.policy;});return value;
  };
  const description = (job: Job) => `<details><summary>English scene and parameters</summary><p>Selected for variation: ${escape(job.snapshot.variation?.selected.map(k => PARAMETERS[k as keyof typeof PARAMETERS] || k).join(", ") || "none")}</p>${job.proposal ? `<p>${escape(job.proposal.changes)}</p><p>${escape(job.proposal.dependencies)}</p><fieldset data-scene="${job.id}"><label>Target genre<input data-scene-genre value="${escape(job.proposal.genre)}"></label><label>Width:height ratio<input data-scene-ratio value="${escape(job.proposal.aspect_ratio)}"></label>${AXES.map(axis=>`<label>${VISUAL_SECTIONS[axis]}<textarea data-axis="${axis}" rows="3" lang="en">${escape(job.proposal!.scene[axis])}</textarea></label>`).join("")}<details><summary>Intended parameters after variation</summary>${profileFields(job.proposal.profile,job.id)}</details></fieldset>${job.state === "proposal" ? `<button data-action="scene" data-job="${job.id}">Save scene</button>` : ""}` : ""}</details>`;
  const readScene=(job:Job):Proposal=>{
    const form=root.querySelector<HTMLElement>(`[data-scene="${job.id}"]`)!,proposal=structuredClone(job.proposal!);
    for(const axis of AXES)proposal.scene[axis]=form.querySelector<HTMLTextAreaElement>(`[data-axis="${axis}"]`)!.value;
    proposal.genre=form.querySelector<HTMLInputElement>("[data-scene-genre]")!.value;proposal.aspect_ratio=form.querySelector<HTMLInputElement>("[data-scene-ratio]")!.value;proposal.profile=readProfile(proposal.profile,job.id);return proposal;
  };
  const render = () => {
    if (!state) { root.innerHTML = `<p role="status">${escape(notice || "Loading…")}</p>`; return; }
    const activeSources = new Set(state.jobs.map(j => j.source_id));
    const pending = state.sources.filter(s => !s.profile && !activeSources.has(s.id));
    const prepared = state.sources.filter(s => s.profile && s.described && !activeSources.has(s.id) && selected.has(s.id));
    root.innerHTML = `<section class="pipeline"><button data-action="refresh">Refresh status</button><p><a href="/docs/pipeline-slop.svg" target="_blank" rel="noopener">Complete pipeline diagram</a> · <a href="${galleryPhotosPath(gallery)}">Gallery photos</a></p>
      <p role="status" data-pipeline-notice>${escape(notice)}</p>
      <h2>1. Prepare the gallery</h2><button data-action="stop" ${state.jobs.some(j=>["queued","dispatching"].includes(j.state))?"":"disabled"}>Stop queued requests</button><p>${state.sources.length} REAL · ${pending.length} without parameters · ${state.jobs.filter(j => ["working","dispatching","queued"].includes(j.state)).length} operations in progress.</p>
      <button data-action="prepare" ${pending.length && !busy && state.paid_calls ? "" : "disabled"}>Describe and prepare all missing REAL (${pending.length})</button>
      <p>One call per full original: English description, genre, parameters and peculiarities. Distinctive temporary details are varied; model and edition details are preserved.</p>
      <details><summary>REAL and peculiarities</summary><label><input type="checkbox" data-all ${state.sources.every(s => selected.has(s.id)) ? "checked" : ""}> Select all</label>${state.sources.map(s => `<div class="pipeline-source"><label><input type="checkbox" data-source="${s.id}" ${selected.has(s.id) ? "checked" : ""}> ${escape(s.title)} ${s.profile ? "✓" : "— missing parameters"}</label>${s.profile ? `<details><summary>${escape(s.profile.genre)} · ${s.profile.peculiarities.length} peculiarities</summary>${profileFields(s.profile,s.id)}<button data-action="profile" data-source-id="${s.id}">Save parameters and peculiarities</button></details>` : ""}</div>`).join("")}</details>
      <h2>2. Gallery variations</h2><details><summary>Gallery composition</summary><p>${state.stats.real_count} annotated REAL; ${state.stats.slop_count} SLOP with saved intended parameters. SLOP data describes what was requested, rather than a verified measurement of the output. Check for recurring visual features too.</p><div class="pipeline-table"><table><thead><tr><th>Feature</th><th>Observed in REAL</th><th>Intended in SLOP</th></tr></thead><tbody>${state.stats.rows.map(r=>`<tr><th>${escape(PARAMETERS[r.key as keyof typeof PARAMETERS] || "Photographic genre")}</th><td>${escape(Object.entries(r.real).map(([k,n])=>`${k}: ${n}`).join(" · "))}</td><td>${escape(Object.entries(r.slop).map(([k,n])=>`${k}: ${n}`).join(" · ") || "None" )}</td></tr>`).join("")}</tbody></table></div></details><details><summary>Rules and probabilities</summary><label>Rules for this gallery<textarea data-rules rows="6">${escape(state.settings.rules)}</textarea></label>
      <label>Environment and genre<select data-environment>${[["keep","Keep environment and light"],["same_genre","Change environment, same genre"],["change_genre","Change environment and genre"]].map(([k,v]) => `<option value="${k}" ${state!.settings.environment===k?"selected":""}>${v}</option>`).join("")}</select></label>
      <label>Chance of plausible new values (%)<input type="number" min="0" max="100" data-novelty value="${state.settings.novelty*100}"></label>
      <p>Leave a probability blank to estimate it from the REAL composition. Ordinary values and the absence of a trait are also sampled. Zero changes are allowed. Frequencies are estimates to review alongside the results.</p>
      <div class="pipeline-probabilities">${PARAMETER_KEYS.map(k => `<label>${PARAMETERS[k]} (%)<input type="number" min="0" max="100" data-probability="${k}" placeholder="Automatic" value="${state!.settings.probabilities[k]===undefined ? "" : state!.settings.probabilities[k]!*100}"></label>`).join("")}</div><button data-action="settings">Save rules and probabilities</button></details>
      <button data-action="plan" ${prepared.length && !busy && state.paid_calls ? "" : "disabled"}>Prepare ${prepared.length} ${prepared.length === 1 ? "scene" : "scenes"} from selected REAL</button>
      <h2>3. Scenes and images to review</h2><div class="pipeline-actions"><button data-action="generate-all" ${state.jobs.some(j => j.state==="proposal")&&!busy?"":"disabled"}>Generate all confirmed scenes</button><button data-action="evaluate-all" ${state.jobs.some(j => j.state==="candidate")&&!busy?"":"disabled"}>Evaluate all new candidates</button></div>
      ${state.jobs.map(j => `<article class="pipeline-job" data-job-card="${j.id}"><h3>${escape(state!.sources.find(s=>s.id===j.source_id)?.title || "SLOP")} · ${escape(LABELS[j.state] || j.state)}</h3>${j.error?`<p role="alert">${escape(j.error)}</p>`:""}${description(j)}
      ${j.format?`<p>Requested ratio: ${escape(j.format.requested_ratio)}. Received dimensions: ${j.format.actual_width} × ${j.format.actual_height}.</p>`:""}${j.file?`<div class="pipeline-views"><figure><img src="${escape(j.file)}" alt="Full candidate"><figcaption>Full candidate</figcaption></figure>${j.previous_key?`<figure><img src="${api}/${j.id}/file?previous=1" alt="Before correction"><figcaption>Before correction</figcaption></figure>`:""}</div>`:""}
      ${j.evaluation?`<section><h4>Original evaluation</h4><p>${escape(j.evaluation.assessment)}</p><ul>${j.evaluation.findings.map(x=>`<li>${escape(x)}</li>`).join("")}</ul><p>Uncertainties: ${escape(j.evaluation.uncertainties.join(" · ") || "none")}</p>${j.evaluation.corrections.map((c,i)=>`<details><summary>Suggestion: ${escape(c.defect)}</summary><p>Benefit: ${escape(c.benefit)}</p><p>Risk: ${escape(c.risk)}</p><textarea data-instruction="${j.id}-${i}" rows="4" aria-label="Correction instruction">${escape(c.instruction)}</textarea><p>The mask covers the area identified by the evaluator. The API may also change pixels outside it: check the entire image after editing.</p><button data-action="edit" data-job="${j.id}" data-correction="${i}" ${["candidate","review"].includes(j.state)?"":"disabled"}>Confirm this correction (1 call)</button></details>`).join("")}</section>`:""}
      <div class="pipeline-actions">${j.state==="proposal"?`<button data-action="generate" data-job="${j.id}">Confirm generation</button>`:""}${["candidate","review"].includes(j.state)?`<button data-action="evaluate" data-job="${j.id}">Request evaluation (1 call)</button>`:""}${j.file && ["candidate","review","attention"].includes(j.state)?`<button data-action="accept" data-job="${j.id}">Accept full image</button>`:""}${!["queued","dispatching","working","accepting"].includes(j.state)?`<button data-action="close" data-job="${j.id}">Discard and close</button>`:""}</div></article>`).join("")}
      <h2>4. Treatment and game copies</h2><p>Adjust treatment if needed, check the frame and 4:5 copy, then approve and publish. A technical reference is sampled from measured REAL of the same genre; without a reference, the copy starts without treatment.</p>
      ${state.images.map(i=>`<article class="pipeline-job" data-accepted-image="${i.id}"><h3>SLOP · ${escape(i.status)}</h3><div class="pipeline-views"><img src="${escape(i.original)}" alt="Accepted original"><img src="${escape(i.file)}" alt="Game copy to check"></div><div class="pipeline-actions"><button data-action="copy" data-image="${i.id}">Prepare 4:5 copy</button><button data-action="frame" data-image="${i.id}">Framing</button><button data-action="treatment" data-image="${i.id}" ${i.treatment || i.generation?.slot?.target_metrics ? "" : "disabled"}>Adjust treatment</button>${i.status==="new"?`<button data-action="approve" data-image="${i.id}" ${i.copy?"":"disabled"}>Approve after checking</button>`:""}${i.status==="approved"?`<button data-action="publish" data-image="${i.id}">Publish</button>`:""}</div></article>`).join("")}</section>`;
    root.querySelectorAll<HTMLButtonElement>("button").forEach(b => { if(busy) b.disabled=true; });
  };
  const refresh = async () => { state = await call<State>(); if(!initialized && await measureMissing(state.sources)) state=await call<State>(); if(!initialized) {selected=new Set(state.sources.map(s=>s.id));initialized=true;} render(); };
  const act = async (work:()=>Promise<void>) => { if(busy)return;busy=true;root.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLButtonElement|HTMLSelectElement>("input,textarea,button,select").forEach(control=>{control.disabled=true;});try {await work();notice="Status updated.";}catch(e){notice=e instanceof Error?e.message:String(e);}finally{busy=false;await refresh().catch(e=>{notice=String(e);render();});} };
  root.addEventListener("change",event=>{ const input=event.target as HTMLInputElement;if(input.dataset.source){if(input.checked)selected.add(input.dataset.source);else selected.delete(input.dataset.source);}if(input.hasAttribute("data-all")){selected=input.checked?new Set(state!.sources.map(s=>s.id)):new Set();render();} });
  root.addEventListener("click",event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");if(!button||busy||!state)return;
    const action=button.dataset.action!,job=state.jobs.find(j=>j.id===button.dataset.job), image=state.images.find(i=>i.id===button.dataset.image);
    void act(async()=>{
      if(action==="refresh")return;
      if(action==="stop"){await stopQueued();return;}
      if(action==="settings"){
        const probabilities:PipelineSettings["probabilities"]={};root.querySelectorAll<HTMLInputElement>("[data-probability]").forEach(input=>{if(input.value!=="")probabilities[input.dataset.probability as keyof typeof probabilities]=Number(input.value)/100;});
        await call("/settings",{rules:root.querySelector<HTMLTextAreaElement>("[data-rules]")!.value,probabilities,environment:root.querySelector<HTMLSelectElement>("[data-environment]")!.value,novelty:Number(root.querySelector<HTMLInputElement>("[data-novelty]")!.value)/100});return;
      }
      if(action==="profile") { const source=button.dataset.sourceId!;await call("/profile",{id:source,profile:readProfile(state!.sources.find(s=>s.id===source)!.profile!,source)});return; }
      if(action==="prepare"||action==="plan"){
        const active=new Set(state!.jobs.map(j=>j.source_id));const ids=state!.sources.filter(s=>!active.has(s.id)&&(action==="prepare"?!s.profile:(selected.has(s.id)&&s.profile&&s.described))).map(s=>s.id);
        if(!confirmation(action==="prepare"?"Describe and prepare missing REAL":"Prepare English scenes",ids.length))return;
        await paidWork(action === "prepare" ? "Preparing REAL descriptions and parameters" : "Preparing English scenes", async jobs => {
          const size = action === "prepare" ? ids.length : 500;
          for (let at = 0; at < ids.length; at += size) {
            const chunk = ids.slice(at, at + size);
            const queued = await call<{jobs: string[]}>(`/${action}`, payload({ids:chunk,max_calls:chunk.length}));
            queued.jobs.forEach(id => jobs.add(id));
          }
        }); return;
      }
      if(action==="generate-all"||action==="evaluate-all"){
        const op=action==="generate-all"?"generate":"evaluate",jobs=state!.jobs.filter(j=>j.state===(op==="generate"?"proposal":"candidate"));
        if(op==="generate")for(const j of jobs){const proposal=readScene(j);await call(`/${j.id}/scene`,payload({proposal}));j.proposal=proposal;}
        if(!confirmation(op==="generate"?"Generate all saved scenes":"Evaluate all candidates",jobs.length))return;
        await paidWork(op === "generate" ? "Generating SLOP images" : "Evaluating full images", async pending => {
          for (const j of jobs) { pending.add(j.id); await call(`/${j.id}/${op}`,payload({max_calls:1,...(op==="generate"?{proposal:j.proposal}:{})})); }
        }); return;
      }
      if(job){
        if(action==="scene"){await call(`/${job.id}/scene`,payload({proposal:readScene(job)}));return;}
        if(action==="generate"||action==="evaluate"){if(action==="generate"){job.proposal=readScene(job);await call(`/${job.id}/scene`,payload({proposal:job.proposal}));}if(!confirmation(action==="generate"?"Generate the saved scene":"Evaluate the full image",1))return;
          await paidWork(action === "generate" ? "Generating SLOP image" : "Evaluating full image", async jobs => {
            jobs.add(job.id); await call(`/${job.id}/${action}`,payload({max_calls:1,...(action==="generate"?{proposal:job.proposal}:{})}));
          }); return;
        }
        if(action==="edit"){
          const index=Number(button.dataset.correction),mask=await confirmMask(job,index);if(!mask)return;
          const instruction = root.querySelector<HTMLTextAreaElement>(`[data-instruction="${job.id}-${index}"]`)!.value;
          await paidWork("Applying confirmed local correction", async jobs => {
            jobs.add(job.id); await call(`/${job.id}/edit`,payload({max_calls:1,instruction,mask}));
          }); return;
        }
        if(action==="accept"||action==="close") {if(!window.confirm(action==="accept"?"Accept this full image? The evaluator’s findings still need to be considered.":"Discard this job and its files?"))return;await call(`/${job.id}/${action}`,payload());return;}
      }
      if(image){
        if(action==="copy"){await prepareItemCopy(image);return;}
        if(action==="frame"){await editFrame(image);return;}
        if(action==="treatment"){const result=await chooseTreatment(image);if(result)await prepareItemCopy(image,undefined,{settings:result.settings});return;}
        if(action==="approve"||action==="publish") {if(!window.confirm(action==="publish"?"Publish the checked copy?":"Have you checked the original and final copy?"))return;await call(`/${image.id}/${action}`,{revision:image.revision},"/api/admin/library");return;}
      }
    }).then(resumePaid);
  });
  const resumePaid = async () => {
    if (busy || !state || !root.isConnected) return;
    const pending = state.jobs.filter(job => ACTIVE_PAID.has(job.state));
    if (pending.length) await act(() => paidWork("Observing paid operations already queued", async jobs => {
      pending.forEach(job => jobs.add(job.id));
    }));
  };
  await refresh(); await resumePaid();
  const timer=window.setInterval(()=>{if(!root.isConnected){clearInterval(timer);return;}if(!busy && state?.jobs.some(j=>["queued","dispatching","working","accepting"].includes(j.state)) && !(root.contains(document.activeElement) && (document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLSelectElement || document.activeElement instanceof HTMLInputElement && document.activeElement.type!=="checkbox")))void refresh().then(resumePaid).catch(e=>{notice=String(e);});},3000);
  return {refresh: async () => { await refresh(); await resumePaid(); }};
}
