/** Owner-controlled 4:5 framing. Keep the photograph’s fundamental subjects and context inside the crop. */
import "./crop-editor.css";
import {
  centredCrop, cropError, fitWidthCrop, FORMAT_LABELS, formatWidth, minimumCropHeight, ratioOf,
} from "../shared/game-copy";
import { originalOf, saveFrame, type TreatableItem } from "./game-copy";
import { withPhotoProcessing } from "./photo-processing";

interface Box { x: number; y: number; height: number }
/** A draggable frame of fixed proportions over a picture of `width` × `height` pixels shown at the stage's size. */
function frameControl(stage: HTMLElement, frame: HTMLElement, size: HTMLInputElement, onChange: () => void) {
  let width = 1, height = 1, ratio = 1, min = 1, max = 1, box: Box = { x: 0, y: 0, height: 1 };
  const w = (h: number) => Math.round(h * ratio);
  const clamp = (b: Box): Box => {
    const h = Math.max(min, Math.min(max, Math.round(b.height)));
    return { height: h, x: Math.max(0, Math.min(width - w(h), Math.round(b.x))), y: Math.max(0, Math.min(height - h, Math.round(b.y))) };
  };
  const draw = () => {
    box = clamp(box);
    frame.style.left = (box.x / width * 100) + "%"; frame.style.top = (box.y / height * 100) + "%";
    frame.style.width = (w(box.height) / width * 100) + "%"; frame.style.height = (box.height / height * 100) + "%";
    size.min = String(min); size.max = String(max); size.value = String(box.height);
    frame.setAttribute("aria-valuetext", `x ${box.x}, y ${box.y}, altezza ${box.height} px`);
  };
  const scale = () => stage.getBoundingClientRect().width / width || 1;
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  const pair = () => {
    const [a, b] = pointers.values();
    return { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  let pinch: (ReturnType<typeof pair> & { box: Box }) | null = null;
  stage.addEventListener("pointerdown", event => {
    if (event.button !== 0 || pointers.size === 2) return;
    if (!pointers.size) dragging = frame.contains(event.target as Node);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) { pinch = { ...pair(), box: { ...box } }; dragging = true; }
    try { stage.setPointerCapture(event.pointerId); } catch { /* the pointer may already be gone */ }
    event.preventDefault();
  });
  stage.addEventListener("pointermove", event => {
    const before = pointers.get(event.pointerId);
    if (!before) return;
    const now = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, now);
    if (!dragging) return;
    const s = scale();
    if (pinch) {
      const current = pair(), start = pinch.box, h = Math.max(min, Math.min(max, start.height * pinch.distance / current.distance));
      box = { height: h, x: start.x + (w(start.height) - w(h)) / 2 + (current.x - pinch.x) / s,
        y: start.y + (start.height - h) / 2 + (current.y - pinch.y) / s };
    } else {
      box = { ...box, x: box.x + (now.x - before.x) / s, y: box.y + (now.y - before.y) / s };
    }
    draw(); onChange();
  });
  const release = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    pinch = null;
    if (!pointers.size) dragging = false;
  };
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"] as const) stage.addEventListener(event, release);
  frame.addEventListener("keydown", event => {
    const step = Math.max(1, Math.round(box.height / 50)) * (event.shiftKey ? 5 : 1);
    const move = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[event.key];
    if (!move) return;
    event.preventDefault(); box = { ...box, x: box.x + move[0], y: box.y + move[1] }; draw(); onChange();
  });
  size.addEventListener("input", () => {
    // Resize around the centre of the frame.
    const h = Number(size.value), cx = box.x + w(box.height) / 2, cy = box.y + box.height / 2;
    box = { height: h, x: cx - w(h) / 2, y: cy - h / 2 }; draw(); onChange();
  });
  return {
    set(next: { width: number; height: number; ratio: number; min: number; max: number; box: Box }) {
      ({ width, height, ratio, min, max, box } = next); draw();
    },
    get: () => clamp(box),
  };
}

