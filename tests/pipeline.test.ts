import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAMETER_KEYS, imageSize, variation, type Profile, type PipelineSettings } from "../shared/pipeline";
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
