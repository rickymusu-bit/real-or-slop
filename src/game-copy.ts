/** Game copies made in the owner's browser (spec `copie-di-gioco`; owner decision of 2026-11-16: the Worker handles what concerns
 * OpenAI, the browser everything else): 4:5 crop of the oriented original, size of the recipe, light treatment of a SLOP from its
 * source REAL (proposed or set with the sliders), WebP, measures; the Worker checks and stores the upload. */
import type { OwnerAcceptance } from "../shared/editorial";
import { copyContentDimensions, copyDimensions, cropQuery, frameLongSide, GAME_COPY, paddedPhotoCanvas, wholePhotoFrame, type Crop } from "../shared/game-copy";
import {
  gap, measure, METRICS_VERSION, monochromeOf, SETTING_LIMITS, settingsOf, treat, treatedLong, TREATMENT_VERSION, type Metrics, type Monochrome,
  type Settings, type Treatment,
} from "../shared/copy-treatment";

const API = "/api/admin/library/";

export function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw Error("Canvas unavailable");
  context.fillStyle = "#fff"; context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  return { canvas, context };
}
const blobOf = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));

/** Pixels of an encoded image. */
async function pixelsOf(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob);
  try {
    const { context } = canvasOf(bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally { bitmap.close(); }
}
/** Measures of an encoded image (the copy as the player will see it). */
export async function measureBlob(blob: Blob): Promise<Metrics> {
  const pixels = await pixelsOf(blob);
  return measure(pixels.data, pixels.width, pixels.height);
}

/** What the treatment of a SLOP needs: the measures of the source REAL, the black and white, sepia or colour they give, the seed, and
 * the owner's settings when chosen with the sliders (else proposed from the measures). */
export interface TreatmentPlan {
  off: boolean; seed: number; monochrome: Monochrome; sample: { metrics: Metrics }; settings?: Settings | null;
}

/** Draws the part of the original selected by the frame, leaving the bands for composition after treatment. */
export function drawBase(bitmap: ImageBitmap, frame: Crop, side: number) {
  const size = copyDimensions(frame, side);
  const content = copyContentDimensions(frame, size);
  let source = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
  let area = { ...content, x: Math.floor((size.width - content.width) / 2), y: Math.floor((size.height - content.height) / 2) };
  if (frame.mode === "padded") {
    const canvas = paddedPhotoCanvas(bitmap.width, bitmap.height);
    const left = Math.max(frame.x, canvas.x), top = Math.max(frame.y, canvas.y);
    const right = Math.min(frame.x + frame.width, canvas.x + bitmap.width), bottom = Math.min(frame.y + frame.height, canvas.y + bitmap.height);
    const pixelX = (x: number) => Math.round((x - frame.x) * size.width / frame.width);
    const pixelY = (y: number) => Math.round((y - frame.y) * size.height / frame.height);
    source = { x: left - canvas.x, y: top - canvas.y, width: right - left, height: bottom - top };
    area = { x: pixelX(left), y: pixelY(top), width: Math.max(0, pixelX(right) - pixelX(left)), height: Math.max(0, pixelY(bottom) - pixelY(top)) };
  }
  const visible = area.width > 0 && area.height > 0;
  const { canvas, context } = canvasOf(visible ? area.width : 1, visible ? area.height : 1);
  if (visible) context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, area.width, area.height);
  return { pixels: context.getImageData(0, 0, canvas.width, canvas.height), area, size };
}
/** Letterbox the picture after any treatment so the bands stay black. */
export function frameCanvas(picture: HTMLCanvasElement, base: ReturnType<typeof drawBase>): HTMLCanvasElement {
  const { area, size: { width, height } } = base;
  if (area.width === width && area.height === height) return picture;
  const { canvas, context } = canvasOf(width, height);
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  if (area.width && area.height) context.drawImage(picture, area.x, area.y);
  return canvas;
}
/** The oriented original, fitted whole by default, drawn at the size of the picture inside the copy. */
export async function basePixels(source: Blob, crop: Crop | undefined, long: (frame: Crop) => number) {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const frame = crop || wholePhotoFrame(bitmap.width, bitmap.height), side = long(frame);
    return { base: drawBase(bitmap, frame, side), frame, long: side };
  } finally { bitmap.close(); }
}
/** Long side of a copy: the recipe's, or for a treated SLOP the owner's or the one proposed from the source REAL. */
const fitSettingsLong = (asked: number, limit: number) =>
  Math.max(Math.min(SETTING_LIMITS.long.min, limit), Math.min(asked, limit, GAME_COPY.maxSide));
