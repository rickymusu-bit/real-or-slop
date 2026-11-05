// Versioned extraction contract: changing preprocessing/model requires a new key.
export const similarityModel = "onnx-community/dinov2-small";
export const similarityModelRevision = "8b1f705a3a7f6f062f6bdd21986c1583d3ef105d";
export const similarityVersion = "dinov2-small-q8-cls-v1";
// Fingerprints can be reused when the comparison policy changes; scan
// checkpoints must be invalidated independently of the extraction contract.
export const similarityIndexVersion = similarityVersion + ":same-origin-v1";
export const embeddingDimensions = 384;
export const defaultSimilarityThreshold = 0.88;
export interface SimilarityFeature { sha256: string; dhash: string; embedding: number[] }
export function normalizedEmbedding(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== embeddingDimensions || value.some(x => typeof x !== "number" || !Number.isFinite(x)))
    throw Error("Impronta DINOv2 non valida");
  const norm = Math.hypot(...value);
  if (!Number.isFinite(norm) || norm < 1e-8) throw Error("Impronta DINOv2 vuota o fuori intervallo");
  return value.map(x => x / norm);
}
export function hashDistance(a: string, b: string): number {
  if (![a, b].every(x => /^[0-9a-f]{16}$/i.test(x))) throw Error("dHash non valido");
  let value = BigInt("0x" + a) ^ BigInt("0x" + b), count = 0;
  while (value) { value &= value - 1n; count++; }
  return count;
}
export function compareFeatures(a: SimilarityFeature, b: SimilarityFeature, threshold = defaultSimilarityThreshold) {
  const distance = hashDistance(a.dhash, b.dhash);
  const cosine = Math.max(-1, Math.min(1, a.embedding.reduce((sum, x, i) => sum + x * b.embedding[i], 0)));
  const reason = a.sha256 === b.sha256 ? "exact" : distance <= 5 ? "perceptual" : cosine >= threshold ? "visual" : null;
  return { reason, distance, cosine };
}
export function sameOrigin(a: { origin: string }, b: { origin: string }) {
  return a.origin === b.origin && ["REAL", "AI"].includes(a.origin);
}
export function compareSameOrigin(a: SimilarityFeature & { origin: string }, b: SimilarityFeature & { origin: string }, threshold = defaultSimilarityThreshold) {
  return sameOrigin(a, b) ? compareFeatures(a, b, threshold) : null;
}
export type SimilarityDecision = "pending" | "different" | "same_scene" | "prefer_a" | "prefer_b";
export interface SceneEdge { a: string; b: string; decision: string }
// Edges are current-hash-bound by the caller. Recompute components so reversing
// a decision can split a group; a permanently assigned group ID could not do so.
export function sceneGroups(edges: SceneEdge[]) {
  const parent = new Map<string, string>();
  const root = (key: string): string => {
    const p = parent.get(key);
    if (!p) { parent.set(key, key); return key; }
    if (p === key) return key;
    const result = root(p); parent.set(key, result); return result;
  };
  for (const edge of edges) {
    if (!["same_scene", "prefer_a", "prefer_b"].includes(edge.decision)) continue;
    const a = root(edge.a), b = root(edge.b);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  }
  return new Map([...parent.keys()].map(key => [key, root(key)]));
}
