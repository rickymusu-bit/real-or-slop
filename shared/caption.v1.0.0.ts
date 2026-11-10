/** Caption length (docs/libreria-immagini.v1.5.0.md, section 4). v1.0.0, 2026-11-10T06:23:49Z.
 * Owner decision of 2026-11-10: 160 characters is a soft limit, a warning and never a cut; 256 is the technical ceiling
 * of the database. Only a text over the ceiling is shortened, at the end of a sentence or of a word, never mid-word. */
export const CAPTION_SOFT = 160;
export const CAPTION_MAX = 256;

/** One line of text: runs of whitespace, line breaks included, become single spaces. */
export const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** Fits a model caption under the ceiling. A sentence end is preferred when it keeps at least half of the text. */
export function fitCaption(input: string): { caption: string; shortened: boolean } {
  const text = oneLine(input);
  if (text.length <= CAPTION_MAX) return { caption: text, shortened: false };
  const head = text.slice(0, CAPTION_MAX);
  const sentence = Math.max(...[".", "!", "?"].map(mark => head.lastIndexOf(mark + " ")), head.endsWith(".") ? head.length - 1 : -1);
  if (sentence + 1 >= CAPTION_MAX / 2) return { caption: head.slice(0, sentence + 1), shortened: true };
  const words = text.slice(0, CAPTION_MAX).lastIndexOf(" ");
  const cut = words > 0 ? text.slice(0, words).replace(/[\s,;:–-]+$/, "") : text.slice(0, CAPTION_MAX - 1);
  return { caption: cut + "…", shortened: true };
}

/** Text for the editors: «142/160», with the warning once over the soft limit. */
export function captionCount(text: string): { label: string; over: boolean } {
  const length = text.length;
  return { label: length + "/" + CAPTION_SOFT + (length > CAPTION_SOFT ? ", oltre il limite consigliato" : ""), over: length > CAPTION_SOFT };
}
