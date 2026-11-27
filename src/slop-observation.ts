/** Gallery observation uses the existing persistent pipeline, including already published SLOP. */
import { withPhotoProcessing } from "./photo-processing";

export interface ObservationState {
  images: { id: string; observed: boolean; job: { id: string; state: string; error: string } | null }[];
}
const ACTIVE = new Set(["queued", "dispatching", "working"]);
async function request<T>(gallery: string, path: string, data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin/pipeline/${encodeURIComponent(gallery)}/${path}`, {
      method: data === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch { throw Error("Cannot read server progress. Work may continue on the server; reopen the gallery without repeating paid calls."); }
  const value = await response.json();
  if (!response.ok) throw Error(value.error || "Cannot read server progress");
  return value as T;
}
export const observationState = (gallery: string) => request<ObservationState>(gallery, "observations");

/** Resume only follows active jobs. No confirmation or paid submission is made when returning to the gallery. */
export async function observeSlops(gallery: string, ids?: string[], resume = false): Promise<string | null> {
  const state = await observationState(gallery), selected = ids ? new Set(ids) : null;
  const targets = state.images.filter(photo => !photo.observed && (!selected || selected.has(photo.id))
    && (!resume || (photo.job && ACTIVE.has(photo.job.state))));
  if (!targets.length) return resume ? null : "All selected SLOP have observed parameters.";
  const missing = resume ? [] : targets.filter(photo => !photo.job);
  if (missing.length && !window.confirm(`Observe parameters from ${missing.length} full SLOP original${missing.length === 1 ? "" : "s"}? ` +
    `Maximum ${missing.length} paid ${missing.length === 1 ? "call" : "calls"}, one per photo. Published photos stay in the game. ` +
    "The observer receives no prompt or requested parameters. Work continues on the server when you leave this page.")) return null;
  let submitted!: () => void;
  const submission = new Promise<void>(resolve => { submitted = resolve; });
  return withPhotoProcessing("Observing SLOP parameters on the server. You can switch tabs or close this page.", async progress => {
    let submissionError: unknown;
    try {
      for (let at = 0; at < missing.length; at += 500) {
        const part = missing.slice(at, at + 500);
        await request(gallery, "observe", { confirm: true, request: crypto.randomUUID(), ids: part.map(photo => photo.id), max_calls: part.length });
      }
    } catch (error) { submissionError = error; } // A lost response never resubmits the batch.
    finally { submitted(); }
    const remaining = new Set(targets.map(photo => photo.id)), failures: string[] = [];
    let done = 0;
    while (remaining.size) {
      const current = new Map((await observationState(gallery)).images.map(photo => [photo.id, photo]));
      for (const id of remaining) {
        const photo = current.get(id);
        if (photo?.observed) { done++; remaining.delete(id); }
        else if (!photo?.job || !ACTIVE.has(photo.job.state)) {
          failures.push(`${id}: ${photo?.job?.error || "No observation job is pending. Check the pipeline before trying again."}`);
          remaining.delete(id);
        }
      }
      progress(`${done} of ${targets.length} SLOP observed; ${remaining.size} pending on the server. You can switch tabs or close this page.`);
      if (remaining.size) await new Promise<void>(resolve => window.setTimeout(resolve, 1000));
    }
    if (submissionError) throw submissionError;
    return `${done} of ${targets.length} SLOP observed.` + (failures.length ? ` Need attention: ${failures.join(" / ")}` : "");
  }, [{ label: "Stop queued requests", run: async () => {
    if (!window.confirm("Cancel requests that have not been sent yet? Operations already in progress will finish.")) return false;
    await submission;
    await request(gallery, "stop", { confirm: true });
    return true;
  } }]);
}
