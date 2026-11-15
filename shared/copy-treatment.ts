/** Measures and light SLOP treatment towards the source REAL: bounded tone/colour, blur and grain, then common encoding. */

export const TREATMENT_VERSION = 3;
/** The one JPEG generation a photo from an archive has gone through before the game copy. */
const JPEG_QUALITY = 0.85;
/** Version of the measures: 2 leaves burnt-out areas out of the noise. Copies measured before are measured again. */
export const METRICS_VERSION = 2;
export interface Metrics {
  /** Long side in pixels. */ long: number;
  /** Standard deviation of the noise of the luminance in uniform areas (0–255 scale). */ noise: number;
  /** Root mean square of the Laplacian of the luminance. */ sharpness: number;
  /** Distance between the 2nd and 98th percentiles of the luminance (0–255). */ contrast: number;
  /** Mean chroma, (max − min) / 255. */ saturation: number;
  /** Mean deviation of R, G, B from the luminance in neutral areas. */ cast: [number, number, number];
  /** Version of the algorithm; absent on the first measures. */ v?: number;
}
export interface Applied {
  medium: string; contrast: number; cast: [number, number, number]; saturation: number; monochrome: "" | "black-and-white" | "sepia";
  blur: number; grain: number; grainSize: number; jpeg: number;
}
export interface Treatment {
  version: number; off: boolean; seed: number; long: number; medium: string; color: string;
  sample: { id: string; metrics: Metrics }; applied?: Applied; result?: Metrics; gap?: number;
}

const round = (n: number, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits;
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

function luminance(rgb: Float32Array, n: number): Float32Array {
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = 0.299 * rgb[3 * i] + 0.587 * rgb[3 * i + 1] + 0.114 * rgb[3 * i + 2];
  return y;
}
/** RGB as floats from RGBA bytes (alpha ignored: copies are opaque). */
export function toRgb(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const n = width * height, rgb = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { rgb[3 * i] = rgba[4 * i]; rgb[3 * i + 1] = rgba[4 * i + 1]; rgb[3 * i + 2] = rgba[4 * i + 2]; }
  return rgb;
}
export function toRgba(rgb: Float32Array, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const n = width * height, out: Uint8ClampedArray<ArrayBuffer> = new Uint8ClampedArray(4 * n);
  for (let i = 0; i < n; i++) {
    out[4 * i] = rgb[3 * i]; out[4 * i + 1] = rgb[3 * i + 1]; out[4 * i + 2] = rgb[3 * i + 2]; out[4 * i + 3] = 255;
  }
  return out;
}

function laplacian(y: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let r = 1; r < height - 1; r++) for (let c = 1; c < width - 1; c++) {
    const i = r * width + c;
    out[i] = 4 * y[i] - y[i - 1] - y[i + 1] - y[i - width] - y[i + width];
  }
  return out;
}
function sharpnessOf(y: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  const l = laplacian(y, width, height);
  let sum = 0;
  for (let r = 1; r < height - 1; r++) for (let c = 1; c < width - 1; c++) { const v = l[r * width + c]; sum += v * v; }
  return Math.sqrt(sum / ((width - 2) * (height - 2)));
}
/** Noise: in 8×8 blocks, the deviation of the Laplacian divided by √20 (its gain on white noise); the median over the 10% of
 * blocks with the least structure, where what varies is noise rather than detail. Blocks burnt to white or black are left out:
 * they are the flattest of all and hold no grain, so a print with a white sky measured zero (34 REAL out of 55 on 2026-11-14). */
const CLIP_LOW = 24, CLIP_HIGH = 231;
function noiseOf(y: Float32Array, width: number, height: number): number {
  const l = laplacian(y, width, height), blocks: { structure: number; noise: number }[] = [];
  for (let r0 = 1; r0 + 8 < height; r0 += 8) for (let c0 = 1; c0 + 8 < width; c0 += 8) {
    let sy = 0, syy = 0, sl = 0, sll = 0;
    for (let r = r0; r < r0 + 8; r++) for (let c = c0; c < c0 + 8; c++) {
      const i = r * width + c, v = y[i], d = l[i];
      sy += v; syy += v * v; sl += d; sll += d * d;
    }
    const mean = sy / 64;
    if (mean < CLIP_LOW || mean > CLIP_HIGH) continue;
    const structure = Math.sqrt(Math.max(0, syy / 64 - mean ** 2)), deviation = Math.sqrt(Math.max(0, sll / 64 - (sl / 64) ** 2));
    blocks.push({ structure, noise: deviation / Math.sqrt(20) });
  }
  if (!blocks.length) return 0;
  blocks.sort((a, b) => a.structure - b.structure);
  const flat = blocks.slice(0, Math.max(1, Math.floor(blocks.length / 10))).map(b => b.noise).sort((a, b) => a - b);
  return flat[Math.floor(flat.length / 2)];
}
function percentiles(y: Float32Array, low: number, high: number): [number, number, number] {
  const histogram = new Uint32Array(256);
  for (const v of y) histogram[clamp(Math.round(v), 0, 255)]++;
  const at = (fraction: number) => {
    const target = fraction * y.length;
    let seen = 0;
    for (let v = 0; v < 256; v++) { seen += histogram[v]; if (seen >= target) return v; }
    return 255;
  };
  return [at(low), at(0.5), at(high)];
}
function chromaStats(rgb: Float32Array, y: Float32Array): { saturation: number; cast: [number, number, number] } {
  const n = y.length;
  let chroma = 0, neutral = 0;
  const cast = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const r = rgb[3 * i], g = rgb[3 * i + 1], b = rgb[3 * i + 2], spread = Math.max(r, g, b) - Math.min(r, g, b);
    chroma += spread / 255;
    if (spread < 0.12 * 255 && y[i] > 20 && y[i] < 235) { neutral++; cast[0] += r - y[i]; cast[1] += g - y[i]; cast[2] += b - y[i]; }
  }
  const enough = neutral >= 0.005 * n;
  return { saturation: n ? chroma / n : 0, cast: enough ? cast.map(v => v / neutral) as [number, number, number] : [0, 0, 0] };
}