export const longOf = (frame: Crop, plan?: TreatmentPlan | null) => {
  const cropLong = frameLongSide(frame);
  return !plan || plan.off ? GAME_COPY.maxSide : plan.settings ? fitSettingsLong(plan.settings.long, cropLong)
    : treatedLong(plan.sample.metrics.long, cropLong, GAME_COPY.maxSide);
};

/** The treated pixels with the intermediate JPEG of a photo that has travelled, on a canvas; the applied values. */
export async function treatedCanvas(base: ImageData, plan: TreatmentPlan) {
  const { width, height } = base;
  const { rgba, applied } = treat(base.data, width, height, plan.sample.metrics, plan.seed, plan.settings || undefined, plan.monochrome);
  let { canvas, context } = canvasOf(width, height);
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  const jpeg = await blobOf(canvas, "image/jpeg", applied.jpeg);
  if (jpeg) {
    const decoded = await createImageBitmap(jpeg);
    ({ canvas, context } = canvasOf(width, height));
    context.drawImage(decoded, 0, 0); decoded.close();
  }
  return { canvas, applied };
}

export async function encodeGameCopy(source: Blob, crop?: Crop, plan?: TreatmentPlan | null): Promise<{ copy: Blob; metrics: Metrics; treatment: Treatment | null; frame: Crop }> {
  const { base, frame, long } = await basePixels(source, crop, f => longOf(f, plan));
  const { pixels } = base;
  let canvas: HTMLCanvasElement;
  let treatment: Treatment | null = plan ? { version: TREATMENT_VERSION, off: plan.off, seed: plan.seed, long, sample: plan.sample, ...(plan.settings ? { settings: { ...plan.settings, long: fitSettingsLong(plan.settings.long, frameLongSide(frame)) } } : {}) } : null;
  if (plan && !plan.off) {
    const done = await treatedCanvas(pixels, plan);
    canvas = done.canvas; treatment = { ...treatment!, applied: done.applied };
  } else {
    ({ canvas } = canvasOf(pixels.width, pixels.height));
    canvas.getContext("2d")!.putImageData(pixels, 0, 0);
  }
  const copy = await blobOf(frameCanvas(canvas, base), GAME_COPY.mime, GAME_COPY.quality);
  if (!copy || copy.type !== GAME_COPY.mime) throw Error("This browser cannot export WebP: use Chrome, Edge or Firefox");
  if (copy.size > GAME_COPY.maxBytes) throw Error("Game copy exceeds 4 MB");
  const metrics = await measureBlob(copy);
  if (treatment && !treatment.off) treatment = { ...treatment, result: metrics, gap: gap(metrics, plan!.sample.metrics) };
  return { copy, metrics, treatment, frame };
}

/** The stored original of a library image. */
export async function originalOf(imageId: string): Promise<Blob> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Invalid image");
  const response = await fetch(API + encodeURIComponent(imageId) + "/original", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw Error("Original unavailable");
  return response.blob();
}

/** Items of the library a treatment plan is built from. */
export interface TreatableItem {
  id: string; origin: string;
  /** `copy_style` only in SLOP generated before 1.50.0, with the Colour tag of the source REAL. */
  generation?: { slot?: { copy_style?: { color?: string }; target_metrics?: Metrics | null; acceptance?: OwnerAcceptance } | null } | null;
  treatment?: Treatment | null;
  copy?: { crop: Crop | null } | null;
}
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
/** The plan of a SLOP: its source REAL's measures; the stored seed, on/off and the owner's settings are kept unless asked otherwise
 * (`settings` null goes back to the proposal). Null for a REAL, or for a SLOP whose source REAL has no measures (untreated copy). */
