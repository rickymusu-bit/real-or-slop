/** The game copy, made on Cloudflare (spec `copie-di-gioco`; owner decision of 2026-11-15: the browser is only an interface, every
 * long photo processing runs in the Worker). One recipe for REAL and SLOP:
 * 1. the Images binding decodes the original (orientation applied) and scales it so that the crop has the copy's size, as PNG;
 * 2. fast-png (worker/codecs.ts) gives the pixels; the crop is cut out of them at that scale, without resampling here; a SLOP gets the
 *    light treatment towards the measures of its source REAL (or the owner's settings) with the intermediate JPEG of a photo that has
 *    travelled, encoded by Images;
 * 3. Images encodes the WebP of the copy; the copy is measured as the player will see it (decoded again).
 * The Worker never holds a full-size original as pixels: the scaled original stays under five megapixels. */
import { HttpError, type Env } from "./core";
import { centredCrop, copyDimensions, cropError, GAME_COPY, type Crop } from "../shared/game-copy";
import { gap, measure, settingsOf, treat, treatedLong, TREATMENT_VERSION, type Metrics, type Settings, type Treatment } from "../shared/copy-treatment";
import { crop as cut, decodePng, encodePng, type Picture } from "./codecs";

/** The scaled original at most five megapixels: its PNG, the inflated lines and the RGBA stay well under the Worker's 128 MB. A 16:9
 * photo scaled to a copy 1536 px high is 4.2 megapixels; wider panoramas get a smaller copy. */
const WORK_PIXELS = 5_000_000;

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200);
/** One pass through the Images binding: input bytes, optional resize, output in the given format. */
async function photo(env: Env, bytes: Uint8Array, output: ImageOutputOptions, transform?: ImageTransform): Promise<Uint8Array> {
  if (!env.PHOTO) throw new HttpError(503, "Elaborazione delle immagini non configurata (binding Images)");
  try {
    let work = env.PHOTO.input(new Blob([bytes]).stream());
    if (transform) work = work.transform(transform);
    const result = await work.output(output);
    return new Uint8Array(await result.response().arrayBuffer());
  } catch (error) { throw new HttpError(502, "Cloudflare Images: " + reason(error)); }
}
/** Pixels of an image through Images and fast-png. A PNG that cannot be read is a 502 with its reason, not an internal error. */
async function pixelsOf(env: Env, bytes: Uint8Array, transform?: ImageTransform): Promise<Picture> {
  const png = await photo(env, bytes, { format: "image/png" }, transform);
  try { return decodePng(png); } catch (error) { throw new HttpError(502, "Copia di gioco: " + reason(error)); }
}
/** Pixels encoded by Images in `format` at `quality` (0–1). */
const encoded = async (env: Env, p: Picture, format: "image/jpeg" | "image/webp", quality: number) =>
  photo(env, encodePng(p), { format, quality: Math.round(quality * 100) });

/** The treatment of a SLOP: its source REAL's measures, the slot's Medium and Color, a seed (kept when the copy is remade), the
 * owner's settings when chosen (else proposed from the measures). */
export interface Plan {
  off: boolean; seed: number; medium: string; color: string; sample: { id: string; metrics: Metrics }; settings?: Settings | null;
}

export interface Made { bytes: Uint8Array; width: number; height: number; metrics: Metrics; treatment: Treatment | null }

/** Makes the WebP copy of an original (`width` × `height`, oriented) along `crop` (4:5, centred if absent), treated if `plan` says so. */
export async function makeCopy(env: Env, original: Uint8Array, width: number, height: number, crop: Crop | null, plan: Plan | null): Promise<Made> {
  const frame = crop || centredCrop(width, height);
  const invalid = cropError(width, height, frame);
  if (invalid || frame.format !== "4:5") throw new HttpError(400, invalid || "Copia di gioco richiesta in 4:5");
  const treated = !!plan && !plan.off, cropLong = Math.max(frame.width, frame.height);
  const proposedLong = treated ? treatedLong(plan.sample.metrics.long, cropLong, GAME_COPY.maxSide) : GAME_COPY.maxSide;
  const long = treated && plan.settings ? Math.min(plan.settings.long, cropLong, GAME_COPY.maxSide) : proposedLong;
  // Images scales the whole original so that the crop has the copy's size (one resampling, by Images); a scaled original over five
  // megapixels makes the copy smaller instead. The box asked is one pixel larger, so that rounding never leaves the crop short.
  let size = copyDimensions(frame, long);
  if (width * height * (size.height / frame.height) ** 2 > WORK_PIXELS)
    size = copyDimensions(frame, Math.max(1, Math.floor(frame.height * Math.sqrt(WORK_PIXELS / (width * height)))));
  const s = size.height / frame.height;
  // In a function of its own, so that the scaled original can be freed before the treatment.
  let picture = await (async () => {
    const work = s < 1
      ? await pixelsOf(env, original, { width: Math.min(width, Math.ceil(width * s) + 1), height: Math.min(height, Math.ceil(height * s) + 1), fit: "scale-down" })
      : await pixelsOf(env, original);
    const fx = work.width / width, fy = work.height / height;
    if (size.width > work.width || size.height > work.height) size = copyDimensions(frame, Math.min(size.height, work.height, Math.floor(work.width * 5 / 4)));
    const x = Math.max(0, Math.min(work.width - size.width, Math.round(frame.x * fx))), y = Math.max(0, Math.min(work.height - size.height, Math.round(frame.y * fy)));
    return cut(work, x, y, size.width, size.height);
  })();
  const made = treated ? Math.max(size.width, size.height) : long;
  let treatment: Treatment | null = plan ? { version: TREATMENT_VERSION, off: plan.off, seed: plan.seed, long: made, medium: plan.medium, color: plan.color,
    sample: plan.sample, ...(plan.settings ? { settings: { ...plan.settings, long: treated ? made : plan.settings.long } } : {}) } : null;
  if (treated) {
    const done = treat(picture.data, size.width, size.height, plan.sample.metrics, plan.medium, plan.color, plan.seed, plan.settings || undefined);
    // The intermediate JPEG compression of a photo that has travelled, then the recipe of every copy.
    picture = await pixelsOf(env, await encoded(env, { data: done.rgba, width: size.width, height: size.height }, "image/jpeg", done.applied.jpeg));
    treatment = { ...treatment!, applied: done.applied };
  }
  const bytes = await encoded(env, picture, "image/webp", GAME_COPY.quality);
  if (bytes.length > GAME_COPY.maxBytes) throw new HttpError(413, "Copia di gioco oltre 4 MB");
  const metrics = await measureCopy(env, bytes);
  if (treatment && !treatment.off) treatment = { ...treatment, result: metrics, gap: gap(metrics, plan!.sample.metrics) };
  return { bytes, width: size.width, height: size.height, metrics, treatment };
}

/** The settings of a made copy (what the sliders show), or null for a copy without treatment. */
export const settingsOfCopy = (treatment: Treatment | null): Settings | null =>
  treatment && !treatment.off && treatment.applied ? treatment.settings || settingsOf(treatment.applied, treatment.long) : null;

/** Measures of an encoded copy, as the player will see it. */
export async function measureCopy(env: Env, copy: Uint8Array): Promise<Metrics> {
  const pixels = await pixelsOf(env, copy);
  return measure(pixels.data, pixels.width, pixels.height);
}
