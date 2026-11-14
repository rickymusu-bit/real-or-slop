/** Game copy made in the owner's browser (spec `copie-di-gioco`, sections 3 and 4): crop, scale, treatment of a SLOP towards its
 * «REAL campione», WebP encoding, measures of the copy, upload to the library; saving «Inquadratura» makes a new copy only when the
 * crop changed. Copies without measures are measured when the dashboard opens. */
import { centredCrop, copyDimensions, cropQuery, GAME_COPY, viewQuery, type Crop, type View } from "../shared/game-copy";
import { gap, measure, treat, treatedLong, TREATMENT_VERSION, type Metrics, type Treatment } from "../shared/copy-treatment";

const API = "/api/admin/library/";

function canvasOf(width: number, height: number) {
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

/** Measures of an encoded image (the copy as the player will see it). */
export async function measureBlob(blob: Blob): Promise<Metrics> {
  const bitmap = await createImageBitmap(blob);
  try {
    const { context } = canvasOf(bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    return measure(context.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height);
  } finally { bitmap.close(); }
}

/** What the treatment of a SLOP needs before the pixels: the sample, its measures, the slot's Medium and Color, the seed. */
export interface TreatmentPlan { off: boolean; seed: number; medium: string; color: string; sample: { id: string; metrics: Metrics } }

export async function encodeGameCopy(source: Blob, crop?: Crop, plan?: TreatmentPlan): Promise<{ copy: Blob; metrics: Metrics; treatment: Treatment | null }> {
  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    const frame = crop || centredCrop(bitmap.width, bitmap.height);
    const long = plan && !plan.off ? treatedLong(plan.sample.metrics.long, Math.max(frame.width, frame.height), GAME_COPY.maxSide) : GAME_COPY.maxSide;
    const { width, height } = copyDimensions(frame, long);
    let { canvas, context } = canvasOf(width, height);
    context.drawImage(bitmap, frame.x, frame.y, frame.width, frame.height, 0, 0, width, height);
    let treatment: Treatment | null = plan ? { version: TREATMENT_VERSION, off: plan.off, seed: plan.seed, long, medium: plan.medium, color: plan.color, sample: plan.sample } : null;
    if (plan && !plan.off) {
      const { rgba, applied } = treat(context.getImageData(0, 0, width, height).data, width, height, plan.sample.metrics, plan.medium, plan.color, plan.seed);
      context.putImageData(new ImageData(rgba, width, height), 0, 0);
      // The intermediate JPEG compression of a photo that has travelled, then the recipe of every copy.
      const jpeg = await blobOf(canvas, "image/jpeg", applied.jpeg);
      if (jpeg) {
        const decoded = await createImageBitmap(jpeg);
        ({ canvas, context } = canvasOf(width, height));
        context.drawImage(decoded, 0, 0); decoded.close();
      }
      treatment = { ...treatment!, applied };
    }
    const copy = await blobOf(canvas, GAME_COPY.mime, GAME_COPY.quality);
    if (!copy || copy.type !== GAME_COPY.mime) throw Error("Questo browser non esporta WebP: usare Chrome, Edge o Firefox");
    if (copy.size > GAME_COPY.maxBytes) throw Error("Copia di gioco oltre 4 MB");
    const metrics = await measureBlob(copy);
    if (treatment && !treatment.off) treatment = { ...treatment, result: metrics, gap: gap(metrics, plan!.sample.metrics) };
    return { copy, metrics, treatment };
  } finally { bitmap.close(); }
}

/** The stored original of a library image. */
export async function originalOf(imageId: string): Promise<Blob> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Immagine non valida");
  const response = await fetch(API + encodeURIComponent(imageId) + "/original", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw Error("Originale non disponibile");
  return response.blob();
}

interface Sample { id: string; metrics: Metrics | null; tags: string[]; categories: Record<string, string> }
async function sampleOf(id: string): Promise<Sample | null> {
  const response = await fetch(API + encodeURIComponent(id), { credentials: "same-origin", cache: "no-store" });
  return response.ok ? await response.json() as Sample : null;
}
/** Items of the library a treatment plan is built from. */
export interface TreatableItem {
  id: string; origin: string; tags?: string[]; categories?: Record<string, string>;
  generation?: { slot?: { tags?: Record<string, string>; sample?: string | null } | null; group?: string | null } | null;
  treatment?: Treatment | null; group?: { key: string } | null;
}
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;

/** The plan for a SLOP: the stored treatment if there is one (same sample, same seed), otherwise the slot's «REAL campione», otherwise
 * a REAL of its group picked at random. `change` picks another sample of the group; `off` turns the treatment off or on. Null for a
 * REAL, or for a SLOP whose group has no measured REAL. */
export async function treatmentPlan(item: TreatableItem, options: { change?: boolean; off?: boolean } = {}): Promise<TreatmentPlan | null> {
  if (item.origin !== "SLOP") return null;
  const stored = item.treatment, slot = item.generation?.slot;
  const medium = stored?.medium || slot?.tags?.medium || "", color = stored?.color || slot?.tags?.color || "";
  const off = options.off ?? stored?.off ?? false;
  if (stored && !options.change) return { off, seed: stored.seed, medium, color, sample: stored.sample };
  const wantedId = !options.change ? slot?.sample : null;
  let sample = wantedId ? await sampleOf(wantedId) : null;
  if (!sample?.metrics) {
    const group = item.generation?.group || item.group?.key;
    if (!group) return null;
    const list = await fetch(API + "?status=library&origin=REAL&group=" + encodeURIComponent(group), { credentials: "same-origin", cache: "no-store" });
    const items = list.ok ? ((await list.json()) as { items: Sample[] }).items.filter(i => i.metrics && i.id !== stored?.sample.id) : [];
    const fitting = items.filter(i => (!medium || i.tags.includes(medium)) && (!color || i.tags.includes(color)));
    const pool = fitting.length ? fitting : items;
    sample = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  if (!sample?.metrics) return null;
  return { off, seed: randomSeed(), medium, color, sample: { id: sample.id, metrics: sample.metrics } };
}

/** Encodes `source` (or, without it, the stored original) along `crop` (nearest format, centred, without it), with the treatment of
 * `plan` for a SLOP, and stores it as the game copy of library image `imageId`. Returns the item. */
export async function prepareLibraryCopy<T>(imageId: string, source?: Blob, crop?: Crop, view?: View, plan?: TreatmentPlan | null): Promise<T> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Immagine non valida");
  const file = source || await originalOf(imageId);
  const { copy, metrics, treatment } = await encodeGameCopy(file, crop, plan || undefined);
  const query = new URLSearchParams();
  if (crop) query.set("crop", cropQuery(crop));
  if (view) query.set("view", viewQuery(view));
  const headers: Record<string, string> = { "Content-Type": GAME_COPY.mime, "X-Copy-Metrics": JSON.stringify(metrics) };
  if (treatment) headers["X-Copy-Treatment"] = JSON.stringify(treatment);
  const upload = await fetch(API + encodeURIComponent(imageId) + "/copy" + (query.size ? "?" + query : ""),
    { method: "POST", credentials: "same-origin", headers, body: copy });
  const result = await upload.json().catch(() => ({})) as T & { error?: string };
  if (!upload.ok) throw Error(result.error || "Copia di gioco non registrata");
  return result;
}

/** The copy of a library item with its treatment: the plan of a SLOP is found first (free reads). */
export async function prepareItemCopy<T>(item: TreatableItem, source?: Blob, crop?: Crop, options: { change?: boolean; off?: boolean } = {}): Promise<T> {
  return prepareLibraryCopy<T>(item.id, source, crop, undefined, await treatmentPlan(item, options));
}

/** Saves the owner's choice from the frame editor: a new copy when the crop changed; the same item when it did not. */
export async function saveFrame<T>(item: T & TreatableItem & { copy: { crop: Crop | null } | null }, choice: { crop: Crop }): Promise<T> {
  const same = item.copy?.crop && JSON.stringify(item.copy.crop) === JSON.stringify(choice.crop);
  return same ? item : prepareItemCopy<T>(item, undefined, choice.crop);
}

/** Measures the copies that have none (copies made before the measures existed), one at a time, from the copy itself. Free. */
export async function measureMissing(items: { id: string; metrics?: Metrics | null; copy?: { sha256: string | null } | null }[]): Promise<number> {
  let done = 0;
  for (const item of items) {
    if (item.metrics || !item.copy?.sha256) continue;
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
