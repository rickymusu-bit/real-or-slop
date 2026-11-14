/** Visible «RS» mark on every game image, REAL and SLOP alike (spec `contenuti-e-trasparenza`): bottom right inside the
 * picture, about 5% of the short side with a readable minimum, white with a dark outline. An overlay: files are not modified. */
export const MARK_TEXT = "RS";
const RATIO = 0.065, MIN_FONT = 14, GAP_RATIO = 0.025, MIN_GAP = 4;

export interface MarkInput {
  box: { left: number; top: number; width: number; height: number };
  natural: { width: number; height: number };
  parent: { width: number; height: number };
  fit: string;
}
/** Position of the mark in the positioned parent, from the rendered picture (object-fit contain or fill). */
export function markPlacement({ box, natural, parent, fit }: MarkInput): { fontSize: number; right: number; bottom: number } | null {
  if (box.width <= 0 || box.height <= 0 || natural.width <= 0 || natural.height <= 0) return null;
  const scale = fit === "contain" || fit === "scale-down" ? Math.min(box.width / natural.width, box.height / natural.height, fit === "scale-down" ? 1 : Infinity) : 0;
  const width = scale ? natural.width * scale : box.width, height = scale ? natural.height * scale : box.height;
  const left = box.left + (box.width - width) / 2, top = box.top + (box.height - height) / 2;
  const short = Math.min(width, height), gap = Math.max(MIN_GAP, short * GAP_RATIO);
  return {
    fontSize: Math.round(Math.max(MIN_FONT, short * RATIO)),
    right: Math.round(parent.width - (left + width) + gap),
    bottom: Math.round(parent.height - (top + height) + gap),
  };
}

const marked = new WeakSet<HTMLImageElement>();
/** Adds the mark to each game image under `root`; the image's parent must be positioned. Idempotent. */
export function markGameMedia(root: ParentNode = document): void {
  root.querySelectorAll<HTMLImageElement>("img[data-game-media]").forEach(img => {
    const parent = img.parentElement;
    if (!parent || marked.has(img)) return;
    marked.add(img);
    const mark = document.createElement("span");
    mark.className = "rs-mark";
    mark.textContent = MARK_TEXT;
    mark.setAttribute("aria-hidden", "true");
    mark.hidden = true;
    img.after(mark);
    const place = () => {
      const at = markPlacement({
        box: { left: img.offsetLeft, top: img.offsetTop, width: img.clientWidth, height: img.clientHeight },
        natural: { width: img.naturalWidth, height: img.naturalHeight },
        parent: { width: parent.clientWidth, height: parent.clientHeight },
        fit: getComputedStyle(img).objectFit,
      });
      mark.hidden = !at;
      if (!at) return;
      mark.style.fontSize = at.fontSize + "px";
      mark.style.right = at.right + "px";
      mark.style.bottom = at.bottom + "px";
    };
    img.addEventListener("load", place);
    if (typeof ResizeObserver === "function") new ResizeObserver(place).observe(img);
    if (img.complete) place();
  });
}
