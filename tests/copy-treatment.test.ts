/** Measures of a game copy and treatment of a SLOP (shared/copy-treatment.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { castFor, gap, measure, SEPIA_TINT, settingsOf, tintWeight, treat, treatedLong, validMetrics, validSettings, validTreatment, type Metrics, type Settings } from "../shared/copy-treatment";

/** A synthetic photo: a smooth gradient with a sharp edge and optional Gaussian noise of `sigma`, reproducible. */
function photo(width: number, height: number, sigma = 0, seed = 1, colour = true): Uint8ClampedArray {
  let s = seed;
  const next = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(next(), 1e-12))) * Math.cos(2 * Math.PI * next());
  const out = new Uint8ClampedArray(width * height * 4);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    const i = 4 * (r * width + c), base = 40 + 160 * c / width + (c > width / 2 && r > height / 2 ? 30 : 0), noise = sigma * normal();
    out[i] = base + noise + (colour ? 25 : 0); out[i + 1] = base + noise; out[i + 2] = base + noise - (colour ? 25 : 0); out[i + 3] = 255;
  }
  return out;
}

test("the noise measure follows the noise added to uniform areas", () => {
  const clean = measure(photo(256, 192), 256, 192), noisy = measure(photo(256, 192, 6), 256, 192);
  assert.ok(clean.noise < 1, "clean " + clean.noise);
  assert.ok(Math.abs(noisy.noise - 6) < 1.5, "noisy " + noisy.noise);
  assert.ok(noisy.sharpness > clean.sharpness);
  assert.equal(noisy.long, 256);
});
test("burnt-out areas are left out of the noise: a grainy image with a white sky is not measured as clean", () => {
  const grainy = photo(256, 192, 6, 9, false);
  // The upper third burnt to white, as the sky of an old print.
  for (let i = 0; i < 256 * 64; i++) { grainy[4 * i] = grainy[4 * i + 1] = grainy[4 * i + 2] = 255; }
  const m = measure(grainy, 256, 192);
  assert.ok(m.noise > 4, "noise " + m.noise);
  assert.equal(m.v, 3);
});
test("contrast, saturation and cast of a colour image; a grey image has no chroma", () => {
  const colour = measure(photo(200, 100), 200, 100), grey = measure(photo(200, 100, 0, 1, false), 200, 100);
  assert.ok(colour.contrast > 120 && colour.contrast < 200, String(colour.contrast));
  assert.ok(colour.saturation > 0.15 && grey.saturation === 0);
  assert.deepEqual(grey.cast, [0, 0, 0]);
});
test("the treatment brings a clean sharp image towards a soft, grainy sample", () => {
  const target: Metrics = { long: 200, noise: 5, sharpness: 4, contrast: 100, saturation: 0, cast: [0, 0, 0] };
  const source = photo(200, 150, 0, 3);
  const before = measure(source, 200, 150);
  const { rgba, applied } = treat(source, 200, 150, target, "newspaper-print", "black-and-white", 42);
  const after = measure(rgba, 200, 150);
  assert.equal(applied.monochrome, "black-and-white");
  assert.equal(after.saturation, 0);
  assert.ok(applied.contrast >= 0.85 && applied.contrast <= 1.2);
  assert.ok(Math.abs(after.contrast - before.contrast) < before.contrast * 0.25, "light contrast adjustment");
  assert.ok(applied.blur <= 1);
  assert.deepEqual(applied.cast, target.cast, "a monochrome copy takes the tint of the sample");
  assert.ok(after.noise > before.noise + 2, "noise " + after.noise);
  assert.ok(gap(after, target) < gap(before, target), `gap ${gap(after, target)} < ${gap(before, target)}`);
  // Same seed, same pixels.
  assert.deepEqual(treat(source, 200, 150, target, "newspaper-print", "black-and-white", 42).rgba, rgba);
  assert.notDeepEqual(treat(source, 200, 150, target, "newspaper-print", "black-and-white", 43).rgba, rgba);
});
test("a blurry sample makes the treatment blur a sharp image", () => {
  const sharp = photo(160, 120, 8, 5), target: Metrics = { ...measure(photo(160, 120, 1, 6), 160, 120), sharpness: 3 };
  const { rgba, applied } = treat(sharp, 160, 120, target, "digital-photo", "color", 7);
  assert.ok(applied.blur > 0);
  assert.ok(measure(rgba, 160, 120).sharpness < measure(sharp, 160, 120).sharpness);
});
test("long side of a treated copy: the sample's, within the crop and the recipe, at least 480 px", () => {
  assert.equal(treatedLong(700, 1536, 1536), 700);
  assert.equal(treatedLong(2400, 1536, 1536), 1536);
  assert.equal(treatedLong(90, 1536, 1536), 480);
  assert.equal(treatedLong(700, 500, 1536), 500);
});
test("the Worker accepts only well-formed measures and treatments", () => {
  const m: Metrics = { long: 700, noise: 3.2, sharpness: 12.5, contrast: 180, saturation: 0.2, cast: [1, 0, -1] };
  assert.deepEqual(validMetrics(m), m);
  assert.deepEqual(validMetrics({ ...m, v: 3 }), { ...m, v: 3 });
  assert.deepEqual(validMetrics({ ...m, v: 2 }), m, "measures of an earlier version are measured again");
  assert.equal(validMetrics({ ...m, saturation: 2 }), null);
  assert.equal(validMetrics({ ...m, cast: [1, 2] }), null);
  const t = { version: 1, off: false, seed: 5, long: 700, medium: "film-still", color: "color", sample: { metrics: m } };
  assert.ok(validTreatment(t));
  assert.ok(validTreatment({ ...t, version: 4 }), "an earlier version");
  assert.ok(validTreatment({ ...t, version: 5 }), "the current version");
  assert.equal(validTreatment({ ...t, version: 6 }), null);
  assert.deepEqual(validMetrics({ ...m, tint: [12, 0, -20], v: 3 }), { ...m, tint: [12, 0, -20], v: 3 });
  assert.equal(validMetrics({ ...m, tint: [12, 0] }), null);
  const settings: Settings = { contrast: 1, saturation: 1, cast: [0, 0, 0], monochrome: "", blur: 0, grain: 0, grainSize: 1, jpeg: 0.85, long: 700 };
  assert.ok(validTreatment({ ...t, version: 4, settings }));
  assert.equal(validTreatment({ ...t, version: 4, settings: { ...settings, blur: 9 } }), null);
  assert.equal(validTreatment({ ...t, sample: { id: "a b", metrics: m } }), null);
});

