/** One gallery wizard: description → variation → scene → generation → review → game copy. */
import type { Metrics } from "../shared/copy-treatment";
import { followSlopObservations } from "./slop-observation";
import { escape } from "../shared/html";
import { VISUAL_SECTIONS } from "../shared/real-description";
import { AXES, PARAMETERS, PARAMETER_KEYS, type Profile, type PipelineSettings, type Proposal, type Review } from "../shared/pipeline";
import { measureMissing, prepareItemCopy, type TreatableItem } from "./game-copy";
import { editFrame } from "./crop-editor";
import { chooseTreatment } from "./treatment-editor";
import { galleryPhotosPath } from "./gallery-paths";
import { withPhotoProcessing } from "./photo-processing";
import "./pipeline.css";

interface Source { generated_count: number; id: string; title: string; metrics?:Metrics|null;copy?:{sha256:string|null}|null; profile: Profile | null; described: boolean }
interface Job { format:{requested_ratio:string;actual_width:number;actual_height:number}|null; id: string; source_id: string | null; state: string; proposal: Proposal | null; evaluation: Review | null;
  file: string | null; previous_key: string | null; error: string; snapshot: { variation?: {selected: string[]}; operation: string } }
interface Image extends TreatableItem { width: number; height: number; revision: number; status: string; file: string; original: string }
interface State { stats: {real_count:number;slop_count:number;slop_total:number;unobserved:string[];rows:{key:string;real:Record<string,number>;slop:Record<string,number>}[]}; settings: PipelineSettings; sources: Source[]; jobs: Job[]; paid_calls: boolean; images: Image[] }
const LABELS: Record<string,string> = { queued: "Queued on server", dispatching:"Starting on server", working: "Processing on server", proposal: "Scene awaiting confirmation", candidate: "Image awaiting review",
  review: "Evaluation available", attention: "Needs attention", failed: "Failed to start", accepting: "Accepting image" };
const ACTIVE_PAID = new Set(["queued", "dispatching", "working"]);

