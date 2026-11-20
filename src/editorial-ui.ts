/** Editorial fields shared by the REAL wizard and the gallery details. */
import { DESCRIPTION_KEYS, type RealDescription } from "../shared/editorial";
import { escape } from "../shared/html";
const LABELS = { visible: "Elementi visibili", documented_context: "Contesto documentato da Commons" };
export function descriptionFields(id: string, value: RealDescription | null, disabled = false, commons = "") {
  return (commons ? `<details><summary>Contesto Commons originale</summary><p>${escape(commons)}</p></details>` : "") + '<fieldset class="editorial-description"><legend>Descrizione editoriale REAL</legend><p class="hint">Nei risultati compaiono gli elementi visibili e il contesto documentato.</p>' +
    DESCRIPTION_KEYS.map(k => `<label>${LABELS[k]}<textarea data-editorial="${k}" data-editorial-id="${escape(id)}" maxlength="3000" rows="3" ${disabled ? "disabled" : ""}>${escape(value?.[k] || "")}</textarea></label>`).join("") + '</fieldset>';
}
export function readDescription(root: ParentNode, id: string): RealDescription {
  const fields = [...root.querySelectorAll<HTMLTextAreaElement>("[data-editorial]")].filter(e => e.dataset.editorialId === id);
  return Object.fromEntries(DESCRIPTION_KEYS.map(k => [k, fields.find(f => f.dataset.editorial === k)?.value.trim() || ""])) as unknown as RealDescription;
}