test("anonymous treatment rejects malformed samples without throwing", () => {
  const t = { version: 5, off: false, seed: 7, long: 700, medium: "", color: "" };
  for (const sample of [undefined, null, false, true, 0, 1, "invalid", [], {}]) {
    assert.equal(validTreatment({ ...t, sample }), null);
  }
});

test("the owner's settings are applied as they are; the proposal applied as settings gives the same pixels", () => {
  const target: Metrics = { long: 200, noise: 4, sharpness: 5, contrast: 150, saturation: 0.1, cast: [2, 0, -2] };
  const source = photo(200, 150, 0, 3);
  const proposed = treat(source, 200, 150, target, "film", "color", 11);
  const again = treat(source, 200, 150, target, "film", "color", 11, settingsOf(proposed.applied, 200));
  assert.deepEqual(again.rgba, proposed.rgba);
  const none: Settings = { contrast: 1, saturation: 1, cast: [0, 0, 0], monochrome: "", blur: 0, grain: 0, grainSize: 1, jpeg: 0.9, long: 200 };
  const untouched = treat(source, 200, 150, target, "film", "color", 11, none);
  let worst = 0;
  for (let i = 0; i < source.length; i++) worst = Math.max(worst, Math.abs(untouched.rgba[i] - source[i]));
  assert.ok(worst <= 1, "neutral settings leave the pixels, " + worst);
  assert.equal(untouched.applied.jpeg, 0.9);
  const strong = treat(source, 200, 150, target, "film", "color", 11, { ...none, grain: 12, saturation: 0, monochrome: "sepia", cast: [20, 8, -12] });
  assert.ok(measure(strong.rgba, 200, 150).noise > 2, "grain " + measure(strong.rgba, 200, 150).noise);
  const soft = treat(source, 200, 150, target, "film", "color", 11, { ...none, blur: 1.5 });
  assert.ok(measure(soft.rgba, 200, 150).sharpness < measure(source, 200, 150).sharpness);
  assert.equal(strong.applied.monochrome, "sepia");
});
test("settings outside the sliders' limits, or longer than the crop, are refused", () => {
  const s: Settings = { contrast: 1.1, saturation: 0.9, cast: [3, 0, -3], monochrome: "black-and-white", blur: 0.6, grain: 4, grainSize: 2, jpeg: 0.8, long: 900 };
  assert.deepEqual(validSettings(s), s);
  assert.equal(validSettings({ ...s, long: 900 }, 800), null);
  assert.equal(validSettings({ ...s, contrast: 3 }), null);
  assert.equal(validSettings({ ...s, monochrome: "red" }), null);
  assert.equal(validSettings({ ...s, extra: 1 }), null);
  assert.equal(validSettings({ ...s, long: 900.5 }), null);
});

