/** Crop and initial view of the game copy (docs/copie-di-gioco.v4.0.0.md, section 3). v2.0.0, 2026-11-13T10:00:00Z.
 * A dialog in two parts. Above, the oriented original with the crop in the chosen format (the nearest one, centred, at first):
 * drag it (mouse, finger) or move it with the arrow keys, resize it with the slider, change the format from the list. Below, the
 * copy that crop will give, with the 4:5 view a vertical screen shows first (centred at first), moved and resized the same way.
 * Returns the crop in pixels of the oriented original and the view in pixels of the copy, or null if the owner cancels.
 * v1.0.0 (src/crop-editor.v1.0.0.ts): a single 4:5 frame. */
import "./crop-editor.v2.0.0.css";
import {
  centredCrop, centredView, copyDimensions, cropError, FORMAT_LABELS, FORMATS, formatWidth, isFormat, minimumCropHeight, nearestFormat,
  ratioOf, viewError, GAME_COPY, type Crop, type Format, type View,
} from "../shared/game-copy.v3.0.0";
import { originalOf } from "./game-copy.v3.0.0";

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
  let drag: { x: number; y: number; box: Box } | null = null;
  frame.addEventListener("pointerdown", event => { drag = { x: event.clientX, y: event.clientY, box: { ...box } }; frame.setPointerCapture(event.pointerId); event.preventDefault(); });
  frame.addEventListener("pointermove", event => {
    if (!drag) return;
    const s = scale();
    box = { ...drag.box, x: drag.box.x + (event.clientX - drag.x) / s, y: drag.box.y + (event.clientY - drag.y) / s }; draw(); onChange();
  });
  frame.addEventListener("pointerup", () => { drag = null; });
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

export async function chooseFrame(imageId: string, width: number, height: number, current: { crop: Crop | null; view: View | null } | null,
  title = ""): Promise<{ crop: Crop; view: View } | null> {
  const blob = await originalOf(imageId), url = URL.createObjectURL(blob);
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  let crop: Crop = current?.crop && !cropError(width, height, current.crop) ? { ...current.crop } : centredCrop(width, height);
  let view: View | null = current?.view || null;
  const dialog = document.createElement("dialog");
  dialog.className = "crop-dialog";
  dialog.setAttribute("aria-label", "Inquadratura della copia di gioco");
  const safeTitle = title.replace(/[<>&"]/g, "");
  dialog.innerHTML = `<h2>Inquadratura</h2><p class="hint">${safeTitle ? `«${safeTitle}». ` : ""}Il giocatore vede tutta la copia: il formato più vicino
    alla foto taglia il meno possibile. Trascina i riquadri, oppure usa le frecce; i cursori ne cambiano la dimensione.</p>
    <label class="crop-format">Formato<select>${FORMATS.map(f => `<option value="${f}">${FORMAT_LABELS[f]}${f === nearestFormat(width, height) ? " (il più vicino)" : ""}</option>`).join("")}</select></label>
    <h3>Ritaglio sulla foto originale</h3>
    <div class="crop-stage" data-stage="crop"><img alt="" draggable="false"><div class="crop-frame" tabindex="0" role="slider" aria-label="Posizione del ritaglio, frecce per spostarlo"></div></div>
    <label class="crop-size">Dimensione del ritaglio<input type="range" step="1" data-size="crop"></label>
    <h3>Vista iniziale 4:5 sugli schermi verticali</h3>
    <div class="crop-stage" data-stage="view"><canvas></canvas><div class="crop-frame" tabindex="0" role="slider" aria-label="Posizione della vista iniziale, frecce per spostarla"></div></div>
    <label class="crop-size">Dimensione della vista<input type="range" step="1" data-size="view"></label>
    <div class="crop-actions"><button type="button" data-crop="centre">Centra</button><button type="button" data-crop="cancel">Annulla</button>
    <button type="button" class="primary" data-crop="ok">Usa questa inquadratura</button></div>`;
  document.body.append(dialog);
  const img = dialog.querySelector("img")!, canvas = dialog.querySelector("canvas")!, select = dialog.querySelector("select")!;
  const [cropStage, viewStage] = [...dialog.querySelectorAll<HTMLElement>(".crop-stage")];
  const cropFrame = cropStage.querySelector<HTMLElement>(".crop-frame")!, viewFrame = viewStage.querySelector<HTMLElement>(".crop-frame")!;
  const cropSize = dialog.querySelector<HTMLInputElement>('[data-size="crop"]')!, viewSize = dialog.querySelector<HTMLInputElement>('[data-size="view"]')!;
  // Each picture fills the room available, enlarged if small, with its proportions.
  const fit = (w: number, h: number) => Math.min((dialog.clientWidth - 40) / w, (window.innerHeight * 0.38) / h);
  /** The copy the current crop gives, drawn small, with the view frame over it. */
  const drawCopy = (keepView: boolean) => {
    const dims = copyDimensions(crop), s = fit(dims.width, dims.height);
    canvas.width = Math.max(1, Math.round(dims.width * s)); canvas.height = Math.max(1, Math.round(dims.height * s));
    canvas.getContext("2d")!.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    if (!keepView || !view || viewError(dims.width, dims.height, view)) view = centredView(dims.width, dims.height);
    viewControl.set({ width: dims.width, height: dims.height, ratio: GAME_COPY.viewRatio, max: centredView(dims.width, dims.height).height,
      min: Math.min(GAME_COPY.minSide, centredView(dims.width, dims.height).height), box: view });
  };
  const cropControl = frameControl(cropStage, cropFrame, cropSize, () => { const b = cropControl.get(); crop = { ...b, width: formatWidth(crop.format, b.height), format: crop.format }; drawCopy(false); });
  const viewControl = frameControl(viewStage, viewFrame, viewSize, () => { view = viewControl.get(); });
  const setFormat = (format: Format, keep: boolean) => {
    if (!keep) crop = centredCrop(width, height, format);
    const largest = centredCrop(width, height, format);
    select.value = format;
    cropControl.set({ width, height, ratio: ratioOf(format), max: largest.height, min: minimumCropHeight(format, width, height), box: crop });
    const b = cropControl.get(); crop = { ...b, width: formatWidth(format, b.height), format };
  };
  select.addEventListener("change", () => { if (isFormat(select.value)) { setFormat(select.value, false); drawCopy(false); } });
  try {
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(Error("Originale non leggibile")); img.src = url; });
    dialog.showModal();
    const s = fit(width, height);
    img.style.width = Math.floor(width * s) + "px"; img.style.height = Math.floor(height * s) + "px";
    setFormat(crop.format, true); drawCopy(true);
    cropFrame.focus();
    return await new Promise<{ crop: Crop; view: View } | null>(resolve => {
      dialog.addEventListener("click", event => {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-crop]")?.dataset.crop;
        if (action === "centre") { setFormat(crop.format, false); drawCopy(false); }
        else if (action === "cancel") resolve(null);
        else if (action === "ok") {
          const b = cropControl.get(); crop = { ...b, width: formatWidth(crop.format, b.height), format: crop.format };
          resolve({ crop, view: viewControl.get() });
        }
      });
      dialog.addEventListener("cancel", () => resolve(null));
    });
  } finally {
    dialog.close(); dialog.remove(); URL.revokeObjectURL(url); bitmap.close();
  }
}
