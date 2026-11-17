/** Game copies made in the owner's browser (spec `copie-di-gioco`; owner decision of 2026-11-16: the Worker handles what concerns
 * OpenAI, the browser everything else): 4:5 crop of the oriented original, size of the recipe, light treatment of a SLOP from its
 * source REAL (proposed or set with the sliders), WebP, measures; the Worker checks and stores the upload. */
import type { OwnerAcceptance } from "../shared/editorial";
import { centredCrop, copyDimensions, cropQuery, GAME_COPY, type Crop } from "../shared/game-copy";
import {
  gap, measure, METRICS_VERSION, settingsOf, treat, treatedLong, TREATMENT_VERSION, type Metrics, type Settings, type Treatment, type CopyStyle,
} from "../shared/copy-treatment";

const API = "/api/admin/library/";

export function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw Error("Canvas non disponibile");
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

/** What the treatment of a SLOP needs: the source REAL and its measures, the slot's Medium and Color, the seed, and the owner's
 * settings when chosen with the sliders (else proposed from the measures). */
export interface TreatmentPlan {
  off: boolean; seed: number; medium: string; color: string; sample: { metrics: Metrics }; settings?: Settings | null;
}

/** The crop of an oriented original drawn at the size of the copy (`side` long): the pixels the treatment starts from. */
export function drawBase(bitmap: ImageBitmap, frame: Crop, side: number): ImageData {
  const { width, height } = copyDimensions(frame, side), { context } = canvasOf(width, height);
  context.drawImage(bitmap, frame.x, frame.y, frame.width, frame.height, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}
/** The original oriented, cut along `crop` (centred 4:5 if absent) and drawn at the size of the copy. */
export async function basePixels(source: Blob, crop: Crop | undefined, long: (frame: Crop) => number): Promise<{ pixels: ImageData; frame: Crop; long: number }> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const frame = crop || centredCrop(bitmap.width, bitmap.height), side = long(frame);
    return { pixels: drawBase(bitmap, frame, side), frame, long: side };
  } finally { bitmap.close(); }
}
/** Long side of a copy: the recipe's, or for a treated SLOP the owner's or the one proposed from the source REAL. */
export const longOf = (frame: Crop, plan?: TreatmentPlan | null) => {
  const cropLong = Math.max(frame.width, frame.height);
  return !plan || plan.off ? GAME_COPY.maxSide : plan.settings ? Math.min(plan.settings.long, cropLong, GAME_COPY.maxSide)
    : treatedLong(plan.sample.metrics.long, cropLong, GAME_COPY.maxSide);
};

/** The treated pixels with the intermediate JPEG of a photo that has travelled, on a canvas; the applied values. */
export async function treatedCanvas(base: ImageData, plan: TreatmentPlan) {
  const { width, height } = base;
  const { rgba, applied } = treat(base.data, width, height, plan.sample.metrics, plan.medium, plan.color, plan.seed, plan.settings || undefined);
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
  const { pixels, frame, long } = await basePixels(source, crop, f => longOf(f, plan));
  let canvas: HTMLCanvasElement;
  let treatment: Treatment | null = plan ? { version: TREATMENT_VERSION, off: plan.off, seed: plan.seed, long, medium: plan.medium, color: plan.color,
    sample: plan.sample, ...(plan.settings ? { settings: { ...plan.settings, long: plan.off ? plan.settings.long : long } } : {}) } : null;
  if (plan && !plan.off) {
    const done = await treatedCanvas(pixels, plan);
    canvas = done.canvas; treatment = { ...treatment!, applied: done.applied };
  } else {
    ({ canvas } = canvasOf(pixels.width, pixels.height));
    canvas.getContext("2d")!.putImageData(pixels, 0, 0);
  }
  const copy = await blobOf(canvas, GAME_COPY.mime, GAME_COPY.quality);
  if (!copy || copy.type !== GAME_COPY.mime) throw Error("Questo browser non esporta WebP: usare Chrome, Edge o Firefox");
  if (copy.size > GAME_COPY.maxBytes) throw Error("Copia di gioco oltre 4 MB");
  const metrics = await measureBlob(copy);
  if (treatment && !treatment.off) treatment = { ...treatment, result: metrics, gap: gap(metrics, plan!.sample.metrics) };
  return { copy, metrics, treatment, frame };
}

