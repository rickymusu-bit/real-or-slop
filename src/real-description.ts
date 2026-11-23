import { escape } from "../shared/html";
import { INDICATION_KEYS, VISUAL_INDICATIONS, VISUAL_KEYS, VISUAL_SECTIONS, type VisualDescription } from "../shared/real-description";
import { withPhotoProcessing } from "./photo-processing";

type RequestItem<T> = (path: string, options: RequestInit) => Promise<T>;
interface Target { id: string; title: string }

export function visualDescription(description: VisualDescription): string {
  return `<details class="editorial-description" data-visual-description><summary>Descrizione visiva</summary>
    <dl>${VISUAL_KEYS.filter(key => description.sections[key]).map(key => `<dt>${VISUAL_SECTIONS[key]}</dt>
      <dd>${escape(description.sections[key])}</dd>`).join("")}</dl>
    <h4>Indicazioni sulla scena</h4><dl>${INDICATION_KEYS.map(key => `<dt>${VISUAL_INDICATIONS[key]}</dt>
      <dd>${description.indications[key].applies ? "Sì" : "No"}. ${escape(description.indications[key].reason)}</dd>`).join("")}</dl>
    <p class="hint">Generata con ${escape(description.model)}</p></details>`;
}

export async function describePhotos<T>(targets: Target[], galleryId: string, request: RequestItem<T>, saved?: (item: T) => void) {
  const count = targets.length;
  if (!count || !window.confirm(`Descrivere ${count === 1 ? "questa REAL" : count + " REAL"}? ` +
    `Massimo ${count} ${count === 1 ? "chiamata" : "chiamate"} a pagamento, una per foto.`)) return null;
  return withPhotoProcessing("Preparo le descrizioni…", async progress => {
    let done = 0;
    const failures: string[] = [];
    for (const [index, item] of targets.entries()) {
      progress(`Descrivo la REAL ${index + 1} di ${count}…`);
      try {
        const updated = await request(`/${encodeURIComponent(item.id)}/description`, { method: "POST",
          body: JSON.stringify({ confirm: true, request: crypto.randomUUID(), gallery_id: galleryId }) });
        saved?.(updated);
        done++;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failures.push(`${item.title}: ${reason}`);
        if (reason.startsWith("OpenAI:") || reason === "Chiave OpenAI mancante") break;
      }
    }
    return `${done} di ${count} ${count === 1 ? "REAL descritta" : "REAL descritte"}.` +
      (failures.length ? ` ${failures.join(" / ")}` : "");
  });
}
