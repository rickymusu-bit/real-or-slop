/** Measures and light SLOP treatment towards the source REAL: bounded tone/colour, blur and grain, then common encoding.
 * The treatment is proposed from the measures of the source REAL and can be set by the owner with sliders (owner request of
 * 2026-11-16): the same steps, with the owner's values in place of the proposed ones. */

/** 4: the parameters are settings the owner can change (`settings`), the tint of a monochrome copy is in `cast`.
 * 5: the tint of a monochrome copy is strongest in the midtones and fades towards black and white, as in a toned print; until 4
 * it was the same on every pixel, so blacks and whites took it too. */
export const TREATMENT_VERSION = 5;
/** Tint at the midtones that «Seppia» starts from when the source REAL is not sepia: warm, about neutral in luminance. */
export const SEPIA_TINT: [number, number, number] = [15, -1, -24];
/** The one JPEG generation a photo from an archive has gone through before the game copy. */
const JPEG_QUALITY = 0.85;
/** Version of the measures: 2 leaves burnt-out areas out of the noise; 3 adds the tint of a monochrome image. Copies measured
 * before are measured again. */
export const METRICS_VERSION = 3;
export interface Metrics {
  /** Long side in pixels. */ long: number;
  /** Standard deviation of the noise of the luminance in uniform areas (0–255 scale). */ noise: number;
  /** Root mean square of the Laplacian of the luminance. */ sharpness: number;
  /** Distance between the 2nd and 98th percentiles of the luminance (0–255). */ contrast: number;
  /** Mean chroma, (max − min) / 255. */ saturation: number;
  /** Mean deviation of R, G, B from the luminance in neutral areas. */ cast: [number, number, number];
  /** Tint at the midtones, fitted on every pixel (`tintWeight`): what a sepia or toned print has; near zero in a neutral black and
   * white. Measured from version 3. */ tint?: [number, number, number];
  /** Version of the algorithm; absent on the first measures. */ v?: number;
}
export type Monochrome = "" | "black-and-white" | "sepia";
/** The parameters of a treatment, proposed or chosen by the owner. */
export interface Settings {
  /** Contrast around the median luminance (1 unchanged). */ contrast: number;
  /** Saturation (1 unchanged); ignored in a monochrome copy. */ saturation: number;
  /** R, G, B added to every pixel: the shift of the colour cast, or the tint of a monochrome copy over its luminance. */ cast: [number, number, number];
  monochrome: Monochrome;
  /** Sigma of the Gaussian blur, in pixels of the copy (0 none). */ blur: number;
  /** Standard deviation of the luminance grain (0–255 scale); none at 0.3 or less. */ grain: number;
  /** Size of the grain: 1 a pixel, larger softened. */ grainSize: number;
  /** Quality of the intermediate JPEG (0–1). */ jpeg: number;
  /** Long side of the copy in pixels. */ long: number;
}
export interface Applied extends Omit<Settings, "long"> { medium: string }
export interface Treatment {
  version: number; off: boolean; seed: number; long: number; medium: string; color: string;
  sample: { metrics: Metrics }; applied?: Applied; result?: Metrics; gap?: number;
  /** Settings chosen by the owner (version 4); absent when the copy follows the proposal. */ settings?: Settings;
}
/** Range and step of each slider; the Worker refuses settings outside. */
export const SETTING_LIMITS = {
  contrast: { min: 0.5, max: 1.6, step: 0.01 }, saturation: { min: 0, max: 1.8, step: 0.01 }, cast: { min: -40, max: 40, step: 0.5 },
  blur: { min: 0, max: 3, step: 0.05 }, grain: { min: 0, max: 25, step: 0.1 }, grainSize: { min: 1, max: 3, step: 0.5 },
  jpeg: { min: 0.4, max: 1, step: 0.01 }, long: { min: 480, max: 1536, step: 1 },
} as const;
const MONOCHROME: Monochrome[] = ["", "black-and-white", "sepia"];

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
/** Weight of the tint of a monochrome copy at luminance y: 1 at the midtones, 0 at pure black and white. */
export const tintWeight = (y: number) => { const t = clamp(y / 255, 0, 1); return 4 * t * (1 - t); };
/** Tint at the midtones of a monochrome image: least-squares fit of each channel's deviation from the luminance to `tintWeight`, on
 * every pixel. The cast only looks at nearly grey pixels, which in a sepia print are the least toned. */
