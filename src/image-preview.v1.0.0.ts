/** Enlarged preview on press and hold, for the admin dashboard (docs/anteprima-descrizione.v1.0.0.md, owner decision of 2026-11-14).
 * v1.0.0, 2026-11-14T09:00:00Z. Pressing and holding a thumbnail (finger or mouse, 500 ms) opens a dialog with the image large and,
 * under it, title, description, a link and other details; the dialog stays open after the press and closes with × in its corner
 * (Esc too). A short press keeps its own meaning (tick a Commons result, open the detail of the Database): the click that follows
 * a press long enough to open the preview is swallowed. Right click and the keyboard's context-menu key (Shift+F10) open it as well.
 * Only the dashboard uses it: in the game a press and hold stays blocked (src/media-privacy.ts). */
import "./image-preview.v1.0.0.css";
import { escape } from "../shared/html";

export interface PreviewContent {
  src: string; alt: string; title: string; description?: string;
  link?: { href: string; label: string };
  /** Extra markup, already escaped by the caller (tags, prompt). */
  extra?: string;
}

const HOLD_MS = 500, SLOP_PX = 10;
let dialog: HTMLDialogElement | null = null;

function safeHref(value: string): string | null {
  try { const url = new URL(value, location.href); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; }
  catch { return null; }
}

/** Opens (or refills) the single preview dialog of the page. */
export function openPreview(content: PreviewContent): HTMLDialogElement {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "image-preview";
    dialog.setAttribute("aria-labelledby", "image-preview-title");
    dialog.addEventListener("click", event => {
      if ((event.target as HTMLElement).closest("[data-preview-close]")) dialog!.close();
    });
    document.body.append(dialog);
  }
  const href = content.link ? safeHref(content.link.href) : null;
  dialog.innerHTML = `<button type="button" class="image-preview-close" data-preview-close aria-label="Chiudi l'anteprima">×</button>
    <div class="image-preview-media"><img src="${escape(content.src)}" alt="${escape(content.alt)}" draggable="false"></div>
    <div class="image-preview-text"><h3 id="image-preview-title">${escape(content.title || "Senza titolo")}</h3>
    ${content.description !== undefined ? `<p class="image-preview-description">${content.description ? escape(content.description) : '<span class="hint">Nessuna descrizione.</span>'}</p>` : ""}
    ${href && content.link ? `<p><a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(content.link.label)}</a></p>` : ""}
    ${content.extra || ""}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector<HTMLButtonElement>("[data-preview-close]")?.focus({ preventScroll: true });
  return dialog;
}

/** Calls open(element) when an element matching selector inside root is pressed and held, right clicked or given the context-menu key. */
export function onLongPress(root: HTMLElement, selector: string, open: (element: HTMLElement) => void): void {
  let timer = 0, start: { x: number; y: number; id: number; element: HTMLElement } | null = null, swallow: HTMLElement | null = null;
  const cancel = () => { window.clearTimeout(timer); timer = 0; start = null; };
  const fire = (element: HTMLElement) => { cancel(); swallow = element; open(element); };
  root.addEventListener("pointerdown", event => {
    swallow = null;
    const element = (event.target as HTMLElement).closest<HTMLElement>(selector);
    if (!element || !root.contains(element) || (event.pointerType === "mouse" && event.button !== 0)) return;
    cancel();
    start = { x: event.clientX, y: event.clientY, id: event.pointerId, element };
    timer = window.setTimeout(() => { if (start) fire(start.element); }, HOLD_MS);
  });
  root.addEventListener("pointermove", event => {
    if (start && event.pointerId === start.id && Math.hypot(event.clientX - start.x, event.clientY - start.y) > SLOP_PX) cancel();
  });
  for (const type of ["pointerup", "pointercancel", "dragstart"]) root.addEventListener(type, () => { if (timer) cancel(); });
  // Touch browsers send «contextmenu» on a long press too: the preview opens once, and the system menu never shows.
  root.addEventListener("contextmenu", event => {
    const element = (event.target as HTMLElement).closest<HTMLElement>(selector);
    if (!element || !root.contains(element)) return;
    event.preventDefault();
    if (swallow === element) return;
    // Only a press of a finger or of the left button is followed by a click to drop; the context-menu key is not.
    if (start) fire(element); else { cancel(); open(element); }
  });
  // The click that ends a long press would tick or open the image: it is dropped, once.
  root.addEventListener("click", event => {
    if (!swallow) return;
    const element = (event.target as HTMLElement).closest<HTMLElement>(selector);
    if (element === swallow) { event.preventDefault(); event.stopPropagation(); }
    swallow = null;
  }, true);
}
