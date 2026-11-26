import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAMETER_KEYS, imageSize, normalizeCategory, normalizeProfile, variation, vocabulary, type Profile, type PipelineSettings } from "../shared/pipeline";
const profile = (damage: string): Profile => ({ genre: "snapshot", peculiarities: [], parameters: Object.fromEntries(PARAMETER_KEYS.map(k => [k,
  { value: k === "damage" ? damage : "ordinary", category: k === "damage" ? damage : "ordinary", certainty: "observed" }])) as Profile["parameters"] });
const settings: PipelineSettings = { rules: "", environment: "keep", novelty: 0, probabilities: Object.fromEntries(PARAMETER_KEYS.map(k => [k, 0])) };
test("no control is forced, including when the source has a conspicuous condition", () => {
  assert.deepEqual(variation(profile("heavy"), [profile("none")], settings).selected, []);
});
test("rare damage retains its empirical frequency before any SLOP exists; selection does not mean intensification", () => {
  let seed = 19; const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const real = [...Array.from({ length: 9 }, () => profile("none")), profile("heavy")];
  let damaged = 0;
  for (let i = 0; i < 12000; i++) if (variation(real[9], real, { ...settings, probabilities: { ...settings.probabilities, damage: 1 } }, random).targets.damage?.category === "heavy") damaged++;
  assert.ok(damaged > 1000 && damaged < 1400, String(damaged));
});
test("unknown damage never acts as evidence of absence or becomes a sampled target", () => {
  const unknown = profile("heavy"); unknown.parameters.damage.certainty = "unknown";
  assert.equal(variation(unknown, [unknown], { ...settings, probabilities: { damage: 1 } }).targets.damage, undefined);
});
test("image dimensions follow the whole-photo orientation and reject invalid ratios", () => {
  assert.equal(imageSize("3:2"), "1536x1024"); assert.equal(imageSize("2:3"), "1024x1536");
  assert.equal(imageSize("1:1"), "1536x1536"); assert.throws(() => imageSize("0:1")); assert.throws(() => imageSize("50:1"));
});
test("categories differing only in case, spacing, accents or separators share one canonical key", () => {
  for (const value of ["object documentation", "object_documentation", "Object-Documentation", "  OBJECT  documentation ", "object__documentation"])
    assert.equal(normalizeCategory(value), "object_documentation");
  assert.equal(normalizeCategory("Café crème"), "cafe_creme");
  assert.equal(normalizeCategory("nintendo_game_boy_dmg_01"), "nintendo_game_boy_dmg_01");
  assert.equal(normalizeCategory(" - "), "unspecified");
  // Distinct meanings are not merged by spelling rules: that is the owner's or the vocabulary's job.
  assert.notEqual(normalizeCategory("catalog product photograph"), normalizeCategory("catalog product photography"));
});
test("profile normalization touches only genre and categories", () => {
  const raw = profile("Heavy Damage"); raw.genre = "Object documentation"; raw.parameters.damage.value = "Deep Scratch";
  const clean = normalizeProfile(raw);
  assert.equal(clean.genre, "object_documentation"); assert.equal(clean.parameters.damage.category, "heavy_damage");
  assert.equal(clean.parameters.damage.value, "Deep Scratch"); assert.equal(raw.genre, "Object documentation");
});
test("the gallery vocabulary counts canonical forms together, most frequent first, without unknown evidence", () => {
  const a = profile("none"), b = profile("none"), c = profile("light");
  a.genre = "object documentation"; b.genre = "object_documentation"; c.genre = "Product photograph";
  c.parameters.damage.certainty = "unknown";
  const known = vocabulary([a, b, c]);
  assert.deepEqual(known.genre, ["object_documentation", "product_photograph"]);
  assert.deepEqual(known.damage, ["none"]);
});
test("spelling variants of one category are a single donor category when sampling", () => {
  const spaced = profile("light wear"), underscored = profile("light_wear"), other = profile("none");
  const sampled = new Set<string>();
  let seed = 7; const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 200; i++) {
    const target = variation(other, [spaced, underscored, other], { ...settings, probabilities: { damage: 1 } }, random).targets.damage;
    if (target) sampled.add(target.category);
  }
  assert.deepEqual([...sampled].sort(), ["light_wear", "none"]);
});
