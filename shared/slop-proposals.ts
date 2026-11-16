/** Anonymous editorial inputs and catalogue balance. REAL references are used only while creating a batch. */
import type { Category } from "./tag-categories";
export const MAX_BATCH = 10, IGNORE_KEY = "catalog-balance";
export interface Tag { label: string; category: Category }
export interface InspirationItem { source?: string; title: string; tags: Tag[] }
export interface AutoInput {
  real: number; slop: number; pending: number; available: number;
  enabled: boolean; openBatch: boolean; ignoredMissing: number | null;
}
export interface Proposal { n_real: number; n_slop: number; n_new: number; spread: number; spread_percent: number; missing: number; size: number }
export type NoProposal = "disabled" | "batch_open" | "studio_closed" | "none";
export const spreadPercent = (real: number, slop: number): number | null => real > 0 ? 100 * (real - slop) / real : null;
export function proposal(input: AutoInput): { proposal: Proposal | null; reason: NoProposal | null } {
  if (!input.enabled) return { proposal: null, reason: "disabled" };
  if (input.openBatch) return { proposal: null, reason: "batch_open" };
  const spread = input.real - input.slop, percent = spreadPercent(input.real, input.slop);
  const missing = Math.max(0, spread - input.pending);
  if (percent === null || missing < 1 || input.available < 1
    || (input.ignoredMissing !== null && missing <= input.ignoredMissing)) return { proposal: null, reason: "none" };
  return { proposal: { n_real: input.real, n_slop: input.slop, n_new: input.pending, spread, spread_percent: percent,
    missing, size: Math.min(missing, input.available, MAX_BATCH) }, reason: null };
}
