import { sourcePhotoPreview, type SourcePhoto } from "./editorial-view";
import { showVisualReview } from "./review";
import { mountEditorialWorkspace } from "./editorial-workspace.v1.0.0";
import { mountEditorialIntelligence } from "./editorial-intelligence.v1.0.0";
import { mountGameCatalogMode } from "./game-catalog-mode.v1.0.0";
import { mountAdminDashboard } from "./admin-dashboard.v1.0.0";
import { api, content, escape } from "./main";
import { curationDirty, curationForm, rememberCuration, setupCuration } from "./curation";
import type { CurationRecord } from "../shared/curation";
interface Candidate {
  reference?: SourcePhoto | null;
  id: string;
  title: string;
  type: string;
  source_url: string;
  license_url: string;
  evidence: string;
  author: string;
  curation: CurationRecord | null;
  ai_model?: string | null;
  ai_prompt?: string | null;
  generation_date?: string | null;
  owner_declaration?: number;
  studio_plan_id?: string | null;
  explanation: string;
  published_at?: string | null;
  editorial_evaluation?: string | null;
}
function aiProvenance(image: Candidate) {
  return image.type === "AI" ? `<details><summary>Provenienza della generazione IA</summary><p>Modello: ${escape(image.ai_model)} · Data: ${escape(image.generation_date)} · Dichiarazione proprietario: ${image.owner_declaration ? "presente" : "da verificare"}</p><pre class="curation-history">${escape(image.ai_prompt)}</pre></details>` : "";
}
export async function showAdmin() {
  if (new URL(location.href).searchParams.get("advanced") !== "1" && !new URL(location.href).searchParams.has("status")) {
    await showVisualReview();
    await mountGameCatalogMode();
    await mountEditorialWorkspace();
    await mountEditorialIntelligence();
    mountAdminDashboard();
    return;
  }
  return showAdvancedAdmin();
}
async function showAdvancedAdmin() {
  content().innerHTML =
    `<section class="page narrow"><div class="eyebrow">AMMINISTRAZIONE PRIVATA</div><h1>Gestione avanzata.</h1><p><a href="/admin">Torna alle immagini da valutare</a> · <a href="/admin/similarity">Somiglianze</a></p><p>Le approvazioni interessano solo l’ambiente corrente. Nessuna promozione automatica in produzione.</p><p>Licenze ammesse: CC0, pubblico dominio verificato, CC BY, BY-SA, BY-NC, BY-ND, BY-NC-SA e BY-NC-ND 2.0, 3.0 e 4.0, incluse le varianti territoriali pubblicate. Conserva la versione e la giurisdizione della fonte e verifica attribuzioni, modifiche e share-alike. NC: solo uso non commerciale. ND: nessun adattamento condiviso; conserva il fotogramma intero e verifica il trattamento tecnico.</p><label>Stato<select id="review-filter"><option value="in-review">In revisione</option><option value="approved">Approvate</option><option value="rejected">Rifiutate</option></select></label><div id="queue">Caricamento…</div><details><summary>Importa metadati</summary><p>Incolla un oggetto JSON conforme all’API documentata; poi carica il file nella scheda.</p><textarea id="import-json" rows="10" style="width:100%" aria-label="Metadati JSON"></textarea><button id="import">Importa nella coda privata</button></details></section>`;
  const initialStatus = new URL(location.href).searchParams.get("status");
  if (initialStatus && ["in-review", "approved", "rejected"].includes(initialStatus))
    (document.querySelector("#review-filter") as HTMLSelectElement).value = initialStatus;
  const load = async () => {
    try {
      const status = (
        document.querySelector("#review-filter") as HTMLSelectElement
      ).value;
      const items = await api<Candidate[]>("/admin/images?status=" + status);
      document.querySelector("#queue")!.innerHTML = items.length
        ? items
            .map(
              (i) =>
                `<article class="review" data-id="${escape(i.id)}"><h2>${escape(i.title)} · ${escape(i.type)}</h2><p>${escape(i.author)} · ${i.published_at ? "Pubblicata" : "Non pubblicata"}</p>${i.editorial_evaluation ? `<details><summary>Valutazione editoriale automatica</summary><pre>${escape(i.editorial_evaluation)}</pre></details>` : ""}<a href="${safeUrl(i.source_url)}" target="_blank" rel="noopener noreferrer">${i.type === "AI" ? "Servizio di generazione" : "Pagina della fonte"} ↗</a><p><a href="${safeUrl(i.license_url)}" target="_blank" rel="noopener noreferrer">Licenza ↗</a></p><details><summary>Prove</summary><p>${escape(i.evidence)}</p></details>${aiProvenance(i)}${sourcePhotoPreview(i.reference)}<label>Spiegazione post-risposta da approvare<textarea class="review-explanation" maxlength="4000" rows="4">${escape(i.explanation)}</textarea></label><img src="/api/admin/assets/${escape(i.id)}" alt="Anteprima privata della candidata"><label>Carica file<input class="upload" type="file" accept="image/jpeg,image/png,image/webp"></label>${curationForm(i.curation)}<label>URL licenza verificata<input class="license-url" value="${escape(i.license_url)}" placeholder="https://creativecommons.org/…"></label><label>Categorie (ID separati da virgola, vuoto = conserva)<input class="categories"></label><label><input class="rights" type="checkbox"> Ho verificato diritti e obblighi della licenza</label><label><input class="authenticity" type="checkbox"> Ho verificato autenticità o invenzione dell’immagine IA</label><label>Nota editoriale (facoltativa)<input class="notes"></label>${status === "in-review" ? '<button data-decision="approved">Approva in questo ambiente</button> <button data-decision="rejected">Rifiuta</button>' : ""}<p class="status" role="status"></p></article>`,
            )
            .join("")
        : "<p>Nessuna candidata in questo stato.</p>";
      rememberCuration(document.querySelector<HTMLElement>("#queue")!);
    } catch (e) {
      document.querySelector("#queue")!.textContent = String(e);
    }
  };
  document
    .querySelector("#review-filter")!
    .addEventListener("change", () => void load());
  setupCuration(document.querySelector<HTMLElement>("#queue")!);
  document
    .querySelector("#queue")!
    .addEventListener("change", async (event) => {
      const el = event.target as HTMLInputElement;
      if (!el.classList.contains("upload") || !el.files?.[0]) return;
      const card = el.closest<HTMLElement>(".review")!;
      const r = await fetch("/api/admin/assets/" + card.dataset.id, {
        method: "PUT",
        body: el.files[0],
      });
      card.querySelector(".status")!.textContent = r.ok
        ? "File caricato"
        : "Caricamento non riuscito";
    });
  document.querySelector("#queue")!.addEventListener("click", async (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-decision]",
    );
    if (!btn) return;
    const card = btn.closest<HTMLElement>(".review")!;
    btn.disabled = true;
    try {
      if (curationDirty(card)) throw new Error("Salva prima le modifiche alla scheda editoriale privata.");
      await api("/admin/review/" + card.dataset.id, {
        method: "POST",
        body: JSON.stringify({
          decision: btn.dataset.decision,
          ...(card.querySelector(".review-explanation") ? { explanation: (card.querySelector(".review-explanation") as HTMLInputElement).value } : {}),
          license_url: (card.querySelector(".license-url") as HTMLInputElement)
            .value,
          categories: (
            card.querySelector(".categories") as HTMLInputElement
          ).value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          rights_confirmed: (card.querySelector(".rights") as HTMLInputElement)
            .checked,
          authenticity_confirmed: (
            card.querySelector(".authenticity") as HTMLInputElement
          ).checked,
          notes: (card.querySelector(".notes") as HTMLInputElement).value,
        }),
      });
      await load();
    } catch (e) {
      card.querySelector(".status")!.textContent = String(e);
      btn.disabled = false;
    }
  });
  document.querySelector("#import")!.addEventListener("click", async () => {
    try {
      await api("/admin/import", {
        method: "POST",
        body: (document.querySelector("#import-json") as HTMLTextAreaElement)
          .value,
      });
      await load();
    } catch (e) {
      document.querySelector("#queue")!.textContent = String(e);
    }
  });
  await load();
}
export function safeUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? escape(url) : "#";
  } catch {
    return "#";
  }
}
