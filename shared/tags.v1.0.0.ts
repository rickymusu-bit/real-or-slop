/** Per-photo tags (docs/lotti-editoriali.v1.4.2.md, section 4). v1.0.0, 2026-11-09T05:00:00Z.
 * Lowercase, no spaces, hyphen between words, at most 40 characters. English for common terms,
 * proper nouns in any language: language cannot be checked here, only the format.
 * `untagged` is a system placeholder, never stored; origin-revealing words are refused. */
export const TAG_MAX = 40;
export const UNTAGGED = "untagged";
const PART = "[\\p{Ll}\\p{Lo}\\p{Lm}\\p{Nd}][\\p{Ll}\\p{Lo}\\p{Lm}\\p{M}\\p{Nd}]*";
const TAG_PATTERN = new RegExp("^" + PART + "(?:-" + PART + ")*$", "u");
/** Whole tags that would reveal whether a photo is REAL or SLOP. */
const ORIGIN_TAGS = new Set(["real", "reale", "fake", "falso", "falsa", "ai", "ia", "ai-generated", "ai-image", "ai-art", "generated",
  "generata", "generato", "synthetic", "sintetica", "sintetico", "artificial", "artificial-intelligence", "intelligenza-artificiale",
  "authentic", "autentica", "autentico", "genuine", "deepfake", "slop", "not-real", "real-photo", "real-photograph", "photo-real"]);
/** Words that name image generators or the game's labels: refused anywhere inside a tag. */
const ORIGIN_PARTS = new Set(["slop", "gpt", "chatgpt", "openai", "dall-e", "dalle", "midjourney", "stable-diffusion", "deepfake",
  "gpt-image", "imagen", "firefly", "sdxl"]);
export type TagCheck = { ok: true; tag: string } | { ok: false; reason: string; suggestion: string };
/** Best-effort conforming form of free text: "Burning car" -> "burning-car". It is only a proposal. */
export function suggestTag(input: string): string {
  return input.normalize("NFKC").toLocaleLowerCase("und").trim()
    .replace(/[^\p{L}\p{M}\p{Nd}]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, TAG_MAX).replace(/-$/, "");
}
export function checkTag(input: unknown): TagCheck {
  const raw = typeof input === "string" ? input.normalize("NFKC") : "";
  const suggestion = suggestTag(raw);
  const fail = (reason: string): TagCheck => ({ ok: false, reason, suggestion: suggestion === raw ? "" : suggestion });
  if (!raw) return fail("Tag vuoto");
  if (raw.length > TAG_MAX) return fail("Tag oltre " + TAG_MAX + " caratteri");
  if (!TAG_PATTERN.test(raw)) return fail("Solo minuscole, cifre e trattini tra le parole, senza spazi");
  if (raw === UNTAGGED) return fail("«untagged» è il segnaposto di sistema");
  const lower = raw.toLocaleLowerCase("und");
  if (ORIGIN_TAGS.has(lower) || [...ORIGIN_PARTS].some(part => ("-" + lower + "-").includes("-" + part + "-")))
    return { ok: false, reason: "Il tag rivelerebbe l'origine REAL/SLOP della foto", suggestion: "" };
  return { ok: true, tag: raw };
}
export function requireTag(input: unknown): string {
  const result = checkTag(input);
  if (!result.ok) throw new Error(result.reason + (result.suggestion ? ": prova «" + result.suggestion + "»" : ""));
  return result.tag;
}
