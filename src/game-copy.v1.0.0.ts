/** Browser-side WebP game copy of a library image. v1.1.0, 2026-11-09T16:30:00Z (docs/copie-di-gioco.v2.0.0.md,
 * docs/libreria-immagini.v1.1.0.md). The file is oriented, scaled and re-encoded with the shared recipe; the Worker
 * checks format, size and dimensions. It is the file the owner approves and players see. */
import { GAME_COPY, gameCopyDimensions } from "../shared/game-copy.v1.0.0";

export async function encodeGameCopy(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const { width, height } = gameCopyDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw Error("Canvas non disponibile");
    context.fillStyle = "#fff"; context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const copy = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, GAME_COPY.mime, GAME_COPY.quality));
    if (!copy || copy.type !== GAME_COPY.mime) throw Error("Questo browser non esporta WebP: usare Chrome, Edge o Firefox");
    if (copy.size > GAME_COPY.maxBytes) throw Error("Copia di gioco oltre 4 MB");
    return copy;
  } finally { bitmap.close(); }
}

/** Encodes `source` (or, without it, the stored original) and stores it as the game copy of library image `imageId`.
 * Returns the updated library item. */
export async function prepareLibraryCopy<T>(imageId: string, source?: Blob): Promise<T> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Immagine non valida");
  const base = "/api/admin/library/" + encodeURIComponent(imageId);
  let file = source;
  if (!file) {
    const response = await fetch(base + "/original", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw Error("Originale non disponibile");
    file = await response.blob();
  }
  const copy = await encodeGameCopy(file);
  const upload = await fetch(base + "/copy", { method: "POST", credentials: "same-origin", headers: { "Content-Type": GAME_COPY.mime }, body: copy });
  const result = await upload.json().catch(() => ({})) as T & { error?: string };
  if (!upload.ok) throw Error(result.error || "Copia di gioco non registrata");
  return result;
}
