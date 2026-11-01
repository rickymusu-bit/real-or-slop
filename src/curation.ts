import { curationChoices, curationTextLimits, type CurationField, type CurationRecord } from "../shared/curation";
import { api, escape } from "./main";

const labels: Record<CurationField, string> = {
  subject_kind: "Tipologia del soggetto",
  country_or_region: "Regione rappresentata (classificazione)",
  period_bucket: "Periodo rappresentato (classificazione)",
  represented_country: "Paese rappresentato",
  represented_place: "Luogo rappresentato",
  represented_period: "Anno o intervallo rappresentato",
  image_medium: "Medium",
  composition: "Composizione",
  visual_style: "Stile visivo",
  quality_bucket: "Qualità percepita",
  verified_place: "Luogo verificato",
  verified_date: "Data o intervallo verificato",
  fact_evidence: "Prove dei fatti verificati (URL o riferimento archivistico preciso)",
  familiarity: "Familiarità del soggetto per il pubblico previsto",
  perceived_plausibility: "Plausibilità percepita",
  surprise_reason: "Elemento sorprendente e motivazione",
  cognitive_mechanism: "Meccanismo cognitivo",
  reveal_learning_point: "Punto didattico proposto per il reveal (privato)",
  authenticity_confidence: "Valutazione delle prove di autenticità / invenzione",
  reviewer_notes: "Note del revisore",
};
function field(key: CurationField, record: CurationRecord | null) {
  const value = record?.[key] || "";
  const choices = (curationChoices as Record<string, readonly string[]>)[key];
  const label = escape(labels[key]);
  return `<label>${label}${choices
    ? `<select data-curation="${key}"><option value="">Non classificato</option>${choices.map((choice) => `<option value="${choice}" ${choice === value ? "selected" : ""}>${escape(choice.replaceAll("_", " "))}</option>`).join("")}</select>`
    : `<textarea data-curation="${key}" rows="${key === "fact_evidence" || key === "reviewer_notes" ? 4 : 2}" maxlength="${(curationTextLimits as Record<string, number>)[key]}">${escape(value)}</textarea>`}</label>`;
}
export function curationForm(record: CurationRecord | null) {
  const groups: [string, CurationField[]][] = [
    ["Contesto rappresentato e classificazione visiva", ["subject_kind", "country_or_region", "represented_country", "represented_place", "period_bucket", "represented_period", "image_medium", "composition", "visual_style"]],
    ["Fatti documentati e verificati dal revisore", ["verified_place", "verified_date", "fact_evidence"]],
    ["Valutazioni soggettive e annotazioni private", ["familiarity", "perceived_plausibility", "surprise_reason", "cognitive_mechanism", "quality_bucket", "authenticity_confidence", "reveal_learning_point", "reviewer_notes"]],
  ];
  return `<details class="curation" data-revision="${record?.revision || 0}"><summary>Scheda editoriale privata · revisione <span class="curation-revision">${record?.revision || 0}</span></summary><p>I campi vuoti significano “non classificato”. Per AI, luogo ed epoca rappresentati non provano che la scena sia esistita. I fatti verificati richiedono prove e conferma umana.</p>${groups.map(([title, fields]) => `<fieldset><legend>${title}</legend>${fields.map((key) => field(key, record)).join("")}</fieldset>`).join("")}<label><input class="facts-confirmed" type="checkbox"> Ho verificato i fatti indicati nelle fonti documentali</label><label>Motivazione della modifica<textarea class="curation-reason" rows="2" maxlength="2000" required></textarea></label><p>Salva la scheda prima della decisione. Il salvataggio non approva né pubblica l’immagine e non cambia la spiegazione mostrata in partita.</p><button data-curation-save>Salva scheda privata</button> <button data-curation-history>Mostra cronologia</button><p class="curation-status" role="status"></p><pre class="curation-history" hidden></pre></details>`;
}
function values(card: HTMLElement) {
  return Object.fromEntries(Array.from(card.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-curation]")).map((el) => [el.dataset.curation!, el.value.trim() || null]));
}
export function rememberCuration(queue: HTMLElement) {
  queue.querySelectorAll<HTMLElement>(".review").forEach((card) => { card.dataset.curationSaved = JSON.stringify(values(card)); });
}
export function curationDirty(card: HTMLElement) {
  return card.dataset.curationSaved !== JSON.stringify(values(card));
}
export function setupCuration(queue: HTMLElement) {
  queue.addEventListener("click", async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-curation-save], [data-curation-history]");
    if (!button) return;
    const card = button.closest<HTMLElement>(".review")!;
    const editor = card.querySelector<HTMLElement>(".curation")!;
    const status = card.querySelector<HTMLElement>(".curation-status")!;
    const path = `/admin/images/${card.dataset.id}/curation`;
    button.disabled = true;
    try {
      if (button.hasAttribute("data-curation-history")) {
        const result = await api<{ events: unknown[] }>(path);
        const history = card.querySelector<HTMLElement>(".curation-history")!;
        history.textContent = result.events.length ? JSON.stringify(result.events, null, 2) : "Nessuna modifica registrata.";
        history.hidden = false;
      } else {
        const submitted = values(card);
        const result = await api<{ curation: CurationRecord }>(path, {
          method: "PUT",
          body: JSON.stringify({
            revision: Number(editor.dataset.revision),
            curation: submitted,
            reason: (card.querySelector(".curation-reason") as HTMLInputElement).value,
            facts_confirmed: (card.querySelector(".facts-confirmed") as HTMLInputElement).checked,
          }),
        });
        editor.dataset.revision = String(result.curation.revision);
        card.dataset.curationSaved = JSON.stringify(submitted);
        card.querySelector(".curation-revision")!.textContent = editor.dataset.revision;
        (card.querySelector(".facts-confirmed") as HTMLInputElement).checked = false;
        (card.querySelector(".curation-reason") as HTMLInputElement).value = "";
        status.textContent = "Scheda salvata con cronologia. Stato di approvazione invariato.";
      }
    } catch (error) {
      status.textContent = String(error);
    } finally {
      button.disabled = false;
    }
  });
}
