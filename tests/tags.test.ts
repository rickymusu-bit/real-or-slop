/** ASCII tags (shared/tags.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTag, suggestTag } from "../shared/tags.ts";

test("valid tags: lowercase ASCII words joined by single hyphens", () => {
  for (const tag of ["riot", "police-car", "place-de-la-republique", "sao-paulo", "1968", "rue-de-rivoli-2"])
    assert.deepEqual(checkTag(tag), { ok: true, tag });
});
test("accents, diacritics, spaces and uppercase are refused with an ASCII suggestion", () => {
  const cases: Record<string, string> = { "place-de-la-république": "place-de-la-republique", "München": "munchen",
    "São Paulo": "sao-paulo", "Burning car": "burning-car", "Straße": "strasse", "Łódź": "lodz", "Æon": "aeon", "--riot--": "riot" };
  for (const [input, suggestion] of Object.entries(cases)) {
    const result = checkTag(input);
    assert.equal(result.ok, false, input);
    if (!result.ok) assert.equal(result.suggestion, suggestion, input);
    assert.equal(suggestTag(input), suggestion);
  }
});
test("origin-revealing tags and the placeholder are refused", () => {
  for (const tag of ["real", "ai", "ai-generated", "made-with-midjourney", "slop", "untagged", "deepfake"])
    assert.equal(checkTag(tag).ok, false, tag);
  assert.equal(checkTag("x".repeat(41)).ok, false);
  assert.equal(checkTag(42).ok, false);
});
