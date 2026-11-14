/** Game copy made in the owner's browser (spec `copie-di-gioco`, section 3): crop, scale and WebP encoding, upload to
 * the library; saving «Inquadratura» makes a new copy only when the crop changed. */
import { centredCrop, copyDimensions, cropQuery, GAME_COPY, viewQuery, type Crop, type View } from "../shared/game-copy";

export async function encodeGameCopy(source: Blob, crop?: Crop): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const frame = crop || centredCrop(bitmap.width, bitmap.height);
    const { width, height } = copyDimensions(frame);
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw Error("Canvas non disponibile");
    context.fillStyle = "#fff"; context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, frame.x, frame.y, frame.width, frame.height, 0, 0, width, height);
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

/** Encodes `source` (or, without it, the stored original) along `crop` (nearest format, centred, without it) and stores it as the
 * game copy of library image `imageId`, with `view` (the previous one if it fits, otherwise centred, without it). Returns the item. */
export async function prepareLibraryCopy<T>(imageId: string, source?: Blob, crop?: Crop, view?: View): Promise<T> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Immagine non valida");
  const file = source || await originalOf(imageId);
  const copy = await encodeGameCopy(file, crop);
  const query = new URLSearchParams();
  if (crop) query.set("crop", cropQuery(crop));
  if (view) query.set("view", viewQuery(view));
  const upload = await fetch("/api/admin/library/" + encodeURIComponent(imageId) + "/copy" + (query.size ? "?" + query : ""),
    { method: "POST", credentials: "same-origin", headers: { "Content-Type": GAME_COPY.mime }, body: copy });
  const result = await upload.json().catch(() => ({})) as T & { error?: string };
  if (!upload.ok) throw Error(result.error || "Copia di gioco non registrata");
  return result;
}

/** Saves the owner's choice from the frame editor: a new copy when the crop changed, otherwise only the view (free, the copy and
 * its statistics stay). */

/** Saves the owner's choice from the frame editor: a new copy when the crop changed; the same item when it did not. */
export async function saveFrame<T>(item: T & { id: string; copy: { crop: Crop | null } | null }, choice: { crop: Crop }): Promise<T> {
  const same = item.copy?.crop && JSON.stringify(item.copy.crop) === JSON.stringify(choice.crop);
  return same ? item : prepareLibraryCopy<T>(item.id, undefined, choice.crop);
}
