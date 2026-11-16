/** PNG in plain JavaScript, for the pixels the Worker works on (spec `copie-di-gioco`): decode the 8-bit, non-interlaced PNG that
 * the Images binding returns (grey, grey+alpha, RGB, RGBA) into RGBA, and encode RGBA into a PNG for it. zlib is the runtime's own
 * (CompressionStream / DecompressionStream «deflate»). No metadata is read or written. */

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
/** Adam7 passes: start x, start y, step x, step y. */
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

export interface Pixels { width: number; height: number; rgba: Uint8ClampedArray }

/** Any standard PNG: grey, RGB, palette, grey+alpha, RGBA; 1 to 16 bits; interlaced or not. Transparency is flattened on white
 * (the recipe of the copies), the result is opaque RGBA. The Images binding may return any of these, depending on the image: a black
 * and white picture can come back as grey or palette PNG (2026-11-16: the copy of a black and white SLOP failed on it). */
export async function decodePng(bytes: Uint8Array): Promise<Pixels> {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw Error("PNG non valido");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8, width = 0, height = 0, depth = 0, type = -1, interlace = 0;
  let palette = new Uint8Array(), alphas = new Uint8Array();
  const data: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at), name = String.fromCharCode(...bytes.subarray(at + 4, at + 8)), body = bytes.subarray(at + 8, at + 8 + length);
    if (name === "IHDR") { width = view.getUint32(at + 8); height = view.getUint32(at + 12); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (name === "PLTE") palette = body.slice();
    else if (name === "tRNS") alphas = body.slice();
    else if (name === "IDAT") data.push(body);
    else if (name === "IEND") break;
    at += 12 + length;
  }
  const channels = CHANNELS[type];
  if (!width || !height || !channels || !DEPTHS[type].includes(depth) || interlace > 1 || (type === 3 && !palette.length))
    throw Error(`PNG non supportato (tipo ${type}, ${depth} bit, interlacciamento ${interlace})`);
  const joined = new Uint8Array(data.reduce((n, d) => n + d.length, 0));
  let offset = 0; for (const d of data) { joined.set(d, offset); offset += d.length; }
  const raw = await through(joined, new DecompressionStream("deflate"));
  const bits = channels * depth, unit = Math.max(1, bits >> 3), max = (1 << Math.min(depth, 8)) - 1;
  const rgba = new Uint8ClampedArray(width * height * 4);
  // One sample of a line: value scaled to 0–255 (16 bits: the high byte).
  const sample = (line: Uint8Array, index: number) => {
    if (depth === 8) return line[index];
    if (depth === 16) return line[index * 2];
    const bit = index * depth, value = (line[bit >> 3] >> (8 - depth - (bit & 7))) & max;
    return type === 3 ? value : Math.round(value * 255 / max);
  };
  const put = (line: Uint8Array, column: number, x: number, y: number) => {
    const o = (y * width + x) * 4, base = column * channels;
    let r: number, g: number, b: number, a = 255;
    if (type === 3) {
      const index = sample(line, base);
      r = palette[index * 3] ?? 0; g = palette[index * 3 + 1] ?? 0; b = palette[index * 3 + 2] ?? 0; a = index < alphas.length ? alphas[index] : 255;
    } else if (channels <= 2) { r = g = b = sample(line, base); if (channels === 2) a = sample(line, base + 1); }
    else { r = sample(line, base); g = sample(line, base + 1); b = sample(line, base + 2); if (channels === 4) a = sample(line, base + 3); }
    // Transparency on white, then opaque.
    rgba[o] = r + (255 - r) * (1 - a / 255); rgba[o + 1] = g + (255 - g) * (1 - a / 255); rgba[o + 2] = b + (255 - b) * (1 - a / 255); rgba[o + 3] = 255;
  };
  let position = 0;
  const passes = interlace ? ADAM7 : [[0, 0, 1, 1]];
  for (const [x0, y0, dx, dy] of passes) {
    const columns = Math.ceil((width - x0) / dx), rows = Math.ceil((height - y0) / dy);
    if (columns <= 0 || rows <= 0) continue;
    const stride = Math.ceil(columns * bits / 8);
    if (raw.length < position + (stride + 1) * rows) throw Error("PNG troncato");
    let previous = new Uint8Array(stride), line = new Uint8Array(stride);
    for (let row = 0; row < rows; row++) {
      const filter = raw[position], input = raw.subarray(position + 1, position + 1 + stride);
      position += stride + 1;
      for (let i = 0; i < stride; i++) {
        const left = i >= unit ? line[i - unit] : 0, up = previous[i], corner = i >= unit ? previous[i - unit] : 0;
        let value = input[i];
        if (filter === 1) value += left;
        else if (filter === 2) value += up;
        else if (filter === 3) value += (left + up) >> 1;
        else if (filter === 4) {
          const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner);
          value += pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
        } else if (filter !== 0) throw Error("Filtro PNG sconosciuto");
        line[i] = value & 255;
      }
      for (let column = 0; column < columns; column++) put(line, column, x0 + column * dx, y0 + row * dy);
      [previous, line] = [line, previous];
    }
  }
  return { width, height, rgba };
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(bytes: Uint8Array) { let c = 0xffffffff; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(name: string, body: Uint8Array) {
  const out = new Uint8Array(12 + body.length), view = new DataView(out.buffer);
  view.setUint32(0, body.length); out.set(new TextEncoder().encode(name), 4); out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}
/** RGB PNG (the copies have no transparency), filter «none» on every line: simple and exact. */
export async function encodePng(rgba: ArrayLike<number>, width: number, height: number): Promise<Uint8Array> {
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0, o = 0, i = 0; y < height; y++) { raw[o++] = 0; for (let x = 0; x < width; x++, i += 4) { raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2]; } }
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 2;
  const parts = [new Uint8Array(SIGNATURE), chunk("IHDR", header), chunk("IDAT", await through(raw, new CompressionStream("deflate"))), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0; for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
