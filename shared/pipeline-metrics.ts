/** Comparison of REAL and SLOP category distributions: total variation distance with a permutation test.
 * Thresholds are provisional and revisable (specification `generazione-slop`, section 4). */
export const METRIC_THRESHOLDS = { minimum: 20, distance: .2, significance: .05, other: .1 } as const;
/** Categories without evidence or awaiting classification never enter a comparison. */
const IGNORED = new Set(["unknown", "pending"]);
export type Counts = Record<string, number>;
export interface Comparison { real_n: number; slop_n: number; distance: number | null; p: number | null; status: "insufficient" | "consistent" | "divergent" }

const usable = (counts: Counts) => Object.entries(counts).filter(([k, n]) => !IGNORED.has(k) && n > 0);
/** Half the L1 distance between shares: 0 identical, 1 disjoint. */
export function totalVariation(a: Counts, b: Counts): number {
  const ea = usable(a), eb = usable(b), na = ea.reduce((s, [, n]) => s + n, 0), nb = eb.reduce((s, [, n]) => s + n, 0);
  if (!na || !nb) return 0;
  const keys = new Set([...ea.map(([k]) => k), ...eb.map(([k]) => k)]), ma = Object.fromEntries(ea), mb = Object.fromEntries(eb);
  let sum = 0; for (const k of keys) sum += Math.abs((ma[k] || 0) / na - (mb[k] || 0) / nb);
  return sum / 2;
}
/** Deterministic generator, so the same counts always give the same p-value on every page load. */
export function seeded(seed = 2463534242) { let x = seed >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
/** Two-sample permutation test on the pooled labels: is the observed distance larger than chance splits of the same photos? */
export function compare(real: Counts, slop: Counts, permutations = 1000, random = seeded()): Comparison {
  const ea = usable(real), eb = usable(slop), na = ea.reduce((s, [, n]) => s + n, 0), nb = eb.reduce((s, [, n]) => s + n, 0);
  if (na < METRIC_THRESHOLDS.minimum || nb < METRIC_THRESHOLDS.minimum) return { real_n: na, slop_n: nb, distance: na && nb ? totalVariation(real, slop) : null, p: null, status: "insufficient" };
  const observed = totalVariation(real, slop), labels: number[] = [], names: string[] = [];
  const pooled = new Map<string, number>();
  for (const [k, n] of [...ea, ...eb]) pooled.set(k, (pooled.get(k) || 0) + n);
  for (const [k, n] of pooled) { const index = names.push(k) - 1; for (let i = 0; i < n; i++) labels.push(index); }
  const total = labels.length, share = new Float64Array(names.length);
  let extreme = 0;
  for (let round = 0; round < permutations; round++) {
    // Partial Fisher–Yates: the first na positions are a uniformly random REAL-sized subset.
    for (let i = 0; i < na; i++) { const j = i + Math.floor(random() * (total - i)); const t = labels[i]; labels[i] = labels[j]; labels[j] = t; }
    share.fill(0);
    for (let i = 0; i < na; i++) share[labels[i]] += 1 / na;
    let distance = 0;
    for (const [index, k] of names.entries()) distance += Math.abs(share[index] - ((pooled.get(k) || 0) - share[index] * na) / nb);
    if (distance / 2 >= observed - 1e-12) extreme++;
  }
  const p = (extreme + 1) / (permutations + 1);
  return { real_n: na, slop_n: nb, distance: observed, p, status: observed >= METRIC_THRESHOLDS.distance && p < METRIC_THRESHOLDS.significance ? "divergent" : "consistent" };
}
/** Share of `other` among usable REAL observations: a high share means the list no longer describes the gallery. */
export function otherShare(counts: Counts) {
  const entries = usable(counts), total = entries.reduce((s, [, n]) => s + n, 0);
  return total ? (counts.other || 0) / total : 0;
}
