/** The Worker's PNG (fast-png, worker/codecs.ts): every PNG Images may return, transparency on white, round trip, crop. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { crop, decodePng, encodePng } from "../worker/codecs";

test("palette, grey, 1–16 bit, interlaced and transparent PNG decode like a reference (sharp), flattened on white", async () => {
  const { default: sharp } = await import("sharp");
  const width = 33, height = 21, colour = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { colour[i * 4] = (i * 7) & 255; colour[i * 4 + 1] = (i * 13) & 255; colour[i * 4 + 2] = (i * 29) & 255; colour[i * 4 + 3] = i % 5 ? 255 : 128; }
  const source = sharp(colour, { raw: { width, height, channels: 4 } });
  const variants: Record<string, Buffer> = {
    rgba: await source.clone().png().toBuffer(),
    palette: await source.clone().png({ palette: true, colours: 64, dither: 0 }).toBuffer(),
    twoColours: await source.clone().png({ palette: true, colours: 2, dither: 0 }).toBuffer(),
    grey: await source.clone().flatten({ background: "#ffffff" }).toColourspace("b-w").png().toBuffer(),
    greyAlpha: await source.clone().toColourspace("b-w").png().toBuffer(),
    oneBit: await source.clone().flatten({ background: "#ffffff" }).toColourspace("b-w").threshold(128).png({ palette: false, colours: 2 }).toBuffer(),
    sixteen: await source.clone().flatten({ background: "#ffffff" }).toColourspace("rgb16").png().toBuffer(),
    interlaced: await source.clone().png({ progressive: true }).toBuffer(),
  };
  for (const [name, png] of Object.entries(variants)) {
    const decoded = await decodePng(new Uint8Array(png));
    const expected = await sharp(png).flatten({ background: "#ffffff" }).toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.width, width, name); assert.equal(decoded.height, height, name);
    const channels = expected.info.channels;
    let worst = 0;
    for (let i = 0; i < width * height; i++) for (let k = 0; k < 3; k++)
      worst = Math.max(worst, Math.abs(decoded.data[i * 4 + k] - expected.data[i * channels + (channels >= 3 ? k : 0)]));
    assert.ok(worst <= 2, `${name}: largest difference ${worst}`);
  }
});

test("PNG round trip and crop", async () => {
  const width = 37, height = 23, data = new Uint8ClampedArray(width * height * 4).map((_, i) => i % 4 === 3 ? 255 : (i * 31) & 255);
  const back = await decodePng(await encodePng({ data, width, height }));
  assert.deepEqual([back.width, back.height], [width, height]); assert.deepEqual(back.data, data);
  const part = crop(back, 2, 3, 4, 5);
  assert.deepEqual([part.width, part.height], [4, 5]);
  for (let row = 0; row < 5; row++)
    assert.deepEqual([...part.data.subarray(row * 16, row * 16 + 16)], [...data.subarray(((3 + row) * width + 2) * 4, ((3 + row) * width + 6) * 4)]);
});

test("grey samples narrower than a byte (1, 2 and 4 bit, as no encoder at hand writes them) are unpacked line by line", () => {
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; };
  const chunk = (name: string, body: Buffer) => { const head = Buffer.alloc(4); head.writeUInt32BE(body.length); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(name), body]))); return Buffer.concat([head, Buffer.from(name), body, tail]); };
  const width = 10, height = 3;
  for (const depth of [1, 2, 4]) {
    const max = 2 ** depth - 1, value = (x: number, y: number) => (x * 3 + y) % (max + 1), lineBytes = Math.ceil(width * depth / 8), raw: number[] = [];
    for (let y = 0; y < height; y++) {
      const line = new Array(lineBytes).fill(0);
      for (let x = 0; x < width; x++) line[(x * depth) >> 3] |= value(x, y) << (8 - depth - ((x * depth) & 7));
      raw.push(0, ...line);
    }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = depth; ihdr[9] = 0;
    const png = new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(raw))), chunk("IEND", Buffer.alloc(0))]));
    const decoded = decodePng(png);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
      assert.equal(decoded.data[(y * width + x) * 4], Math.round(value(x, y) / max * 255), `depth ${depth} at ${x},${y}`);
  }
});
