/** Game copies without identifying metadata. v1.0.0, 2026-11-09T10:00:00Z (docs/lotti-editoriali.v1.6.2.md, 6.4).
 * Container-level rewrite only: pixels and compressed image data are copied byte for byte, never re-encoded.
 * Removed: EXIF, XMP, IPTC/Photoshop, ICC profiles, comments, C2PA/JUMBF, text chunks, JFIF density, data after
 * the end of the image (multi-picture previews, motion photos). Kept: what the decoder needs, plus a minimal EXIF
 * with the orientation alone when the original asks for a rotation, so the photo is shown as before.
 * Malformed files throw: the caller must not fall back to the original bytes. */
import { imageMime } from "./image-format.v1.0.0";
import { imageGeometry } from "./image-geometry.v1.0.0";

export type CleanMime = "image/jpeg" | "image/png" | "image/webp";
export interface CleanImage { bytes: Uint8Array; mime: CleanMime; orientation: number }

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
/** Big-endian TIFF with a single IFD entry: Orientation (0x0112, SHORT, 1). */
function orientationTiff(orientation: number): Uint8Array {
  return new Uint8Array([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
}

// JPEG markers needed to decode: SOFn, DHT, DAC, DQT, DRI, DNL, EXP, DHP. APPn and COM are dropped,
// except Adobe APP14, rewritten to its colour-transform byte alone because decoders need it.
const JPEG_KEEP = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcc, 0xcd, 0xce, 0xcf, 0xdb, 0xdc, 0xdd, 0xde, 0xdf]);
function cleanJpeg(bytes: Uint8Array, orientation: number): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw Error("jpeg_soi");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  if (orientation !== 1) {
    const tiff = orientationTiff(orientation), size = 2 + 6 + tiff.length;
    parts.push(new Uint8Array([0xff, 0xe1, size >> 8, size & 255, 0x45, 0x78, 0x69, 0x66, 0, 0]), tiff);
  }
  let offset = 2, scans = 0, segments = 0;
  /** Reads the marker segment at `offset` (pointing at 0xFF); returns the marker. */
  const segment = (): number => {
    if (++segments > 65536) throw Error("jpeg_segment_limit");
    while (offset < bytes.length && bytes[offset] === 0xff && bytes[offset + 1] === 0xff) offset++;
    if (offset + 4 > bytes.length || bytes[offset] !== 0xff) throw Error("jpeg_marker");
    const marker = bytes[offset + 1], size = view.getUint16(offset + 2);
    if (size < 2 || offset + 2 + size > bytes.length) throw Error("jpeg_segment");
    const whole = bytes.subarray(offset, offset + 2 + size);
    if (marker === 0xda || JPEG_KEEP.has(marker)) parts.push(whole);
    else if (marker === 0xee && size >= 14 && ascii(bytes, offset + 4, 5) === "Adobe")
      parts.push(new Uint8Array([0xff, 0xee, 0, 14, 0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, bytes[offset + 15]]));
    else if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe && !(marker >= 0xf0 && marker <= 0xfd)) throw Error("jpeg_unexpected_marker");
    offset += 2 + size;
    return marker;
  };
  // Header: everything up to the first scan.
  while (segment() !== 0xda) { /* header segments */ }
  scans = 1;
  // Entropy-coded data: copy until EOI, handling segments between progressive scans. Anything after EOI is dropped.
  let start = offset;
  for (;;) {
    const at = bytes.indexOf(0xff, offset);
    if (at < 0 || at + 1 >= bytes.length) { parts.push(bytes.subarray(start), new Uint8Array([0xff, 0xd9])); break; }
    const next = bytes[at + 1];
    if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) { offset = at + 1; continue; }
    parts.push(bytes.subarray(start, at));
    if (next === 0xd9) { parts.push(new Uint8Array([0xff, 0xd9])); break; }
    offset = at;
    if (segment() === 0xda && ++scans > 4096) throw Error("jpeg_scan_limit");
    start = offset;
  }
  return concat(parts);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  return table;
})();
function pngChunk(kind: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = kind.charCodeAt(i);
  out.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) crc = CRC_TABLE[(crc ^ out[i]) & 255] ^ (crc >>> 8);
  view.setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0);
  return out;
}
// Only what the decoder needs; colour chunks (gAMA, cHRM, sRGB, iCCP) are dropped like the JPEG ICC profile.
const PNG_KEEP = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
function cleanPng(bytes: Uint8Array, orientation: number): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8, chunks = 0, ended = false, exif = orientation !== 1;
  while (offset + 12 <= bytes.length) {
    if (++chunks > 1_000_000) throw Error("png_chunk_limit");
    const size = view.getUint32(offset), end = offset + 12 + size;
    if (end > bytes.length) throw Error("png_chunk");
    const kind = ascii(bytes, offset + 4, 4);
    if (kind === "IDAT" && exif) { parts.push(pngChunk("eXIf", orientationTiff(orientation))); exif = false; }
    if (PNG_KEEP.has(kind)) parts.push(bytes.subarray(offset, end));
    offset = end;
    if (kind === "IEND") { ended = true; break; }
  }
  if (!ended || chunks < 3) throw Error("png_iend");
  return concat(parts);
}

