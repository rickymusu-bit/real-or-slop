/** Owner-controlled 4:5 framing. Keep the photograph’s fundamental subjects and context inside the crop. */
import "./crop-editor.css";
import {
  centredCrop, cropError, formatWidth, GAME_COPY, minimumCropHeight, wholePhotoFrame,
} from "../shared/game-copy";
import { originalOf, saveFrame, type TreatableItem } from "./game-copy";
import { withPhotoProcessing } from "./photo-processing";

interface Box { x: number; y: number; height: number }
interface Point { x: number; y: number }
const CORNERS: Record<string, Point> = { nw: { x: -1, y: -1 }, ne: { x: 1, y: -1 }, sw: { x: -1, y: 1 }, se: { x: 1, y: 1 } };
/** A draggable frame of fixed proportions over a picture of `width` × `height` pixels shown at the stage's size. */
function frameControl(stage: HTMLElement, frame: HTMLElement, width: number, height: number, box: Box) {
  const ratio = GAME_COPY.viewRatio, w = (height: number) => formatWidth("4:5", height);
  const max = centredCrop(width, height).height, min = minimumCropHeight("4:5", width, height);
  const clampedHeight = (h: number, limit = max) => Math.max(min, Math.min(limit, Math.round(h)));
  const draw = (next: Box) => {
    const h = clampedHeight(next.height);
    box = { height: h, x: Math.max(0, Math.min(width - w(h), Math.round(next.x))), y: Math.max(0, Math.min(height - h, Math.round(next.y))) };
    frame.style.left = (box.x / width * 100) + "%"; frame.style.top = (box.y / height * 100) + "%";
    frame.style.width = (w(box.height) / width * 100) + "%"; frame.style.height = (box.height / height * 100) + "%";
    frame.setAttribute("aria-valuenow", String(box.height));
    frame.setAttribute("aria-valuetext", `x ${box.x}, y ${box.y}, altezza ${box.height} px`);
  };
  const scale = () => stage.getBoundingClientRect().width / width || 1;
  const pointers = new Map<number, Point>();
  let drag: { start: Point; box: Box; corner?: Point } | null = null;
  const pair = () => {
    const [a, b] = pointers.values();
    return { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };
  const resizeAroundCenter = (start: Box, wanted: number, dx = 0, dy = 0) => {
    const h = clampedHeight(wanted);
    draw({ height: h, x: start.x + (w(start.height) - w(h)) / 2 + dx, y: start.y + (start.height - h) / 2 + dy });
  };
  const resizeFromCorner = (start: Box, corner: Point, dx: number, dy: number) => {
    const anchorX = corner.x > 0 ? start.x : start.x + w(start.height);
    const anchorY = corner.y > 0 ? start.y : start.y + start.height;
    const availableWidth = corner.x > 0 ? width - anchorX : anchorX;
    const availableHeight = corner.y > 0 ? height - anchorY : anchorY;
    const limit = Math.min(Math.ceil((availableWidth + 0.5) / ratio) - 1, availableHeight);
    const h = clampedHeight(start.height + (dx * corner.x * ratio + dy * corner.y) / (1 + ratio * ratio), limit);
    draw({ height: h, x: corner.x > 0 ? anchorX : anchorX - w(h), y: corner.y > 0 ? anchorY : anchorY - h });
  };
  let pinch: (ReturnType<typeof pair> & { box: Box }) | null = null;
  stage.addEventListener("pointerdown", event => {
    if (frame.hidden || event.button !== 0 || pointers.size === 2) return;
    const start = { x: event.clientX, y: event.clientY }, target = event.target as HTMLElement;
    if (!pointers.size && frame.contains(target)) {
      const corner = CORNERS[target.closest<HTMLElement>("[data-crop-corner]")?.dataset.cropCorner || ""];
      drag = { start, box, corner };
      frame.focus({ preventScroll: true });
    }
    pointers.set(event.pointerId, start);
    if (pointers.size === 2) { pinch = { ...pair(), box }; drag = null; }
    try { stage.setPointerCapture(event.pointerId); } catch { /* the pointer may already be gone */ }
    event.preventDefault();
  });
  stage.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId)) return;
    const now = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, now);
    const s = scale();
    if (pinch) {
      const current = pair();
      resizeAroundCenter(pinch.box, pinch.box.height * current.distance / pinch.distance, (current.x - pinch.x) / s, (current.y - pinch.y) / s);
    } else if (drag) {
      const dx = (now.x - drag.start.x) / s, dy = (now.y - drag.start.y) / s;
      if (drag.corner) resizeFromCorner(drag.box, drag.corner, dx, dy);
      else draw({ ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy });
    }
  });
  const release = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    pinch = drag = null;
  };
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"] as const) stage.addEventListener(event, release);
  frame.addEventListener("keydown", event => {
    const step = Math.max(1, Math.round(box.height / 50)) * (event.shiftKey ? 5 : 1);
    const move = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[event.key];
    if (move) draw({ ...box, x: box.x + move[0], y: box.y + move[1] });
    else if (event.key === "+" || event.key === "-") resizeAroundCenter(box, box.height + (event.key === "+" ? step : -step));
    else return;
    event.preventDefault();
  });
  frame.setAttribute("aria-valuemin", String(min));
  frame.setAttribute("aria-valuemax", String(max));
  draw(box);
  return () => ({ x: box.x, y: box.y, width: w(box.height), height: box.height, format: "4:5" as const });
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
  const saved = current?.format === format && !cropError(width, height, current) ? current : null;
  const whole = saved?.mode ? saved : wholePhotoFrame(width, height);
  const largest = centredCrop(width, height);
  const startHeight = Math.max(minimumCropHeight(format, width, height), Math.round(largest.height * 0.8));
  const initialCrop = saved && !saved.mode ? saved : {
    x: Math.floor((width - formatWidth(format, startHeight)) / 2), y: Math.floor((height - startHeight) / 2), height: startHeight,
  };
  let cropping = Boolean(saved && !saved.mode);
  const dialog = document.createElement("dialog");
  dialog.className = "crop-dialog";
  dialog.setAttribute("aria-label", "Inquadratura della copia di gioco");
  const safeTitle = title.replace(/[<>&"]/g, "");
  dialog.innerHTML = `<div class="crop-layout"><div class="crop-scroll"><h2>Inquadratura 4:5</h2>
    ${safeTitle ? `<p class="hint">«${safeTitle}»</p>` : ""}
    <p class="hint" data-crop-help hidden>Trascina il riquadro per spostarlo. Ridimensionalo con gli angoli o con due dita. Da tastiera, usa le frecce e i tasti + e −.</p>
    <div class="crop-stage"><div class="crop-frame" tabindex="0" role="slider" aria-label="Dimensione del ritaglio" hidden>
    ${Object.keys(CORNERS).map(corner => `<span data-crop-corner="${corner}" aria-hidden="true"></span>`).join("")}</div></div></div>
    <div class="crop-footer"><p class="crop-error" role="alert" hidden></p><div class="crop-actions">
    <button type="button" data-crop="toggle">Ritaglia</button><button type="button" data-crop="cancel">Annulla</button>
    <button type="button" class="primary" data-crop="ok">Salva</button></div></div></div>`;
  document.body.append(dialog);
  const toggle = dialog.querySelector<HTMLButtonElement>('[data-crop="toggle"]')!, error = dialog.querySelector<HTMLElement>(".crop-error")!;
  const help = dialog.querySelector<HTMLElement>("[data-crop-help]")!;
  const cropStage = dialog.querySelector<HTMLElement>(".crop-stage")!, cropFrame = cropStage.querySelector<HTMLElement>(".crop-frame")!;
  cropStage.prepend(img);
  cropStage.style.setProperty("--crop-image-ratio", String(width / height));
  const readCrop = frameControl(cropStage, cropFrame, width, height, initialCrop);
  const showMode = () => {
    cropStage.classList.toggle("is-cropping", cropping);
    cropFrame.hidden = help.hidden = !cropping;
    img.alt = cropping ? "Foto originale da ritagliare" : "Anteprima della foto intera nel formato 4:5";
    toggle.textContent = cropping ? "Foto intera" : "Ritaglia";
    error.hidden = true;
  };
  try {
    showMode();
    dialog.showModal();
    (cropping ? cropFrame : toggle).focus({ preventScroll: true });
    return await new Promise<T | null>(resolve => {
      let saving = false;
      dialog.addEventListener("click", async event => {
        if (saving) return;
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-crop]")?.dataset.crop;
        if (action === "toggle") { cropping = !cropping; showMode(); }
        else if (action === "cancel") resolve(null);
        else if (action === "ok") {
          saving = true;
          error.hidden = true;
          try {
            const choice = cropping ? readCrop() : whole;
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
