export const preparationTtlMs = 10 * 60_000;
export const roomPreparationTtlMs = 45_000;
export const preloadLimits = {
  concurrency: 2,
  timeoutMs: 20_000,
  encodedBytes: 32 * 1024 * 1024,
  decodedBytes: 24 * 1024 * 1024,
  assetBytes: 12_000_000,
  pixels: 6_000_000,
  window: 3,
} as const;

// Operational rollback affects only newly created sessions/rooms.
export const mediaProtocol = (setting?: string): 1 | 2 => setting === "legacy" ? 1 : 2;
