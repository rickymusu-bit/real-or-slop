/** Uniform game copies (docs/copie-di-gioco.v1.0.0.md). v1.0.0, 2026-11-09T11:00:00Z.
 * Same recipe for REAL and SLOP: WebP, longest side at most 2048 px, quality 0.85, sRGB, no metadata.
 * Never enlarges: smaller files keep their size and are only re-encoded. */
export const GAME_COPY = { mime: "image/webp", maxSide: 2048, quality: 0.85, maxBytes: 4_000_000 } as const;
export const GAME_COPY_RECIPE = `webp-q${GAME_COPY.quality}-max${GAME_COPY.maxSide}-srgb-v1`;
export function gameCopyDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw Error("Dimensioni non valide");
  const scale = Math.min(1, GAME_COPY.maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