function tintOf(rgb: Float32Array, y: Float32Array): [number, number, number] {
  const tint = [0, 0, 0];
  let weights = 0;
  for (let i = 0; i < y.length; i++) {
    const w = tintWeight(y[i]);
    weights += w * w;
    for (let k = 0; k < 3; k++) tint[k] += w * (rgb[3 * i + k] - y[i]);
  }
  return tint.map(v => weights ? v / weights : 0) as [number, number, number];
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
    contrast: p98 - p2, saturation: round(saturation), cast: cast.map(v => round(v, 2)) as [number, number, number],
    tint: tintOf(rgb, y).map(v => round(v, 2)) as [number, number, number], v: METRICS_VERSION };
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
  const tint = m.tint === undefined ? undefined : Array.isArray(m.tint) && m.tint.length === 3 && m.tint.every(v => finite(v, -255, 255)) ? m.tint as [number, number, number] : null;
  if (tint === null) return null;
  return { long: Math.round(m.long as number), noise: m.noise as number, sharpness: m.sharpness as number, contrast: m.contrast as number,
    saturation: m.saturation as number, cast: m.cast as [number, number, number], ...(tint ? { tint } : {}), ...(m.v === METRICS_VERSION ? { v: METRICS_VERSION } : {}) };
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
/** Separable Gaussian blur of `channels` interleaved channels, in place: one line of the image at a time is copied aside, so a copy of
 * 1229 × 1536 needs no second 23 MB buffer (the Worker has 128 MB in all). */
function blurInPlace(data: Float32Array, width: number, height: number, channels: number, sigma: number): Float32Array {
  if (sigma <= 0) return data;
  const radius = Math.max(1, Math.ceil(3 * sigma)), kernel = new Float32Array(2 * radius + 1);
  let total = 0;
  for (let k = -radius; k <= radius; k++) { kernel[k + radius] = Math.exp(-(k * k) / (2 * sigma * sigma)); total += kernel[k + radius]; }
  for (let k = 0; k < kernel.length; k++) kernel[k] /= total;
  const line = new Float32Array(Math.max(width, height) * channels);
  // Horizontal, row by row.
  for (let r = 0; r < height; r++) {
    line.set(data.subarray(r * width * channels, (r + 1) * width * channels));
    for (let c = 0; c < width; c++) for (let ch = 0; ch < channels; ch++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += line[clamp(c + k, 0, width - 1) * channels + ch] * kernel[k + radius];
      data[(r * width + c) * channels + ch] = sum;
    }
  }
  // Vertical, column by column.
  for (let c = 0; c < width; c++) {
    for (let r = 0; r < height; r++) for (let ch = 0; ch < channels; ch++) line[r * channels + ch] = data[(r * width + c) * channels + ch];
    for (let r = 0; r < height; r++) for (let ch = 0; ch < channels; ch++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += line[clamp(r + k, 0, height - 1) * channels + ch] * kernel[k + radius];
      data[(r * width + c) * channels + ch] = sum;
    }
  }
  return data;
}
/** The same blur on a copy. */
const blur = (data: Float32Array, width: number, height: number, channels: number, sigma: number) =>
  blurInPlace(data.slice(), width, height, channels, sigma);

