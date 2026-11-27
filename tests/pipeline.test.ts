import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAMETER_KEYS, imageSize, normalizeCategory, normalizeProfile, projectedProfile, variation, vocabulary, type Profile, type PipelineSettings } from "../shared/pipeline";
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
test("the dictionary sends every existing keyword of an ordinary gallery, not only the most frequent", () => {
  const many = Array.from({ length: 60 }, (_, i) => { const p = profile("none"); p.parameters.model.category = `model_${i}`; return p; });
  assert.equal(vocabulary(many).model?.length, 60);
});

const enable = (...keys: typeof PARAMETER_KEYS[number][]): PipelineSettings => ({ ...settings,
  probabilities: { ...settings.probabilities, ...Object.fromEntries(keys.map(k => [k, 1])) } });
const attribute = (value: string) => ({ value, category: value, certainty: "observed" as const });
const randomFrom = (start: number) => { let seed = start; return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296); };

test("product and camera controls preserve observed combinations without modifying unselected controls", () => {
  const a = profile("none"), b = profile("none");
  a.parameters.colour = attribute("red"); a.parameters.edition_decoration = attribute("special");
  b.parameters.colour = attribute("grey"); b.parameters.edition_decoration = attribute("standard");
  a.parameters.pose = attribute("standing"); a.parameters.viewpoint = attribute("front"); a.parameters.aspect_ratio = attribute("portrait");
  b.parameters.pose = attribute("lying"); b.parameters.viewpoint = attribute("above"); b.parameters.aspect_ratio = attribute("landscape");
  const random = randomFrom(91), seen = new Set<string>();
  for (let n = 0; n < 300; n++) {
    const draw = variation(a, [a, b], enable("colour", "edition_decoration", "pose", "viewpoint", "aspect_ratio"), random);
    const pair = [draw.targets.colour!.category, draw.targets.edition_decoration!.category].join("/"); seen.add(pair);
    assert.ok(["red/special", "grey/standard"].includes(pair));
    assert.ok(["standing/front/portrait", "lying/above/landscape"].includes([draw.targets.pose!.category, draw.targets.viewpoint!.category, draw.targets.aspect_ratio!.category].join("/")));
    assert.equal(draw.targets.model, undefined); assert.equal(draw.targets.composition, undefined);
  }
  assert.equal(seen.size, 2);
  // With edition fixed, red is the only observed compatible colour.
  assert.equal(variation(a, [a, b], enable("colour"), () => .99).targets.colour!.category, "red");
});
test("screen pairs belong to the resulting model and content alone cannot reveal an inactive screen", () => {
  const off = profile("none"), on = profile("none"), foreign = profile("none");
  off.parameters.operating_state = attribute("off"); off.parameters.screen_content = attribute("not_applicable");
  on.parameters.operating_state = attribute("on"); on.parameters.screen_content = attribute("menu");
  foreign.parameters.model = attribute("different_model"); foreign.parameters.operating_state = attribute("on"); foreign.parameters.screen_content = attribute("foreign_game");
  const random = randomFrom(23);
  for (let n = 0; n < 200; n++) {
    const draw = variation(off, [off, on, foreign], enable("operating_state", "screen_content"), random);
    assert.ok(["off/not_applicable", "on/menu"].includes([draw.targets.operating_state!.category, draw.targets.screen_content!.category].join("/")));
  }
  assert.equal(variation(off, [off, on], enable("screen_content"), () => .9).targets.screen_content!.category, "not_applicable");
  assert.deepEqual(variation(off, [foreign], enable("operating_state", "screen_content"), () => .1).selected, []);
});
test("unknown fields and incompatible genres cannot become joint targets; no forced fallback", () => {
  const source = profile("none"), unknown = profile("none"), other = profile("none");
  unknown.parameters.colour.certainty = "unknown";
  assert.deepEqual(variation(source, [unknown], enable("model", "colour"), () => .1).targets.colour, undefined);
  other.genre = "studio";
  assert.equal(variation(source, [other], enable("viewpoint"), () => .1).targets.viewpoint, undefined);
  assert.ok(variation(source, [other], { ...enable("viewpoint"), environment: "change_genre" }, () => .1).targets.viewpoint);
  source.parameters.damage.category = "unknown";
  assert.equal(variation(source, [source], enable("damage"), () => .1).targets.damage, undefined);
});
test("a group's provisional choices correct later draws and never mutate sources or accepted counts", () => {
  const a = profile("none"), b = profile("heavy"), accepted: Profile[] = [], balancing = [...accepted];
  const before = JSON.stringify([a, b]), draws: string[] = [];
  for (let n = 0; n < 20; n++) {
    const draw = variation(a, [a, b], enable("damage"), () => .5, balancing);
    draws.push(draw.targets.damage!.category); balancing.push(projectedProfile(a, draw));
  }
  // With the same random numbers and frozen counts every draw would be heavy.
  assert.equal(draws.filter(x => x === "heavy").length, 10);
  assert.equal(draws.filter(x => x === "none").length, 10);
  assert.equal(accepted.length, 0); assert.equal(JSON.stringify([a, b]), before);
  assert.equal(balancing[0].parameters.model.category, a.parameters.model.category);
});

const auto: PipelineSettings = { ...settings, environment: "auto" };
test("automatic genre selection corrects observed surplus and projects the chosen genre into the group", () => {
  const a = profile("none"), b = profile("heavy"); b.genre = "studio";
  const draw = variation(a, [a, b], auto, () => .2, Array(8).fill(a));
  assert.equal(draw.environment, "change_genre"); assert.equal(draw.genre, "studio");
  assert.equal(projectedProfile(a, draw).genre, "studio");
  assert.equal(draw.targets.damage, undefined); // A context transition never changes hardware or condition implicitly.
  assert.match(draw.balance!, /distribution gap/);
});
test("automatic context changes use a joint observed donor in the same genre", () => {
  const a = profile("none"), b = profile("none");
  for (const key of ["pose", "viewpoint", "composition", "aspect_ratio"] as const) b.parameters[key] = { value: "different " + key, category: "different", certainty: "observed" };
  const draw = variation(a, [a, b], auto, () => .1, Array(8).fill(a));
  assert.equal(draw.environment, "same_genre"); assert.equal(draw.genre, a.genre);
  for (const key of ["pose", "viewpoint", "composition", "aspect_ratio"] as const) assert.deepEqual(draw.targets[key], b.parameters[key]);
  assert.equal(draw.targets.model, undefined);
});
test("balanced or missing observations do not force environment/genre changes; unknown context is not evidence", () => {
  const a = profile("none"), b = profile("none"); b.genre = "studio";
  for (const observed of [[], [a, b]]) assert.equal(variation(a, [a, b], auto, () => .2, observed).environment, "keep");
  const unknown = profile("none"); unknown.parameters.composition.certainty = "unknown";
  assert.equal(variation(a, [a, unknown], auto, () => .2, Array(8).fill(a)).environment, "keep");
});
test("automatic group transitions use previous provisional genres rather than repeatedly filling the same deficit", () => {
  const a = profile("none"), b = profile("none"); b.genre = "studio";
  const balancing = [a, a, a, a], genres: string[] = [];
  for (let n = 0; n < 12; n++) { const draw = variation(a, [a, b], auto, () => .5, balancing); balancing.push(projectedProfile(a, draw)); genres.push(draw.genre!); }
  assert.equal(balancing.filter(p => p.genre === "studio").length, 8);
  assert.ok(genres.includes("snapshot") && genres.includes("studio"));
});
