/** The game copy, made on Cloudflare (spec `copie-di-gioco`; owner decision of 2026-11-15: the browser is only an interface, every
 * long photo processing runs in the Worker). One recipe for REAL and SLOP:
 * 1. the Images binding decodes the original (orientation applied) and scales it down to a working size, as PNG;
 * 2. here, in JavaScript: crop on the oriented original, area resampling to the copy's size, then, for a SLOP, the light treatment
 *    towards the measures of its source REAL with the intermediate JPEG of a photo that has travelled (through Images again);
 * 3. Images encodes the WebP of the copy; the copy is measured as the player will see it (decoded again).
 * The Worker never holds a full-size original as pixels: the working image stays under six megapixels. */
import { HttpError, type Env } from "./core";
import { centredCrop, copyDimensions, cropError, GAME_COPY, type Crop } from "../shared/game-copy";
import { gap, measure, treat, treatedLong, TREATMENT_VERSION, type Metrics, type Treatment } from "../shared/copy-treatment";
import { decodePng, encodePng, type Pixels } from "./png";

/** Working image at most six megapixels: its PNG, the inflated lines and the RGBA stay well under the Worker's 128 MB (24 MB of
 * pixels), while a 4:5 crop of the whole height still has more pixels than the copy (1229 × 1536). */
const WORK_PIXELS = 6_000_000;

/** One pass through the Images binding: input bytes, optional resize, output in the given format. */
async function photo(env: Env, bytes: Uint8Array, output: ImageOutputOptions, transform?: ImageTransform): Promise<Uint8Array> {
  if (!env.PHOTO) throw new HttpError(503, "Elaborazione delle immagini non configurata (binding Images)");
  let work = env.PHOTO.input(new Blob([bytes]).stream());
  if (transform) work = work.transform(transform);
  const result = await work.output(output);
  return new Uint8Array(await result.response().arrayBuffer());
}
const pixelsOf = async (env: Env, bytes: Uint8Array, transform?: ImageTransform) => decodePng(await photo(env, bytes, { format: "image/png" }, transform));

/** Area (box) resampling of the rectangle `rect` of `source` (float coordinates) into width × height: each output pixel is the
 * average of the source pixels it covers, weighted by the covered fraction. Never enlarges detail: a smaller source is spread. */
export function resample(source: Pixels, rect: { x: number; y: number; width: number; height: number }, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4), sx = rect.width / width, sy = rect.height / height;
  for (let oy = 0; oy < height; oy++) {
    const y0 = rect.y + oy * sy, y1 = y0 + sy;
    for (let ox = 0; ox < width; ox++) {
      const x0 = rect.x + ox * sx, x1 = x0 + sx;
      let r = 0, g = 0, b = 0, w = 0;
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0), row = Math.min(source.height - 1, Math.max(0, y)) * source.width;
        if (wy <= 0) continue;
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          const i = (row + Math.min(source.width - 1, Math.max(0, x))) * 4, weight = wx * wy;
          r += source.rgba[i] * weight; g += source.rgba[i + 1] * weight; b += source.rgba[i + 2] * weight; w += weight;
        }
      }
      const o = (oy * width + ox) * 4;
      out[o] = r / w; out[o + 1] = g / w; out[o + 2] = b / w; out[o + 3] = 255;
    }
  }
  return out;
}

/** The treatment of a SLOP: its source REAL's measures, the slot's Medium and Color, a seed (kept when the copy is remade). */
export interface Plan { off: boolean; seed: number; medium: string; color: string; sample: { id: string; metrics: Metrics } }

export interface Made { bytes: Uint8Array; width: number; height: number; metrics: Metrics; treatment: Treatment | null }

/** Makes the WebP copy of an original (`width` × `height`, oriented) along `crop` (4:5, centred if absent), treated if `plan` says so. */
export async function makeCopy(env: Env, original: Uint8Array, width: number, height: number, crop: Crop | null, plan: Plan | null): Promise<Made> {
  const frame = crop || centredCrop(width, height);
  const invalid = cropError(width, height, frame);
  if (invalid || frame.format !== "4:5") throw new HttpError(400, invalid || "Copia di gioco richiesta in 4:5");
  const long = plan && !plan.off ? treatedLong(plan.sample.metrics.long, Math.max(frame.width, frame.height), GAME_COPY.maxSide) : GAME_COPY.maxSide;
  const size = copyDimensions(frame, long);
  // Working image: one and a half times the pixels the copy needs in the crop, never more than six megapixels (or the original).
  const want = Math.max(size.width / frame.width, size.height / frame.height);
  const scale = Math.min(1, want * 1.5, Math.sqrt(WORK_PIXELS / (width * height)));
  const work = scale < 1
    ? await pixelsOf(env, original, { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), fit: "scale-down" })
    : await pixelsOf(env, original);
  const fx = work.width / width, fy = work.height / height;
  let rgba = resample(work, { x: frame.x * fx, y: frame.y * fy, width: frame.width * fx, height: frame.height * fy }, size.width, size.height);
  let treatment: Treatment | null = plan ? { version: TREATMENT_VERSION, off: plan.off, seed: plan.seed, long, medium: plan.medium, color: plan.color, sample: plan.sample } : null;
  if (plan && !plan.off) {
    const treated = treat(rgba, size.width, size.height, plan.sample.metrics, plan.medium, plan.color, plan.seed);
    // The intermediate JPEG compression of a photo that has travelled, then the recipe of every copy.
    const jpeg = await photo(env, await encodePng(treated.rgba, size.width, size.height), { format: "image/jpeg", quality: Math.round(treated.applied.jpeg * 100) });
    rgba = (await pixelsOf(env, jpeg)).rgba;
    treatment = { ...treatment!, applied: treated.applied };
  }
  const bytes = await photo(env, await encodePng(rgba, size.width, size.height), { format: "image/webp", quality: Math.round(GAME_COPY.quality * 100) });
  if (bytes.length > GAME_COPY.maxBytes) throw new HttpError(413, "Copia di gioco oltre 4 MB");
  const metrics = await measureCopy(env, bytes);
  if (treatment && !treatment.off) treatment = { ...treatment, result: metrics, gap: gap(metrics, plan!.sample.metrics) };
  return { bytes, width: size.width, height: size.height, metrics, treatment };
}

/** Measures of an encoded copy, as the player will see it. */
export async function measureCopy(env: Env, copy: Uint8Array): Promise<Metrics> {
  const pixels = await pixelsOf(env, copy);
  return measure(pixels.rgba, pixels.width, pixels.height);
}
