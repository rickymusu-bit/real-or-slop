import { escape } from "../shared/html";
import { INDICATION_KEYS, VISUAL_INDICATIONS, VISUAL_KEYS, VISUAL_SECTIONS, type VisualDescription } from "../shared/real-description";
import { withPhotoProcessing } from "./photo-processing";

type RequestItem<T> = (path: string, options: RequestInit) => Promise<T>;
interface Target { id: string; title: string }

export function visualDescription(description: VisualDescription): string {
  return `<details class="editorial-description" data-visual-description><summary>Visual description</summary>
    <dl>${VISUAL_KEYS.filter(key => description.sections[key]).map(key => `<dt>${VISUAL_SECTIONS[key]}</dt>
      <dd lang="en">${escape(description.sections[key])}</dd>`).join("")}</dl>
    <h4>Scene indicators</h4><dl>${INDICATION_KEYS.map(key => `<dt>${VISUAL_INDICATIONS[key]}</dt>
      <dd>${description.indications[key].applies ? "Yes" : "No"}. <span lang="en">${escape(description.indications[key].reason)}</span></dd>`).join("")}</dl>
    <p class="hint">Generated with ${escape(description.model)}</p></details>`;
}

interface DescriptionState {
  images: { id: string; title: string; described: boolean; job: { id: string; state: string; error: string } | null }[];
}
const ACTIVE_DESCRIPTION = new Set(["queued", "dispatching", "working"]);
async function preparationRequest<T>(galleryId: string, path: string, data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/pipeline/${encodeURIComponent(galleryId)}/${path}`, {
      method: data === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch { throw Error("Cannot read server progress. Queued work continues on the server; reopen this page to check it without repeating paid calls."); }
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Cannot read server progress");
  return result as T;
}

/** Only status reads and saved image reads depend on this page. Every paid request is dispatched by a server Workflow. */
async function followDescriptions<T>(targets: Target[], galleryId: string, request: RequestItem<T>, saved?: (item: T) => void) {
  return withPhotoProcessing("Describing REAL on the server. You can switch tabs or close this page.", async progress => {
    const remaining = new Map(targets.map(item => [item.id, item]));
    const failures: string[] = [];
    let done = 0;
    while (remaining.size) {
      const state = await preparationRequest<DescriptionState>(galleryId, "descriptions");
      const byId = new Map(state.images.map(item => [item.id, item]));
      for (const [id, target] of remaining) {
        const photo = byId.get(id);
        if (photo?.described) {
          const updated = await request(`/${encodeURIComponent(id)}`, {});
          saved?.(updated); done++; remaining.delete(id);
        } else if (!photo?.job || !ACTIVE_DESCRIPTION.has(photo.job.state)) {
          failures.push(`${target.title}: ${photo?.job?.error || "Photo unavailable or no description job is queued."}`);
          remaining.delete(id);
        }
      }
      progress(`${done} of ${targets.length} REAL described; ${remaining.size} pending on the server. You can switch tabs or close this page.`);
      if (remaining.size) await new Promise<void>(resolve => window.setTimeout(resolve, 1000));
    }
    return `${done} of ${targets.length} REAL described.` + (failures.length ? ` Not described: ${failures.join(" / ")}` : "");
  });
}

export async function describePhotos<T>(targets: Target[], galleryId: string, request: RequestItem<T>, saved?: (item: T) => void) {
  if (!targets.length) return null;
  const state = await preparationRequest<DescriptionState>(galleryId, "descriptions");
  const byId = new Map(state.images.map(item => [item.id, item]));
  const missing = targets.filter(item => {
    const photo = byId.get(item.id);
    return photo && !photo.described && (!photo.job || !ACTIVE_DESCRIPTION.has(photo.job.state));
  });
  const count = missing.length;
  if (count) {
    if (!window.confirm(`Describe ${count === 1 ? "this REAL" : count + " REAL"} and prepare SLOP parameters? ` +
      `Maximum ${count} paid ${count === 1 ? "call" : "calls"}, one per photo. The batch continues on the server when you leave this page.`)) return null;
    await preparationRequest(galleryId, "prepare", { confirm: true, request: crypto.randomUUID(), ids: missing.map(item => item.id), max_calls: count });
  }
  return followDescriptions(targets, galleryId, request, saved);
}

/** Returning to an import observes the existing work without asking for or sending another paid request. */
export async function resumePhotoDescriptions<T>(targets: Target[], galleryId: string, request: RequestItem<T>, saved?: (item: T) => void) {
  if (!targets.length) return null;
  const state = await preparationRequest<DescriptionState>(galleryId, "descriptions");
  const ids = new Set(targets.map(item => item.id));
  const pending = state.images.filter(photo => ids.has(photo.id) && !photo.described && photo.job);
  if (!pending.length) return null;
  return followDescriptions(pending, galleryId, request, saved);
}
