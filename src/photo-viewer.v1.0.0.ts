/** Explorable photo of a game round (docs/copie-di-gioco.v4.0.0.md, section 5). v1.0.0, 2026-11-13T10:00:00Z.
 * On a vertical screen (taller than wide) the frame is 4:5 and starts on the round's initial view; on a horizontal screen the frame
 * has the photo's own proportions and starts on the whole photo. One finger (or the mouse) drags the photo, two fingers (or the
 * wheel) zoom from «whole photo in the frame» up to 4 times the initial view; `reset()` goes back to the initial view.
 * The picture sits in a layer sized to the whole photo fitted in the frame; the layer is moved and scaled with a transform, so
 * the «RS» mark (src/media-mark.v1.0.0.ts), placed inside the layer, stays on the picture. */
export interface ViewFractions { x: number; y: number; width: number; height: number }
export interface Viewer { reset(): void; dispose(): void }

const MAX_ZOOM = 4;
export const isVertical = (win: Window = window) => win.innerHeight > win.innerWidth;

/** Starts the viewer on `frame` (the visible box), `layer` (moved and scaled) and its loaded `img`. */
export function photoViewer(frame: HTMLElement, layer: HTMLElement, img: HTMLImageElement, view: ViewFractions, onChange?: (changed: boolean) => void): Viewer {
  let base = 1, zoom = 1, initialZoom = 1, maxZoom = MAX_ZOOM, tx = 0, ty = 0, frameW = 0, frameH = 0, changed = false;
  const natW = () => img.naturalWidth || 1, natH = () => img.naturalHeight || 1;
  const apply = () => {
    const w = natW() * base * zoom, h = natH() * base * zoom;
    tx = w <= frameW ? (frameW - w) / 2 : Math.min(0, Math.max(frameW - w, tx));
    ty = h <= frameH ? (frameH - h) / 2 : Math.min(0, Math.max(frameH - h, ty));
    layer.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
  };
  const mark = (value: boolean) => { if (value !== changed) { changed = value; onChange?.(value); } };
  /** The initial view: on a vertical screen the 4:5 view fills the frame, otherwise the whole photo. */
  const reset = () => {
    const vertical = isVertical();
    frame.style.setProperty("--ratio", vertical ? "0.8" : String(natW() / natH()));
    frameW = frame.clientWidth; frameH = frame.clientHeight;
    base = Math.min(frameW / natW(), frameH / natH()) || 1;
    layer.style.width = natW() * base + "px"; layer.style.height = natH() * base + "px";
    initialZoom = vertical && view.width > 0 ? Math.max(1, frameW / (view.width * natW() * base)) : 1;
    maxZoom = MAX_ZOOM * initialZoom; zoom = initialZoom;
    tx = vertical ? -view.x * natW() * base * zoom : 0; ty = vertical ? -view.y * natH() * base * zoom : 0;
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
  const down = (event: PointerEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    try { frame.setPointerCapture(event.pointerId); } catch { /* pointer already gone */ }
    pointers.set(event.pointerId, local(event));
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
  const up = (event: PointerEvent) => { pointers.delete(event.pointerId); if (pointers.size < 2) pinch = null; };
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