function measureRgb(rgb: Float32Array, width: number, height: number): Metrics {
  const y = luminance(rgb, width * height), [p2, , p98] = percentiles(y, 0.02, 0.98), { saturation, cast } = chromaStats(rgb, y);
  return { long: Math.max(width, height), noise: round(noiseOf(y, width, height)), sharpness: round(sharpnessOf(y, width, height)),
    contrast: p98 - p2, saturation: round(saturation), cast: cast.map(v => round(v, 2)) as [number, number, number], v: METRICS_VERSION };
}
/** Measures of an image given as RGBA bytes. */
export function measure(rgba: ArrayLike<number>, width: number, height: number): Metrics {
  return measureRgb(toRgb(rgba, width, height), width, height);
}

/** Measures as the Worker accepts them, or null. */
export function validMetrics(value: unknown): Metrics | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Record<string, unknown>;
  const finite = (v: unknown, low: number, high: number) => typeof v === "number" && Number.isFinite(v) && v >= low && v <= high;
  if (!finite(m.long, 1, 100_000) || !finite(m.noise, 0, 255) || !finite(m.sharpness, 0, 2000) || !finite(m.contrast, 0, 255)
    || !finite(m.saturation, 0, 1) || !Array.isArray(m.cast) || m.cast.length !== 3 || !m.cast.every(v => finite(v, -255, 255))) return null;
  return { long: Math.round(m.long as number), noise: m.noise as number, sharpness: m.sharpness as number, contrast: m.contrast as number,
    saturation: m.saturation as number, cast: m.cast as [number, number, number], ...(m.v === METRICS_VERSION ? { v: METRICS_VERSION } : {}) };
}
/** Relative distance between two measures: the mean of the relative differences of noise, sharpness, contrast and saturation. */
export function gap(a: Metrics, b: Metrics): number {
  const rel = (x: number, y: number) => Math.abs(x - y) / Math.max(Math.abs(y), 1e-6, Math.abs(x));
  return round((rel(a.noise, b.noise) + rel(a.sharpness, b.sharpness) + rel(a.contrast, b.contrast) + rel(a.saturation, b.saturation)) / 4);
}

/** Long side of a treated copy: the sample's, never larger than the crop nor than the recipe's maximum, at least 480 px. */
export const treatedLong = (sampleLong: number, cropLong: number, maxSide: number) =>
  Math.max(Math.min(480, cropLong), Math.min(Math.round(sampleLong), cropLong, maxSide));

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(next: () => number) {
  return () => Math.sqrt(-2 * Math.log(Math.max(next(), 1e-12))) * Math.cos(2 * Math.PI * next());
}
/** Separable Gaussian blur of `channels` interleaved channels. */
function blur(data: Float32Array, width: number, height: number, channels: number, sigma: number): Float32Array {
  if (sigma <= 0) return data;
  const radius = Math.max(1, Math.ceil(3 * sigma)), kernel = new Float32Array(2 * radius + 1);
  let total = 0;
  for (let k = -radius; k <= radius; k++) { kernel[k + radius] = Math.exp(-(k * k) / (2 * sigma * sigma)); total += kernel[k + radius]; }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= total;
  const pass = (source: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(source.length);
    for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) for (let ch = 0; ch < channels; ch++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const rr = horizontal ? r : clamp(r + k, 0, height - 1), cc = horizontal ? clamp(c + k, 0, width - 1) : c;
        sum += source[(rr * width + cc) * channels + ch] * kernel[k + radius];
      }
      out[(r * width + c) * channels + ch] = sum;
    }
    return out;
  };
  return pass(pass(data, true), false);
}

