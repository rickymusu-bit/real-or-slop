/** PNG in plain JavaScript, for the pixels the Worker works on (spec `copie-di-gioco`): decode the 8-bit, non-interlaced PNG that
 * the Images binding returns (grey, grey+alpha, RGB, RGBA) into RGBA, and encode RGBA into a PNG for it. zlib is the runtime's own
 * (CompressionStream / DecompressionStream «deflate»). No metadata is read or written. */

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export interface Pixels { width: number; height: number; rgba: Uint8ClampedArray }

export async function decodePng(bytes: Uint8Array): Promise<Pixels> {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) throw Error("PNG non valido");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8, width = 0, height = 0, depth = 0, type = -1, interlace = 0;
  const data: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at), name = String.fromCharCode(...bytes.subarray(at + 4, at + 8)), body = bytes.subarray(at + 8, at + 8 + length);
    if (name === "IHDR") { width = view.getUint32(at + 8); height = view.getUint32(at + 12); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (name === "IDAT") data.push(body);
    else if (name === "IEND") break;
    at += 12 + length;
  }
  const channels = CHANNELS[type];
  if (!width || !height || depth !== 8 || !channels || interlace) throw Error("PNG non supportato");
  const joined = new Uint8Array(data.reduce((n, d) => n + d.length, 0));
  let offset = 0; for (const d of data) { joined.set(d, offset); offset += d.length; }
  const raw = await through(joined, new DecompressionStream("deflate"));
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) throw Error("PNG troncato");
  const rgba = new Uint8ClampedArray(width * height * 4), line = new Uint8Array(stride), previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? line[i - channels] : 0, up = previous[i], corner = i >= channels ? previous[i - channels] : 0;
      let value = row[i];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      } else if (filter !== 0) throw Error("Filtro PNG sconosciuto");
      line[i] = value & 255;
    }
    for (let x = 0, o = y * width * 4; x < width; x++, o += 4) {
      const i = x * channels;
      if (channels >= 3) { rgba[o] = line[i]; rgba[o + 1] = line[i + 1]; rgba[o + 2] = line[i + 2]; rgba[o + 3] = channels === 4 ? line[i + 3] : 255; }
      else { rgba[o] = rgba[o + 1] = rgba[o + 2] = line[i]; rgba[o + 3] = channels === 2 ? line[i + 1] : 255; }
    }
    previous.set(line);
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
