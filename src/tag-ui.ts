/** Tag pills, legend and category picker shared by the wizard and the dashboard (spec `libreria-immagini`, section 4). */
import "./tag-categories.css";
import { escape } from "../shared/html";
import { CATEGORIES, CATEGORY_LABELS, forcedCategory, isCategory, type Category } from "../shared/tag-categories";

/** Category of a tag on an image, «other» when unknown. */
export const categoryOf = (categories: Record<string, string> | undefined, label: string): Category => {
  const value = categories?.[label];
  return isCategory(value) ? value : "other";
};
/** Labels in category order, then alphabetical. */
export const sortByCategory = (labels: string[], categories: Record<string, string> | undefined) =>
  [...labels].sort((a, b) => CATEGORIES.indexOf(categoryOf(categories, a)) - CATEGORIES.indexOf(categoryOf(categories, b)) || a.localeCompare(b));
/** A pill: its colour says the category, the title names it. «extra» goes inside, after the label (a remove button). */
export const pill = (label: string, category: Category, className: string, extra = "") =>
  '<span class="' + className + ' tag-cat tag-cat-' + category + '" title="' + escape(CATEGORY_LABELS[category]) + '" data-category="' + category + '">' +
  escape(label) + extra + "</span>";
/** Category picker: required for a new tag, set by itself for an existing one or a decade. */
export const categorySelect = (attributes: string, selected = "") =>
  "<select " + attributes + ' aria-label="Categoria del tag"><option value="">Categoria…</option>' +
  CATEGORIES.map(c => '<option value="' + c + '"' + (c === selected ? " selected" : "") + ">" + escape(CATEGORY_LABELS[c]) + "</option>").join("") + "</select>";
/** Category the picker should show for what is typed: the vocabulary's, the forced one (decade, closed lists), otherwise unchanged. */
export const suggestedCategory = (label: string, vocabulary: Map<string, Category>): Category | "" =>
  vocabulary.get(label) || forcedCategory(label) || "";
/** Legend of the colours. */
export const legend = () => '<p class="tag-legend">' + CATEGORIES.map(c => pill(CATEGORY_LABELS[c], c, "tag-legend-item")).join("") + "</p>";

/** Independent SLOP catalogue and anonymous editorial inputs. */
export interface StartSlot {
  index?: number; theme?: string[];
  tags?: { label: string; category: string }[] | Record<string, string>;
}
/** The starting tags of a slot with their category and, for the old slots, the old theme note. */
export function startTagList(slot: StartSlot | null | undefined): { label: string; category: Category; note: string }[] {
  if (!slot) return [];
  if (Array.isArray(slot.tags)) return sortByCategory(slot.tags.map(t => t.label), Object.fromEntries(slot.tags.map(t => [t.label, t.category])))
    .map(label => ({ label, category: categoryOf(Object.fromEntries((slot.tags as { label: string; category: string }[]).map(t => [t.label, t.category])), label), note: "" }));
  const theme = Array.isArray(slot.theme) ? slot.theme.filter(t => typeof t === "string") : [];
  const old = slot.tags && typeof slot.tags === "object" ? slot.tags as Record<string, string> : {};
  return [...theme.map(label => ({ label, category: "other" as Category, note: "tema" })),
    ...Object.entries(old).filter(([c, label]) => isCategory(c) && typeof label === "string" && !theme.includes(label)).map(([c, label]) => ({ label, category: c as Category, note: "" }))];
}
export const startPills = (slot: StartSlot | null | undefined) =>
  startTagList(slot).map(t => pill(t.label, t.category, "rw-pill", t.note ? " <small>" + t.note + "</small>" : "")).join("");

