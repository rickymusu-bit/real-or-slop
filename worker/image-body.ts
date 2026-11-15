/** JSON request bodies that carry one image as a data URL (analysis and SLOP evaluation). The image is base64-encoded straight into
 * the bytes of the body, never into JavaScript strings: a large original (up to 12 MB) needs about three times its size in memory
 * instead of the many string copies that pushed the Worker past its memory limit (2026-11-15, five analyses in a row). */

/** Put this string where the data URL goes; it must appear exactly once in the payload. */
export const IMAGE_MARK = "__ros_image_data_url__";
const ALPHABET = new TextEncoder().encode("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
const PAD = 61; // "="

export const base64Length = (n: number) => Math.ceil(n / 3) * 4;
/** Standard base64 of `src`, written into `out` from `at`. */
export function base64Into(src: Uint8Array, out: Uint8Array, at: number): void {
  let o = at, i = 0;
  for (; i + 2 < src.length; i += 3) {
    const n = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
    out[o++] = ALPHABET[(n >> 18) & 63]; out[o++] = ALPHABET[(n >> 12) & 63]; out[o++] = ALPHABET[(n >> 6) & 63]; out[o++] = ALPHABET[n & 63];
  }
  const rest = src.length - i;
  if (rest === 1) {
    const n = src[i] << 16;
    out[o++] = ALPHABET[(n >> 18) & 63]; out[o++] = ALPHABET[(n >> 12) & 63]; out[o++] = PAD; out[o++] = PAD;
  } else if (rest === 2) {
    const n = (src[i] << 16) | (src[i + 1] << 8);
    out[o++] = ALPHABET[(n >> 18) & 63]; out[o++] = ALPHABET[(n >> 12) & 63]; out[o++] = ALPHABET[(n >> 6) & 63]; out[o++] = PAD;
  }
}
/** The UTF-8 bytes of JSON.stringify(payload), with IMAGE_MARK replaced by `data:<mime>;base64,<image>`. */
export function jsonWithImage(payload: unknown, image: ArrayBuffer | Uint8Array, mime: string): Uint8Array {
  const json = JSON.stringify(payload), at = json.indexOf(IMAGE_MARK);
  if (at < 0 || json.indexOf(IMAGE_MARK, at + 1) >= 0) throw Error("Segnaposto dell'immagine mancante o ripetuto");
  const bytes = image instanceof Uint8Array ? image : new Uint8Array(image);
  const encoder = new TextEncoder(), head = encoder.encode(json.slice(0, at) + `data:${mime};base64,`), tail = encoder.encode(json.slice(at + IMAGE_MARK.length));
  const out = new Uint8Array(head.length + base64Length(bytes.length) + tail.length);
  out.set(head, 0); base64Into(bytes, out, head.length); out.set(tail, out.length - tail.length);
  return out;
}
