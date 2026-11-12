/** Proposal of an automatic SLOP batch (docs/proposta-generazione-slop.v2.0.0.md, sections 2–4). v1.0.0, 2026-11-12T21:00:00Z.
 * For each tag: n_real and n_slop among approved and published images, n_new among the new SLOP. spread = n_real − n_slop,
 * spread_percent = 100 × spread / n_real, missing = spread − n_new. A tag is a candidate when no automatic batch is open, proposals
 * are on, the studio is open, n_real reaches the theme threshold, spread_percent reaches the proposal threshold, missing ≥ 1 and the
 * tag was not ignored (or its percentage grew by at least 10 points since). One candidate is proposed: highest spread_percent, then
 * highest missing, then alphabetical. Pure: the counts come from the database. */
export const AUTO_MAX_BATCH = 10, IGNORE_MARGIN = 10, AUTO_DEFAULT_THRESHOLD = 33;

export interface TagCount { label: string; real: number; slop: number; fresh: number }
export interface AutoInput {
  tags: readonly TagCount[];
  realTotal: number;
  sectionMin: number;
  themeMin: number;
  thresholdPercent: number;
  enabled: boolean;
  openBatch: boolean;
  ignored: ReadonlyMap<string, number>;
}
export interface Proposal { tag: string; n_real: number; n_slop: number; n_new: number; spread: number; spread_percent: number; missing: number; size: number }
export type NoProposal = "disabled" | "batch_open" | "studio_closed" | "none";

/** spread_percent with the sign: 100 without SLOP, 0 at parity, negative when the SLOP exceed the REAL; null without REAL. */
export function spreadPercent(real: number, slop: number): number | null {
  return real > 0 ? 100 * (real - slop) / real : null;
}

/** Exact comparison 100 × spread / n_real ≥ threshold, without rounding: 15 REAL and 10 SLOP reach 33%. */
const reaches = (real: number, slop: number, threshold: number) => real > 0 && 100 * (real - slop) >= threshold * real;

export function candidates(input: AutoInput): Proposal[] {
  const out: Proposal[] = [];
  for (const t of input.tags) {
    if (t.real < input.themeMin || !reaches(t.real, t.slop, input.thresholdPercent)) continue;
    const spread = t.real - t.slop, missing = spread - t.fresh, percent = spreadPercent(t.real, t.slop)!;
    if (missing < 1) continue;
    const ignoredAt = input.ignored.get(t.label);
    if (ignoredAt !== undefined && percent < ignoredAt + IGNORE_MARGIN) continue;
    out.push({ tag: t.label, n_real: t.real, n_slop: t.slop, n_new: t.fresh, spread, spread_percent: percent, missing, size: Math.min(missing, AUTO_MAX_BATCH) });
  }
  return out.sort((a, b) => b.spread_percent - a.spread_percent || b.missing - a.missing || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

export function proposal(input: AutoInput): { proposal: Proposal | null; reason: NoProposal | null } {
  if (!input.enabled) return { proposal: null, reason: "disabled" };
  if (input.openBatch) return { proposal: null, reason: "batch_open" };
  if (input.realTotal < input.sectionMin) return { proposal: null, reason: "studio_closed" };
  const [first] = candidates(input);
  return first ? { proposal: first, reason: null } : { proposal: null, reason: "none" };
}
