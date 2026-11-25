/** Owner-controlled 4:5 framing. Keep the photograph’s fundamental subjects and context inside the crop. */
import "./crop-editor.css";
import {
  cropError, formatWidth, GAME_COPY, minimumCropHeight, paddedPhotoCanvas, wholePhotoFrame,
} from "../shared/game-copy";
import { originalOf, saveFrame, type TreatableItem } from "./game-copy";
import { withPhotoProcessing } from "./photo-processing";

interface Box { x: number; y: number; height: number }
interface Point { x: number; y: number }
const CORNERS: Record<string, Point> = { nw: { x: -1, y: -1 }, ne: { x: 1, y: -1 }, sw: { x: -1, y: 1 }, se: { x: 1, y: 1 } };
const positionOnPhoto = (position: number, frameSize: number, photoStart: number, photoSize: number) =>
  frameSize > photoSize ? photoStart + Math.round((photoSize - frameSize) / 2)
    : Math.max(photoStart, Math.min(photoStart + photoSize - frameSize, Math.round(position)));
/** A draggable frame of fixed proportions over the 4:5 canvas at original resolution. */
function frameControl(stage: HTMLElement, frame: HTMLElement, width: number, height: number,
  photo: Point & { width: number; height: number }, min: number, box: Box) {
  const ratio = GAME_COPY.viewRatio, w = (height: number) => formatWidth("4:5", height);
  const max = height;
  const clampedHeight = (h: number, limit = max) => Math.max(min, Math.min(limit, Math.round(h)));
  const draw = (next: Box) => {
    const h = clampedHeight(next.height);
    box = { height: h, x: positionOnPhoto(next.x, w(h), photo.x, photo.width), y: positionOnPhoto(next.y, h, photo.y, photo.height) };
    frame.style.left = (box.x / width * 100) + "%"; frame.style.top = (box.y / height * 100) + "%";
    frame.style.width = (w(box.height) / width * 100) + "%"; frame.style.height = (box.height / height * 100) + "%";
    frame.setAttribute("aria-valuenow", String(box.height));
    frame.setAttribute("aria-valuetext", `x ${box.x}, y ${box.y}, height ${box.height} px`);
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
    // On the padded axis the frame can keep growing after the anchor is replaced by centring.
    const availableWidth = photo.width < width ? width : corner.x > 0 ? width - anchorX : anchorX;
    const availableHeight = photo.height < height ? height : corner.y > 0 ? height - anchorY : anchorY;
    const limit = Math.min(Math.ceil((availableWidth + 0.5) / ratio) - 1, availableHeight);
    const h = clampedHeight(start.height + (dx * corner.x * ratio + dy * corner.y) / (1 + ratio * ratio), limit);
    draw({ height: h, x: corner.x > 0 ? anchorX : anchorX - w(h), y: corner.y > 0 ? anchorY : anchorY - h });
  };
  let pinch: (ReturnType<typeof pair> & { box: Box }) | null = null;
  stage.addEventListener("pointerdown", event => {
    if (event.button !== 0 || pointers.size === 2) return;
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
  const url = await withPhotoProcessing("Loading the original photo…", async () => {
    const source = URL.createObjectURL(await originalOf(item.id));
    img.src = source;
    try { await img.decode(); return source; }
    catch { URL.revokeObjectURL(source); throw Error("Cannot read the original image"); }
  });
  const saved = current?.format === format && !cropError(width, height, current) ? current : null;
  const canvas = paddedPhotoCanvas(width, height);
  const initialCrop = saved?.mode === "padded" ? saved : saved && !saved.mode
    ? { x: saved.x + canvas.x, y: saved.y + canvas.y, height: saved.height }
    : { x: 0, y: 0, height: canvas.height };
  const dialog = document.createElement("dialog");
  dialog.className = "crop-dialog";
  dialog.setAttribute("aria-label", "Game copy framing");
  const safeTitle = title.replace(/[<>&"]/g, "");
  dialog.innerHTML = `<div class="crop-layout"><div class="crop-scroll"><h2>4:5 framing</h2>
    ${safeTitle ? `<p class="hint">«${safeTitle}»</p>` : ""}
    <div class="crop-stage"><div class="crop-frame" tabindex="0" role="slider" aria-label="Frame size">
    ${Object.keys(CORNERS).map(corner => `<span data-crop-corner="${corner}" aria-hidden="true"></span>`).join("")}</div></div></div>
    <div class="crop-footer"><p class="crop-error" role="alert" hidden></p><div class="crop-actions">
    <button type="button" data-crop="cancel">Cancel</button>
    <button type="button" class="primary" data-crop="ok" autofocus>Save</button></div></div></div>`;
  document.body.append(dialog);
  const error = dialog.querySelector<HTMLElement>(".crop-error")!;
  const cropStage = dialog.querySelector<HTMLElement>(".crop-stage")!, cropFrame = cropStage.querySelector<HTMLElement>(".crop-frame")!;
  cropStage.prepend(img);
  cropStage.style.setProperty("--crop-ratio", String(canvas.width / canvas.height));
  img.alt = "Original photo fitted to 4:5";
  img.style.left = `${canvas.x / canvas.width * 100}%`;
  img.style.top = `${canvas.y / canvas.height * 100}%`;
  img.style.width = `${width / canvas.width * 100}%`;
  img.style.height = `${height / canvas.height * 100}%`;
  const photo = { x: canvas.x, y: canvas.y, width, height };
  const readCrop = frameControl(cropStage, cropFrame, canvas.width, canvas.height, photo, minimumCropHeight(format, width, height), initialCrop);
  try {
    dialog.showModal();
    cropFrame.focus({ preventScroll: true });
    return await new Promise<T | null>(resolve => {
      let saving = false;
      dialog.addEventListener("click", async event => {
        if (saving) return;
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-crop]")?.dataset.crop;
        if (action === "cancel") resolve(null);
        else if (action === "ok") {
          saving = true;
          error.hidden = true;
          try {
            const crop = readCrop();
            const unchanged = saved && crop.x === initialCrop.x && crop.y === initialCrop.y && crop.height === initialCrop.height;
            const whole = crop.height === canvas.height;
            const choice = unchanged ? saved : whole ? wholePhotoFrame(width, height) : { ...crop, mode: "padded" as const };
            resolve(await withPhotoProcessing("Saving the frame and processing the photo…", () => saveFrame(item, { crop: choice })));
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
