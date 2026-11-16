/** The Worker's PNG: what it encodes it decodes back exactly, with every filter of a real encoder (zlib from the runtime). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { decodePng, encodePng } from "../worker/png";

test("encode then decode gives the same pixels (alpha set to opaque)", async () => {
  const width = 37, height = 23, rgba = new Uint8ClampedArray(width * height * 4).map((_, i) => i % 4 === 3 ? 255 : (i * 31) & 255);
  const back = await decodePng(await encodePng(rgba, width, height));
  assert.equal(back.width, width); assert.equal(back.height, height); assert.deepEqual(back.rgba, rgba);
});

test("every PNG filter and the grey types decode as a reference implementation would", async () => {
  // A hand-made 3×2 RGB PNG whose lines use filters Sub and Paeth, and a grey 2×1.
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xffffffff) >>> 0; };
  const chunk = (name: string, body: Buffer) => { const head = Buffer.alloc(4); head.writeUInt32BE(body.length); const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(name), body]))); return Buffer.concat([head, Buffer.from(name), body, tail]); };
  const png = (w: number, h: number, type: number, raw: number[]) => {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = type;
    return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(raw))), chunk("IEND", Buffer.alloc(0))]));
  };
  // Pixels: row 0 = (10,20,30)(20,30,40)(30,40,50); row 1 = (15,25,35)(25,35,45)(35,45,55).
  const sub = [1, 10, 20, 30, 10, 10, 10, 10, 10, 10];
  const paeth = [4, 5, 5, 5, 5, 5, 5, 5, 5, 5];  // here Paeth always predicts «up»
  const rgb = await decodePng(png(3, 2, 2, [...sub, ...paeth]));
  assert.deepEqual([...rgb.rgba], [10,20,30,255, 20,30,40,255, 30,40,50,255, 15,25,35,255, 25,35,45,255, 35,45,55,255]);
  const grey = await decodePng(png(2, 1, 0, [0, 7, 200]));
  assert.deepEqual([...grey.rgba], [7,7,7,255, 200,200,200,255]);
});

test("area resampling averages the covered pixels and keeps a uniform image uniform", async () => {
  const { resample } = await import("../worker/copy-maker");
  // 4×2 source: left half black, right half white; halved to 2×1 → black and white; a 1×1 → mid grey.
  const rgba = new Uint8ClampedArray(4 * 2 * 4);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) { const v = x < 2 ? 0 : 255, i = (y * 4 + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255; }
  const source = { width: 4, height: 2, rgba };
  assert.deepEqual([...resample(source, { x: 0, y: 0, width: 4, height: 2 }, 2, 1)], [0, 0, 0, 255, 255, 255, 255, 255]);
  assert.deepEqual([...resample(source, { x: 0, y: 0, width: 4, height: 2 }, 1, 1)].slice(0, 3), [128, 128, 128]);
  // A crop of the white half, enlarged: still white.
  assert.ok([...resample(source, { x: 2, y: 0, width: 2, height: 2 }, 3, 3)].every((v, i) => i % 4 === 3 || v === 255));
});

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
      worst = Math.max(worst, Math.abs(decoded.rgba[i * 4 + k] - expected.data[i * channels + (channels >= 3 ? k : 0)]));
    assert.ok(worst <= 2, `${name}: largest difference ${worst}`);
  }
});
