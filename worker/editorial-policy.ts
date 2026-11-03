import { HttpError, type Env } from "./core";
export async function editorialThreshold(env: Env) {
  const row = await env.DB.prepare("SELECT editorial_threshold FROM editorial_controls WHERE id=1").first<{ editorial_threshold: number }>();
  const threshold = row?.editorial_threshold;
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) throw new HttpError(503, "Soglia editoriale non configurata");
  return threshold;
}
