/** Review of the SLOP wizard (step 7) and processes without a SLOP: every attempt with its whole candidate and evaluation, accepted
 * images with frame, treatment, approval and publication. The manual generation was retired on 2026-11-22 (owner decision); batches
 * remain available for manual recovery; new generation uses src/pipeline.ts. */
import "./slop-studio.css";
import { prepareItemCopy, type TreatableItem } from "./game-copy";
import { chooseTreatment } from "./treatment-editor";
import { editFrame } from "./crop-editor";
import { withPhotoProcessing } from "./photo-processing";
import { escape } from "../shared/html";
import { type Brief, type Evaluation } from "../shared/editorial";
import type { InspirationItem } from "../shared/slop-proposals";
import { onLongPress, openPreview } from "./image-preview";
interface Config { max_generation_attempts: number; editorial_tolerance: number; text_model: string; image_model: string; quality: string; mode?: "manual" | "gallery" }
interface Image extends TreatableItem { id: string; status: string; revision: number; file: string; original: string;
  width: number; height: number; copy: TreatableItem["copy"]; prompt: string }
interface Attempt {id: string; number: number; prompt: string; status: string; evaluation: Evaluation | null; file: string | null}
interface Process {id: string; slot: number; state: string; prompt: string; snapshot?: {mode?: string}; brief: Brief | null; premise?: string | null; attempts: Attempt[]; error: string; calls: number; image_id: string | null}
interface Batch {origin: string; id: string; items: InspirationItem[]; gallery_id: string; processes: Process[]; config: Config | null; max_calls: number;
  runner: {id: string; status: string | null; updated_at: string | null; alive: boolean} | null;
  prompts_status: string; prompts_error: string; images: Image[]}
interface Attention extends Process {title: string; batch_id: string; updated_at: string}
interface State {attention: Attention[]}
const STATE_LABELS: Record<string, string> = {exhausted: "attempts exhausted without SLOP", review_needed: "evaluator requests your review",
  failed: "failed", uncertain: "uncertain outcome, no calls repeated"};
