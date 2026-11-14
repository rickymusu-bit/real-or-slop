/** Explorable photo of a game round (spec `copie-di-gioco`, section 5): whole photo first, in its own format; one finger
 * or the mouse drags, two fingers or the wheel zoom up to two CSS pixels per copy pixel, a double tap zooms in or back, «Foto intera»
 * resets. */
export interface Viewer { reset(): void; dispose(): void }

const MIN_MAX_ZOOM = 4, DOUBLE_TAP_ZOOM = 2.5, TAP_MS = 250, TAP_PX = 10, DOUBLE_TAP_MS = 350, DOUBLE_TAP_PX = 30;

/** Starts the viewer on `frame` (the visible box), `layer` (moved and scaled) and its loaded `img`. */
export function photoViewer(frame: HTMLElement, layer: HTMLElement, img: HTMLImageElement, onChange?: (changed: boolean) => void): Viewer {
  let base = 1, zoom = 1, maxZoom = MIN_MAX_ZOOM, tx = 0, ty = 0, frameW = 0, frameH = 0, changed = false;
  const natW = () => img.naturalWidth || 1, natH = () => img.naturalHeight || 1;
  const apply = () => {
    const w = natW() * base * zoom, h = natH() * base * zoom;
    tx = w <= frameW ? (frameW - w) / 2 : Math.min(0, Math.max(frameW - w, tx));
    ty = h <= frameH ? (frameH - h) / 2 : Math.min(0, Math.max(frameH - h, ty));
    layer.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
  };
  const mark = (value: boolean) => { if (value !== changed) { changed = value; onChange?.(value); } };
  /** The whole photo, fitted in the frame, which takes the photo's proportions. */
  const reset = () => {
    frame.style.setProperty("--ratio", String(natW() / natH()));
    frameW = frame.clientWidth; frameH = frame.clientHeight;
    base = Math.min(frameW / natW(), frameH / natH()) || 1;
    layer.style.width = natW() * base + "px"; layer.style.height = natH() * base + "px";
    // Up to two CSS pixels per pixel of the copy, never less than 4 times the whole photo: a 16:9 photo on a phone reaches about 8.
    maxZoom = Math.max(MIN_MAX_ZOOM, 2 / base);
    zoom = 1; tx = 0; ty = 0;
    apply(); mark(false);
  };
  /** Zoom to `next` keeping the point (px, py) of the frame still. */
  const zoomAt = (next: number, px: number, py: number) => {
    const z = Math.min(maxZoom, Math.max(1, next));
    tx = px - (px - tx) * z / zoom; ty = py - (py - ty) * z / zoom; zoom = z;
    apply(); mark(true);
  };
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; zoom: number } | null = null;
  const local = (e: { clientX: number; clientY: number }) => { const r = frame.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const twoFingers = () => { const [a, b] = [...pointers.values()]; return { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; };
  // A tap is one finger (or click) that goes down and up quickly without moving; two taps close in time and space make a double tap.
  let press: { time: number; x: number; y: number; single: boolean } | null = null, lastTap: { time: number; x: number; y: number } | null = null;
  /** After a tap: on the second one, zoom in on the point, or back to the whole photo when already zoomed. */
  const tapped = (p: { x: number; y: number }, time: number) => {
    const hit = lastTap && time - lastTap.time < DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < DOUBLE_TAP_PX;
    lastTap = hit ? null : { time, ...p };
    if (hit) { if (zoom > 1.01) reset(); else zoomAt(DOUBLE_TAP_ZOOM, p.x, p.y); }
  };
  const down = (event: PointerEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    try { frame.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    const p = local(event);
    if (pointers.size === 0) press = { time: event.timeStamp, ...p, single: true }; else if (press) press.single = false;
    pointers.set(event.pointerId, p);
    if (pointers.size === 2) pinch = { distance: twoFingers().distance, zoom };
    event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    const before = pointers.get(event.pointerId);
    if (!before) return;
    const now = local(event);
    if (pointers.size === 1) {
      pointers.set(event.pointerId, now);
      tx += now.x - before.x; ty += now.y - before.y; apply(); mark(true);
    } else if (pointers.size === 2 && pinch) {
      const old = twoFingers().mid;
      pointers.set(event.pointerId, now);
      const { distance, mid } = twoFingers();
      tx += mid.x - old.x; ty += mid.y - old.y;
      zoomAt(pinch.zoom * distance / pinch.distance, mid.x, mid.y);
    }
  };
  const up = (event: PointerEvent) => {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0 && press) {
      const p = local(event);
      if (press.single && event.type === "pointerup" && event.timeStamp - press.time < TAP_MS && Math.hypot(p.x - press.x, p.y - press.y) < TAP_PX)
        tapped(p, event.timeStamp);
      else lastTap = null;
      press = null;
    }
  };
  const wheel = (event: WheelEvent) => { event.preventDefault(); const p = local(event); zoomAt(zoom * Math.exp(-event.deltaY / 400), p.x, p.y); };
  const resize = () => reset();
  frame.addEventListener("pointerdown", down);
  frame.addEventListener("pointermove", move);
  frame.addEventListener("pointerup", up);
  frame.addEventListener("pointercancel", up);
  frame.addEventListener("wheel", wheel, { passive: false });
  window.addEventListener("resize", resize);
  if (img.complete && img.naturalWidth) reset(); else img.addEventListener("load", reset, { once: true });
  return {
    reset,
    dispose() {
      frame.removeEventListener("pointerdown", down); frame.removeEventListener("pointermove", move);
      frame.removeEventListener("pointerup", up); frame.removeEventListener("pointercancel", up);
      frame.removeEventListener("wheel", wheel); window.removeEventListener("resize", resize);
    },
  };
}
