/** PNG in the Worker through fast-png (MIT, plain JavaScript with fflate): it replaces the hand-written PNG decoder (owner request of
 * 2026-11-16: use libraries already made). Plain JavaScript on purpose: its memory is freed after each copy, while a WebAssembly codec
 * keeps its memory for the life of the isolate (libpng from Squoosh grew to 50 MB for one picture, its resampler to 142 MB, mozjpeg
 * and libwebp start at 16 MiB each, against the Worker's 128 MB). Resampling, JPEG and WebP stay with the Images binding
 * (worker/copy-maker.ts). */
import { convertIndexedToRgb, decode, encode } from "fast-png";

export type Picture = { data: Uint8ClampedArray; width: number; height: number };

/** Any PNG (grey, palette, 1–16 bit, interlaced, with transparency) to 8-bit opaque RGBA, transparency flattened on white. */
export function decodePng(bytes: Uint8Array): Picture {
  const png = decode(bytes), n = png.width * png.height;
  const indexed = png.palette ? convertIndexedToRgb(png) : null;
  const channels = indexed ? indexed.length / n : png.channels, max = indexed ? 255 : 2 ** png.depth - 1;
  const source = indexed || png.data;
  // Samples narrower than a byte stay packed, line by line, in fast-png's output.
  const packed = !indexed && png.depth < 8, lineBytes = Math.ceil(png.width * channels * png.depth / 8);
  const sample = packed
    ? (i: number) => {
      const pixel = Math.floor(i / channels), row = Math.floor(pixel / png.width), bit = ((pixel % png.width) * channels + i % channels) * png.depth;
      return (source[row * lineBytes + (bit >> 3)] >> (8 - png.depth - (bit & 7))) & max;
    }
    : (i: number) => source[i];
  const out = new Uint8ClampedArray(n * 4), alpha = channels === 2 || channels === 4;
  for (let p = 0; p < n; p++) {
    const base = p * channels, a = alpha ? sample(base + channels - 1) / max : 1;
    for (let k = 0; k < 3; k++) {
      const v = sample(base + (channels < 3 ? 0 : k)) / max;
      out[p * 4 + k] = Math.round((v * a + (1 - a)) * 255);
    }
    out[p * 4 + 3] = 255;
  }
  return { data: out, width: png.width, height: png.height };
}
export const encodePng = (p: Picture): Uint8Array => encode({ width: p.width, height: p.height, data: p.data, channels: 4, depth: 8 });

/** An integer rectangle of a picture (no resampling). */
export function crop(p: Picture, x: number, y: number, width: number, height: number): Picture {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) out.set(p.data.subarray(((y + row) * p.width + x) * 4, ((y + row) * p.width + x + width) * 4), row * width * 4);
  return { data: out, width, height };
}