/** The stored original of a library image. */
export async function originalOf(imageId: string): Promise<Blob> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Immagine non valida");
  const response = await fetch(API + encodeURIComponent(imageId) + "/original", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw Error("Originale non disponibile");
  return response.blob();
}

/** Items of the library a treatment plan is built from. */
export interface TreatableItem {
  id: string; origin: string;
  generation?: { slot?: { copy_style?: CopyStyle; target_metrics?: Metrics | null; acceptance?: OwnerAcceptance } | null } | null;
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
  return { off: asked.off ?? (asked.settings ? false : stored?.off || false), seed: stored?.seed ?? randomSeed(),
    color: item.generation?.slot?.copy_style?.color || stored?.color || "",
    medium: item.generation?.slot?.copy_style?.medium || stored?.medium || "", sample: {metrics}, settings };
}
/** The settings a plan gives on these pixels: the owner's, or the proposal (what the sliders start from). */
export function proposalOf(base: ImageData, plan: TreatmentPlan, long: number): Settings {
  const { applied } = treat(base.data, base.width, base.height, plan.sample.metrics, plan.medium, plan.color, plan.seed);
  return settingsOf(applied, long);
}

/** Encodes `source` (or the stored original) along `crop` (centred 4:5 if absent) with the treatment of `plan` for a SLOP, and stores
 * it as the game copy of library image `imageId`; `force` stores it even with the same crop and treatment. Returns the item. */
export async function prepareLibraryCopy<T>(imageId: string, source?: Blob, crop?: Crop, plan?: TreatmentPlan | null, force = false): Promise<T> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Immagine non valida");
  const file = source || await originalOf(imageId);
  const { copy, metrics, treatment, frame } = await encodeGameCopy(file, crop, plan);
  const headers: Record<string, string> = { "Content-Type": GAME_COPY.mime, "X-Copy-Metrics": JSON.stringify(metrics) };
  if (treatment) headers["X-Copy-Treatment"] = JSON.stringify(treatment);
  const upload = await fetch(API + encodeURIComponent(imageId) + "/copy?" + new URLSearchParams({ crop: cropQuery(frame), ...(force ? { force: "1" } : {}) }),
    { method: "POST", credentials: "same-origin", headers, body: copy });
  const result = await upload.json().catch(() => ({})) as T & { error?: string };
  if (!upload.ok) throw Error(result.error || "Copia di gioco non registrata");
  return result;
}

/** The copy of a library item along `crop` (its stored crop, else centred) with its treatment: the plan of a SLOP is found first. */
export async function prepareItemCopy<T>(item: TreatableItem, crop?: Crop, asked: { off?: boolean; settings?: Settings | null; force?: boolean } = {}): Promise<T> {
  return prepareLibraryCopy<T>(item.id, undefined, crop || item.copy?.crop || undefined, await treatmentPlan(item, asked), asked.force);
}

/** Saves the owner's choice from the frame editor: a new copy when the crop changed; the same item when it did not. */
export async function saveFrame<T>(item: T & TreatableItem, choice: { crop: Crop }): Promise<T> {
  const same = item.copy?.crop && JSON.stringify(item.copy.crop) === JSON.stringify(choice.crop);
  return same ? item : prepareItemCopy<T>(item, choice.crop);
}

/** «Rifai la copia di gioco» for a selection, in this page, one image at a time; the page must stay open. */
export async function remakeCopies(items: TreatableItem[], progress: (text: string) => void): Promise<{ done: number; failed: { id: string; error: string }[] }> {
  let done = 0;
  const failed: { id: string; error: string }[] = [];
  for (const [index, item] of items.entries()) {
    progress(`Copie in preparazione in questa pagina: ${index + 1} di ${items.length}. Non chiuderla.`);
    try {
      const response = await fetch(API + encodeURIComponent(item.id), { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw Error("Immagine non trovata");
      let fresh = await response.json() as TreatableItem & { status: string };
      if (fresh.status === "published") {
        const withdrawn = await fetch(API + encodeURIComponent(item.id) + "/withdraw", { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" }, body: "{}" });
        if (!withdrawn.ok) throw Error("Ritiro dal gioco non riuscito");
        fresh = await withdrawn.json() as typeof fresh;
      }
      // Made again even with the same crop and treatment (a copy of an earlier recipe).
      await prepareItemCopy(fresh, undefined, { force: true });
      done++;
    } catch (error) { failed.push({ id: item.id, error: error instanceof Error ? error.message : String(error) }); }
  }
  return { done, failed };
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

