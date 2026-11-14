/** Proposal of an automatic SLOP batch (spec `generazione-slop`, section 8): counts per group (genre and decade), spread percent,
 * the missing number, the single candidate and the batch size. Pure. */
import type { GroupCount } from "./slop-groups";

export const AUTO_MAX_BATCH = 10, IGNORE_MARGIN = 10, AUTO_DEFAULT_THRESHOLD = 33;

export interface AutoInput {
  groups: readonly GroupCount[];
  realTotal: number;
  sectionMin: number;
  groupMin: number;
  thresholdPercent: number;
  enabled: boolean;
  openBatch: boolean;
  ignored: ReadonlyMap<string, number>;
}
export interface Proposal {
  group: string; genre: string; time: string; n_real: number; n_slop: number; n_new: number; spread: number; spread_percent: number;
  missing: number; size: number;
}
export type NoProposal = "disabled" | "batch_open" | "studio_closed" | "none";

/** spread_percent with the sign: 100 without SLOP, 0 at parity, negative when the SLOP exceed the REAL; null without REAL. */
export function spreadPercent(real: number, slop: number): number | null {
  return real > 0 ? 100 * (real - slop) / real : null;
}

/** Exact comparison 100 × spread / n_real ≥ threshold, without rounding: 15 REAL and 10 SLOP reach 33%. */
const reaches = (real: number, slop: number, threshold: number) => real > 0 && 100 * (real - slop) >= threshold * real;

export function candidates(input: AutoInput): Proposal[] {
  const out: Proposal[] = [];
  for (const g of input.groups) {
    if (g.real < input.groupMin || !reaches(g.real, g.slop, input.thresholdPercent)) continue;
    const spread = g.real - g.slop, missing = spread - g.fresh, percent = spreadPercent(g.real, g.slop)!;
    if (missing < 1) continue;
    const ignoredAt = input.ignored.get(g.key);
    if (ignoredAt !== undefined && percent < ignoredAt + IGNORE_MARGIN) continue;
    out.push({ group: g.key, genre: g.genre, time: g.time, n_real: g.real, n_slop: g.slop, n_new: g.fresh, spread, spread_percent: percent,
      missing, size: Math.min(missing, AUTO_MAX_BATCH) });
  }
  return out.sort((a, b) => b.spread_percent - a.spread_percent || b.missing - a.missing || (a.group < b.group ? -1 : a.group > b.group ? 1 : 0));
}

export function proposal(input: AutoInput): { proposal: Proposal | null; reason: NoProposal | null } {
  if (!input.enabled) return { proposal: null, reason: "disabled" };
  if (input.openBatch) return { proposal: null, reason: "batch_open" };
  if (input.realTotal < input.sectionMin) return { proposal: null, reason: "studio_closed" };
  const [first] = candidates(input);
  return first ? { proposal: first, reason: null } : { proposal: null, reason: "none" };
}
