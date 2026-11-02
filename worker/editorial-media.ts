import { HttpError, json, type Env } from "./core";

/** Shared immutable storage for private source photos and generated attempts. */
export async function editorialMedia(request: Request, env: Env, key: string, expected: string, archived?: (size: number) => Promise<void>): Promise<Response> {
  if (!env.QUARANTINE) throw new HttpError(503, "Quarantena mancante");
  if (request.method === "GET") {
    const object = await env.QUARANTINE.get(key);
    if (!object) throw new HttpError(404, "File privato mancante");
    return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (request.method !== "PUT") throw new HttpError(405, "Metodo archivio non consentito");
  if (Number(request.headers.get("Content-Length")) > 12000000) throw new HttpError(413, "File troppo grande");
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 12000000) throw new HttpError(413, "Dimensione non valida");
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2,"0")).join("");
  if (digest !== expected) throw new HttpError(409, "Impronta diversa dal dossier privato");
  const b = new Uint8Array(bytes);
  const mime = b[0] === 255 && b[1] === 216 ? "image/jpeg" : b[0] === 137 && b[1] === 80 ? "image/png" : String.fromCharCode(...b.slice(0,4)) === "RIFF" && String.fromCharCode(...b.slice(8,12)) === "WEBP" ? "image/webp" : null;
  if (!mime) throw new HttpError(415, "Formato immagine non valido");
  await env.QUARANTINE.put(key, bytes, { httpMetadata: { contentType: mime }, onlyIf: { etagDoesNotMatch: "*" } });
  if (archived) await archived(bytes.byteLength);
  return json({ archived: true });
}
