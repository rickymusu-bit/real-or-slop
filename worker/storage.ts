import { type Env, type ImageRow, HttpError } from "./core";
import { cleanImage } from "../shared/media-clean";
/** The approved game copy of a published image, from the game bucket. */
export async function media(env: Env, image: Pick<ImageRow, "r2_key">) {
  if (!env.IMAGES) throw new HttpError(503, "Storage immagini non configurato");
  const value = await env.IMAGES.get(image.r2_key);
  if (!value) throw new HttpError(404, "Immagine non disponibile");
  return gameCopy(new Response(value.body));
}

/** Game files carry no identifying metadata (spec 1.6.2, 6.4); originals in R2 stay untouched.
 * A file that cannot be cleaned is never served as-is. */
export async function gameCopy(response: Response): Promise<Response> {
  let clean;
  try {
    clean = cleanImage(new Uint8Array(await response.arrayBuffer()));
  } catch {
    throw new HttpError(500, "Immagine non servibile senza metadati");
  }
  return new Response(clean.bytes, {
    headers: { "Content-Type": clean.mime, "X-Content-Type-Options": "nosniff" },
  });
}

// Never publicly cache authenticated media or reveal metadata. The opaque URL
// and credential-specific Vary partition allow private browser cache reuse.
export function privateMedia(response: Response, identity: "Cookie" | "Authorization") {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("Vary", identity);
  return new Response(response.body, { status: response.status, headers });
}
