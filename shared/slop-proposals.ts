/** Editorial inputs; reference allocation is private. Proposal only describes historical batch snapshots. */
import type { Category } from "./tag-categories";
export const MAX_BATCH = 10;
export interface Tag { label: string; category: Category }
export interface InspirationItem { source?: string; title: string; tags: Tag[] }
export interface Proposal { n_real: number; n_slop: number; n_new: number; spread: number; spread_percent: number; missing: number; size: number }
