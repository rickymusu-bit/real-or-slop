/** Review of the SLOP wizard (step 7) and processes without a SLOP: every attempt with its whole candidate and evaluation, accepted
 * images with frame, treatment, approval and publication. The manual generation was retired on 2026-11-22 (owner decision); batches
 * are created and followed by the wizard (src/slop-auto.ts). */
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
const STATE_LABELS: Record<string, string> = {exhausted: "tentativi esauriti senza SLOP", review_needed: "il valutatore chiede la tua revisione",
  failed: "non riuscito", uncertain: "esito incerto, nessuna chiamata ripetuta"};
const API = "/api/admin/library/slop/", LIBRARY = "/api/admin/library";
async function call<T>(path: string, body?: unknown, method?: string, base = API): Promise<T> {
  const response = await fetch(base + path, {credentials: "same-origin", method: method || (body === undefined ? "GET" : "POST"),
    headers: {"Content-Type":"application/json"}, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json() as T & {error?: string};
  if (!response.ok) throw Error(data.error || "Richiesta non riuscita"); return data;
}
export function mountSlopStudio(root: HTMLElement, galleryId: string) {
  let state: State | null = null, batch: Batch | null = null, batchId = "", busy = false, notice = "";
  const scope = "?" + new URLSearchParams({gallery: galleryId});
  const loadBatch = async () => {
    if (!batchId) { batch = null; return; }
    const result = await call<Batch>("batches/" + batchId);
    batch = result.gallery_id === galleryId ? result : null;
  };
  const evaluation = (a: Attempt, open = false) => `<details data-evaluation="${escape(a.id)}"${open ? " open" : ""}><summary>Tentativo ${a.number}: ${escape(a.evaluation?.decision || a.status)}</summary>` +
    (a.file ? `<img src="${escape(a.file)}" alt="Candidata intera del tentativo ${a.number}" style="max-width:100%;max-height:360px;object-fit:contain">` : "") +
    `<p lang="en">${escape(a.prompt)}</p>` + (a.evaluation ? `<p>${escape(a.evaluation.action_reason)}</p><p>Difetti critici: ${escape(a.evaluation.critical_findings.join("; ") || "nessuno")}</p><p>Difetti minori: ${escape(a.evaluation.minor_findings.join("; ") || "nessuno")}</p><p>Incertezze: ${escape(a.evaluation.uncertainty_notes.join("; ") || "nessuna")}</p><p>Vincoli editoriali: ${a.evaluation.editorial_constraints_met ? "rispettati" : "non rispettati"}</p>` : "") + "</details>";
  const summary = () => batch?.config ? `<p class="hint">${batch.config.max_generation_attempts} tentativi massimi per SLOP; tolleranza ${["rigorosa","normale","permissiva"][batch.config.editorial_tolerance]}. Massimo ${batch.max_calls} chiamate (prompt, generazioni e valutazioni). Effettive: ${batch.processes.reduce((n,p) => n+p.calls,0)}. Modelli: ${escape(batch.config.text_model)}, ${escape(batch.config.image_model)}, qualità ${escape(batch.config.quality)}.</p>` : "";
  const review = () => !batch ? "" : `<section class="slop-review-section" aria-labelledby="slop-review-title"><h3 id="slop-review-title">Revisione delle SLOP</h3>` + summary() +
    '<p>Accettazione del modello e approvazione dell’owner sono separate. Controlla l’originale intero e la copia 4:5, regola inquadratura e trattamento, poi approva; pubblica solo dopo revisione.</p>' +
    batch.images.map(image => `<article class="rw-final slop-review" data-image="${image.id}"><h3>SLOP ${escape(image.status)}</h3>${image.generation?.slot?.acceptance?.by === "owner" ? '<p class="hint" data-owner-accepted>Accettata manualmente dall’owner. Le segnalazioni del valutatore restano nella valutazione originale.</p>' : ""}<div class="rw-preview-grid"><figure><img data-slop-original="${image.id}" data-long-press src="${escape(image.original)}" alt="Originale SLOP intero" style="max-width:100%;max-height:420px;object-fit:contain"><figcaption>Originale intero valutato</figcaption></figure><figure><img data-slop-copy="${image.id}" data-long-press src="${escape(image.file)}" alt="Copia di gioco 4:5" style="max-width:100%;max-height:420px;object-fit:contain"><figcaption>Copia 4:5${image.copy ? "" : " da preparare"}</figcaption></figure></div><p lang="en">${escape(image.prompt)}</p>` +
      `<div class="rw-actions">${image.status === "new" || image.status === "approved" ? `<button data-slop="frame" data-id="${image.id}">Inquadratura</button><button data-slop="${image.treatment?.off ? "treatment-on" : "treatment-off"}" data-id="${image.id}">${image.treatment?.off ? "Con trattamento" : "Senza trattamento"}</button>${image.treatment ? `<button data-slop="treatment-edit" data-id="${image.id}">Regola il trattamento</button>` : ""}` : ""}` +
      (image.status === "new" ? `<button data-slop="approve" data-id="${image.id}" ${image.copy ? "" : "disabled"}>Approva</button>` : "") +
      (image.status === "approved" ? `<button data-slop="publish" data-id="${image.id}">Pubblica</button>` : "") +
      (image.status !== "published" && image.status !== "trash" ? `<button data-slop="trash" data-id="${image.id}">Cestino</button>` : "") + '</div></article>').join("") +
    batch.processes.map(p => `<section><h3>${escape(batch!.items[p.slot]?.title || `SLOP ${p.slot + 1}`)}: ${escape(p.state)}</h3>${p.error ? `<p role="status">${escape(p.error)}</p>` : ""}${p.premise ? `<p>Premessa approvata: ${escape(p.premise)}</p>` : ""}${p.attempts.map(a => evaluation(a)).join("")}</section>`).join("") + "</section>";
  /** A saved and evaluated candidate can be accepted manually regardless of its findings. */
  const acceptable = (a: Attempt) => a.status === "completed" && !!a.file && !!a.evaluation;
  const attentionView = () => {
    const list = state?.attention || [];
    if (!list.length) return "";
    return `<section class="slop-attention" aria-labelledby="slop-attention-title"><h3 id="slop-attention-title">Da vedere: ${list.length} ${list.length === 1 ? "processo senza SLOP" : "processi senza SLOP"}</h3>` +
      list.map(p => `<details class="slop-closed" data-attention="${escape(p.id)}"><summary>${escape(p.title || "SLOP")}: ${escape(STATE_LABELS[p.state] || p.state)}</summary>` +
        `<p>${p.attempts.length} ${p.attempts.length === 1 ? "tentativo" : "tentativi"}, ${p.calls} chiamate registrate.${p.error ? " " + escape(p.error) : ""}</p>` +
        (p.premise ? `<p>Premessa approvata: ${escape(p.premise)}</p>` : p.brief ? `<p>Ancoraggi obbligatori: ${escape(p.brief.required.join("; "))}. Esclusioni: ${escape(p.brief.exclusions.join("; ") || "nessuna")}</p>` : "") +
        p.attempts.map(a => evaluation(a, false)).join("") +
        `<div class="rw-actions">${p.attempts.filter(acceptable).map(a => `<button data-slop="accept-process" data-process="${escape(p.id)}" data-attempt="${escape(a.id)}">Accetta comunque il tentativo ${a.number}</button>`).join("")}` +
        `<button data-slop="close-process" data-process="${escape(p.id)}">Chiudi: ho visto</button></div></details>`).join("") + "</section>";
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
      alt:element.dataset.slopOriginal ? "Originale intero" : "Copia 4:5", extra:`<p lang="en">${escape(image.prompt)}</p>`});
  });
  root.addEventListener("click", async event => {
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-slop]");
    if(!button||busy)return;
    const action=button.dataset.slop!, image=batch?.images.find(i=>i.id===button.dataset.id);
    if(action==="accept-process"){
      const attempt=state?.attention.find(p=>p.id===button.dataset.process)?.attempts.find(a=>a.id===button.dataset.attempt);
      if(!attempt || !acceptable(attempt))return;
      const e=attempt.evaluation!;
      const findings=[`Difetti critici: ${e.critical_findings.join("; ") || "nessuno"}`,
        `Difetti minori: ${e.minor_findings.join("; ") || "nessuno"}`,
        `Incertezze: ${e.uncertainty_notes.join("; ") || "nessuna"}`,
        ...(e.editorial_constraints_met ? [] : ["Il valutatore non ha potuto confermare i vincoli editoriali."])].join("\n");
      if(!window.confirm(`Accettare questa candidata (tentativo ${attempt.number}) nonostante la valutazione?\n\n${findings}\n\n${e.action_reason}\n\nLa tua decisione sarà registrata senza modificare la valutazione. Entra nella libreria come SLOP nuova, da approvare dopo la copia 4:5. Nessuna chiamata a pagamento.`))return;
      busy=true;notice="Accettazione…";render();
      try{await call("processes/"+button.dataset.process+"/accept",{confirm:true,attempt:button.dataset.attempt});
        state=await call<State>("state"+scope);await loadBatch();notice="SLOP accettata: la trovi nella revisione del suo batch.";}
      catch(e){notice=String(e);}finally{busy=false;} render();return;}
    if(action==="close-process"){
      if(!window.confirm("Chiudere questo processo? Sparisce dall'elenco e le immagini dei suoi tentativi vengono cancellate dopo sette giorni."))return;
      try{await call("processes/"+button.dataset.process+"/close",{});state=await call<State>("state"+scope);notice="Processo chiuso.";}
      catch(e){notice=String(e);} render();return;}
    if(!image)return;
    busy=true;notice="";render();
    try {
      if (action === "frame") await editFrame(image);
      else if (action === "treatment-edit") {
        const choice = await chooseTreatment(image);
        if (choice) await withPhotoProcessing("Applico il trattamento alla foto…", () => prepareItemCopy(image, undefined, choice));
      } else if (action === "treatment-off" || action === "treatment-on") {
        await withPhotoProcessing("Elaboro la copia di gioco…", () => prepareItemCopy(image, undefined, { off: action === "treatment-off" }));
      } else await call("/" + image.id + "/" + action, {}, "POST", LIBRARY);
      await loadBatch();
    }catch(e){notice=String(e);await loadBatch().catch(()=>{});}finally{busy=false;render();}
  });
  return {refresh};
}
