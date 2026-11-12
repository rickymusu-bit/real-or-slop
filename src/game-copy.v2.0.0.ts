/** Browser-side 4:5 WebP game copy of a library image (docs/copie-di-gioco.v3.0.0.md). v2.0.0, 2026-11-12T08:00:00Z.
 * The oriented original is cut along the owner's frame (centred by default), scaled to at most 2048 px high and re-encoded
 * with the shared recipe (shared/game-copy.v2.0.0.ts); the Worker checks format, size and dimensions against the frame.
 * v1.1.0 (src/game-copy.v1.0.0.ts): the whole image. */
import { centredCrop, GAME_COPY, gameCopyDimensions, type Crop } from "../shared/game-copy.v2.0.0";

export async function encodeGameCopy(source: Blob, crop?: Crop): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const frame = crop || centredCrop(bitmap.width, bitmap.height);
    const { width, height } = gameCopyDimensions(frame);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw Error("Canvas non disponibile");
    context.fillStyle = "#fff"; context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, frame.x, frame.y, Math.round(frame.height * GAME_COPY.ratio), frame.height, 0, 0, width, height);
    const copy = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, GAME_COPY.mime, GAME_COPY.quality));
    if (!copy || copy.type !== GAME_COPY.mime) throw Error("Questo browser non esporta WebP: usare Chrome, Edge o Firefox");
    if (copy.size > GAME_COPY.maxBytes) throw Error("Copia di gioco oltre 4 MB");
    return copy;
  } finally { bitmap.close(); }
}

/** The stored original of a library image. */
export async function originalOf(imageId: string): Promise<Blob> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Immagine non valida");
  const response = await fetch("/api/admin/library/" + encodeURIComponent(imageId) + "/original", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw Error("Originale non disponibile");
  return response.blob();
}

/** Encodes `source` (or, without it, the stored original) along `crop` (centred without it) and stores it as the game copy of
 * library image `imageId`. Returns the updated library item. */
export async function prepareLibraryCopy<T>(imageId: string, source?: Blob, crop?: Crop): Promise<T> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Immagine non valida");
  const file = source || await originalOf(imageId);
  const copy = await encodeGameCopy(file, crop);
  const query = crop ? "?crop=" + [crop.x, crop.y, crop.height].join(",") : "";
  const upload = await fetch("/api/admin/library/" + encodeURIComponent(imageId) + "/copy" + query,
    { method: "POST", credentials: "same-origin", headers: { "Content-Type": GAME_COPY.mime }, body: copy });
  const result = await upload.json().catch(() => ({})) as T & { error?: string };
  if (!upload.ok) throw Error(result.error || "Copia di gioco non registrata");
  return result;
}