/** A sepia print: grey gradient toned in proportion to `tintWeight`, as a toned print is. */
function sepiaPrint(width: number, height: number, tint: [number, number, number]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) {
    const i = 4 * (r * width + c), y = 255 * c / (width - 1), w = tintWeight(y);
    for (let k = 0; k < 3; k++) out[i + k] = y + tint[k] * w;
    out[i + 3] = 255;
  }
  return out;
}
test("the tint of a sepia print is measured on every pixel; the cast, on the nearly grey ones only, misses most of it", () => {
  // A tint neutral in luminance, so the grey under it is measured back as it was.
  const m = measure(sepiaPrint(256, 64, [20, -1, -47]), 256, 64);
  assert.ok(Math.abs(m.tint![0] - 20) < 2 && Math.abs(m.tint![2] + 47) < 2, "tint " + m.tint);
  assert.ok(Math.abs(m.cast[2]) < 25, "cast " + m.cast);
  assert.deepEqual(measure(photo(200, 100, 0, 1, false), 200, 100).tint, [0, 0, 0], "a neutral black and white has no tint");
});
test("sepia and black and white differ; the tint is strongest in the midtones and leaves black and white clean", () => {
  const source = photo(256, 64, 0, 3), target = measure(sepiaPrint(256, 64, [20, -1, -47]), 256, 64);
  const none: Settings = { contrast: 1, saturation: 1, cast: [0, 0, 0], monochrome: "black-and-white", blur: 0, grain: 0, grainSize: 1, jpeg: 0.9, long: 256 };
  const grey = treat(source, 256, 64, target, "film", "black-and-white", 1, none).rgba;
  const sepia = treat(source, 256, 64, target, "film", "sepia", 1, { ...none, monochrome: "sepia", cast: castFor("sepia", none) }).rgba;
  const spread = (px: Uint8ClampedArray, i: number) => px[4 * i] - px[4 * i + 2];
  const middle = 32 * 256 + 128;
  assert.ok(Math.abs(spread(grey, middle)) <= 1 && spread(sepia, middle) > 25, `grey ${spread(grey, middle)}, sepia ${spread(sepia, middle)}`);
  const proposed = treat(source, 256, 64, target, "film", "sepia", 1);
  assert.equal(proposed.applied.monochrome, "sepia");
  assert.deepEqual(proposed.applied.cast, target.tint, "proposed from the sample's tint");
  // At pure black and white the tint is gone.
  const ends = treat(sepiaPrint(256, 64, [0, 0, 0]), 256, 64, target, "film", "sepia", 1, { ...none, monochrome: "sepia", cast: [40, 0, -40] }).rgba;
  for (const i of [0, 255]) assert.ok(Math.abs(spread(ends, i)) <= 2, `end ${i}: ${spread(ends, i)}`);
});
test("changing «Colore» in the editor: the proposal's tint if it has that colour, the sepia tint, or none", () => {
  const proposed: Settings = { contrast: 1, saturation: 1, cast: [2, 0, -3], monochrome: "", blur: 0, grain: 0, grainSize: 1, jpeg: 0.85, long: 700 };
  assert.deepEqual(castFor("sepia", proposed), SEPIA_TINT);
  assert.deepEqual(castFor("black-and-white", proposed), [0, 0, 0]);
  assert.deepEqual(castFor("", proposed), [2, 0, -3]);
  assert.deepEqual(castFor("sepia", { ...proposed, monochrome: "sepia", cast: [25, 3, -30] }), [25, 3, -30]);
  assert.ok(Math.abs(0.299 * SEPIA_TINT[0] + 0.587 * SEPIA_TINT[1] + 0.114 * SEPIA_TINT[2]) < 2, "about neutral in luminance");
});

