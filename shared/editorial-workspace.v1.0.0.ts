/** Admin editorial workspace input contract, v1.0.0. No paid model calls. */
export const editorialWorkspaceVersion = "1.0.0";
export function topicTitle(value: unknown): string {
  if (typeof value !== "string") throw new Error("Argomento richiesto");
  const title = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (title.length < 6 || title.length > 200 || !/[\p{L}\p{N}]/u.test(title)) throw new Error("Argomento da 6 a 200 caratteri");
  return title;
}
export function topicKey(value: string): string {
  return topicTitle(value).toLocaleLowerCase("und");
}
export function sourcePageUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 1500) throw new Error("URL HTTPS richiesto");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) throw Error();
    return url.href;
  } catch { throw new Error("Pagina HTTPS senza credenziali o frammenti richiesta"); }
}
export function imageMime(data: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 &&
      data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return "image/png";
  if (String.fromCharCode(...data.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...data.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
/** Strict allowlist at the SLOP prompt-planning boundary.
 * Never permit current-cycle REAL images, metadata, votes, descriptions or URLs.
 * This does not launch generation; downstream code must use ONLY this payload.
 */
export interface SlopPlanningInput { topic: string; taxonomy_version: string; slop_feedback: string[] }
export function isolatedSlopPlanningInput(raw: unknown): SlopPlanningInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Contesto SLOP non valido");
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some(key => !["topic","taxonomy_version","slop_feedback"].includes(key))) {
    throw new Error("Contesto SLOP contiene campi non ammessi");
  }
  const topic = topicTitle(value.topic);
  if (typeof value.taxonomy_version !== "string" || !/^\d+\.\d+\.\d+$/.test(value.taxonomy_version)) throw new Error("Tassonomia non valida");
  if (!Array.isArray(value.slop_feedback) || value.slop_feedback.length > 50 ||
    value.slop_feedback.some(item => typeof item !== "string" || item.length > 600)) throw new Error("Feedback SLOP non valido");
  return { topic, taxonomy_version: value.taxonomy_version,
    slop_feedback: [...value.slop_feedback] as string[] };
}
