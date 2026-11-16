/** Game copies from the dashboard: the browser only chooses the crop and asks; the Worker makes the copy (crop, size, treatment of a
 * SLOP, WebP, measures: worker/copy-maker.ts), owner decision of 2026-11-15: every long photo processing runs on Cloudflare. */
import { cropQuery, type Crop } from "../shared/game-copy";
import type { Settings, Treatment } from "../shared/copy-treatment";

const API = "/api/admin/library/";

/** The stored original of a library image, shown by the frame editor. */
export async function originalOf(imageId: string): Promise<Blob> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Immagine non valida");
  const response = await fetch(API + encodeURIComponent(imageId) + "/original", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw Error("Originale non disponibile");
  return response.blob();
}

/** Items of the library whose copy can be asked for. */
export interface TreatableItem { id: string; origin: string; treatment?: Treatment | null }

/** Asks the Worker for the copy of `imageId`: along `crop` (the stored 4:5 crop, else centred, if absent), with the treatment of a
 * SLOP turned off or on (`off`) or set by the owner (`settings`, null for the proposal), made again even if unchanged (`force`).
 * Returns the item. */
export async function requestCopy<T>(imageId: string, options: { crop?: Crop; off?: boolean; settings?: Settings | null; force?: boolean } = {}): Promise<T> {
  if (!/^[\w-]{1,64}$/.test(imageId)) throw Error("Immagine non valida");
  const body: Record<string, unknown> = {};
  if (options.crop) body.crop = cropQuery(options.crop);
  if (options.off !== undefined || options.settings !== undefined)
    body.treatment = { ...(options.off !== undefined ? { off: options.off } : {}), ...(options.settings !== undefined ? { settings: options.settings } : {}) };
  if (options.force) body.force = true;
  const response = await fetch(API + encodeURIComponent(imageId) + "/copy", { method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw Error(result.error || "Copia di gioco non preparata");
  return result;
}

/** The copy of a library item (a fallback: the Worker makes it when the image enters the library). */
export const prepareItemCopy = <T>(item: TreatableItem, crop?: Crop, options: { off?: boolean; settings?: Settings | null } = {}) => requestCopy<T>(item.id, { crop, ...options });

/** Saves the owner's choice from the frame editor: a new copy when the crop changed; the same item when it did not. */
export async function saveFrame<T>(item: T & TreatableItem & { copy: { crop: Crop | null } | null }, choice: { crop: Crop }): Promise<T> {
  const same = item.copy?.crop && JSON.stringify(item.copy.crop) === JSON.stringify(choice.crop);
  return same ? item : requestCopy<T>(item.id, { crop: choice.crop });
}

/** «Rifai la copia di gioco» for a selection: a job on Cloudflare; resolves when it ends, reporting progress meanwhile. */
export async function remakeCopies(ids: string[], progress: (text: string) => void): Promise<{ done: number; failed: { id: string; error: string }[] }> {
  const call = async <R>(path: string, body?: unknown): Promise<R> => {
    const response = await fetch(API + path, { method: body === undefined ? "GET" : "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => ({})) as R & { error?: string };
    if (!response.ok) throw Error(data.error || "Richiesta non riuscita");
    return data;
  };
  const { job } = await call<{ job: string }>("copies", { ids });
  for (;;) {
    progress(`Copie in preparazione sul server (${ids.length})…`);
    await new Promise(resolve => window.setTimeout(resolve, 1500));
    const state = await call<{ status: string; output: { done: number; failed: { id: string; error: string }[] } | null; error: string | null }>("copies/" + job);
    if (state.status === "complete" && state.output) return state.output;
    if (["errored", "terminated"].includes(state.status)) throw Error("Copie non completate sul server" + (state.error ? ": " + state.error : ""));
  }
}
