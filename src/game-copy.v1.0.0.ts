/** Browser-side WebP game copy of a file under review. v1.0.0, 2026-11-09T12:00:00Z (docs/copie-di-gioco.v2.0.0.md).
 * The file is read, oriented, scaled and re-encoded with the shared recipe; the Worker checks format, size and
 * dimensions and makes the copy the file the owner approves. The original never changes. */
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

/** Encodes the file under review (inbox `inboxId`, source hash `sourceSha`) and registers it as its game copy:
 * from then on the copy is the file shown, approved, admitted and served to players. */
export interface PreparedCopy { sha256: string; width?: number; height?: number; bytes?: number; already_prepared: boolean }
export async function prepareReviewCopy(inboxId: string, sourceSha: string): Promise<PreparedCopy> {
  if (!/^[\w-]{1,160}$/.test(inboxId) || !/^[a-f0-9]{64}$/.test(sourceSha)) throw Error("Identità non valida");
  const base = "/api/admin/review-inbox/" + encodeURIComponent(inboxId);
  // An empty request only confirms an existing copy, so nothing is downloaded or encoded twice.
  const probe = await fetch(base + "/game-copy?source_sha256=" + sourceSha,
    { method: "POST", credentials: "same-origin", headers: { "Content-Type": GAME_COPY.mime }, body: new Uint8Array(0) });
  if (probe.ok) return await probe.json() as PreparedCopy;
  if (probe.status !== 413) throw Error(((await probe.json().catch(() => ({}))) as { error?: string }).error || "Copia di gioco non verificabile");
  const response = await fetch(base + "/image?source=" + sourceSha, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw Error("File in revisione non disponibile");
  const copy = await encodeGameCopy(await response.blob());
  const upload = await fetch(base + "/game-copy?source_sha256=" + sourceSha,
    { method: "POST", credentials: "same-origin", headers: { "Content-Type": GAME_COPY.mime }, body: copy });
  const result = (await upload.json().catch(() => ({}))) as PreparedCopy & { error?: string };
  if (!upload.ok) throw Error(result.error || "Copia di gioco non registrata");
  return result;
}

/** Makes sure the inbox file has its game copy and returns the hash to use from now on (the copy's).
 * Called right after a photo enters the queue and before any operation bound to its pixels. */
export async function ensureReviewCopy(inboxId: string, sha: string): Promise<string> {
  return (await prepareReviewCopy(inboxId, sha)).sha256;
}
/** Prepares copies for photos that just entered the queue; failures are reported, not thrown. */
export async function ensureReviewCopies(items: { inbox_id?: string; sha256?: string }[]): Promise<{ done: number; failed: string[] }> {
  let done = 0; const failed: string[] = [];
  for (const item of items) {
    if (!item.inbox_id || !item.sha256) continue;
    try { await ensureReviewCopy(item.inbox_id, item.sha256); done++; }
    catch (error) { failed.push(error instanceof Error ? error.message : String(error)); }
  }
  return { done, failed };
}
