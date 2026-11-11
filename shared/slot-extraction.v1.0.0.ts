/** Slots of the SLOP studio (docs/wizard-slop.v1.4.0.md, section 4). v1.0.0, 2026-11-10T22:11:48Z.
 * A slot is the theme (mandatory in every prompt) plus at most one tag per category, drawn from the REAL images that
 * contain the whole theme. Categories in order Time, Format, Place, Setting, Event, People, Objects; after each pick the
 * reference images narrow to those that also contain it, unless fewer than MIN_SUPPORT would remain. Weight of a
 * candidate: square root of its frequency times the spread factor max(0.25, 1 + s/S); a tag already used in the same
 * category by another slot of the group weighs a third each time; a combination already in the group is drawn again,
 * up to 20 times. Pure: the random source is injected. */
import type { Category } from "./tag-categories.v1.0.0";

export const SLOT_ORDER: readonly Category[] = ["time", "format", "place", "setting", "event", "people", "object"];
export const MIN_SUPPORT = 3, SECTION_MIN_REAL = 50, THEME_MIN_REAL = 10, MAX_SLOTS = 10;
const ATTEMPTS = 20;

export interface TaggedImage { tags: Map<string, Category> }
export type Slot = Partial<Record<Category, string>>;
export interface SlotInput {
  images: readonly TaggedImage[]; spread: ReadonlyMap<string, number>; theme: readonly string[];
  count: number; existing?: readonly Slot[]; random?: () => number;
}

/** Spread factor: twice for the most missing tag, once for a neutral one, a quarter for the most exceeding one. */
export function spreadFactor(spread: number, maxAbsolute: number): number {
  return Math.max(0.25, 1 + spread / (maxAbsolute || 1));
}
const key = (slot: Slot) => JSON.stringify(SLOT_ORDER.map(c => slot[c] || ""));

function pick(weights: [string, number][], random: () => number): string {
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let r = random() * total;
  for (const [label, w] of weights) { r -= w; if (r < 0) return label; }
  return weights[weights.length - 1][0];
}

export function extractSlots(input: SlotInput): { slots: Slot[]; reference: number } {
  const random = input.random || Math.random;
  const theme = [...new Set(input.theme)];
  const reference = input.images.filter(image => theme.every(t => image.tags.has(t)));
  // Categories the theme already covers: the theme is the slot's tag there.
  const covered = new Set<Category>();
  for (const image of reference) for (const t of theme) { const c = image.tags.get(t); if (c) covered.add(c); }
  const used = new Map<string, number>(), combinations = new Set<string>();
  const remember = (slot: Slot) => {
    combinations.add(key(slot));
    for (const c of SLOT_ORDER) if (slot[c]) used.set(c + ":" + slot[c], (used.get(c + ":" + slot[c]) || 0) + 1);
  };
  for (const slot of input.existing || []) remember(slot);
  const slots: Slot[] = [];
  for (let n = 0; n < Math.min(input.count, MAX_SLOTS); n++) {
    let slot: Slot = {};
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      slot = {};
      let current = reference;
      for (const category of SLOT_ORDER) {
        if (covered.has(category)) continue;
        const counts = new Map<string, number>();
        for (const image of current) for (const [label, c] of image.tags)
          if (c === category && !theme.includes(label)) counts.set(label, (counts.get(label) || 0) + 1);
        if (!counts.size) continue;
        const maxAbsolute = Math.max(...[...counts.keys()].map(l => Math.abs(input.spread.get(l) || 0)));
        const weights = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]): [string, number] =>
          [label, Math.sqrt(count) * spreadFactor(input.spread.get(label) || 0, maxAbsolute) / 3 ** (used.get(category + ":" + label) || 0)]);
        const chosen = pick(weights, random);
        slot[category] = chosen;
        const narrowed = current.filter(image => image.tags.has(chosen));
        if (narrowed.length >= MIN_SUPPORT) current = narrowed;
      }
      if (!combinations.has(key(slot))) break;
    }
    remember(slot);
    slots.push(slot);
  }
  return { slots, reference: reference.length };
}
