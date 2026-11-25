import { galleryPhotosPath, type GalleryWizard } from "./gallery-paths";
import { mountRealWizard } from "./real-wizard";
import { mountSlopStudio } from "./slop-studio";
import { mountPipeline } from "./pipeline";
import "./gallery-wizard.css";

const loading = '<p class="admin-loading" role="status">Loading wizard…</p>';

export async function showGalleryWizard(content: HTMLElement, id: string, wizard: GalleryWizard) {
  const slop = wizard === "slop";
  content.innerHTML = `<section class="library page gallery-wizard" aria-labelledby="gallery-wizard-title">
    <div class="gallery-wizard-header">
      <a class="button" href="${galleryPhotosPath(id)}" data-gallery-return>← Gallery photos</a>
      <div><h1 id="gallery-wizard-title">${slop ? "SLOP generation" : "Import REAL"}</h1><p id="wizard-gallery-name"></p></div>
    </div>
    <div id="gallery-wizard-body">${loading}</div>
  </section>`;
  const body = content.querySelector<HTMLElement>("#gallery-wizard-body")!;
  let gallery: { title: string; paid_calls: boolean };
  try {
    const response = await fetch("/api/admin/library/galleries/" + encodeURIComponent(id));
    if (!response.ok) throw Error(response.status === 404 ? "Gallery unavailable." : "Cannot load the gallery.");
    gallery = await response.json();
    content.querySelector("#wizard-gallery-name")!.textContent = gallery.title;
  } catch (error) {
    body.querySelector("p")!.classList.remove("admin-loading");
    body.querySelector("p")!.textContent = error instanceof Error ? error.message : String(error);
    content.querySelector<HTMLAnchorElement>("[data-gallery-return]")!.href = "/admin";
    content.querySelector("[data-gallery-return]")!.textContent = "← Galleries";
    return;
  }

  if (!slop) {
    body.id = "real-wizard";
    const real = await mountRealWizard(body, id, gallery.paid_calls);
    window.addEventListener("pageshow", event => { if (event.persisted) void real.sync(); });
    return;
  }

  body.innerHTML='<div data-gallery-pipeline></div><details data-legacy-recovery hidden><summary>Previous jobs awaiting a decision</summary><div data-legacy-studio></div></details>';
  const pipeline = await mountPipeline(body.querySelector<HTMLElement>("[data-gallery-pipeline]")!, id);
  const old = await fetch("/api/admin/library/slop/state?gallery="+encodeURIComponent(id)).then(r=>r.ok?r.json():null).catch(()=>null);
  if(old?.attention?.length){body.querySelector<HTMLElement>("[data-legacy-recovery]")!.hidden=false;await mountSlopStudio(body.querySelector<HTMLElement>("[data-legacy-studio]")!,id).refresh(null);}
  window.addEventListener("pageshow", event => { if (event.persisted) void pipeline.refresh(); });
}
