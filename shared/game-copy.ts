/** Common generation formats, fixed 4:5 game copies, geometry validation and generator sizes. */
export const FORMATS = ["3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "1:1"] as const;
export type Format = typeof FORMATS[number] | "4:5";
export const FORMAT_LABELS: Record<Format, string> = {
  "4:5": "4:5 portrait", "3:2": "3:2 landscape", "2:3": "2:3 portrait", "4:3": "4:3 landscape", "3:4": "3:4 portrait",
  "16:9": "16:9 landscape", "9:16": "9:16 portrait", "1:1": "1:1 square",
};
export const GAME_COPY = { mime: "image/webp", maxSide: 1536, quality: 0.85, maxBytes: 4_000_000, minSide: 64, viewRatio: 4 / 5 } as const;
export const GAME_COPY_RECIPE = `webp-q${GAME_COPY.quality}-format-max${GAME_COPY.maxSide}-srgb-v4-portrait`;
const CROP_MODES = ["fit", "fit-width", "padded"] as const;
type CropMode = typeof CROP_MODES[number];
const isCropMode = (mode: unknown): mode is CropMode => CROP_MODES.some(value => value === mode);
export interface Crop { x: number; y: number; width: number; height: number; format: Format; mode?: CropMode }
export interface View { x: number; y: number; height: number }

export const isFormat = (value: unknown): value is Format => typeof value === "string" && [...FORMATS, "4:5"].includes(value);
/** Width over height of a format. */
export function ratioOf(format: Format): number {
  const [w, h] = format.split(":").map(Number);
  return w / h;
}
/** Width of a frame of the format with the given height. */
export const formatWidth = (format: Format, height: number) => Math.round(height * ratioOf(format));

/** The format closest to the proportions of an image (distance on the logarithm of the ratio). */
export function nearestFormat(width: number, height: number, allowed: readonly Format[] = FORMATS): Format {
  if (!(width > 0) || !(height > 0)) throw Error("Invalid dimensions");
  const target = Math.log(width / height);
  let best = allowed[0];
  for (const format of allowed) if (Math.abs(Math.log(ratioOf(format)) - target) < Math.abs(Math.log(ratioOf(best)) - target)) best = format;
  return best;
}

/** Largest frame of a format that fits in width × height. */
function largest(format: Format, width: number, height: number): { width: number; height: number } {
  let h = Math.min(height, Math.floor(width / ratioOf(format)));
  while (h > 1 && formatWidth(format, h) > width) h--;
  return { width: formatWidth(format, Math.max(h, 1)), height: Math.max(h, 1) };
}

/** The largest crop of `format` (the nearest one without it) centred in the image: the default before the owner moves it. */
export function centredCrop(width: number, height: number, format?: Format): Crop {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw Error("Invalid dimensions");
  const f = format || "4:5", size = largest(f, width, height);
  if (size.width > width || size.height > height) throw Error("Image too small for this format " + f);
  return { x: Math.floor((width - size.width) / 2), y: Math.floor((height - size.height) / 2), width: size.width, height: size.height, format: f };
}

/** The whole original fitted inside the 4:5 copy. */
export function wholePhotoFrame(width: number, height: number): Crop {
  return { x: 0, y: 0, width, height, format: "4:5", mode: "fit" };
}

/** The virtual 4:5 canvas at original resolution, with the offset of the centred photograph. */
export function paddedPhotoCanvas(width: number, height: number) {
  const canvasHeight = Math.max(height, Math.round(width / GAME_COPY.viewRatio));
  const canvasWidth = formatWidth("4:5", canvasHeight);
  return { width: canvasWidth, height: canvasHeight, x: Math.floor((canvasWidth - width) / 2), y: Math.floor((canvasHeight - height) / 2) };
}
const frameHeight = (crop: Pick<Crop, "width" | "height" | "format" | "mode">) =>
  crop.mode === "fit" || crop.mode === "fit-width" ? paddedPhotoCanvas(crop.width, crop.height).height : crop.height;
export const frameLongSide = (crop: Crop) => Math.max(crop.width, frameHeight(crop));

/** Smallest height a crop of `format` may have in an image of these dimensions. */
export const minimumCropHeight = (format: Format, width: number, height: number) =>
  Math.min(Math.ceil(GAME_COPY.minSide / Math.min(1, ratioOf(format))), largest(format, width, height).height);

/** Why a crop is not acceptable for an image of these dimensions, or "" if it is. */
export function cropError(width: number, height: number, crop: unknown): string {
  if (!crop || typeof crop !== "object") return "Missing frame";
  const c = crop as Record<string, unknown>;
  if (!isFormat(c.format)) return "Unsupported format";
  if (![c.x, c.y, c.width, c.height].every(v => typeof v === "number" && Number.isSafeInteger(v))) return "Invalid frame";
  const { x, y, width: w, height: h, format } = crop as Crop;
  if (c.mode !== undefined && (!isCropMode(c.mode) || format !== "4:5")) return "Unsupported fit";
  if (c.mode === "fit" || c.mode === "fit-width") {
    if (x !== 0 || y !== 0 || w !== width || h !== height || w < 1 || h < 1) return "Fit extends beyond the image";
    return c.mode === "fit-width" && h >= Math.round(w / GAME_COPY.viewRatio) ? "Fit extends beyond the image" : "";
  }
  const bounds = c.mode === "padded" ? paddedPhotoCanvas(width, height) : { width, height };
  if (w !== formatWidth(format, h)) return "Frame does not match the format " + format;
  if (x < 0 || y < 0 || h < minimumCropHeight(format, width, height)) return "Frame too small or outside the image";
  if (x + w > bounds.width || y + h > bounds.height) return "Frame outside the image";
  return "";
}

/** Dimensions of the copy made from a crop: the crop's format, longest side at most 1536 px (or `maxSide`, smaller, for a treated
 * SLOP), never enlarged. */
export function copyDimensions(crop: Pick<Crop, "width" | "height" | "format" | "mode">, maxSide: number = GAME_COPY.maxSide): { width: number; height: number } {
  const ratio = ratioOf(crop.format), side = Math.min(maxSide, GAME_COPY.maxSide);
  if (ratio >= 1) { const width = Math.min(crop.width, side); return { width, height: Math.max(1, Math.round(width / ratio)) }; }
  const height = Math.min(frameHeight(crop), side);
  return { width: Math.max(1, Math.round(height * ratio)), height };
}

/** Dimensions of the photograph inside the copy, before padding. */
export function copyContentDimensions(crop: Crop, size: { width: number; height: number }): { width: number; height: number } {
  if (crop.mode !== "fit" && crop.mode !== "fit-width") return size;
  const scale = Math.min(size.width / crop.width, size.height / crop.height, 1);
  return { width: Math.max(1, Math.round(crop.width * scale)), height: Math.max(1, Math.round(crop.height * scale)) };
}

/** Width of a 4:5 view of the given height. */
export const viewWidth = (height: number) => Math.round(height * GAME_COPY.viewRatio);
/** The largest 4:5 view centred in a copy of these dimensions. */
export function centredView(width: number, height: number): View {
  let h = Math.min(height, Math.floor(width / GAME_COPY.viewRatio));
  while (h > 1 && viewWidth(h) > width) h--;
  h = Math.max(h, 1);
  return { x: Math.floor((width - viewWidth(h)) / 2), y: Math.floor((height - h) / 2), height: h };
}
/** Why a view is not acceptable for a copy of these dimensions, or "" if it is. */
export function viewError(width: number, height: number, view: unknown): string {
  if (!view || typeof view !== "object") return "Missing initial view";
  const v = view as Record<string, unknown>;
  if (![v.x, v.y, v.height].every(n => typeof n === "number" && Number.isSafeInteger(n))) return "Invalid initial view";
  const { x, y, height: h } = view as View;
  if (x < 0 || y < 0 || h < Math.min(GAME_COPY.minSide, centredView(width, height).height)) return "Initial view too small or outside the copy";
  if (x + viewWidth(h) > width || y + h > height) return "Initial view outside the copy";
  return "";
}
/** The view if it still fits a copy of these dimensions, otherwise the centred one. */
export function fitView(view: View | null, width: number, height: number): View {
  return view && !viewError(width, height, view) ? view : centredView(width, height);
}

/** Parses «x,y,width,height,format[,fit|fit-width|padded]» (query string form). */
export function parseCrop(value: string | null): Crop | null {
  const match = value ? /^(\d{1,6}),(\d{1,6}),(\d{1,6}),(\d{1,6}),(\d{1,2}:\d{1,2})(?:,([a-z-]+))?$/.exec(value) : null;
  if (!match || !isFormat(match[5]) || (match[6] && !isCropMode(match[6]))) return null;
  return { x: Number(match[1]), y: Number(match[2]), width: Number(match[3]), height: Number(match[4]), format: match[5],
    ...(isCropMode(match[6]) ? { mode: match[6] } : {}) };
}
/** Parses «x,y,height» (query string form). */
export function parseView(value: string | null): View | null {
  if (!value || !/^\d{1,5},\d{1,5},\d{1,5}$/.test(value)) return null;
  const [x, y, height] = value.split(",").map(Number);
  return { x, y, height };
}
export const cropQuery = (c: Crop) => [c.x, c.y, c.width, c.height, c.format].join(",") + (c.mode ? `,${c.mode}` : "");
export const viewQuery = (v: View) => [v.x, v.y, v.height].join(",");

/** A stored crop of the current recipe, or null (absent, unreadable, or a 4:5 crop of shared/game-copy.ts). */
export function storedCrop(value: string | null): Crop | null {
  try { const crop = value ? JSON.parse(value) as Crop : null;
    return crop && crop.format === "4:5" && typeof crop.width === "number" &&
      (crop.mode === undefined || isCropMode(crop.mode)) ? crop : null; }
  catch { return null; }
}
export function storedView(value: string | null): View | null {
  try { const view = value ? JSON.parse(value) as View : null; return view && typeof view.height === "number" ? view : null; } catch { return null; }
}

/** The initial view as fractions of the copy, as the game sends it: the whole copy when there is no view (4:5 copies of v2). */
export function viewFractions(view: View | null, width: number | null, height: number | null) {
  if (!view || !width || !height) return { x: 0, y: 0, width: 1, height: 1 };
  const round = (n: number) => Math.round(n * 1e4) / 1e4;
  return { x: round(view.x / width), y: round(view.y / height), width: round(viewWidth(view.height) / width), height: round(view.height / height) };
}

/** Sizes asked to the image generator, per format (spec `copie-di-gioco`, section 2): multiples of 16, between 655,360
 * and 8,294,400 pixels, long side 1536. GPT Image 2, 2.5 and 2.6 accept custom sizes; the other models only the three standard
 * ones, so they are offered only 1:1, 3:2 and 2:3. */
export const GENERATION_SIZES: Record<Format, string> = {
  "4:5": "1232x1536", "3:2": "1536x1024", "2:3": "1024x1536", "4:3": "1536x1152", "3:4": "1152x1536", "16:9": "1536x864", "9:16": "864x1536", "1:1": "1536x1536",
};
const STANDARD: Partial<Record<Format, string>> = { "1:1": "1024x1024", "3:2": "1536x1024", "2:3": "1024x1536" };
export const customSizes = (model: string) => /^gpt-image-2(\.[56]-[a-z]+)?$/.test(model);
/** Formats a model can produce directly. */
export const formatsFor = (model: string): Format[] => customSizes(model) ? [...FORMATS] : ["3:2", "2:3", "1:1"];
/** Size to ask for a format: the format itself, or the nearest standard size where the model has only those. */
export function generationSize(model: string, format: Format): string {
  if (customSizes(model)) return GENERATION_SIZES[format];
  return STANDARD[format] || STANDARD[nearestFormat(ratioOf(format), 1, ["1:1", "3:2", "2:3"])]!;
}
