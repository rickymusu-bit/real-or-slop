/** Per-gallery closed categories for balancing: fixed scales, owner-approved gallery lists, mapping and model schemas. */
import { PARAMETER_KEYS, SCENE_SCHEMA, normalizeCategory, objectSchema, type Parameter, type Profile } from "./pipeline";

export type TaxonomyKey = "genre" | Exclude<Parameter, "aspect_ratio">;
/** aspect_ratio is computed from pixel dimensions by the server and never classified by a model. */
export const TAXONOMY_KEYS = ["genre", ...PARAMETER_KEYS.filter(key => key !== "aspect_ratio")] as TaxonomyKey[];
const SEVERITY = ["none", "light", "moderate", "heavy"];
/** Scales shared by every gallery: only their aliases are editable. */
export const FIXED: Partial<Record<TaxonomyKey, { name: string; definition: string }[]>> = {
  ...Object.fromEntries((["wear", "damage", "ageing", "cleanliness"] as const).map(key => [key, SEVERITY.map(name => ({ name,
    definition: name === "none" ? `No visible ${key === "cleanliness" ? "dirt" : key}.` : `${name[0].toUpperCase() + name.slice(1)} visible ${key === "cleanliness" ? "dirt" : key}.` }))])),
  operating_state: [{ name: "on", definition: "Switched on: screen or lights active." }, { name: "off", definition: "Switched off or inactive." },
    { name: "not_applicable", definition: "The subject has no operating state." }],
};
export const MAX_CATEGORIES = 30;
/** Profiles per text-only classification call. */
export const CLASSIFY_BATCH = 30;
/** Categories always accepted besides the list: `unknown` for absent evidence, `other` for values outside the gallery list. */
export const reservedOf = (key: TaxonomyKey) => FIXED[key] ? ["unknown"] : key === "screen_content" ? ["other", "unknown", "not_applicable"] : ["other", "unknown"];
export interface TaxonomyCategory { name: string; definition: string; aliases: string[] }
export type TaxonomyKeys = Record<TaxonomyKey, TaxonomyCategory[]>;
export interface Consistency { at: string; version: number; items: number; agreement: Partial<Record<TaxonomyKey, number>> }
export interface Taxonomy { version: number; approved_at: string; keys: TaxonomyKeys; consistency?: Consistency }
export interface TaxonomyDraft { proposed_at: string; model: string | null; notes: string; keys: TaxonomyKeys }

/** Validates and canonicalises a list. Owner lists are strict (readable errors); model drafts are lenient:
 * duplicates are merged and conflicting aliases dropped, so a paid proposal is never wasted on a formality. */
export function cleanTaxonomy(value: unknown, lenient = false): TaxonomyKeys {
  if (!value || typeof value !== "object") throw Error("Category lists are missing");
  const input = value as Record<string, unknown>, out = {} as TaxonomyKeys;
  for (const key of TAXONOMY_KEYS) {
    const rows = Array.isArray(input[key]) ? input[key] as unknown[] : [];
    const reserved = reservedOf(key), seen = new Set<string>(reserved), categories: TaxonomyCategory[] = [];
    const parsed = rows.map(row => {
      const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const aliases = (Array.isArray(r.aliases) ? r.aliases : Array.isArray(r.includes) ? r.includes : []).filter((x): x is string => typeof x === "string");
      return { name: typeof r.name === "string" ? normalizeCategory(r.name) : "", definition: typeof r.definition === "string" ? r.definition.trim().slice(0, 500) : "", aliases };
    });
    const fixed = FIXED[key];
    const wanted = fixed ? fixed.map(f => ({ ...f, aliases: parsed.filter(p => p.name === f.name).flatMap(p => p.aliases),
      definition: parsed.find(p => p.name === f.name)?.definition || f.definition })) : parsed;
    for (const row of wanted) {
      if (!row.name || row.name === "unspecified") continue;
      if (seen.has(row.name)) { if (reserved.includes(row.name) || lenient) continue; throw Error(`${key}: “${row.name}” appears twice`); }
      seen.add(row.name); categories.push({ name: row.name, definition: row.definition, aliases: [] });
    }
    if (categories.length > MAX_CATEGORIES) throw Error(`${key}: at most ${MAX_CATEGORIES} categories`);
    let aliases = 0;
    for (const row of wanted) {
      const target = categories.find(c => c.name === row.name);
      if (!target) continue;
      for (const alias of row.aliases.map(normalizeCategory)) {
        if (alias === target.name || target.aliases.includes(alias) || alias === "unspecified") continue;
        if (seen.has(alias)) { if (lenient) continue; throw Error(`${key}: “${alias}” is already a category or an alias`); }
        if (++aliases > 2000) throw Error(`${key}: too many aliases`);
        seen.add(alias); target.aliases.push(alias);
      }
    }
    out[key] = categories;
  }
  return out;
}
export const allowedOf = (keys: TaxonomyKeys, key: TaxonomyKey) => [...keys[key].map(c => c.name), ...reservedOf(key)];
/** The gallery category for a stored value, or null when it needs a new classification. */
export function mapCategory(keys: TaxonomyKeys, key: TaxonomyKey, category: string, suggestion = ""): string | null {
  const allowed = allowedOf(keys, key), resolve = (value: string) => {
    const c = normalizeCategory(value);
    return allowed.includes(c) ? c : keys[key].find(x => x.aliases.includes(c))?.name ?? null;
  };
  if (normalizeCategory(category) === "other" && suggestion.trim()) {
    const suggested = resolve(suggestion);
    if (suggested && suggested !== "other") return suggested;
  }
  return resolve(category);
}
interface Classified { category: string; suggestion?: string; certainty?: string }
const fieldOf = (profile: Profile, key: TaxonomyKey): Classified => key === "genre"
  ? { category: profile.genre, suggestion: profile.genre_suggestion } : profile.parameters[key];
