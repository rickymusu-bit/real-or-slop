/** Tag pills and category picker shared by the wizard and the library (docs/categorie-tag.v1.1.0.md). v1.1.0, 2026-11-10T22:11:48Z:
 * validated colours (tag-categories.v1.1.0.css). v1.0.0, 2026-11-10T16:16:00Z. */
import "./tag-categories.v1.1.0.css";
import { escape } from "../shared/html";
import { CATEGORIES, CATEGORY_LABELS, isCategory, isDecade, type Category } from "../shared/tag-categories.v1.0.0";

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
/** Category the picker should show for what is typed: the vocabulary's, Time for a decade, otherwise unchanged. */
export const suggestedCategory = (label: string, vocabulary: Map<string, Category>): Category | "" =>
  vocabulary.get(label) || (isDecade(label) ? "time" : "");
/** Legend of the colours. */
export const legend = () => '<p class="tag-legend">' + CATEGORIES.map(c => pill(CATEGORY_LABELS[c], c, "tag-legend-item")).join("") + "</p>";
