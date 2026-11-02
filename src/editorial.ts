import { api, escape } from "./main";
interface Reference {
  id: string; role: string; rank: number; source_url: string;
  metadata_json: string; evaluation_json: string;
}
interface Attempt {
  id: string; reference_id: string; image_id: string | null; dossier_json: string;
  status: string | null; published_at: string | null; media_available?: number;
}
export function editorialPanel() {
  return `<section class="curation"><h2>Pipeline editoriale REAL / SLOP</h2><p>Le prime posizioni della classifica diventano candidate REAL. Le altre fotografie forniscono soltanto idee testuali al generatore. Ogni risultato richiede revisione umana.</p><button id="editorial-refresh">Carica dossier automatici e diagnostica</button><details><summary>Elaborazioni Batch</summary><pre id="editorial-batches" class="curation-history"></pre></details><div id="editorial-dossiers"></div><details><summary>Comparabilità del catalogo pubblicato</summary><pre id="editorial-diagnostics" class="curation-history"></pre></details><label><input id="publication-confirm" type="checkbox"> Ho verificato le approvazioni e confermo la pubblicazione nell’ambiente corrente</label><button id="editorial-publish">Pubblica gruppi bilanciati approvati</button><p id="editorial-status" role="status"></p></section>`;
}
export function setupEditorial(page: HTMLElement) {
  const output = page.querySelector<HTMLElement>("#editorial-dossiers")!;
  const status = page.querySelector<HTMLElement>("#editorial-status")!;
  const load = async () => {
    const [data, state, batches] = await Promise.all([
      api<{ references: Reference[]; attempts: Attempt[] }>("/admin/editorial/dossiers"),
      api<{ diagnostics: unknown }>("/admin/editorial/state"),
      api<unknown[]>("/admin/editorial/batch-runs"),
    ]);
    if (!page.isConnected) return;
    page.querySelector("#editorial-diagnostics")!.textContent = JSON.stringify(state.diagnostics, null, 2);
    page.querySelector("#editorial-batches")!.textContent = JSON.stringify(batches, null, 2);
    output.innerHTML = data.references.map(photo => {
      const metadata = JSON.parse(photo.metadata_json) as { title?: string };
      const attempts = data.attempts.filter(attempt => attempt.reference_id === photo.id);
      return `<details><summary>${escape(metadata.title)} · ${escape(photo.role)} · posizione ${photo.rank}</summary><p><a href="${escape(photo.source_url)}" target="_blank" rel="noopener noreferrer">Fonte documentata ↗</a></p><img loading="lazy" src="/api/admin/editorial/references/${encodeURIComponent(photo.id)}/preview" alt="Fotografia sorgente privata"><details><summary>Valutazione della fotografia</summary><pre class="curation-history">${escape(photo.evaluation_json)}</pre></details>${attempts.map(attempt => `<article><h3>Tentativo ${escape(attempt.id)}</h3><p>${escape(attempt.status || "Scartato / errore / in attesa di importazione")} · ${attempt.published_at ? "Pubblicata: " + escape(attempt.published_at) : "Non pubblicata"}</p>${attempt.media_available && !attempt.image_id ? `<img loading="lazy" src="/api/admin/editorial/attempts/${encodeURIComponent(attempt.id)}/preview" alt="Risultato sintetico scartato, archivio privato">` : ""}${attempt.image_id ? `<img loading="lazy" src="/api/admin/assets/${encodeURIComponent(attempt.image_id)}" alt="Risultato sintetico privato"><a href="/admin?advanced=1&status=${encodeURIComponent(attempt.status || 'in-review')}">Apri la moderazione ↗</a>` : ""}<details><summary>Descrizione, brief, prompt effettivo, modelli, parametri, valutazione e motivazione</summary><pre class="curation-history">${escape(JSON.stringify(JSON.parse(attempt.dossier_json), null, 2))}</pre></details></article>`).join("")}</details>`;
    }).join("") || "<p>Nessun dossier automatico disponibile.</p>";
  };
  page.querySelector("#editorial-refresh")!.addEventListener("click", () => void load().catch(error => { status.textContent = String(error); }));
  page.querySelector("#editorial-publish")!.addEventListener("click", async () => {
    const button = page.querySelector<HTMLButtonElement>("#editorial-publish")!;
    if (!(page.querySelector("#publication-confirm") as HTMLInputElement).checked) { status.textContent = "Conferma la pubblicazione dopo la revisione."; return; }
    button.disabled = true;
    try {
      const result = await api<{ published: boolean }>("/admin/editorial/publish", { method: "POST", body: JSON.stringify({ confirm: true }) });
      status.textContent = result.published ? "Gruppo bilanciato pubblicato. Le eccedenze restano approvate in attesa." : "Nessun gruppo bilanciato disponibile.";
      (page.querySelector("#publication-confirm") as HTMLInputElement).checked = false;
      await load();
    } catch (error) { status.textContent = String(error); }
    finally { button.disabled = false; }
  });
}