export async function mountPipeline(root: HTMLElement, gallery: string) {
  const api = `/api/admin/pipeline/${encodeURIComponent(gallery)}`;
  let state: State | null = null, busy = false, notice = "", selected = new Set<string>(), initialized = false, mergeKey = "genre";
  const openPanels = new Set<string>();
  type JobStatus = Pick<Job, "id" | "state" | "error">;
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
        let current: { jobs: JobStatus[] };
        try { current = await call<{ jobs: JobStatus[] }>("/status"); }
        catch { throw Error("Cannot confirm server progress. Work may continue on the server; reload to check without repeating paid calls."); }
        for (const job of current.jobs) if (ACTIVE_PAID.has(job.state)) jobs.add(job.id);
      } finally { finishSubmission(); }
      const total = jobs.size, failures: string[] = [];
      while (jobs.size && root.isConnected) {
        // Light status reads while waiting; the full page state is reloaded once at the end.
        let status: JobStatus[];
        try { status = (await call<{ jobs: JobStatus[] }>("/status")).jobs; }
        catch { throw Error("Cannot read server progress. Work continues on the server; reload to resume observation without repeating paid calls."); }
        for (const id of jobs) {
          const job = status.find(item => item.id === id);
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
  const featureName = (key: string) => PARAMETERS[key as keyof typeof PARAMETERS] || "Photographic genre";
  const counts = (values: Record<string, number>) => Object.entries(values).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) => `${k}: ${n}`).join(", ");
  /** Free consolidation of synonyms already saved in the gallery profiles (REAL and SLOP). */
  const mergeForm = (rows: State["stats"]["rows"]) => `<fieldset class="pipeline-merge"><legend>Merge equivalent categories (free)</legend>
    <p>Categories are stored in canonical form (lowercase, words joined by underscores). Merge names that mean the same thing; free-text values and descriptions are not changed.</p>
    <label>Feature<select data-merge-key>${rows.map(r => `<option value="${r.key}" ${r.key === mergeKey ? "selected" : ""}>${escape(featureName(r.key))}</option>`).join("")}</select></label>
    ${rows.map(r => { const all: Record<string, number> = { ...r.real }; for (const [k, n] of Object.entries(r.slop)) all[k] = (all[k] || 0) + n;
      return `<div data-merge-group="${r.key}" ${r.key === mergeKey ? "" : "hidden"}>${Object.entries(all).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, n]) =>
        `<label><input type="checkbox" data-merge-category value="${escape(k)}"> ${escape(k)} (${n})</label>`).join("") || "<p>No categories yet.</p>"}</div>`; }).join("")}
    <label>Merged category<input data-merge-into autocomplete="off" placeholder="e.g. object_documentation"></label>
    <button data-action="merge">Merge selected categories</button></fieldset>`;
  const render = () => {
    if (!state) { root.innerHTML = `<p role="status">${escape(notice || "Loading…")}</p>`; return; }
    const activeSources = new Set(state.jobs.map(j => j.source_id));
    const pending = state.sources.filter(s => (!s.profile || !s.described) && !activeSources.has(s.id));
    const prepared = state.sources.filter(s => s.profile && s.described && !activeSources.has(s.id) && selected.has(s.id));
    const rewritable = state.sources.filter(s => !activeSources.has(s.id));
    root.innerHTML = `<section class="pipeline"><button data-action="refresh">Refresh status</button><p><a href="/docs/pipeline-slop.svg" target="_blank" rel="noopener">Complete pipeline diagram</a> · <a href="${galleryPhotosPath(gallery)}">Gallery photos</a></p>
      <p role="status" data-pipeline-notice>${escape(notice)}</p>
      <h2>1. Prepare the gallery</h2><button data-action="stop" ${state.jobs.some(j=>["queued","dispatching"].includes(j.state))?"":"disabled"}>Stop queued requests</button><p>${state.sources.length} REAL · ${pending.length} without parameters · ${state.jobs.filter(j => ["working","dispatching","queued"].includes(j.state)).length} operations in progress.</p>
      <button data-action="prepare" ${pending.length && !busy && state.paid_calls ? "" : "disabled"}>Describe and prepare all missing REAL (${pending.length})</button>
      <button data-action="refresh-parameters" ${rewritable.length && !busy && state.paid_calls ? "" : "disabled"}>Rewrite parameters of all REAL (${rewritable.length})</button>
      <p>One call per full original: English description, genre, parameters and peculiarities. Distinctive temporary details are varied; model and edition details are preserved. Preparations of a gallery run one at a time, so each one reuses the categories written by the previous ones. A rewrite keeps the descriptions, replaces parameters and peculiarities, and rebuilds the category dictionary from the rewritten REAL only.</p>
      <details data-panel="parameters" ${openPanels.has("parameters") ? "open" : ""}><summary>REAL parameters and peculiarities</summary>${state.sources.map(s => `<div class="pipeline-source"><h3>${escape(s.title)}</h3>${s.profile ? `<details><summary>${escape(s.profile.genre)} · ${s.profile.peculiarities.length} peculiarities</summary>${profileFields(s.profile,s.id)}<button data-action="profile" data-source-id="${s.id}">Save parameters and peculiarities</button></details>` : "<p>Prepare this REAL to review its parameters.</p>"}</div>`).join("")}</details>
      <h2>2. Gallery variations</h2><p>${state.stats.slop_count} of ${state.stats.slop_total} SLOP observed. Approving a SLOP automatically observes its full original, at most one model call.</p><details data-panel="composition" ${openPanels.has("composition")?"open":""}><summary>Gallery composition</summary><p>${state.stats.real_count} annotated REAL; ${state.stats.slop_count} of ${state.stats.slop_total} SLOP observed from their full originals. Requested parameters are excluded from this comparison and accepted-image balancing. ${state.stats.unobserved.length} SLOP still need observation. Check for recurring visual features too.</p><div class="pipeline-table"><table><thead><tr><th>Feature</th><th>Observed in REAL</th><th>Observed in SLOP</th></tr></thead><tbody>${state.stats.rows.map(r=>`<tr><th>${escape(PARAMETERS[r.key as keyof typeof PARAMETERS] || "Photographic genre")}</th><td>${escape(counts(r.real) || "None")}</td><td>${escape(counts(r.slop) || "None")}</td></tr>`).join("")}</tbody></table></div><p>One automatic call per full SLOP original at approval, using the REAL attribute conventions and vocabulary. The observer receives no prompt, requested profile or source photo. Photos without an observation are excluded; approval starts the observation automatically.</p>${mergeForm(state.stats.rows)}</details><details><summary>Rules and probabilities</summary><label>Rules for this gallery<textarea data-rules rows="6">${escape(state.settings.rules)}</textarea></label>
      <label>Environment and genre<select data-environment>${[["keep","Keep environment and light"],["same_genre","Change environment, same genre"],["change_genre","Change environment and genre"]].map(([k,v]) => `<option value="${k}" ${state!.settings.environment===k?"selected":""}>${v}</option>`).join("")}</select></label>
      <label>Chance of plausible new values (%)<input type="number" min="0" max="100" data-novelty value="${state.settings.novelty*100}"></label>
      <p>Leave a probability blank to estimate it from the REAL composition. Ordinary values and the absence of a trait are also sampled. Zero changes are allowed. Frequencies are estimates to review alongside the results.</p>
      <div class="pipeline-probabilities">${PARAMETER_KEYS.map(k => `<label>${PARAMETERS[k]} (%)<input type="number" min="0" max="100" data-probability="${k}" placeholder="Automatic" value="${state!.settings.probabilities[k]===undefined ? "" : state!.settings.probabilities[k]!*100}"></label>`).join("")}</div><button data-action="settings">Save rules and probabilities</button></details>
      <section aria-labelledby="pipeline-selection-title" class="pipeline-selection">
      <h3 id="pipeline-selection-title">Choose REAL for new SLOP scenes</h3>
      <p>Choose the photos to use as starting points. Each selected REAL prepares one scene; image generation is confirmed later.</p><p>Usage counts include successful initial generations and verified historical uses, including discarded candidates. Corrections do not add uses. Older uses without supporting records are excluded. Used REAL remain selectable.</p>
      <div class="pipeline-actions"><label><input type="checkbox" data-all> Select all ready REAL</label><button data-action="clear-selection">Clear selection</button></div>
      <p role="status" data-selection-count></p>
      <div class="pipeline-source-grid">${state.sources.map(s => {
        const ready = !!s.profile && s.described && !activeSources.has(s.id);
        const reason = activeSources.has(s.id) ? "Finish or close its current job first" : !s.profile || !s.described ? "Prepare this REAL first" : "Ready for a new scene";
        return `<label class="pipeline-source-choice"><img src="/api/admin/library/${encodeURIComponent(s.id)}/file" alt="" loading="lazy"><span><input type="checkbox" data-source="${s.id}" ${selected.has(s.id) ? "checked" : ""} ${ready ? "" : "disabled"}> ${escape(s.title)}</span><small data-generated-count>${s.generated_count} SLOP generated</small><small>${reason}</small></label>`;
      }).join("")}</div>
      <button data-action="plan" ${prepared.length && !busy && state.paid_calls ? "" : "disabled"}>Prepare ${prepared.length} ${prepared.length === 1 ? "scene" : "scenes"} from selected REAL</button></section>
      <h2>3. Scenes and images to review</h2><div class="pipeline-actions"><button data-action="generate-all" ${state.jobs.some(j => j.state==="proposal")&&!busy?"":"disabled"}>Generate all confirmed scenes</button><button data-action="evaluate-all" ${state.jobs.some(j => j.state==="candidate")&&!busy?"":"disabled"}>Evaluate all new candidates</button></div>
      ${state.jobs.map(j => `<article class="pipeline-job" data-job-card="${j.id}"><h3>${escape(j.snapshot.operation === "observe" ? "SLOP parameter observation" : state!.sources.find(s=>s.id===j.source_id)?.title || "SLOP")} · ${escape(LABELS[j.state] || j.state)}</h3>${j.error?`<p role="alert">${escape(j.error)}</p>`:""}${j.snapshot.operation === "observe" ? "<p>Reading the full SLOP original without the requested parameters.</p>" : description(j)}
      ${j.format?`<p>Requested ratio: ${escape(j.format.requested_ratio)}. Received dimensions: ${j.format.actual_width} × ${j.format.actual_height}.</p>`:""}${j.file?`<div class="pipeline-views"><figure><img src="${escape(j.file)}" alt="Full candidate"><figcaption>Full candidate</figcaption></figure>${j.previous_key?`<figure><img src="${api}/${j.id}/file?previous=1" alt="Before correction"><figcaption>Before correction</figcaption></figure>`:""}</div>`:""}
      ${j.evaluation?`<section><h4>Original evaluation</h4><p>${escape(j.evaluation.assessment)}</p><ul>${j.evaluation.findings.map(x=>`<li>${escape(x)}</li>`).join("")}</ul><p>Uncertainties: ${escape(j.evaluation.uncertainties.join(" · ") || "none")}</p>${j.evaluation.corrections.map((c,i)=>`<details><summary>Suggestion: ${escape(c.defect)}</summary><p>Benefit: ${escape(c.benefit)}</p><p>Risk: ${escape(c.risk)}</p><textarea data-instruction="${j.id}-${i}" rows="4" aria-label="Correction instruction">${escape(c.instruction)}</textarea><p>The mask covers the area identified by the evaluator. The API may also change pixels outside it: check the entire image after editing.</p><button data-action="edit" data-job="${j.id}" data-correction="${i}" ${["candidate","review"].includes(j.state)?"":"disabled"}>Confirm this correction (1 call)</button></details>`).join("")}</section>`:""}
      <div class="pipeline-actions">${j.state==="proposal"?`<button data-action="generate" data-job="${j.id}">Confirm generation</button>`:""}${["candidate","review"].includes(j.state)?`<button data-action="evaluate" data-job="${j.id}">Request evaluation (1 call)</button>`:""}${j.file && ["candidate","review","attention"].includes(j.state)?`<button data-action="accept" data-job="${j.id}">Accept full image</button>`:""}${!["queued","dispatching","working","accepting"].includes(j.state)?`<button data-action="close" data-job="${j.id}">Discard and close</button>`:""}</div></article>`).join("")}
      <h2>4. Treatment and game copies</h2><p>Adjust treatment if needed, check the frame and 4:5 copy, then approve. Approved SLOP leave this step and can be found and published in the <a href="${galleryPhotosPath(gallery)}">gallery</a>. A technical reference is sampled from measured REAL of the same genre; without a reference, the copy starts without treatment.</p>
      ${state.images.map(i=>`<article class="pipeline-job" data-accepted-image="${i.id}"><h3>SLOP · ${escape(i.status)}</h3><div class="pipeline-views"><img src="${escape(i.original)}" alt="Accepted original"><img src="${escape(i.file)}" alt="Game copy to check"></div><div class="pipeline-actions"><button data-action="copy" data-image="${i.id}">Prepare 4:5 copy</button><button data-action="frame" data-image="${i.id}">Framing</button><button data-action="treatment" data-image="${i.id}" ${i.treatment || i.generation?.slot?.target_metrics ? "" : "disabled"}>Adjust treatment</button>${i.status==="new"?`<button data-action="approve" data-image="${i.id}" ${i.copy?"":"disabled"}>Approve after checking</button>`:""}</div></article>`).join("")}</section>`;
    syncSelection();
    root.querySelectorAll<HTMLButtonElement>("button").forEach(b => { if(busy) b.disabled=true; });
  };
  const readySources = () => state ? state.sources.filter(s => s.profile && s.described && !state!.jobs.some(j => j.source_id === s.id)) : [];
  // Update only selection controls: changing a checkbox must not erase unsaved rules or profile edits.
  const syncSelection = () => {
    const ready = readySources(), ids = new Set(ready.map(s => s.id));
    selected = new Set([...selected].filter(id => ids.has(id)));
    const count = selected.size, all = root.querySelector<HTMLInputElement>("[data-all]");
    if (all) { all.checked = !!ready.length && count === ready.length; all.indeterminate = count > 0 && count < ready.length; all.disabled = busy || !ready.length; }
    const status = root.querySelector<HTMLElement>("[data-selection-count]");
    if (status) status.textContent = `${count} selected · ${ready.length} ready · ${state!.sources.length} REAL in this gallery`;
    const plan = root.querySelector<HTMLButtonElement>("[data-action=plan]");
    if (plan) { plan.textContent = `Prepare ${count} ${count === 1 ? "scene" : "scenes"} from selected REAL`; plan.disabled = !count || busy || !state!.paid_calls; }
    root.querySelectorAll<HTMLInputElement>("[data-source]").forEach(input => { input.checked = selected.has(input.dataset.source!); });
  };
  const refresh = async () => { state = await call<State>(); if(!initialized && await measureMissing(state.sources)) state=await call<State>(); initialized=true; render(); };
  const act = async (work:()=>Promise<void>) => { if(busy)return;busy=true;root.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLButtonElement|HTMLSelectElement>("input,textarea,button,select").forEach(control=>{control.disabled=true;});try {notice="";await work();notice||="Status updated.";}catch(e){notice=e instanceof Error?e.message:String(e);}finally{busy=false;await refresh().catch(e=>{notice=String(e);render();});} };
  root.addEventListener("toggle",event=>{const panel=(event.target as HTMLElement).dataset?.panel;if(panel){if((event.target as HTMLDetailsElement).open)openPanels.add(panel);else openPanels.delete(panel);}},true);
  root.addEventListener("change",event=>{ const input=event.target as HTMLInputElement;
    if(input.hasAttribute("data-merge-key")){mergeKey=input.value;root.querySelectorAll<HTMLElement>("[data-merge-group]").forEach(group=>{group.hidden=group.dataset.mergeGroup!==mergeKey;group.querySelectorAll<HTMLInputElement>("input").forEach(box=>{box.checked=false;});});return;}if(input.dataset.source){if(input.checked)selected.add(input.dataset.source);else selected.delete(input.dataset.source);syncSelection();return;}if(input.hasAttribute("data-all")){selected=input.checked?new Set(readySources().map(s=>s.id)):new Set();syncSelection();} });
  root.addEventListener("click",event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");if(!button||busy||!state)return;
    if(button.dataset.action==="clear-selection"){selected.clear();syncSelection();return;}
    const action=button.dataset.action!,job=state.jobs.find(j=>j.id===button.dataset.job), image=state.images.find(i=>i.id===button.dataset.image);
    void act(async()=>{
      if(action==="refresh")return;
      if(action==="stop"){await stopQueued();return;}
      if(action==="settings"){
        const probabilities:PipelineSettings["probabilities"]={};root.querySelectorAll<HTMLInputElement>("[data-probability]").forEach(input=>{if(input.value!=="")probabilities[input.dataset.probability as keyof typeof probabilities]=Number(input.value)/100;});
        await call("/settings",{rules:root.querySelector<HTMLTextAreaElement>("[data-rules]")!.value,probabilities,environment:root.querySelector<HTMLSelectElement>("[data-environment]")!.value,novelty:Number(root.querySelector<HTMLInputElement>("[data-novelty]")!.value)/100});return;
      }
      if(action==="merge"){
        const group=root.querySelector<HTMLElement>(`[data-merge-group="${mergeKey}"]`),from=[...group?.querySelectorAll<HTMLInputElement>("[data-merge-category]:checked")??[]].map(input=>input.value);
        const into=root.querySelector<HTMLInputElement>("[data-merge-into]")!.value.trim();
        if(!from.length||!into)throw Error("Select at least one category and enter the merged name.");
        if(!window.confirm(`Rename ${from.join(", ")} to “${into}” in all profiles of this gallery? No paid call is made.`))return;
        const result=await call<{updated:number}>("/categories",{confirm:true,key:mergeKey,from,into});notice=`${result.updated} profiles updated.`;return;
      }
      if(action==="profile") { const source=button.dataset.sourceId!;await call("/profile",{id:source,profile:readProfile(state!.sources.find(s=>s.id===source)!.profile!,source)});return; }
      if(action==="refresh-parameters"){
        const active=new Set(state!.jobs.map(j=>j.source_id)),ids=state!.sources.filter(s=>!active.has(s.id)).map(s=>s.id);
        if(!confirmation("Rewrite the parameters of every REAL in this gallery, one at a time? Edited categories and peculiarity policies will be replaced",ids.length))return;
        let skipped=0;
        await paidWork("Rewriting REAL parameters", async jobs => {
          const queued = await call<{jobs: string[]; skipped?: number}>("/prepare", payload({ids,max_calls:ids.length,refresh:true}));
          queued.jobs.forEach(id => jobs.add(id)); skipped = queued.skipped || 0;
        });
        if(skipped)notice=`${skipped} REAL with another active job were skipped and not charged.`;
        return;
      }
      if(action==="prepare"||action==="plan"){
        const active=new Set(state!.jobs.map(j=>j.source_id));const ids=state!.sources.filter(s=>!active.has(s.id)&&(action==="prepare"?(!s.profile||!s.described):(selected.has(s.id)&&s.profile&&s.described))).map(s=>s.id);
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
        if(action==="approve"||action==="publish") {if(!window.confirm(action==="publish"?"Publish the checked copy?":"Have you checked the original and final copy?"))return;const observed=action==="approve"?await followSlopObservations(gallery,[image.id],()=>call(`/${image.id}/approve`,{revision:image.revision},"/api/admin/library")):(await call(`/${image.id}/${action}`,{revision:image.revision},"/api/admin/library"),null);if(action==="approve")notice="SLOP approved. Find it in the gallery to publish it. "+(observed||"");return;}
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
