import { galleryPhotosPath, galleryWizardPath, type GalleryWizard } from "./gallery-paths";
import { mountRealWizard } from "./real-wizard";
import { mountSlopAuto } from "./slop-auto";
import { mountSlopStudio } from "./slop-studio";
import "./gallery-wizard.css";

const loading = '<p class="admin-loading" role="status">Caricamento del wizard…</p>';

export async function showGalleryWizard(content: HTMLElement, id: string, wizard: GalleryWizard) {
  const slop = wizard === "slop";
  content.innerHTML = `<section class="library page gallery-wizard" aria-labelledby="gallery-wizard-title">
    <div class="gallery-wizard-header">
      <a class="button" href="${galleryPhotosPath(id)}" data-gallery-return>← Foto della galleria</a>
      <div><h1 id="gallery-wizard-title">${slop ? "Generazione SLOP" : "Caricamento REAL"}</h1><p id="wizard-gallery-name"></p></div>
    </div>
    <div id="gallery-wizard-body">${loading}</div>
  </section>`;
  const body = content.querySelector<HTMLElement>("#gallery-wizard-body")!;
  try {
    const response = await fetch("/api/admin/library/galleries/" + encodeURIComponent(id));
    if (!response.ok) throw Error(response.status === 404 ? "Galleria non disponibile." : "Impossibile caricare la galleria.");
    const gallery = await response.json() as {title: string};
    content.querySelector("#wizard-gallery-name")!.textContent = gallery.title;
  } catch (error) {
    body.querySelector("p")!.classList.remove("admin-loading");
    body.querySelector("p")!.textContent = error instanceof Error ? error.message : String(error);
    content.querySelector<HTMLAnchorElement>("[data-gallery-return]")!.href = "/admin";
    content.querySelector("[data-gallery-return]")!.textContent = "← Gallerie";
    return;
  }

  if (!slop) {
    body.id = "real-wizard";
    const real = await mountRealWizard(body, id);
    window.addEventListener("pageshow", event => { if (event.persisted) void real.sync(); });
    return;
  }

  // One wizard for every SLOP (owner decision of 2026-11-22): steps 2-6 in the controls, review and exceptions in the studio below.
  body.innerHTML = `<section id="slop-automatic"><div id="slop-auto-controls">${loading}</div></section>
  <section id="slop-review"><div id="slop-studio"></div></section>`;
  const studio = mountSlopStudio(body.querySelector<HTMLElement>("#slop-studio")!, id);
  let shown: string | null | undefined;
  const auto = mountSlopAuto(null, body.querySelector<HTMLElement>("#slop-auto-controls")!, id, {
    // The studio reloads only when the batch to review changes; the exceptions come with it.
    batch: async batchId => { if (batchId !== shown) { shown = batchId; await studio.refresh(batchId); } },
    review: batch => { location.assign(galleryPhotosPath(id, batch)); },
    openGallery: galleryId => { location.assign(galleryWizardPath(galleryId, "slop")); },
    changed: async () => { await studio.refresh(shown ?? null); },
  });
  const refresh = () => Promise.all([studio.refresh(shown ?? null), auto.refresh()]);
  if (new URLSearchParams(location.search).has("mode")) history.replaceState(history.state, "", location.pathname);
  await refresh();
  window.addEventListener("pageshow", event => { if (event.persisted) void refresh(); });
}
