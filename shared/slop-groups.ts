/** Groups of images of the same Genre and decade («mugshot/1960s»): a filter of the Database and the unit the Statistics compare
 * REAL and SLOP on (spec `statistiche-impostazioni`, section 3). Pure. */
import type { Category } from "./tag-categories";

export interface Group { key: string; genre: string; time: string }
export const groupKey = (genre: string, time: string) => genre + "/" + time;
/** The group of a key, or null if the key is not «genre/decade». */
export function parseGroup(key: unknown): Group | null {
  if (typeof key !== "string") return null;
  const match = /^([a-z0-9-]{1,40})\/([0-9]{3}0s)$/.exec(key);
  return match ? { key, genre: match[1], time: match[2] } : null;
}
/** The group of an image from its tags, or null without a Genre or a Time tag. */
export function groupOf(tags: readonly { label: string; category: Category }[]): Group | null {
  const genre = tags.find(t => t.category === "genre")?.label, time = tags.find(t => t.category === "time")?.label;
  return genre && time ? { key: groupKey(genre, time), genre, time } : null;
}

export interface GroupImage { origin: "REAL" | "SLOP"; status: string; group: string | null }
export interface GroupCount extends Group { real: number; slop: number; fresh: number }
/** Counts per group: REAL and SLOP among approved and published, new SLOP among «new»; the trash never counts. */
export function groupCounts(images: readonly GroupImage[]): GroupCount[] {
  const out = new Map<string, GroupCount>();
  for (const image of images) {
    const group = parseGroup(image.group);
    if (!group) continue;
    const done = image.status === "approved" || image.status === "published", fresh = image.origin === "SLOP" && image.status === "new";
    if (!done && !fresh) continue;
    const count = out.get(group.key) || { ...group, real: 0, slop: 0, fresh: 0 };
    if (fresh) count.fresh++; else if (image.origin === "REAL") count.real++; else count.slop++;
    out.set(group.key, count);
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key));
}
