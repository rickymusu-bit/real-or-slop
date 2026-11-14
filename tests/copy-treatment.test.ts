/** Measures of a game copy and treatment of a SLOP (shared/copy-treatment.ts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gap, measure, treat, treatedLong, validMetrics, validTreatment, type Metrics } from "../shared/copy-treatment";

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
  assert.equal(m.v, 2);
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
  assert.ok(Math.abs(after.contrast - 100) < 25, "contrast " + after.contrast);
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
test("long side of a treated copy: the sample's, within the crop and the recipe, at least 160 px", () => {
  assert.equal(treatedLong(700, 1536, 1536), 700);
  assert.equal(treatedLong(2400, 1536, 1536), 1536);
  assert.equal(treatedLong(90, 1536, 1536), 160);
  assert.equal(treatedLong(700, 500, 1536), 500);
});
test("the Worker accepts only well-formed measures and treatments", () => {
  const m: Metrics = { long: 700, noise: 3.2, sharpness: 12.5, contrast: 180, saturation: 0.2, cast: [1, 0, -1] };
  assert.deepEqual(validMetrics(m), m);
  assert.deepEqual(validMetrics({ ...m, v: 2 }), { ...m, v: 2 });
  assert.equal(validMetrics({ ...m, saturation: 2 }), null);
  assert.equal(validMetrics({ ...m, cast: [1, 2] }), null);
  const t = { version: 1, off: false, seed: 5, long: 700, medium: "film-still", color: "color", sample: { id: "abc", metrics: m } };
  assert.ok(validTreatment(t));
  assert.ok(validTreatment({ ...t, version: 2 }), "the current version");
  assert.equal(validTreatment({ ...t, version: 3 }), null);
  assert.equal(validTreatment({ ...t, sample: { id: "a b", metrics: m } }), null);
});
