/** Editorial inputs; reference allocation is private. Proposal only describes historical batch snapshots. */
export const MAX_BATCH = 10;
/** A slot of a manual batch; batches made before 1.50.0 also kept its starting tags. */
export interface InspirationItem { source?: string; title: string }
export interface Proposal { n_real: number; n_slop: number; n_new: number; spread: number; spread_percent: number; missing: number; size: number }
