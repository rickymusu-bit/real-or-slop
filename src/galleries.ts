import { escape } from "../shared/html";
import "./galleries.css";

export interface Gallery {
  id: string; title: string; description: string; slop_instructions: string; revision: number; available: number; ready: boolean;
}
export interface GalleryList {galleries: Gallery[]; paid_calls: boolean; text_model: string}

export function galleryOptions(galleries: Gallery[], value: string) {
  return galleries.map(g => `<option value="${escape(g.id)}" ${g.id === value ? "selected" : ""}>${escape(g.title)}</option>`).join("");
}

export function mountGalleries(root: HTMLElement, request: <T>(path: string, init?: RequestInit) => Promise<T>, changed: () => Promise<void>) {
  let list: GalleryList | null = null, selected = "", busy = false;
  const render = () => {
    const gallery = list?.galleries.find(g => g.id === selected);
    root.innerHTML = `<h3>Gallerie tematiche</h3>
      <label>Galleria<select id="gallery-editor-select"><option value="">Nuova galleria</option>${galleryOptions(list?.galleries || [], selected)}</select></label>
      <p class="hint" id="gallery-readiness">${gallery?.ready ? "Pronta per la generazione automatica."
        : "Salva le Indicazioni SLOP per abilitare la generazione automatica. Puoi già assegnare le REAL a una galleria salvata."}</p>
      <form class="gallery-form">
        <label>Titolo<input name="title" required maxlength="200" value="${escape(gallery?.title || "")}"></label>
        <label>Descrizione<textarea name="description" rows="3" maxlength="3000">${escape(gallery?.description || "")}</textarea></label>
        <label>Indicazioni SLOP<textarea name="slop_instructions" rows="7" maxlength="4000">${escape(gallery?.slop_instructions || "")}</textarea></label>
        <div class="library-inline"><button class="primary" type="submit">${gallery ? "Salva modifiche" : "Crea galleria"}</button>
        ${gallery && list?.paid_calls ? '<button type="button" data-gallery-suggest>Proponi indicazioni con IA</button>' : ""}</div>
      </form>
      <p class="hint" role="status" id="gallery-message"></p>`;
  };
  const message = (text: string) => { root.querySelector("#gallery-message")!.textContent = text; };
  const setBusy = (value: boolean) => {
    busy = value;
    root.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, select, textarea, button").forEach(control => { control.disabled = busy; });
  };
  const report = (error: unknown) => message(error instanceof Error ? error.message : String(error));
  const fields = (form: HTMLFormElement) => ({
    title: (form.elements.namedItem("title") as HTMLInputElement).value,
    description: (form.elements.namedItem("description") as HTMLTextAreaElement).value,
    slop_instructions: (form.elements.namedItem("slop_instructions") as HTMLTextAreaElement).value,
  });
  root.addEventListener("change", event => {
    const picker = (event.target as HTMLElement).closest<HTMLSelectElement>("#gallery-editor-select");
    if (!picker || busy) return;
    selected = picker.value;
    render();
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
      selected = saved.id;
      list = await request<GalleryList>("/galleries");
      render();
      message("Galleria salvata.");
      await changed();
    } catch (error) { report(error); }
    finally { setBusy(false); }
  });
  root.addEventListener("click", async event => {
    if (!(event.target as HTMLElement).closest("[data-gallery-suggest]") || busy || !list) return;
    const gallery = list.galleries.find(g => g.id === selected);
    const form = root.querySelector("form")!;
    if (!gallery || !form.reportValidity()) return;
    if (!window.confirm(`Chiedere una proposta a ${list.text_model}? Massimo una chiamata. Potrai rivedere le indicazioni prima di salvarle.`)) return;
    const {title, description} = fields(form);
    setBusy(true);
    message("Proposta in preparazione…");
    try {
      const draft = await request<{slop_instructions: string}>(`/galleries/${encodeURIComponent(gallery.id)}/suggest`, {
        method: "POST", body: JSON.stringify({title, description, revision: gallery.revision, request: crypto.randomUUID(), confirm: true}),
      });
      (form.elements.namedItem("slop_instructions") as HTMLTextAreaElement).value = draft.slop_instructions;
      message("Proposta caricata nel campo. Rivedila e salva le modifiche per usarla.");
    } catch (error) { report(error); }
    finally { setBusy(false); }
  });
  return {
    show(value: GalleryList) {
      list = value;
      if (!root.querySelector("form")) render();
      else if (!busy) {
        const picker = root.querySelector<HTMLSelectElement>("#gallery-editor-select")!;
        picker.innerHTML = '<option value="">Nuova galleria</option>' + galleryOptions(value.galleries, selected);
      }
    },
  };
}
