/** Tag categories (docs/categorie-tag.v1.1.0.md). v1.0.0, 2026-11-10T16:16:00Z.
 * One category per tag, fixed list: the extraction for SLOP generation depends on it. Time holds only decades
 * (`1970s`) and a decade is always Time; an image has at most one Time tag and one Format tag. */
export const CATEGORIES = ["time", "format", "place", "setting", "event", "people", "object", "other"] as const;
export type Category = typeof CATEGORIES[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  time: "Tempo", format: "Formato", place: "Luogo", setting: "Ambiente", event: "Evento", people: "Persone",
  object: "Oggetti e strutture", other: "Altro",
};
/** Categories with at most one tag per image. */
export const SINGLE: readonly Category[] = ["time", "format"];
const DECADE = /^[0-9]{3}0s$/;

export const isCategory = (value: unknown): value is Category => typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
export const isDecade = (label: string) => DECADE.test(label);

/** Error for a label in a category, or "" when it fits: a decade is Time, and Time holds only decades. */
export function categoryError(label: string, category: Category): string {
  if (isDecade(label) && category !== "time") return "«" + label + "» è un decennio: va nella categoria Tempo";
  if (category === "time" && !isDecade(label)) return "Tempo accetta solo decenni nel formato «1970s»";
  return "";
}
/** Error when an image would hold more than one Time or one Format tag, or "". */
export function limitError(categories: Iterable<Category>): string {
  const seen = new Map<Category, number>();
  for (const c of categories) seen.set(c, (seen.get(c) || 0) + 1);
  for (const c of SINGLE) if ((seen.get(c) || 0) > 1) return "Al massimo un tag di " + CATEGORY_LABELS[c] + " per immagine";
  return "";
}
