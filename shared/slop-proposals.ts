/** Anonymous editorial inputs and catalogue balance. REAL references are used only while creating a batch. */
import type { Category } from "./tag-categories";
export const SECTION_MIN_REAL = 50, MAX_BATCH = 10, IGNORE_MARGIN = 10, AUTO_DEFAULT_THRESHOLD = 33, IGNORE_KEY = "catalog-balance";
export interface Tag { label: string; category: Category }
export interface InspirationItem { source?: string; title: string; tags: Tag[] }
export interface AutoInput {
  real: number; slop: number; pending: number; available: number;
  sectionMin: number; thresholdPercent: number; enabled: boolean; openBatch: boolean; ignoredAt: number | null;
}
export interface Proposal { n_real: number; n_slop: number; n_new: number; spread: number; spread_percent: number; missing: number; size: number }
export type NoProposal = "disabled" | "batch_open" | "studio_closed" | "none";
export const spreadPercent = (real: number, slop: number): number | null => real > 0 ? 100 * (real - slop) / real : null;
export function proposal(input: AutoInput): { proposal: Proposal | null; reason: NoProposal | null } {
  if (!input.enabled) return { proposal: null, reason: "disabled" };
  if (input.openBatch) return { proposal: null, reason: "batch_open" };
  if (input.real < input.sectionMin) return { proposal: null, reason: "studio_closed" };
  const spread = input.real - input.slop, percent = spreadPercent(input.real, input.slop);
  const missing = Math.max(0, spread - input.pending);
  if (percent === null || 100 * spread < input.thresholdPercent * input.real || missing < 1 || input.available < 1
    || (input.ignoredAt !== null && percent < input.ignoredAt + IGNORE_MARGIN)) return { proposal: null, reason: "none" };
  return { proposal: { n_real: input.real, n_slop: input.slop, n_new: input.pending, spread, spread_percent: percent,
    missing, size: Math.min(missing, input.available, MAX_BATCH) }, reason: null };
}
