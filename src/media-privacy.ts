/** Right-click, drag and (through CSS) long-press on game images are blocked: a deterrent, not a guarantee. */
export function blockMediaSaving(doc: Document = document) {
  const preventCopy = (event: Event) => {
    if ((event.target as Element | null)?.closest?.("[data-game-media]")) event.preventDefault();
  };
  doc.addEventListener("contextmenu", preventCopy);
  doc.addEventListener("dragstart", preventCopy);
  return () => {
    doc.removeEventListener("contextmenu", preventCopy);
    doc.removeEventListener("dragstart", preventCopy);
  };
}
/** Local deterrents only: never pause a server clock or infer cheating. */
export function protectGameMedia(doc: Document = document, win: Window = window, canReveal = () => true) {
  let covered = doc.visibilityState === "hidden";
  const refresh = () => doc.documentElement.classList.toggle("media-obscured", covered);
  const cover = () => {
    covered = true;
    refresh();
    doc.querySelector<HTMLDialogElement>("[data-game-zoom]")?.close();
  };
  const visibility = () => { if (doc.visibilityState === "hidden") cover(); };
  const reveal = (event: Event) => {
    if ((event.target as Element | null)?.closest?.("[data-reveal-media]") && doc.visibilityState === "visible" && canReveal()) {
      covered = false;
      refresh();
    }
  };
  doc.addEventListener("visibilitychange", visibility);
  const unblock = blockMediaSaving(doc);
  doc.addEventListener("click", reveal);
  win.addEventListener("blur", cover);
  win.addEventListener("pagehide", cover);
  refresh();
  return {
    refresh,
    dispose() {
      doc.removeEventListener("visibilitychange", visibility);
      unblock();
      doc.removeEventListener("click", reveal);
      win.removeEventListener("blur", cover);
      win.removeEventListener("pagehide", cover);
      doc.documentElement.classList.remove("media-obscured");
    },
  };
}
