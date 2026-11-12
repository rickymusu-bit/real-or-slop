/** Uniform game copies in one format (docs/copie-di-gioco.v3.0.0.md). v2.0.0, 2026-11-12T08:00:00Z.
 * Owner decision of 2026-11-11: every game copy has the same 4:5 portrait format, so that no shape tells REAL from SLOP and the
 * caption fits on a phone. The owner chooses the frame (crop) on the oriented original; the copy is that frame, scaled down to
 * at most 2048 px high, never enlarged. Same recipe as before otherwise: WebP quality 0.85, sRGB, no metadata.
 * A crop is { x, y, height } in pixels of the oriented original; its width is always round(height × 4 / 5).
 * v1.0.0 (shared/game-copy.v1.0.0.ts): the whole image, longest side at most 2048 px. */
export const GAME_COPY = { mime: "image/webp", maxHeight: 2048, quality: 0.85, maxBytes: 4_000_000, ratio: 4 / 5, minHeight: 64 } as const;
export const GAME_COPY_RECIPE = `webp-q${GAME_COPY.quality}-4x5-max${GAME_COPY.maxHeight}-srgb-v2`;
export interface Crop { x: number; y: number; height: number }

/** Width of a 4:5 frame of the given height. */
export const cropWidth = (height: number) => Math.round(height * GAME_COPY.ratio);

/** The largest 4:5 frame centred in the image: the default before the owner moves it. */
export function centredCrop(width: number, height: number): Crop {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw Error("Dimensioni non valide");
  let frameHeight = Math.min(height, Math.floor(width / GAME_COPY.ratio));
  while (frameHeight > 1 && cropWidth(frameHeight) > width) frameHeight--;
  return { x: Math.floor((width - cropWidth(frameHeight)) / 2), y: Math.floor((height - frameHeight) / 2), height: frameHeight };
}

/** Why a crop is not acceptable for an image of these dimensions, or "" if it is. */
export function cropError(width: number, height: number, crop: unknown): string {
  if (!crop || typeof crop !== "object") return "Inquadratura mancante";
  const { x, y, height: h } = crop as Record<string, unknown>;
  if (![x, y, h].every(v => typeof v === "number" && Number.isSafeInteger(v))) return "Inquadratura non valida";
  const c = crop as Crop;
  if (c.x < 0 || c.y < 0 || c.height < Math.min(GAME_COPY.minHeight, height, Math.floor(width / GAME_COPY.ratio))) return "Inquadratura troppo piccola o fuori dall'immagine";
  if (c.x + cropWidth(c.height) > width || c.y + c.height > height) return "Inquadratura fuori dall'immagine";
  return "";
}

/** Parses «x,y,height» (query string form). */
export function parseCrop(value: string | null): Crop | null {
  if (!value || !/^\d{1,6},\d{1,6},\d{1,6}$/.test(value)) return null;
  const [x, y, height] = value.split(",").map(Number);
  return { x, y, height };
}

/** Dimensions of the game copy made from a crop: 4:5, at most 2048 px high, never enlarged. */
export function gameCopyDimensions(crop: Crop): { width: number; height: number } {
  const height = Math.min(crop.height, GAME_COPY.maxHeight);
  return { width: cropWidth(height), height };
}
