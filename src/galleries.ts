import { escape } from "../shared/html";
import "./galleries.css";

export interface Gallery {
  id: string; title: string; description: string; revision: number; available: number; ready: boolean;
}
/** `source_missing`: REAL whose file is gone from Commons (nightly check, spec `libreria-immagini`, section 9). */
interface GalleryPreview extends Gallery { photos: number; source_missing: number; preview: string[] }
export interface GalleryList {galleries: GalleryPreview[]; paid_calls: boolean; text_model: string}

export function galleryOptions(galleries: Gallery[], value: string) {
  return galleries.map(g => `<option value="${escape(g.id)}" ${g.id === value ? "selected" : ""}>${escape(g.title)}</option>`).join("");
}

export function galleryCards(galleries: GalleryList["galleries"]) {
  if (!galleries.length) return '<p class="gallery-empty">Create a gallery to start collecting REAL and SLOP.</p>';
  return `<ul class="gallery-grid">${galleries.map(g => `<li><button type="button" class="gallery-card" data-gallery-open="${escape(g.id)}">
    <span class="gallery-contact-sheet" data-photos="${g.preview.length}">${g.preview.map(src =>
      `<img src="${escape(src)}" alt="" loading="lazy" draggable="false">`).join("") || '<span>No photos</span>'}</span>
    <span class="gallery-card-copy"><strong>${escape(g.title)}</strong>${g.description ? `<span class="gallery-description">${escape(g.description)}</span>` : ""}
    <small>${g.photos} photos</small>${g.source_missing ? `<small class="gallery-source-missing" data-source-missing>${g.source_missing} ${g.source_missing === 1
      ? "REAL image is no longer" : "REAL images are no longer"} on Commons</small>` : ""}</span></button></li>`).join("")}</ul>`;
}

export function mountGalleryEditor(dialog: HTMLDialogElement, request: <T>(path: string, init?: RequestInit) => Promise<T>,
  changed: (id: string) => Promise<void>, removed: (id: string) => void) {
  const root = dialog.querySelector<HTMLElement>("[data-gallery-form]")!;
  let list: GalleryList | null = null, selected = "", busy = false;
  const render = () => {
    const gallery = list?.galleries.find(g => g.id === selected);
    dialog.querySelector("#gallery-editor-title")!.textContent = gallery ? "Edit gallery" : "New gallery";
    root.innerHTML = `
      <p class="hint" id="gallery-readiness">${gallery?.ready ? `Legacy generation: approved or published REAL images available: ${gallery.available}.`
        : "The “Generate SLOP” wizard uses the gallery’s REAL images. Prepare their descriptions and parameters in the wizard."}
        The title and description accompany requests to the model.</p>
      <form class="gallery-form">
        <label>Title<input name="title" autofocus required maxlength="200" value="${escape(gallery?.title || "")}"></label>
        <label>Description<textarea name="description" rows="3" maxlength="3000">${escape(gallery?.description || "")}</textarea></label>
        <div class="library-inline"><button class="primary" type="submit">${gallery ? "Save changes" : "Create gallery"}</button></div>
      </form>
      ${gallery ? '<div class="gallery-remove"><button type="button" class="danger" data-gallery-remove>Delete gallery</button></div>' : ""}
      <p class="hint" role="status" id="gallery-message"></p>`;
  };
  const message = (text: string) => { root.querySelector("#gallery-message")!.textContent = text; };
  const setBusy = (value: boolean) => {
    busy = value;
    dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, textarea, button").forEach(control => { control.disabled = busy; });
  };
  const report = (error: unknown) => message(error instanceof Error ? error.message : String(error));
  const fields = (form: HTMLFormElement) => ({
    title: (form.elements.namedItem("title") as HTMLInputElement).value,
    description: (form.elements.namedItem("description") as HTMLTextAreaElement).value,
  });
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("click", event => {
    if ((event.target as HTMLElement).closest("[data-gallery-editor-close]") && !busy) dialog.close();
  });
  root.addEventListener("submit", async event => {
    const form = event.target as HTMLFormElement;
    event.preventDefault();
    if (busy) return;
    const gallery = list?.galleries.find(g => g.id === selected);
    const data = fields(form);
    setBusy(true);
    try {
      const saved = await request<Gallery>("/galleries" + (gallery ? "/" + encodeURIComponent(gallery.id) : ""),
        {method: gallery ? "PATCH" : "POST", body: JSON.stringify({...data, ...(gallery ? {revision: gallery.revision} : {})})});
      try {
        await changed(saved.id);
      } catch (error) {
        // The write succeeded. A retry should update that gallery, even if refreshing the overview failed.
        selected = saved.id;
        list!.galleries = [...list!.galleries.filter(g => g.id !== saved.id),
          { ...saved, available: gallery?.available ?? 0, photos: gallery?.photos ?? 0, source_missing: gallery?.source_missing ?? 0, preview: gallery?.preview ?? [], ready: gallery?.ready ?? false }];
        render();
        message("Gallery saved. " + (error instanceof Error ? error.message : String(error)));
        return;
      }
      dialog.close();
    } catch (error) { report(error); }
    finally { setBusy(false); }
  });
  root.addEventListener("click", async event => {
    const button = (event.target as HTMLElement).closest("[data-gallery-remove]");
    if (!button || busy || !list) return;
    const gallery = list.galleries.find(g => g.id === selected);
    if (!gallery) return;
    if (!window.confirm(`Permanently delete “${gallery.title}”? All its REAL and SLOP images, including trashed images, and generation jobs will be deleted.`)) return;
    setBusy(true);
    message("Deleting…");
    try {
      await request(`/galleries/${encodeURIComponent(gallery.id)}`, {
        method: "DELETE", body: JSON.stringify({confirm: true, revision: gallery.revision}),
      });
      dialog.close();
      removed(gallery.id);
    } catch (error) { report(error); }
    finally { setBusy(false); }
  });
  return {
    open(value: GalleryList, gallery = "") {
      if (busy || dialog.open) return;
      list = value;
      selected = gallery;
      render();
      dialog.showModal();
    },
  };
}
