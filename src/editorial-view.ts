import { escape } from "../shared/html";

export interface SourcePhoto { id: string; title: string; source_url: string }
export interface Reference {
  id: string; role: string; rank: number; source_url: string; batch_id: string;
  created_at: string; metadata_json: string; evaluation_json: string;
}
export interface Attempt {
  id: string; reference_id: string; image_id: string | null; dossier_json: string;
  status: string | null; published_at: string | null; media_available?: number;
}
export interface Dossiers { references: Reference[]; attempts: Attempt[] }
function object(value: string): Record<string, unknown> {
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
}
function sourceLink(url: string) {
  try { if (new URL(url).protocol === "https:") return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">Pagina della fotografia originale ↗</a>`; } catch { /* Invalid URLs remain plain text. */ }
  return "";
}
export function sourcePhotoPreview(photo: SourcePhoto | null | undefined) {
  return photo ? `<figure class="source-photo"><figcaption>Fotografia sorgente del prompt</figcaption><img loading="lazy" src="/api/admin/editorial/references/${encodeURIComponent(photo.id)}/preview" alt="${escape(photo.title || "Fotografia sorgente privata")}">${sourceLink(photo.source_url)}</figure>` : "";
}
export function editorialBatches(data: Dossiers) {
  const batches = new Map<string, { id: string; created_at: string; photos: number; generated: number }>();
  for (const photo of data.references) {
    const batch = batches.get(photo.batch_id) || { id: photo.batch_id, created_at: photo.created_at, photos: 0, generated: 0 };
    batch.photos++;
    batch.generated += data.attempts.filter(attempt => attempt.reference_id === photo.id && (attempt.media_available || attempt.image_id)).length;
    batches.set(batch.id, batch);
  }
  return [...batches.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
}
export function editorialGallery(data: Dossiers, batchId: string) {
  return data.references.filter(photo => photo.batch_id === batchId).sort((a, b) => a.rank - b.rank).map(photo => {
    const metadata = object(photo.metadata_json), evaluation = object(photo.evaluation_json);
    const source = { id: photo.id, title: String(metadata.title || "Fotografia autentica"), source_url: photo.source_url };
    const attempts = data.attempts.filter(attempt => attempt.reference_id === photo.id);
    const score = typeof evaluation.score === "number" ? `${evaluation.score}/100` : "Valutazione non disponibile";
    const threshold = typeof evaluation.editorial_threshold === "number" ? evaluation.editorial_threshold : 65;
    const result = typeof evaluation.score === "number" && evaluation.score >= threshold ? "Sopra soglia · revisione umana richiesta" : "Sotto soglia editoriale";
    const original = photo.role === "SLOP" ? sourcePhotoPreview(source) : `<figure><figcaption>Fotografia REAL · ${escape(score)} · ${escape(result)}</figcaption><img loading="lazy" src="/api/admin/editorial/references/${encodeURIComponent(photo.id)}/preview" alt="${escape(source.title)}">${sourceLink(source.source_url)}</figure>`;
    const generations = attempts.map(attempt => {
      const dossier = object(attempt.dossier_json), assessment = dossier.evaluation as Record<string, unknown> | undefined;
      const decision = attempt.published_at ? "Pubblicata" : attempt.status === "approved" ? "Approvata, in attesa di pubblicazione" : attempt.status === "rejected" ? "Rifiutata" : dossier.status === "accepted" ? "Sopra soglia · da rivedere" : "Scartata / errore";
      const image = attempt.media_available ? `/api/admin/editorial/attempts/${encodeURIComponent(attempt.id)}/preview` : attempt.image_id ? `/api/admin/assets/${encodeURIComponent(attempt.image_id)}` : null;
      return `<div class="editorial-generation"><figure><figcaption>SLOP generata · ${escape(assessment?.score ?? "—")}/100 · ${escape(decision)}</figcaption>${image ? `<img loading="lazy" src="${image}" alt="SLOP generata dalla fotografia sorgente">` : "<p>File della generazione non archiviato.</p>"}</figure><p>${escape(assessment?.reason || dossier.error || "")}</p><details><summary>Descrizione, brief, prompt e valutazione</summary><pre class="curation-history">${escape(JSON.stringify(dossier, null, 2))}</pre></details>${attempt.image_id && attempt.status === "in-review" ? '<a href="/admin">Apri la revisione Approva / Rifiuta ↗</a>' : ""}</div>`;
    }).join("");
    return `<article class="editorial-card" data-reference-id="${escape(photo.id)}"><h3>#${photo.rank} · ${escape(photo.role === "REAL" ? "REAL" : "Sorgente SLOP")} · ${escape(source.title)}</h3><div class="editorial-comparison">${original}${photo.role === "SLOP" ? generations || "<p>Generazione non ancora disponibile.</p>" : ""}</div><details><summary>Valutazione della fotografia · ${escape(score)}</summary><pre class="curation-history">${escape(JSON.stringify(evaluation, null, 2))}</pre></details></article>`;
  }).join("") || "<p>Nessuna immagine nel lotto selezionato.</p>";
}
