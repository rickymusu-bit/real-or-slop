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

  body.innerHTML = `<nav class="db-tabs" aria-label="Modalità di generazione">
    <button type="button" data-generation-mode="manual">Generazione manuale</button>
    <button type="button" data-generation-mode="automatic">Generazione automatica</button>
  </nav>
  <section id="slop-manual"><div id="slop-studio">${loading}</div></section>
  <section id="slop-automatic"><div id="slop-auto-controls">${loading}</div></section>`;
  const manual = body.querySelector<HTMLElement>("#slop-manual")!, automatic = body.querySelector<HTMLElement>("#slop-automatic")!;
  const modes = body.querySelectorAll<HTMLButtonElement>("[data-generation-mode]");
  const query = new URLSearchParams(location.search);
  function setMode(mode: string) {
    manual.hidden = mode !== "manual";
    automatic.hidden = mode !== "automatic";
    modes.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.generationMode === mode)));
    sessionStorage.setItem("ros-generation-mode", mode);
    if (query.has("mode") && mode === "manual") {
      query.delete("mode");
      history.replaceState(history.state, "", location.pathname);
    }
  }
  for (const button of modes) button.addEventListener("click", () => setMode(button.dataset.generationMode!));
  setMode(query.get("mode") === "automatic" || sessionStorage.getItem("ros-generation-mode") === "automatic" ? "automatic" : "manual");
  const studio = mountSlopStudio(manual.querySelector<HTMLElement>("#slop-studio")!, id);
  const auto = mountSlopAuto(null, automatic.querySelector<HTMLElement>("#slop-auto-controls")!, id, {
    loop: async batch => { setMode("manual"); await studio.refresh(batch); },
    review: batch => { location.assign(galleryPhotosPath(id, batch)); },
    openGallery: galleryId => { location.assign(galleryWizardPath(galleryId, "slop", true)); },
  });
  const refresh = () => Promise.all([studio.refresh(), auto.refresh()]);
  await refresh();
  window.addEventListener("pageshow", event => { if (event.persisted) void refresh(); });
}
