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

export function enableAnswerSwipe(image: HTMLImageElement, attribute: "data-choice" | "data-pvp-choice"): void {
  const surface = image.parentElement;
  if (!surface) return;

  const preview = document.createElement("span");
  preview.className = "swipe-preview";
  preview.setAttribute("aria-hidden", "true");
  surface.append(preview);

  let pointer: { id: number; x: number; y: number; dx: number; dy: number; horizontal: boolean; vertical: boolean } | null = null;
  let suppressClickUntil = 0;

  const button = (choice: SwipeChoice) =>
    document.querySelector<HTMLButtonElement>(`[${attribute}="${choice}"]`);
  const enabled = () => !document.documentElement.classList.contains("media-obscured") &&
    !!button("REAL") && !!button("AI") &&
    !button("REAL")!.disabled && !button("AI")!.disabled;

  const clear = () => {
    pointer = null;
    image.style.transform = "";
    image.style.opacity = "";
    image.classList.remove("swipe-dragging");
    preview.textContent = "";
    preview.classList.remove("swipe-real", "swipe-slop", "swipe-visible");
  };

  image.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0 || !enabled()) return;
    clear();
    suppressClickUntil = 0;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, horizontal: false, vertical: false };
    image.setPointerCapture(event.pointerId);
  });

  image.addEventListener("pointermove", event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    pointer.dx = event.clientX - pointer.x;
    pointer.dy = event.clientY - pointer.y;
    if (!pointer.horizontal && !pointer.vertical && Math.hypot(pointer.dx, pointer.dy) > 10) {
      if (Math.abs(pointer.dy) > Math.abs(pointer.dx)) pointer.vertical = true;
      else pointer.horizontal = true;
    }
    if (!pointer.horizontal) return; // Vertical touch scrolling remains available.
    if (event.cancelable) event.preventDefault();
    image.classList.add("swipe-dragging");
    image.style.transform = `translateX(${Math.max(-160, Math.min(160, pointer.dx))}px) rotate(${Math.max(-8, Math.min(8, pointer.dx / 18))}deg)`;
    image.style.opacity = String(Math.max(0.78, 1 - Math.abs(pointer.dx) / 700));
    preview.textContent = pointer.dx < 0 ? "REAL" : "SLOP";
    preview.classList.toggle("swipe-real", pointer.dx < 0);
    preview.classList.toggle("swipe-slop", pointer.dx >= 0);
    preview.classList.add("swipe-visible");
  });

  image.addEventListener("pointerup", event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const { dx, dy, horizontal } = pointer;
    const choice = horizontal ? swipeDecision(dx, dy, image.getBoundingClientRect().width) : null;
    if (horizontal) suppressClickUntil = Date.now() + 600; // Prevent swipe from opening the zoom dialog.
    clear();
    if (choice && enabled()) button(choice)?.click();
  });

  image.addEventListener("pointercancel", clear);
  image.addEventListener("lostpointercapture", clear);
  image.addEventListener("click", event => {
    if (event.detail && Date.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = 0;
    }
  }, true);
}
