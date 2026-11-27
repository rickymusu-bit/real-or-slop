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

/** Approval submits the work on the server. Returning to a gallery only follows existing active jobs. */
export async function followSlopObservations(gallery: string, ids?: string[], approve?: () => Promise<unknown>): Promise<string | null> {
  const selected = ids ? new Set(ids) : null;
  const initial = approve ? null : await observationState(gallery);
  const targets = initial?.images.filter(photo => !photo.observed && photo.job && ACTIVE.has(photo.job.state) && (!selected || selected.has(photo.id)));
  if (targets && !targets.length) return null;
  let submitted!: () => void;
  const submission = new Promise<void>(resolve => { submitted = resolve; });
  return withPhotoProcessing("Approving SLOP and observing parameters on the server. You can switch tabs or close this page.", async progress => {
    let submissionError: unknown;
    try { await approve?.(); } catch (error) { submissionError = error; }
    finally { submitted(); }
    const state = initial || await observationState(gallery);
    // A bulk approver can remove explicitly failed IDs; unknown outcomes keep their IDs for recovery.
    const approved = ids ? new Set(ids) : null;
    const photos = targets || state.images.filter(photo => !approved || approved.has(photo.id));
    const remaining = new Set(photos.map(photo => photo.id)), failures: string[] = [];
    let done = 0;
    while (remaining.size) {
      const current = new Map((await observationState(gallery)).images.map(photo => [photo.id, photo]));
      for (const id of remaining) {
        const photo = current.get(id);
        if (photo?.observed) { done++; remaining.delete(id); }
        else if (!photo?.job || !ACTIVE.has(photo.job.state)) {
          failures.push(`${id}: ${photo?.job?.error || "No observation is pending. Review the pipeline status."}`);
          remaining.delete(id);
        }
      }
      progress(`${done} of ${photos.length} SLOP observed; ${remaining.size} pending on the server. You can switch tabs or close this page.`);
      if (remaining.size) await new Promise<void>(resolve => window.setTimeout(resolve, 1000));
    }
    if (submissionError) throw submissionError;
    return `${done} of ${photos.length} SLOP observed.` + (failures.length ? ` Need attention: ${failures.join(" / ")}` : "");
  }, [{ label: "Stop queued requests", run: async () => {
    if (!window.confirm("Cancel requests that have not been sent yet? Operations already in progress will finish.")) return false;
    await submission;
    await request(gallery, "stop", { confirm: true });
    return true;
  } }]);
}
