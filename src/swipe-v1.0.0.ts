/**
 * Optional swipe input for game answers. The existing buttons remain the only
 * submission path (including timer, pending and server validation checks).
 * v1.0.0 — swipe left = REAL, right = SLOP.
 */
export type SwipeChoice = "REAL" | "AI";

export function swipeThreshold(width: number): number {
  return Math.min(120, Math.max(55, width * 0.23));
}

export function swipeDecision(dx: number, dy: number, width: number): SwipeChoice | null {
  if (Math.abs(dx) < swipeThreshold(width) || Math.abs(dx) <= Math.abs(dy) * 1.2) return null;
  return dx < 0 ? "REAL" : "AI";
}

export function enableAnswerSwipe(
  image: HTMLImageElement,
  attribute: "data-choice" | "data-pvp-choice",
  canAnswer = () => true,
): () => void {
  const surface = image.parentElement;
  const root = image.closest(".play");
  if (!surface || !root) return () => {};
  const doc = image.ownerDocument;
  const win = doc.defaultView!;
  const preview = doc.createElement("span");
  preview.className = "swipe-preview";
  preview.setAttribute("aria-hidden", "true");
  surface.append(preview);
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  let pointer: { id: number; x: number; y: number; width: number; axis: "horizontal" | "vertical" | null } | null = null;
  let suppressClick = false, disposed = false;
  const button = (choice: SwipeChoice) => root.querySelector<HTMLButtonElement>(`[${attribute}="${choice}"]`);
  const enabled = () => image.isConnected && doc.visibilityState !== "hidden" && canAnswer() &&
    !doc.documentElement.classList.contains("media-obscured") &&
    !!button("REAL") && !!button("AI") && !button("REAL")!.disabled && !button("AI")!.disabled;
  const clear = () => {
    const id = pointer?.id;
    pointer = null;
    if (id !== undefined && image.hasPointerCapture(id)) image.releasePointerCapture(id);
    image.style.transform = "";
    image.style.opacity = "";
    image.classList.remove("swipe-dragging");
    preview.textContent = "";
    preview.classList.remove("swipe-real", "swipe-slop", "swipe-visible");
  };
  const cancel = () => { if (pointer) suppressClick = true; clear(); };
  // A second contact cancels the entire gesture rather than choosing a class.
  doc.addEventListener("pointerdown", event => {
    if (pointer && event.pointerId !== pointer.id) cancel();
  }, { ...options, capture: true });
  image.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    clear();
    suppressClick = false;
    if (!enabled()) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, width: image.getBoundingClientRect().width, axis: null };
    image.setPointerCapture(event.pointerId);
  }, options);
  image.addEventListener("pointermove", event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!enabled()) { cancel(); return; }
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (!pointer.axis && Math.hypot(dx, dy) > 10) {
      pointer.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "horizontal" : "vertical";
      suppressClick = true;
    }
    if (pointer.axis !== "horizontal") return;
    if (event.cancelable) event.preventDefault();
    image.classList.add("swipe-dragging");
    image.style.transform = `translateX(${Math.max(-160, Math.min(160, dx))}px) rotate(${Math.max(-8, Math.min(8, dx / 18))}deg)`;
    image.style.opacity = String(Math.max(0.78, 1 - Math.abs(dx) / 700));
    preview.textContent = dx < 0 ? "REAL" : "SLOP";
    preview.classList.toggle("swipe-real", dx < 0);
    preview.classList.toggle("swipe-slop", dx >= 0);
    preview.classList.add("swipe-visible");
  }, options);
  image.addEventListener("pointerup", event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (Math.hypot(dx, dy) > 10) suppressClick = true;
    const choice = pointer.axis === "horizontal" ? swipeDecision(dx, dy, pointer.width) : null;
    clear();
    if (choice && enabled()) button(choice)?.click();
  }, options);
  image.addEventListener("pointercancel", cancel, options);
  image.addEventListener("lostpointercapture", cancel, options);
  image.addEventListener("dragstart", event => event.preventDefault(), options);
  doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden") cancel(); }, options);
  win.addEventListener("blur", cancel, options);
  win.addEventListener("pagehide", cancel, options);
  const guardClick = (event: MouseEvent) => {
    if (event.detail && suppressClick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClick = false;
      if (disposed) image.removeEventListener("click", guardClick, true);
    }
  };
  image.addEventListener("click", guardClick, true);
  return () => {
    if (disposed) return;
    cancel(); disposed = true; listeners.abort(); preview.remove();
    // Timeout/navigation may disable the gesture before its final native click.
    // Keep only this image-local guard until that click or the next deliberate tap.
    if (!suppressClick) image.removeEventListener("click", guardClick, true);
    else image.addEventListener("pointerdown", () => image.removeEventListener("click", guardClick, true), { once: true });
  };
}