/** Applies the treatment to RGBA pixels already reduced to the sample's long side; returns the new pixels and what was applied
 * (the JPEG quality is for the browser, which compresses afterwards). Deterministic for a given seed. Every step follows a measure
 * of the sample: nothing is drawn that the REAL do not have. Version 1 also painted effects by medium (halftone screen, vignette,
 * glow): invented looks, some undone at once by the next step, and possible signs of the origin. */
export function treat(rgba: ArrayLike<number>, width: number, height: number, target: Metrics, medium: string, color: string, seed: number):
  { rgba: Uint8ClampedArray<ArrayBuffer>; applied: Applied } {
  const n = width * height;
  let rgb = toRgb(rgba, width, height);
  const monochrome: Applied["monochrome"] = color === "black-and-white" || color === "sepia" ? color : "";
  // Contrast around the median.
  let y = luminance(rgb, n);
  const [p2, median, p98] = percentiles(y, 0.02, 0.98), contrast = clamp(target.contrast / Math.max(p98 - p2, 1), 0.85, 1.2);
  for (let i = 0; i < 3 * n; i++) rgb[i] = median + (rgb[i] - median) * contrast;
  y = luminance(rgb, n);
  let saturation = 1, shift: [number, number, number] = [0, 0, 0];
  if (monochrome) {
    // Black and white or sepia when the source REAL is: the tint of the sample on the luminance.
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) rgb[3 * i + k] = y[i] + target.cast[k];
  } else {
    // The colour cast of the sample, then its saturation.
    const now = chromaStats(rgb, y);
    shift = target.cast.map((v, k) => clamp(v - now.cast[k], -8, 8)) as [number, number, number];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) rgb[3 * i + k] += shift[k];
    y = luminance(rgb, n);
    saturation = clamp(target.saturation / Math.max(chromaStats(rgb, y).saturation, 1e-3), 0.7, 1.3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) rgb[3 * i + k] = y[i] + (rgb[3 * i + k] - y[i]) * saturation;
  }
  for (let i = 0; i < 3 * n; i++) rgb[i] = clamp(rgb[i], 0, 255);
  // Blur: the smallest of a few radii that brings the sharpness down to the sample's, tried on the luminance only.
  y = luminance(rgb, n);
  let sigma = 0;
  if (sharpnessOf(y, width, height) > target.sharpness * 1.05) {
    sigma = 1;
    for (const candidate of [0.4, 0.6, 0.8, 1]) {
      if (sharpnessOf(blur(y, width, height, 1, candidate), width, height) <= target.sharpness * 1.05) { sigma = candidate; break; }
    }
    rgb = blur(rgb, width, height, 3, sigma);
  }
  // Luminance grain up to the sample's noise. In larger images the grain is softened, as film grain is at that scale, and brought
  // back to its strength; never drawn as blocks.
  y = luminance(rgb, n);
  const current = noiseOf(y, width, height), grain = Math.sqrt(Math.max(0, target.noise ** 2 - current ** 2));
  const grainSize = Math.max(width, height) >= 1000 ? 2 : 1;
  if (grain > 0.3) {
    const normal = gaussian(random(seed));
    let field = new Float32Array(n);
    for (let i = 0; i < n; i++) field[i] = normal();
    if (grainSize > 1) field = blur(field, width, height, 1, 0.7) as Float32Array<ArrayBuffer>;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += field[i] * field[i];
    const scale = grain / Math.max(Math.sqrt(sum / n), 1e-6);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) rgb[3 * i + k] = clamp(rgb[3 * i + k] + field[i] * scale, 0, 255);
  }
  return { rgba: toRgba(rgb, width, height),
    applied: { medium, contrast: round(contrast), cast: shift.map(v => round(v, 2)) as [number, number, number], saturation: round(saturation),
      monochrome, blur: sigma, grain: round(grain), grainSize, jpeg: JPEG_QUALITY } };
}

/** A stored treatment as the Worker accepts it, or null. */
export function validTreatment(value: unknown): Treatment | null {
  if (!value || typeof value !== "object") return null;
  const t = value as Record<string, unknown>, sample = t.sample as Record<string, unknown> | undefined;
  if (typeof t.version !== "number" || t.version < 1 || t.version > TREATMENT_VERSION || typeof t.off !== "boolean" || typeof t.seed !== "number" || !Number.isSafeInteger(t.seed)
    || typeof t.long !== "number" || !Number.isSafeInteger(t.long) || t.long < 1 || typeof t.medium !== "string" || t.medium.length > 40
    || typeof t.color !== "string" || t.color.length > 40 || !sample || typeof sample.id !== "string" || !/^[\w-]{1,64}$/.test(sample.id)
    || !validMetrics(sample.metrics)) return null;
  if (t.result !== undefined && !validMetrics(t.result)) return null;
  return value as Treatment;
}
