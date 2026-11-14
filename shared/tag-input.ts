/** Tags typed by the owner (spec `libreria-immagini`, section 4): a tag that breaks only the form (capitals, accents,
 * spaces, punctuation) is converted silently; one that reveals the origin or has no valid form is refused with the reason. */
import { checkTag, suggestTag } from "./tags";

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