/** Keys whose stored category is outside the approved list (legacy data, moved photos, removed categories). */
export const pendingKeys = (profile: Profile, keys: TaxonomyKeys) => TAXONOMY_KEYS.filter(key => {
  const field = fieldOf(profile, key);
  return field.certainty !== "unknown" && mapCategory(keys, key, field.category, field.suggestion) === null;
});
/** Maps every category that the list can resolve; unresolvable ones are left untouched for classification. */
export function applyTaxonomy(profile: Profile, keys: TaxonomyKeys): Profile {
  const out: Profile = { ...profile, parameters: { ...profile.parameters } };
  for (const key of TAXONOMY_KEYS) {
    const field = fieldOf(profile, key);
    const mapped = field.certainty === "unknown" ? "unknown" : mapCategory(keys, key, field.category, field.suggestion);
    if (mapped === null) continue;
    const keepSuggestion = mapped === "other" ? field.suggestion ?? "" : "";
    if (key === "genre") { out.genre = mapped; out.genre_suggestion = keepSuggestion; }
    else out.parameters[key] = { ...profile.parameters[key], category: mapped, suggestion: keepSuggestion };
  }
  return out;
}
/** Category used in statistics: approved name, `unknown`, or `pending` while awaiting classification. */
export function statCategory(profile: Profile, key: TaxonomyKey | "aspect_ratio", keys: TaxonomyKeys | null) {
  if (key === "aspect_ratio") return profile.parameters.aspect_ratio.category;
  const field = fieldOf(profile, key);
  if (field.certainty === "unknown") return "unknown";
  if (!keys) return normalizeCategory(field.category);
  return mapCategory(keys, key, field.category, field.suggestion) ?? "pending";
}

const string = { type: "string" };
const certainty = { type: "string", enum: ["observed", "inferred", "unknown"] };
const categoryOf = (keys: TaxonomyKeys | null, key: TaxonomyKey | "aspect_ratio") => key !== "aspect_ratio" && keys ? { type: "string", enum: allowedOf(keys, key) } : string;
/** Profile contract; with an approved list every category is a closed value and `other` carries a suggested name. */
export function profileSchema(keys: TaxonomyKeys | null) {
  return objectSchema({ genre: categoryOf(keys, "genre"), genre_suggestion: string, genre_evidence: string,
    parameters: objectSchema(Object.fromEntries(PARAMETER_KEYS.map(key => [key, objectSchema({ value: string, category: categoryOf(keys, key), certainty, suggestion: string })]))),
    peculiarities: { type: "array", items: objectSchema({ description: string, region: string, parameter: { type: "string", enum: PARAMETER_KEYS },
      role: { type: "string", enum: ["identity", "specimen", "temporary"] }, policy: { type: "string", enum: ["preserve", "vary", "draw"] }, certainty }) } });
}
export function proposalSchema(keys: TaxonomyKeys | null) {
  return objectSchema({ profile: profileSchema(keys), scene: SCENE_SCHEMA, changes: string, dependencies: string, genre: categoryOf(keys, "genre"), aspect_ratio: string });
}
export const TAXONOMY_SCHEMA = objectSchema({ notes: string, keys: objectSchema(Object.fromEntries(TAXONOMY_KEYS.map(key => [key,
  { type: "array", items: objectSchema({ name: string, definition: string, includes: { type: "array", items: string } }) }]))) });
export function classificationSchema(keys: TaxonomyKeys, ids: string[]) {
  return objectSchema({ items: { type: "array", items: objectSchema({ id: { type: "string", enum: ids },
    ...Object.fromEntries(TAXONOMY_KEYS.map(key => [key, objectSchema({ category: categoryOf(keys, key), suggestion: string })])) }) } });
}
/** Instructions shared by annotation and classification, so REAL and SLOP use the same conventions. */
export function taxonomyRules(keys: TaxonomyKeys | null) {
  return keys ? " The gallery category lists are closed: choose for genre and each parameter the listed category whose definition fits the observed value; `unknown` only when evidence is absent. When no listed category fits, choose `other` and write a concise lowercase snake_case name in the matching suggestion field; otherwise leave suggestion empty. Never choose a category from the source title alone."
    : " Leave suggestion fields empty.";
}
