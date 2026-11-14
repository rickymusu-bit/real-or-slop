/** Tag categories (spec `libreria-immagini`, section 4): the fixed list, labels, the decade rule of Time, the closed lists of
 * Color and Medium and the limit of one Time, Genre, Color and Medium tag per image. */
export const CATEGORIES = ["time", "genre", "color", "medium", "place", "setting", "event", "people", "object", "other"] as const;
export type Category = typeof CATEGORIES[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  time: "Tempo", genre: "Genere", color: "Colore", medium: "Supporto", place: "Luogo", setting: "Ambiente", event: "Evento",
  people: "Persone", object: "Oggetti e strutture", other: "Altro",
};
/** Categories with at most one tag per image. */
export const SINGLE: readonly Category[] = ["time", "genre", "color", "medium"];
/** Categories judged only from the pixels of the image (spec `libreria-immagini`, section 5). */
export const VISUAL: readonly Category[] = ["genre", "color", "medium"];
/** Closed lists of Color and Medium. */
export const COLORS = ["color", "black-and-white", "sepia", "hand-colored"] as const;
export const MEDIA = ["photo-print", "newspaper-print", "magazine-print", "postcard", "slide", "film-still", "instant-photo",
  "digital-photo", "phone-photo", "screen-capture", "poster", "painting", "drawing", "illustration"] as const;
const DECADE = /^[0-9]{3}0s$/;
const CLOSED: Partial<Record<Category, readonly string[]>> = { color: COLORS, medium: MEDIA };

export const isCategory = (value: unknown): value is Category => typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
export const isDecade = (label: string) => DECADE.test(label);

/** The category a label must have whatever is asked, or null: decades are Time, the closed lists are Color and Medium. */
export function forcedCategory(label: string): Category | null {
  if (isDecade(label)) return "time";
  for (const [category, list] of Object.entries(CLOSED) as [Category, readonly string[]][]) if (list.includes(label)) return category;
  return null;
}

/** Error for a label in a category, or "" when it fits. */
export function categoryError(label: string, category: Category): string {
  if (isDecade(label) && category !== "time") return "«" + label + "» è un decennio: va nella categoria Tempo";
  if (category === "time" && !isDecade(label)) return "Tempo accetta solo decenni nel formato «1970s»";
  const closed = CLOSED[category];
  if (closed && !closed.includes(label)) return CATEGORY_LABELS[category] + " accetta solo: " + closed.join(", ");
  const forced = forcedCategory(label);
  if (forced && forced !== category) return "«" + label + "» appartiene alla categoria " + CATEGORY_LABELS[forced];
  return "";
}
/** Error when an image would hold more than one tag of a single-tag category, or "". */
export function limitError(categories: Iterable<Category>): string {
  const seen = new Map<Category, number>();
  for (const c of categories) seen.set(c, (seen.get(c) || 0) + 1);
  for (const c of SINGLE) if ((seen.get(c) || 0) > 1) return "Al massimo un tag di " + CATEGORY_LABELS[c] + " per immagine";
  return "";
}
