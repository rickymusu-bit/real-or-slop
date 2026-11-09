/** Image tags (docs/libreria-immagini.v1.1.0.md, section 3). v2.0.0, 2026-11-09T16:30:00Z.
 * Lowercase ASCII letters and digits, single hyphens between words, at most 40 characters.
 * English for common nouns, proper nouns in the original language transliterated to ASCII:
 * no accents, diacritics or spaces. Words that would reveal REAL or SLOP are refused.
 * Replaces shared/tags.v1.0.0.ts, which allowed diacritics. */
export const TAG_MAX = 40;
export const UNTAGGED = "untagged";
const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ORIGIN_TAGS = new Set(["real", "reale", "fake", "falso", "falsa", "ai", "ia", "ai-generated", "ai-image", "ai-art", "generated",
  "generata", "generato", "synthetic", "sintetica", "sintetico", "artificial", "artificial-intelligence", "intelligenza-artificiale",
  "authentic", "autentica", "autentico", "genuine", "deepfake", "slop", "not-real", "real-photo", "real-photograph", "photo-real"]);
const ORIGIN_PARTS = ["slop", "gpt", "chatgpt", "openai", "dall-e", "dalle", "midjourney", "stable-diffusion", "deepfake",
  "gpt-image", "imagen", "firefly", "sdxl"];
export type TagCheck = { ok: true; tag: string } | { ok: false; reason: string; suggestion: string };

/** Conforming form of free text: "Place de la République" -> "place-de-la-republique". Only a proposal. */
export function suggestTag(input: string): string {
  return input.normalize("NFKD").replace(/\p{M}+/gu, "").replace(/ß/g, "ss").replace(/[æ]/g, "ae").replace(/[œ]/g, "oe")
    .replace(/[ø]/g, "o").replace(/[đð]/g, "d").replace(/[ł]/g, "l").replace(/[þ]/g, "th")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, TAG_MAX).replace(/-+$/, "");
}
export function checkTag(input: unknown): TagCheck {
  const raw = typeof input === "string" ? input.trim() : "";
  const suggestion = suggestTag(raw);
  const fail = (reason: string): TagCheck => ({ ok: false, reason, suggestion: suggestion === raw ? "" : suggestion });
  if (!raw) return fail("Tag vuoto");
  if (raw.length > TAG_MAX) return fail("Tag oltre " + TAG_MAX + " caratteri");
  if (!TAG_PATTERN.test(raw)) return fail("Solo lettere minuscole senza accenti, cifre e trattini tra le parole");
  if (raw === UNTAGGED) return fail("«untagged» è il segnaposto di sistema");
  if (ORIGIN_TAGS.has(raw) || ORIGIN_PARTS.some(part => ("-" + raw + "-").includes("-" + part + "-")))
    return { ok: false, reason: "Il tag rivelerebbe l'origine REAL/SLOP della foto", suggestion: "" };
  return { ok: true, tag: raw };
}
