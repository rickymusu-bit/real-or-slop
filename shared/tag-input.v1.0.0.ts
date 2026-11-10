/** Tags typed by the owner (docs/libreria-immagini.v1.5.0.md, section 3). v1.0.0, 2026-11-10T07:10:00Z.
 * Owner decision of 2026-11-10: a tag that breaks only the form (capitals, accents, spaces, punctuation) is converted
 * and saved, saying so, as model tags already are; a tag that would reveal the origin, or has no valid form, is refused.
 * The server keeps checking strictly (shared/tags.v2.0.0.ts). */
import { checkTag, suggestTag } from "./tags.v2.0.0";

export type TagInput = { ok: true; tag: string; converted: boolean } | { ok: false; reason: string };

export function tagFromInput(input: string): TagInput {
  const raw = input.trim();
  const direct = checkTag(raw);
  if (direct.ok) return { ok: true, tag: direct.tag, converted: false };
  const candidate = suggestTag(raw);
  const checked = candidate ? checkTag(candidate) : direct;
  if (checked.ok) return { ok: true, tag: checked.tag, converted: true };
  return { ok: false, reason: checked.reason };
}

/** Notice after saving: «Tag salvato» or «Tag salvato come «sao-paulo»». */
export const savedNotice = (result: { tag: string; converted: boolean }) =>
  result.converted ? "Tag salvato come «" + result.tag + "»." : "Tag salvato.";