export async function editFrame<T extends TreatableItem & { width: number; height: number }>(item: T, title = ""): Promise<T | null> {
  const { width, height } = item, format = "4:5", current = item.copy?.crop;
  const img = new Image();
  img.alt = ""; img.draggable = false;
  const url = await withPhotoProcessing("Carico la foto originale…", async () => {
    const source = URL.createObjectURL(await originalOf(item.id));
    img.src = source;
    try { await img.decode(); return source; }
    catch { URL.revokeObjectURL(source); throw Error("Originale non leggibile"); }
  });
  const fitWidth = fitWidthCrop(width, height);
  let crop = current?.format === format && !current.mode && !cropError(width, height, current) ? { ...current } : centredCrop(width, height);
  const dialog = document.createElement("dialog");
  dialog.className = "crop-dialog";
  dialog.setAttribute("aria-label", "Inquadratura della copia di gioco");
  const safeTitle = title.replace(/[<>&"]/g, "");
  dialog.innerHTML = `<h2>Inquadratura</h2><p class="hint">${safeTitle ? `«${safeTitle}». ` : ""}Il giocatore vede la copia 4:5. Conserva i soggetti e gli elementi fondamentali della fotografia.</p>
    <div class="crop-options"><label class="crop-format">Formato<select><option value="4:5">${FORMAT_LABELS[format]}</option></select></label>
    ${fitWidth ? '<label>Adattamento<select data-crop-mode><option value="crop">Ritaglia</option><option value="fit-width">Adatta alla larghezza</option></select></label>' : ""}</div>
    <div data-crop-editor>
    <h3>Ritaglio sulla foto originale</h3>
    <p class="hint">Trascina il riquadro o usa le frecce. Per ingrandire o rimpicciolire, usa due dita o il cursore.</p>
    <div class="crop-stage" data-stage="crop"><div class="crop-frame" tabindex="0" role="slider" aria-label="Posizione del ritaglio, frecce per spostarlo"></div></div>
    <label class="crop-size">Dimensione del ritaglio<input type="range" step="1" data-size="crop"></label>
    </div>
    ${fitWidth ? '<div data-crop-fit hidden><h3>Anteprima 4:5</h3><div class="crop-fit-preview"><img alt="Foto intera con bande nere" draggable="false"></div></div>' : ""}
    <div class="crop-actions"><button type="button" data-crop="centre">Centra</button><button type="button" data-crop="cancel">Annulla</button>
    <button type="button" class="primary" data-crop="ok">Usa questa inquadratura</button></div><p class="crop-error" role="alert" hidden></p>`;
  document.body.append(dialog);
  const mode = dialog.querySelector<HTMLSelectElement>("[data-crop-mode]");
  const fitPreview = dialog.querySelector<HTMLElement>("[data-crop-fit]"), editor = dialog.querySelector<HTMLElement>("[data-crop-editor]")!;
  const centre = dialog.querySelector<HTMLButtonElement>('[data-crop="centre"]')!, error = dialog.querySelector<HTMLElement>(".crop-error")!;
  const fitImage = fitPreview?.querySelector("img");
  if (fitImage) fitImage.src = url;
  const cropStage = dialog.querySelector<HTMLElement>(".crop-stage")!, cropFrame = cropStage.querySelector<HTMLElement>(".crop-frame")!;
  cropStage.prepend(img);
  const cropSize = dialog.querySelector<HTMLInputElement>('[data-size="crop"]')!;
  // The picture fills the room available, enlarged if small, with its proportions.
  cropStage.style.width = `min(100%, ${60 * width / height}svh)`;
  const cropControl = frameControl(cropStage, cropFrame, cropSize, () => { const b = cropControl.get(); crop = { ...b, width: formatWidth(crop.format, b.height), format: crop.format }; });
  const setFrame = (keep: boolean) => {
    const largest = centredCrop(width, height, format);
    cropControl.set({ width, height, ratio: ratioOf(format), max: largest.height, min: minimumCropHeight(format, width, height), box: keep ? crop : largest });
    const b = cropControl.get(); crop = { ...b, width: formatWidth(format, b.height), format };
  };
  const showMode = () => {
    const letterbox = mode?.value === "fit-width";
    editor.hidden = centre.hidden = letterbox;
    if (fitPreview) fitPreview.hidden = !letterbox;
    error.hidden = true;
  };
  if (mode && current?.mode === "fit-width" && !cropError(width, height, current)) mode.value = "fit-width";
  mode?.addEventListener("change", showMode);
  try {
    dialog.showModal();
    setFrame(true);
    showMode();
    (editor.hidden ? mode : cropFrame)?.focus({ preventScroll: true });
    return await new Promise<T | null>(resolve => {
      let saving = false;
      dialog.addEventListener("click", async event => {
        if (saving) return;
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-crop]")?.dataset.crop;
        if (action === "centre") setFrame(false);
        else if (action === "cancel") resolve(null);
        else if (action === "ok") {
          saving = true;
          error.hidden = true;
          try {
            const choice = mode?.value === "fit-width" && fitWidth ? fitWidth : crop;
            resolve(await withPhotoProcessing("Salvo l’inquadratura ed elaboro la foto…", () => saveFrame(item, { crop: choice })));
          } catch (failure) {
            error.textContent = failure instanceof Error ? failure.message : String(failure);
            error.hidden = false;
            error.scrollIntoView({ block: "nearest" });
          } finally { saving = false; }
        }
      });
      dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); else resolve(null); });
    });
  } finally {
    dialog.close(); dialog.remove(); URL.revokeObjectURL(url);
  }
}
