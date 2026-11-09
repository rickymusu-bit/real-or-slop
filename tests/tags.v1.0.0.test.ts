// v1.0.0 (2026-11-09T05:00:00Z): tag format of docs/lotti-editoriali.v1.4.2.md, section 4.1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTag, suggestTag, UNTAGGED } from "../shared/tags.v1.0.0.ts";

test("conforming tags: lowercase, no spaces, hyphens between words, Unicode letters", () => {
  for (const tag of ["firefighter", "burning-car", "computer", "close-up", "paris", "place-de-la-république", "notre-dame", "1968", "東京", "москва"])
    assert.deepEqual(checkTag(tag), { ok: true, tag }, tag);
});
test("non-conforming tags are refused with a suggested form", () => {
  const cases: Array<[string, string]> = [["Burning car", "burning-car"], ["burning car", "burning-car"], ["burning_car", "burning-car"],
    ["-car", "car"], ["car-", "car"], ["burning--car", "burning-car"], ["Paris", "paris"], ["  close up ", "close-up"]];
  for (const [input, suggestion] of cases) {
    const result = checkTag(input);
    assert.equal(result.ok, false, input);
    if (!result.ok) assert.equal(result.suggestion, suggestion, input);
  }
  assert.equal(checkTag("").ok, false);
  assert.equal(checkTag("x".repeat(41)).ok, false);
  assert.equal(checkTag(42).ok, false);
});
test("the placeholder and origin-revealing words are never real tags", () => {
  for (const tag of [UNTAGGED, "real", "fake", "ai", "ai-generated", "synthetic", "slop", "deepfake", "midjourney-style", "made-with-gpt", "openai"])
    assert.equal(checkTag(tag).ok, false, tag);
  for (const tag of ["real-madrid", "air", "aid", "gpt-free-zone-sign"]) assert.equal(checkTag(tag).ok, tag !== "gpt-free-zone-sign", tag);
});
test("suggestions never exceed the limit or end with a hyphen", () => {
  const long = suggestTag("a very long description of a burning car in the middle of a street");
  assert.ok(long.length <= 40 && !long.endsWith("-"), long);
});
