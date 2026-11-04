import { api, content, escape } from "./main";
import type { ObjectValue } from "../shared/editorial-v2";

interface Candidate extends ObjectValue {
  id: string;
  origin: "REAL" | "AI";
  image: string;
  revision: number;
  review_state: string;
  provenance: ObjectValue;
  feedback: ObjectValue;
  review: { provenance?: ObjectValue; feedback?: ObjectValue };
}
interface Queue { candidates: Candidate[] }
const endpoint = "/admin/editorial/v2";
export async function showEditorialV2() {
  content().innerHTML = `<section class="page narrow editorial-v2"><div class="eyebrow">PROTOCOLLO 2 · STUDIO PRIVATO</div><h1>Due origini, uno sguardo critico.</h1><p>Le SLOP di questo studio nascono da idee e prompt originali, senza fotografie di riferimento. Le approvazioni restano nell’archivio sperimentale.</p><p><a href="/admin">Torna alla revisione</a></p><button id="v2-refresh">Aggiorna</button> <button id="v2-export">Esporta il campione per il benchmark</button><p id="v2-message" role="status"></p><div id="v2-queue"></div></section>`;
  const page = content().querySelector<HTMLElement>(".editorial-v2")!, queue = page.querySelector<HTMLElement>("#v2-queue")!, message = page.querySelector<HTMLElement>("#v2-message")!;
  let candidates: Candidate[] = [], busy = false;
  const load = async () => {
    const run = new URL(location.href).searchParams.get("run_id");
    const data = await api<Queue>(endpoint + "/candidates" + (run ? "?run_id=" + encodeURIComponent(run) : ""));
    if (!page.isConnected) return;
    candidates = data.candidates;
    queue.innerHTML = candidates.length ? candidates.map(row => {
      const proof = row.review.provenance || row.provenance, feedback = row.review.feedback || row.feedback;
      return `<article class="review" data-v2-id="${escape(row.id)}"><h2>${row.origin === "REAL" ? "REAL" : "SLOP"} · ${escape(row.review_state)}</h2><img class="review-image" src="${escape(row.image)}" alt="Candidata privata del protocollo 2"><details><summary>Profilo visivo</summary><pre>${escape(JSON.stringify(row.profile, null, 2))}</pre></details><details><summary>Provenienza e diritti da verificare</summary><p>Controlla le evidenze documentali. Ibridi, opere non fotografiche e casi incerti restano esclusi da REAL. Nessuna deduzione dai soli pixel certifica l’origine.</p><label>Dossier documentale<textarea class="v2-proof" rows="14">${escape(JSON.stringify(proof, null, 2))}</textarea></label></details><details open><summary>Spiegazione per il giocatore</summary><p>Distingui osservazioni, ipotesi fuorvianti, incertezza ed evidenza dell’origine. Non aggiungere presunti segni di AI senza riscontro.</p><label>Feedback documentato<textarea class="v2-feedback" rows="10">${escape(JSON.stringify(feedback, null, 2))}</textarea></label></details><label><input class="v2-confirm" type="checkbox"> Ho esaminato immagine, provenienza, diritti e spiegazione</label><div class="review-actions"><button data-v2-decision="approved" disabled>Approva per lo studio</button><button data-v2-decision="rejected" disabled>Rifiuta per lo studio</button></div><p class="status" role="status"></p></article>`;
    }).join("") : "<p>Nessuna candidata sperimentale archiviata.</p>";
    for (const card of queue.querySelectorAll<HTMLElement>("article")) {
      const image = card.querySelector<HTMLImageElement>("img")!, confirm = card.querySelector<HTMLInputElement>(".v2-confirm")!;
      const update = () => card.querySelectorAll<HTMLButtonElement>("[data-v2-decision]").forEach(button => { button.disabled = busy || !confirm.checked || !image.complete || !image.naturalWidth; });
      confirm.onchange = update; image.onload = update;
      image.onerror = () => { card.querySelector<HTMLElement>(".status")!.textContent = "Anteprima non disponibile: aggiorna prima della revisione."; update(); };
      update();
    }
  };
  page.addEventListener("click", async event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!target || busy) return;
    busy = true;
    try {
      if (target.id === "v2-refresh") await load();
      else if (target.id === "v2-export") {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ version: "2.0.0", candidates }, null, 2)], { type: "application/json" }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = "real-or-slop-v2-study.json"; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else if (target.dataset.v2Decision) {
        const card = target.closest<HTMLElement>("[data-v2-id]")!, row = candidates.find(item => item.id === card.dataset.v2Id)!;
        card.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = true; });
        await api(`${endpoint}/candidates/${encodeURIComponent(row.id)}/review`, { method: "POST", body: JSON.stringify({
          decision: target.dataset.v2Decision, revision: row.revision, confirm_reviewed: card.querySelector<HTMLInputElement>(".v2-confirm")!.checked,
          provenance: JSON.parse(card.querySelector<HTMLTextAreaElement>(".v2-proof")!.value) as unknown,
          feedback: JSON.parse(card.querySelector<HTMLTextAreaElement>(".v2-feedback")!.value) as unknown,
        }) });
        message.textContent = "Revisione archiviata nello studio privato.";
        await load();
      }
    } catch (error) {
      if (page.isConnected) message.textContent = String(error);
    } finally {
      busy = false;
      for (const confirm of queue.querySelectorAll<HTMLInputElement>(".v2-confirm")) confirm.dispatchEvent(new Event("change"));
    }
  });
  await load().catch(error => { if (page.isConnected) message.textContent = String(error); });
}
