/** Extraction of the REAL for an automatic batch, corrected on crowding and detail (owner decisions of 2026-11-21, specification
 * `generazione-slop`, section 2). Without correction the most versatile REAL, usually the simplest, would be drawn more and the SLOP
 * would end up simpler than the REAL of their gallery: simplicity would hint at the origin. Each axis is split into three bins; a bin
 * with fewer SLOP than its share of REAL weighs more. Axes are corrected separately: with three bins each, nine joint cells would
 * be almost empty in a gallery of a few dozen photos. */
import type { Scores } from "./real-measure";

export const BINS = 3;
const AXES = ["crowdedness", "detail"] as const;
const MIN_WEIGHT = 0.25, MAX_WEIGHT = 4;
/** Bin of a score from 0 to 100: 0-33, 34-66, 67-100. */
export const binOf = (score: number) => Math.min(BINS - 1, Math.floor(Math.max(0, Math.min(100, score)) / (100 / BINS + 1e-9)));

/** Shares of each bin per axis, with one extra count per bin so that an empty gallery or a first SLOP gives finite weights. */
function shares(list: readonly Scores[]) {
  return Object.fromEntries(AXES.map(axis => {
    const counts = Array(BINS).fill(1) as number[];
    for (const scores of list) counts[binOf(scores[axis])]++;
    const total = counts.reduce((a, b) => a + b, 0);
    return [axis, counts.map(n => n / total)];
  })) as Record<typeof AXES[number], number[]>;
}

/** Weight of each REAL: for each axis the share of its bin among the measured REAL of the gallery over the share among the SLOP
 * already made from ideas of that gallery, between 0.25 and 4; the product of the two axes. A REAL with no measure weighs 1. */
export function extractionWeights(candidates: readonly (Scores | null)[], reals: readonly Scores[], slops: readonly Scores[]): number[] {
  const real = shares(reals), slop = shares(slops);
  return candidates.map(c => c ? AXES.reduce((w, axis) => {
    const b = binOf(c[axis]);
    return w * Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, real[axis][b] / slop[axis][b]));
  }, 1) : 1);
}

/** `size` distinct indices drawn with probability proportional to the weights, without replacement (Efraimidis and Spirakis:
 * the smallest -ln(u)/w win). `random` returns numbers in (0, 1]. */
export function weightedSample(weights: readonly number[], size: number, random: () => number): number[] {
  return weights.map((w, i) => ({ i, key: -Math.log(Math.max(random(), Number.MIN_VALUE)) / Math.max(w, 1e-9) }))
    .sort((a, b) => a.key - b.key).slice(0, size).map(x => x.i);
}