/** Applies the treatment to RGBA pixels already reduced to the copy's long side; returns the new pixels and what was applied (the
 * JPEG quality is for the caller, which compresses afterwards). Without `settings` every value is proposed from the measures of the
 * sample (the source REAL); with them, the owner's values are applied as they are. Deterministic for a given seed. Every proposed step
 * follows a measure of the sample: nothing is drawn that the REAL do not have. Version 1 also painted effects by medium (halftone
 * screen, vignette, glow): invented looks, some undone at once by the next step, and possible signs of the origin. */
export function treat(rgba: ArrayLike<number>, width: number, height: number, target: Metrics, medium: string, color: string, seed: number,
  settings?: Omit<Settings, "long">): { rgba: Uint8ClampedArray<ArrayBuffer>; applied: Applied } {
  const n = width * height;
  const rgb = toRgb(rgba, width, height);
  const monochrome: Monochrome = settings ? settings.monochrome : color === "black-and-white" || color === "sepia" ? color : "";
  // Contrast around the median.
  let y = luminance(rgb, n);
  const [p2, median, p98] = percentiles(y, 0.02, 0.98);
  const contrast = settings ? settings.contrast : round(clamp(target.contrast / Math.max(p98 - p2, 1), 0.85, 1.2));
  for (let i = 0; i < 3 * n; i++) rgb[i] = median + (rgb[i] - median) * contrast;
  y = luminance(rgb, n);
  let saturation = 1, cast: [number, number, number];
  if (monochrome) {
    // Black and white or sepia (proposed when the source REAL is): a tint on the luminance, strongest in the midtones, the sample's
    // when proposed (its cast when it was measured before the tint existed).
    cast = settings ? settings.cast : (target.tint || target.cast).map(v => round(v, 2)) as [number, number, number];
    for (let i = 0; i < n; i++) { const w = tintWeight(y[i]); for (let k = 0; k < 3; k++) rgb[3 * i + k] = y[i] + cast[k] * w; }
    saturation = settings ? settings.saturation : 1;
  } else {
    // The colour cast of the sample, then its saturation.
    const now = chromaStats(rgb, y);
    cast = settings ? settings.cast : target.cast.map((v, k) => round(clamp(v - now.cast[k], -8, 8), 2)) as [number, number, number];
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) rgb[3 * i + k] += cast[k];
    y = luminance(rgb, n);
    saturation = settings ? settings.saturation : round(clamp(target.saturation / Math.max(chromaStats(rgb, y).saturation, 1e-3), 0.7, 1.3));
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) rgb[3 * i + k] = y[i] + (rgb[3 * i + k] - y[i]) * saturation;
  }
  for (let i = 0; i < 3 * n; i++) rgb[i] = clamp(rgb[i], 0, 255);
  // Blur: the smallest of a few radii that brings the sharpness down to the sample's, tried on the luminance only.
  y = luminance(rgb, n);
  let sigma = settings ? settings.blur : 0;
  if (!settings && sharpnessOf(y, width, height) > target.sharpness * 1.05) {
    sigma = 1;
    for (const candidate of [0.4, 0.6, 0.8, 1]) {
      if (sharpnessOf(blur(y, width, height, 1, candidate), width, height) <= target.sharpness * 1.05) { sigma = candidate; break; }
    }
  }
  if (sigma > 0) blurInPlace(rgb, width, height, 3, sigma);
  // Luminance grain up to the sample's noise. In larger images the grain is softened, as film grain is at that scale, and brought
  // back to its strength; never drawn as blocks.
  y = luminance(rgb, n);
  const grain = settings ? settings.grain : round(Math.sqrt(Math.max(0, target.noise ** 2 - noiseOf(y, width, height) ** 2)), 2);
  const grainSize = settings ? settings.grainSize : Math.max(width, height) >= 1000 ? 2 : 1;
  if (grain > 0.3) {
    const normal = gaussian(random(seed));
    const field = new Float32Array(n);
    for (let i = 0; i < n; i++) field[i] = normal();
    if (grainSize > 1) blurInPlace(field, width, height, 1, 0.7 * (grainSize - 1));
    let sum = 0;
    for (let i = 0; i < n; i++) sum += field[i] * field[i];
    const scale = grain / Math.max(Math.sqrt(sum / n), 1e-6);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) rgb[3 * i + k] = clamp(rgb[3 * i + k] + field[i] * scale, 0, 255);
  }
  return { rgba: toRgba(rgb, width, height),
    applied: { medium, contrast, cast: [...cast] as [number, number, number], saturation,
      monochrome, blur: sigma, grain, grainSize, jpeg: settings ? settings.jpeg : JPEG_QUALITY } };
}

