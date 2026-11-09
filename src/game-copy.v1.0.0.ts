/** Browser-side WebP game copy of an admitted image. v1.0.0, 2026-11-09T11:00:00Z.
 * The approved file is read, oriented, scaled and re-encoded with the shared recipe; the result is uploaded
 * to the Worker, which checks format, size and dimensions against the admitted file. The original never changes. */
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

/** Reads the approved file of `inboxId`, encodes it and registers it as the game copy of `imageId`. */
export async function prepareGameCopy(inboxId: string, imageId: string): Promise<void> {
  if (!/^[\w-]{1,160}$/.test(inboxId) || !/^[\w-]{1,160}$/.test(imageId)) throw Error("Identità non valida");
  const response = await fetch("/api/admin/review-inbox/" + encodeURIComponent(inboxId) + "/image", { credentials: "same-origin" });
  if (!response.ok) throw Error("File approvato non disponibile");
  const copy = await encodeGameCopy(await response.blob());
  const upload = await fetch("/api/admin/editorial/cycle/game-copy?image_id=" + encodeURIComponent(imageId),
    { method: "POST", credentials: "same-origin", headers: { "Content-Type": GAME_COPY.mime }, body: copy });
  if (!upload.ok) throw Error(((await upload.json().catch(() => ({}))) as { error?: string }).error || "Copia di gioco non registrata");
}
