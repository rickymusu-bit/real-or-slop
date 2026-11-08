import { demoSvg, type Env, type ImageRow, HttpError } from "./core";
export interface ObjectStore {
  get(key: string): Promise<Response | null>;
}
export class R2Store implements ObjectStore {
  constructor(private bucket: R2Bucket) {}
  async get(key: string) {
    const value = await this.bucket.get(key);
    if (!value) return null;
    return new Response(value.body, {
      headers: {
        "Content-Type": value.httpMetadata?.contentType || "image/webp",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
export class DemoStore implements ObjectStore {
  async get(key: string) {
    return new Response(demoSvg(key), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  }
}
export async function media(env: Env, image: ImageRow) {
  const store =
    image.demo === 1
      ? new DemoStore()
      : env.IMAGES
        ? new R2Store(env.IMAGES)
        : null;
  if (!store) throw new HttpError(503, "Storage immagini non configurato");
  const response = await store.get(image.r2_key);
  if (!response) throw new HttpError(404, "Immagine non disponibile");
  return response;
}

// Never publicly cache authenticated media or reveal metadata. The opaque URL
// and credential-specific Vary partition allow private browser cache reuse.
export function privateMedia(response: Response, identity: "Cookie" | "Authorization") {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, max-age=300");
  headers.set("Vary", identity);
  return new Response(response.body, { status: response.status, headers });
}