export async function treatmentPlan(listed: TreatableItem, asked: { off?: boolean; settings?: Settings | null } = {}): Promise<TreatmentPlan | null> {
  if (listed.origin !== "SLOP") return null;
  // The current state of the SLOP, not the one of a list loaded earlier: source REAL and stored treatment may have changed.
  const read = async <R>(id: string) => {
    const response = await fetch(API + encodeURIComponent(id), { credentials: "same-origin", cache: "no-store" });
    return response.ok ? await response.json() as R : null;
  };
  const item = await read<TreatableItem>(listed.id) || listed;
  const stored = item.treatment, metrics = stored?.sample.metrics || item.generation?.slot?.target_metrics;
  if (!metrics) return null;
  const settings = asked.settings !== undefined ? asked.settings : stored && stored.version >= 4 ? stored.settings || null : null;
  // Measures taken before the residual chroma existed keep the Colour tag their record had (spec `copie-di-gioco`).
  const legacy = item.generation?.slot?.copy_style?.color || stored?.color || "";
  return { off: asked.off ?? (asked.settings ? false : stored?.off || false), seed: stored?.seed ?? randomSeed(),
    monochrome: monochromeOf(metrics, legacy), sample: {metrics}, settings };
}
/** The settings a plan gives on these pixels: the owner's, or the proposal (what the sliders start from). */
export function proposalOf(base: ImageData, plan: TreatmentPlan, long: number): Settings {
  const { applied } = treat(base.data, base.width, base.height, plan.sample.metrics, plan.seed, undefined, plan.monochrome);
  return settingsOf(applied, long);
}

/** Encodes `source` (or the stored original) along `crop` (whole photo by default) with the treatment of `plan` for a SLOP, and stores
 * it as the game copy of library image `imageId`; `force` stores it even with the same crop and treatment. Returns the item. */
export async function prepareLibraryCopy<T>(imageId: string, source?: Blob, crop?: Crop, plan?: TreatmentPlan | null, force = false, ifMissing = false): Promise<T> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Invalid image");
  const file = source || await originalOf(imageId);
  const { copy, metrics, treatment, frame } = await encodeGameCopy(file, crop, plan);
  const headers: Record<string, string> = { "Content-Type": GAME_COPY.mime, "X-Copy-Metrics": JSON.stringify(metrics) };
  if (treatment) headers["X-Copy-Treatment"] = JSON.stringify(treatment);
  const upload = await fetch(API + encodeURIComponent(imageId) + "/copy?" + new URLSearchParams({ crop: cropQuery(frame), ...(force ? { force: "1" } : {}), ...(ifMissing ? { if_missing: "1" } : {}) }),
    { method: "POST", credentials: "same-origin", headers, body: copy });
  const result = await upload.json().catch(() => ({})) as T & { error?: string };
  if (!upload.ok) throw Error(result.error || "Game copy was not saved");
  return result;
}

/** The copy of a library item with its treatment, using the chosen frame, the stored frame or the whole photo. */
export async function prepareItemCopy<T>(item: TreatableItem, crop?: Crop, asked: { off?: boolean; settings?: Settings | null; force?: boolean; ifMissing?: boolean } = {}): Promise<T> {
  return prepareLibraryCopy<T>(item.id, undefined, crop || item.copy?.crop || undefined, await treatmentPlan(item, asked), asked.force, asked.ifMissing);
}

/** Saves the owner's choice from the frame editor: a new copy when the crop changed; the same item when it did not. */
export async function saveFrame<T>(item: T & TreatableItem, choice: { crop: Crop }): Promise<T> {
  const same = item.copy?.crop && cropQuery(item.copy.crop) === cropQuery(choice.crop);
  return same ? item : prepareItemCopy<T>(item, choice.crop);
}

/** Measures the copies that have no measures of the current version, one at a time, from the copy itself. Free. */
export async function measureMissing(items: { id: string; metrics?: Metrics | null; copy?: { sha256: string | null } | null }[]): Promise<number> {
  let done = 0;
  for (const item of items) {
    if (item.metrics?.v === METRICS_VERSION || !item.copy?.sha256) continue;
    try {
      const response = await fetch(API + encodeURIComponent(item.id) + "/file", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) continue;
      const metrics = await measureBlob(await response.blob());
      const saved = await fetch(API + encodeURIComponent(item.id) + "/metrics", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metrics, sha256: item.copy.sha256 }) });
      if (saved.ok) { item.metrics = metrics; done++; }
    } catch { /* the next opening tries again */ }
  }
  return done;
}