/** The colour sliders when the owner changes «Colore»: the proposal's if it has that colour; otherwise the sepia tint for «Seppia»
 * and none for the others, so that «Seppia» and «Bianco e nero» never look alike by accident. */
export const castFor = (monochrome: Monochrome, proposed: Settings): [number, number, number] =>
  proposed.monochrome === monochrome ? [...proposed.cast] as [number, number, number] : monochrome === "sepia" ? [...SEPIA_TINT] as [number, number, number] : [0, 0, 0];

/** The settings of an applied treatment and its long side (what the sliders start from). */
export const settingsOf = (applied: Applied, long: number): Settings => ({ contrast: applied.contrast, saturation: applied.saturation,
  cast: [...applied.cast] as [number, number, number], monochrome: applied.monochrome, blur: applied.blur, grain: applied.grain,
  grainSize: applied.grainSize, jpeg: applied.jpeg, long });

/** Settings as the Worker accepts them (within SETTING_LIMITS, `long` also within the crop), or null. */
export function validSettings(value: unknown, cropLong: number = SETTING_LIMITS.long.max): Settings | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>, L = SETTING_LIMITS;
  const inside = (v: unknown, limit: { min: number; max: number }) => typeof v === "number" && Number.isFinite(v) && v >= limit.min && v <= limit.max;
  if (Object.keys(s).some(k => !["contrast", "saturation", "cast", "monochrome", "blur", "grain", "grainSize", "jpeg", "long"].includes(k))) return null;
  if (!inside(s.contrast, L.contrast) || !inside(s.saturation, L.saturation) || !Array.isArray(s.cast) || s.cast.length !== 3
    || !s.cast.every(v => inside(v, L.cast)) || !MONOCHROME.includes(s.monochrome as Monochrome) || !inside(s.blur, L.blur)
    || !inside(s.grain, L.grain) || !inside(s.grainSize, L.grainSize) || !inside(s.jpeg, L.jpeg)
    || !Number.isInteger(s.long) || !inside(s.long, { min: Math.min(L.long.min, cropLong), max: Math.min(L.long.max, cropLong) })) return null;
  return { contrast: s.contrast as number, saturation: s.saturation as number, cast: [...s.cast] as [number, number, number],
    monochrome: s.monochrome as Monochrome, blur: s.blur as number, grain: s.grain as number, grainSize: s.grainSize as number,
    jpeg: s.jpeg as number, long: s.long as number };
}

/** A stored treatment as the Worker accepts it, or null. */
export function validTreatment(value: unknown): Treatment | null {
  if (!value || typeof value !== "object") return null;
  const t = value as Record<string, unknown>, sample = t.sample as Record<string, unknown> | undefined;
  if (typeof t.version !== "number" || t.version < 1 || t.version > TREATMENT_VERSION || typeof t.off !== "boolean" || typeof t.seed !== "number" || !Number.isSafeInteger(t.seed)
    || typeof t.long !== "number" || !Number.isSafeInteger(t.long) || t.long < 1 || typeof t.medium !== "string" || t.medium.length > 40
    || typeof t.color !== "string" || t.color.length > 40 || !sample || "id" in sample
    || !validMetrics(sample.metrics)) return null;
  if (t.result !== undefined && !validMetrics(t.result)) return null;
  if (t.settings !== undefined && !validSettings(t.settings, Math.max(t.long, (t.settings as { long?: number } | null)?.long ?? 0))) return null;
  return value as Treatment;
}

