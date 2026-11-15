/** Owner-controlled 4:5 framing. Keep the photograph’s fundamental subjects and context inside the crop. */
import "./crop-editor.css";
import {
  centredCrop, cropError, FORMAT_LABELS, formatWidth, isFormat, minimumCropHeight, ratioOf, type Crop, type Format,
} from "../shared/game-copy";
import { originalOf } from "./game-copy";

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

export async function chooseFrame(imageId: string, width: number, height: number, current: { crop: Crop | null } | null,
  title = ""): Promise<{ crop: Crop } | null> {
  const blob = await originalOf(imageId), url = URL.createObjectURL(blob);
  let crop: Crop = current?.crop?.format === "4:5" && !cropError(width, height, current.crop) ? { ...current.crop } : centredCrop(width, height);
  const dialog = document.createElement("dialog");
  dialog.className = "crop-dialog";
  dialog.setAttribute("aria-label", "Inquadratura della copia di gioco");
  const safeTitle = title.replace(/[<>&"]/g, "");
  dialog.innerHTML = `<h2>Inquadratura</h2><p class="hint">${safeTitle ? `«${safeTitle}». ` : ""}Il giocatore vede la copia 4:5. Conserva i soggetti e gli elementi fondamentali della fotografia. Trascina il riquadro, oppure usa le frecce; il cursore ne cambia la dimensione.</p>
    <label class="crop-format">Formato<select>${["4:5" as const].map(f => `<option value="${f}">${FORMAT_LABELS[f]}</option>`).join("")}</select></label>
    <h3>Ritaglio sulla foto originale</h3>
    <div class="crop-stage" data-stage="crop"><img alt="" draggable="false"><div class="crop-frame" tabindex="0" role="slider" aria-label="Posizione del ritaglio, frecce per spostarlo"></div></div>
    <label class="crop-size">Dimensione del ritaglio<input type="range" step="1" data-size="crop"></label>
    <div class="crop-actions"><button type="button" data-crop="centre">Centra</button><button type="button" data-crop="cancel">Annulla</button>
    <button type="button" class="primary" data-crop="ok">Usa questa inquadratura</button></div>`;
  document.body.append(dialog);
  const img = dialog.querySelector("img")!, select = dialog.querySelector("select")!;
  const cropStage = dialog.querySelector<HTMLElement>(".crop-stage")!, cropFrame = cropStage.querySelector<HTMLElement>(".crop-frame")!;
  const cropSize = dialog.querySelector<HTMLInputElement>('[data-size="crop"]')!;
  // The picture fills the room available, enlarged if small, with its proportions.
  const fit = (w: number, h: number) => Math.min((dialog.clientWidth - 40) / w, (window.innerHeight * 0.6) / h);
  const cropControl = frameControl(cropStage, cropFrame, cropSize, () => { const b = cropControl.get(); crop = { ...b, width: formatWidth(crop.format, b.height), format: crop.format }; });
  const setFormat = (format: Format, keep: boolean) => {
    if (!keep) crop = centredCrop(width, height, format);
    const largest = centredCrop(width, height, format);
    select.value = format;
    cropControl.set({ width, height, ratio: ratioOf(format), max: largest.height, min: minimumCropHeight(format, width, height), box: crop });
    const b = cropControl.get(); crop = { ...b, width: formatWidth(format, b.height), format };
  };
  select.addEventListener("change", () => { if (isFormat(select.value)) setFormat(select.value, false); });
  try {
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(Error("Originale non leggibile")); img.src = url; });
    dialog.showModal();
    const s = fit(width, height);
    img.style.width = Math.floor(width * s) + "px"; img.style.height = Math.floor(height * s) + "px";
    setFormat(crop.format, true);
    cropFrame.focus();
    return await new Promise<{ crop: Crop } | null>(resolve => {
      dialog.addEventListener("click", event => {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-crop]")?.dataset.crop;
        if (action === "centre") setFormat(crop.format, false);
        else if (action === "cancel") resolve(null);
        else if (action === "ok") {
          const b = cropControl.get(); crop = { ...b, width: formatWidth(crop.format, b.height), format: crop.format };
          resolve({ crop });
        }
      });
      dialog.addEventListener("cancel", () => resolve(null));
    });
  } finally {
    dialog.close(); dialog.remove(); URL.revokeObjectURL(url);
  }
}