// VP8X flags: ICC 0x20, alpha 0x10, EXIF 0x08, XMP 0x04, animation 0x02.
const WEBP_KEEP = new Set(["VP8X", "ALPH", "VP8 ", "VP8L", "ANIM", "ANMF"]);
function cleanWebp(bytes: Uint8Array, orientation: number): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff = Math.min(bytes.length, 8 + view.getUint32(4, true));
  const chunks: Uint8Array[] = [];
  let offset = 12, extended = false, count = 0;
  while (offset + 8 <= riff) {
    if (++count > 1_000_000) throw Error("webp_chunk_limit");
    const kind = ascii(bytes, offset, 4), size = view.getUint32(offset + 4, true), end = offset + 8 + size;
    if (end > riff) throw Error("webp_chunk");
    const padded = Math.min(end + (size % 2), riff);
    if (!chunks.length) {
      if (kind === "VP8 " || kind === "VP8L") { chunks.push(bytes.subarray(offset, padded)); break; }
      if (kind !== "VP8X" || size < 10) throw Error("webp_first_chunk");
      extended = true;
      const header = bytes.slice(offset, offset + 18);
      header[8] = (header[8] & 0x12) | (orientation !== 1 ? 0x08 : 0);
      chunks.push(header);
    } else if (WEBP_KEEP.has(kind) && kind !== "VP8X") chunks.push(bytes.subarray(offset, padded));
    offset = padded;
  }
  if (!chunks.length || (extended && chunks.length < 2)) throw Error("webp_image");
  if (extended && orientation !== 1) {
    const tiff = orientationTiff(orientation), head = new Uint8Array(8);
    head.set([0x45, 0x58, 0x49, 0x46]); new DataView(head.buffer).setUint32(4, tiff.length, true);
    chunks.push(head, tiff);
  }
  const body = concat(chunks), out = new Uint8Array(12 + body.length);
  out.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(body, 12);
  return out;
}

export function cleanImage(input: Uint8Array): CleanImage {
  const mime = imageMime(input);
  if (!mime) throw Error("unsupported_format");
  const geometry = imageGeometry(input);
  // Unknown or absent orientation: the image is served unrotated, as the geometry audit already reports.
  const orientation = geometry.orientation && geometry.orientation_status === "explicit" ? geometry.orientation : 1;
  const bytes = mime === "image/jpeg" ? cleanJpeg(input, orientation) : mime === "image/png" ? cleanPng(input, orientation) : cleanWebp(input, orientation);
  return { bytes, mime, orientation };
}
