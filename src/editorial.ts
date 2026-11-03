import { api, escape } from "./main";
import { editorialBatches, editorialGallery, type Dossiers } from "./editorial-view";
export function editorialPanel() {
  return `<section class="curation editorial-panel"><h2>Lotti REAL / SLOP</h2><p>Archivio privato: le immagini sotto soglia restano visibili per il confronto. La pubblicazione richiede sempre la revisione umana.</p><div class="editorial-toolbar"><label>Lotto<select id="editorial-lot" aria-label="Lotto editoriale"></select></label><button id="editorial-refresh">Ricarica immagini</button></div><p id="editorial-count" role="status">Caricamento delle immagini…</p><div id="editorial-dossiers"></div><details id="editorial-management"><summary>Diagnostica e pubblicazione avanzata</summary><details><summary>Elaborazioni Batch</summary><pre id="editorial-batches" class="curation-history"></pre></details><details><summary>Comparabilità del catalogo pubblicato</summary><pre id="editorial-diagnostics" class="curation-history"></pre></details><label><input id="publication-confirm" type="checkbox"> Ho verificato le approvazioni e confermo la pubblicazione nell’ambiente corrente</label><button id="editorial-publish">Pubblica gruppi bilanciati approvati</button></details><p id="editorial-status" role="status"></p></section>`;
}
export function setupEditorial(page: HTMLElement) {
  const output = page.querySelector<HTMLElement>("#editorial-dossiers")!;
  const status = page.querySelector<HTMLElement>("#editorial-status")!;
  const count = page.querySelector<HTMLElement>("#editorial-count")!;
  const selector = page.querySelector<HTMLSelectElement>("#editorial-lot")!;
  let data: Dossiers = { references: [], attempts: [] };
  let loading = false;
  const render = () => {
    const batch = editorialBatches(data).find(batch => batch.id === selector.value);
    count.textContent = batch ? `${batch.photos} fotografie · ${batch.generated} immagini SLOP · incluse quelle scartate` : "Nessun lotto disponibile.";
    output.innerHTML = editorialGallery(data, selector.value);
    output.querySelectorAll<HTMLImageElement>("img").forEach(image => image.addEventListener("error", () => {
      image.hidden = true;
      image.insertAdjacentHTML("afterend", '<p role="status">Anteprima non disponibile. Ricarica le immagini per riprovare.</p>');
    }, { once: true }));
  };
  const load = async () => {
    if (loading) return;
    loading = true;
    const button = page.querySelector<HTMLButtonElement>("#editorial-refresh")!;
    button.disabled = true;
    try {
      const next = await api<Dossiers>("/admin/editorial/dossiers");
      if (!page.isConnected) return;
      const previous = selector.value;
      data = next;
      const batches = editorialBatches(data);
      selector.innerHTML = batches.map(batch => `<option value="${escape(batch.id)}">${escape(batch.created_at.slice(0, 10))} · ${batch.photos} fotografie · ${batch.generated} SLOP</option>`).join("");
      selector.value = batches.some(batch => batch.id === previous) ? previous : batches[0]?.id || "";
      status.textContent = "";
      render();
    } catch (error) {
      if (page.isConnected) { status.textContent = String(error); count.textContent = "Caricamento non riuscito. Premi Ricarica immagini."; }
    } finally { loading = false; if (page.isConnected) button.disabled = false; }
  };
  selector.addEventListener("change", render);
  page.querySelector("#editorial-refresh")!.addEventListener("click", () => void load());
  page.querySelector<HTMLDetailsElement>("#editorial-management")!.addEventListener("toggle", async event => {
    if (!(event.currentTarget as HTMLDetailsElement).open) return;
    try {
      const [state, batches] = await Promise.all([api<{ diagnostics: unknown }>("/admin/editorial/state"), api<unknown[]>("/admin/editorial/batch-runs")]);
      if (!page.isConnected) return;
      page.querySelector("#editorial-diagnostics")!.textContent = JSON.stringify(state.diagnostics, null, 2);
      page.querySelector("#editorial-batches")!.textContent = JSON.stringify(batches, null, 2);
    } catch (error) { if (page.isConnected) status.textContent = String(error); }
  });
  page.querySelector("#editorial-publish")!.addEventListener("click", async () => {
    const button = page.querySelector<HTMLButtonElement>("#editorial-publish")!;
    if (!(page.querySelector("#publication-confirm") as HTMLInputElement).checked) { status.textContent = "Conferma la pubblicazione dopo la revisione."; return; }
    button.disabled = true;
    try {
      const result = await api<{ published: boolean }>("/admin/editorial/publish", { method: "POST", body: JSON.stringify({ confirm: true }) });
      status.textContent = result.published ? "Gruppo bilanciato pubblicato. Le eccedenze restano approvate in attesa." : "Nessun gruppo bilanciato disponibile.";
      (page.querySelector("#publication-confirm") as HTMLInputElement).checked = false;
    } catch (error) { status.textContent = String(error); }
    finally { button.disabled = false; }
  });
  void load();
}