const API = "/api/admin/library/slop/", LIBRARY = "/api/admin/library";
async function call<T>(path: string, body?: unknown, method?: string, base = API): Promise<T> {
  const response = await fetch(base + path, {credentials: "same-origin", method: method || (body === undefined ? "GET" : "POST"),
    headers: {"Content-Type":"application/json"}, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json() as T & {error?: string};
  if (!response.ok) throw Error(data.error || "Request failed"); return data;
}
export function mountSlopStudio(root: HTMLElement, galleryId: string) {
  let state: State | null = null, batch: Batch | null = null, batchId = "", busy = false, notice = "";
  const scope = "?" + new URLSearchParams({gallery: galleryId});
  const loadBatch = async () => {
    if (!batchId) { batch = null; return; }
    const result = await call<Batch>("batches/" + batchId);
    batch = result.gallery_id === galleryId ? result : null;
  };
  const evaluation = (a: Attempt, open = false) => `<details data-evaluation="${escape(a.id)}"${open ? " open" : ""}><summary>Attempt ${a.number}: ${escape(a.evaluation?.decision || a.status)}</summary>` +
    (a.file ? `<img src="${escape(a.file)}" alt="Full candidate from attempt ${a.number}" style="max-width:100%;max-height:360px;object-fit:contain">` : "") +
    `<p lang="en">${escape(a.prompt)}</p>` + (a.evaluation ? `<p>${escape(a.evaluation.action_reason)}</p><p>Critical defects: ${escape(a.evaluation.critical_findings.join("; ") || "none")}</p><p>Minor defects: ${escape(a.evaluation.minor_findings.join("; ") || "none")}</p><p>Uncertainties: ${escape(a.evaluation.uncertainty_notes.join("; ") || "none")}</p><p>Editorial constraints: ${a.evaluation.editorial_constraints_met ? "met" : "not met"}</p>` : "") + "</details>";
  const summary = () => batch?.config ? `<p class="hint">${batch.config.max_generation_attempts} maximum attempts per SLOP; tolerance ${["strict","normal","permissive"][batch.config.editorial_tolerance]}. Maximum ${batch.max_calls} calls (prompts, generations and evaluations). Actual: ${batch.processes.reduce((n,p) => n+p.calls,0)}. Models: ${escape(batch.config.text_model)}, ${escape(batch.config.image_model)}, quality ${escape(batch.config.quality)}.</p>` : "";
  const review = () => !batch ? "" : `<section class="slop-review-section" aria-labelledby="slop-review-title"><h3 id="slop-review-title">SLOP review</h3>` + summary() +
    '<p>Model acceptance and owner approval are separate. Check the full original and 4:5 copy, adjust framing and treatment, then approve; publish only after review.</p>' +
    batch.images.map(image => `<article class="rw-final slop-review" data-image="${image.id}"><h3>SLOP ${escape(image.status)}</h3>${image.generation?.slot?.acceptance?.by === "owner" ? '<p class="hint" data-owner-accepted>Manually accepted by the owner. Evaluator findings remain in the original evaluation.</p>' : ""}<div class="rw-preview-grid"><figure><img data-slop-original="${image.id}" data-long-press src="${escape(image.original)}" alt="Full SLOP original" style="max-width:100%;max-height:420px;object-fit:contain"><figcaption>Full original evaluated</figcaption></figure><figure><img data-slop-copy="${image.id}" data-long-press src="${escape(image.file)}" alt="4:5 game copy" style="max-width:100%;max-height:420px;object-fit:contain"><figcaption>4:5 copy${image.copy ? "" : " not prepared"}</figcaption></figure></div><p lang="en">${escape(image.prompt)}</p>` +
      `<div class="rw-actions">${image.status === "new" || image.status === "approved" ? `<button data-slop="frame" data-id="${image.id}">Framing</button><button data-slop="${image.treatment?.off ? "treatment-on" : "treatment-off"}" data-id="${image.id}">${image.treatment?.off ? "With treatment" : "Without treatment"}</button>${image.treatment ? `<button data-slop="treatment-edit" data-id="${image.id}">Adjust treatment</button>` : ""}` : ""}` +
      (image.status === "new" ? `<button data-slop="approve" data-id="${image.id}" ${image.copy ? "" : "disabled"}>Approve</button>` : "") +
      (image.status === "approved" ? `<button data-slop="publish" data-id="${image.id}">Publish</button>` : "") +
      (image.status !== "published" && image.status !== "trash" ? `<button data-slop="trash" data-id="${image.id}">Trash</button>` : "") + '</div></article>').join("") +
    batch.processes.map(p => `<section><h3>${escape(batch!.items[p.slot]?.title || `SLOP ${p.slot + 1}`)}: ${escape(p.state)}</h3>${p.error ? `<p role="status">${escape(p.error)}</p>` : ""}${p.premise ? `<p>Approved premise: ${escape(p.premise)}</p>` : ""}${p.attempts.map(a => evaluation(a)).join("")}</section>`).join("") + "</section>";
  /** A saved and evaluated candidate can be accepted manually regardless of its findings. */
  const acceptable = (a: Attempt) => a.status === "completed" && !!a.file && !!a.evaluation;
  const attentionView = () => {
    const list = state?.attention || [];
    if (!list.length) return "";
    return `<section class="slop-attention" aria-labelledby="slop-attention-title"><h3 id="slop-attention-title">To review: ${list.length} ${list.length === 1 ? "process without SLOP" : "processes without SLOP"}</h3>` +
      list.map(p => `<details class="slop-closed" data-attention="${escape(p.id)}"><summary>${escape(p.title || "SLOP")}: ${escape(STATE_LABELS[p.state] || p.state)}</summary>` +
        `<p>${p.attempts.length} ${p.attempts.length === 1 ? "attempt" : "attempts"}, ${p.calls} calls recorded.${p.error ? " " + escape(p.error) : ""}</p>` +
        (p.premise ? `<p>Approved premise: ${escape(p.premise)}</p>` : p.brief ? `<p>Required anchors: ${escape(p.brief.required.join("; "))}. Exclusions: ${escape(p.brief.exclusions.join("; ") || "none")}</p>` : "") +
        p.attempts.map(a => evaluation(a, false)).join("") +
        `<div class="rw-actions">${p.attempts.filter(acceptable).map(a => `<button data-slop="accept-process" data-process="${escape(p.id)}" data-attempt="${escape(a.id)}">Accept attempt anyway ${a.number}</button>`).join("")}` +
        `<button data-slop="close-process" data-process="${escape(p.id)}">Close: reviewed</button></div></details>`).join("") + "</section>";
  };
  const render = () => {
    const open = new Set([...root.querySelectorAll<HTMLDetailsElement>("details[data-attention][open], details[data-evaluation][open]")].map(d => d.dataset.attention || d.dataset.evaluation));
    root.innerHTML = `<div class="rw slop">${attentionView()}${notice ? `<p role="status" aria-live="polite">${escape(notice)}</p>` : ""}${review()}</div>`;
    for (const d of root.querySelectorAll<HTMLDetailsElement>("details[data-attention], details[data-evaluation]"))
      if (open.has(d.dataset.attention || d.dataset.evaluation)) d.open = true;
    if (busy) root.querySelectorAll<HTMLButtonElement>("button").forEach(b => b.disabled = true);
  };
  /** Shows the exceptions of the gallery and, when given, the review of a batch of the wizard. */
  const refresh = async (id: string | null = batchId || null) => {
    if (busy) return;
    batchId = id || "";
    try {
      state = await call<State>("state" + scope);
      await loadBatch();
    } catch (e) { notice = String(e); }
    render();
  };
  onLongPress(root, "[data-slop-original], [data-slop-copy]", element => {
    const image = batch?.images.find(i=>i.id===(element.dataset.slopOriginal || element.dataset.slopCopy));
    if(image) openPreview({src:element.dataset.slopOriginal ? image.original : image.file, title:"SLOP / "+image.status,
      alt:element.dataset.slopOriginal ? "Full original" : "4:5 copy", extra:`<p lang="en">${escape(image.prompt)}</p>`});
  });
  root.addEventListener("click", async event => {
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-slop]");
    if(!button||busy)return;
    const action=button.dataset.slop!, image=batch?.images.find(i=>i.id===button.dataset.id);
    if(action==="accept-process"){
      const attempt=state?.attention.find(p=>p.id===button.dataset.process)?.attempts.find(a=>a.id===button.dataset.attempt);
      if(!attempt || !acceptable(attempt))return;
      const e=attempt.evaluation!;
      const findings=[`Critical defects: ${e.critical_findings.join("; ") || "none"}`,
        `Minor defects: ${e.minor_findings.join("; ") || "none"}`,
        `Uncertainties: ${e.uncertainty_notes.join("; ") || "none"}`,
        ...(e.editorial_constraints_met ? [] : ["The evaluator could not confirm the editorial constraints."])].join("\n");
      if(!window.confirm(`Accept this candidate (attempt ${attempt.number}) despite the evaluation?\n\n${findings}\n\n${e.action_reason}\n\nYour decision will be recorded without changing the evaluation. It enters the library as a new SLOP, to approve after the 4:5 copy. No paid calls.`))return;
      busy=true;notice="Accepting…";render();
      try{await call("processes/"+button.dataset.process+"/accept",{confirm:true,attempt:button.dataset.attempt});
        state=await call<State>("state"+scope);await loadBatch();notice="SLOP accepted: find it in its batch review.";}
      catch(e){notice=String(e);}finally{busy=false;} render();return;}
    if(action==="close-process"){
      if(!window.confirm("Close this process? It leaves the list and its attempt images are deleted after seven days."))return;
      try{await call("processes/"+button.dataset.process+"/close",{});state=await call<State>("state"+scope);notice="Process closed.";}
      catch(e){notice=String(e);} render();return;}
    if(!image)return;
    busy=true;notice="";render();
    try {
      if (action === "frame") await editFrame(image);
      else if (action === "treatment-edit") {
        const choice = await chooseTreatment(image);
        if (choice) await withPhotoProcessing("Applying treatment to photo…", () => prepareItemCopy(image, undefined, choice));
      } else if (action === "treatment-off" || action === "treatment-on") {
        await withPhotoProcessing("Processing game copy…", () => prepareItemCopy(image, undefined, { off: action === "treatment-off" }));
      } else await call("/" + image.id + "/" + action, {}, "POST", LIBRARY);
      await loadBatch();
    }catch(e){notice=String(e);await loadBatch().catch(()=>{});}finally{busy=false;render();}
  });
  return {refresh};
}
