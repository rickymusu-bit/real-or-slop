/** Game copies without identifying metadata, pixels unchanged. */
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { cleanImage } from "../shared/media-clean.ts";
import { imageGeometry } from "../shared/image-geometry.ts";
import { gameCopy } from "../worker/storage.ts";

const latin = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");
const SECRETS = ["Canon", "EOS-5D", "Mario Rossi", "xmpmeta", "jumb", "c2pa", "ICC_PROFILE", "Photoshop", "secret-comment"];
function leaks(bytes: Uint8Array): string[] {
  const text = latin(bytes);
  return SECRETS.filter(secret => text.includes(secret));
}
async function pixels(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes).rotate().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
/** A 40×24 gradient so that rotation and any pixel change are visible. */
async function source() {
  const raw = Buffer.alloc(40 * 24 * 3);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 40; x++) raw.set([x * 6, y * 10, (x + y) * 3], (y * 40 + x) * 3);
  return sharp(raw, { raw: { width: 40, height: 24, channels: 3 } });
}
const exif = { IFD0: { Make: "Canon", Model: "EOS-5D", Artist: "Mario Rossi", Copyright: "Mario Rossi" } };
const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></x:xmpmeta>';

/** Inserts raw JPEG segments right after SOI and junk after EOI, as cameras and C2PA tools do. */
function withJpegExtras(jpeg: Buffer): Buffer {
  const segment = (marker: number, text: string) => {
    const payload = Buffer.from(text, "latin1"), head = Buffer.alloc(4);
    head.writeUInt8(0xff, 0); head.writeUInt8(marker, 1); head.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([head, payload]);
  };
  return Buffer.concat([jpeg.subarray(0, 2), segment(0xfe, "secret-comment"), segment(0xeb, "JP\0\0jumbc2pa manifest"),
    segment(0xed, "Photoshop 3.0\0"), jpeg.subarray(2), Buffer.from("trailing EOS-5D motion photo", "latin1")]);
}

test("JPEG: EXIF, XMP, ICC, comments, C2PA and trailing data removed; pixels and orientation unchanged", async () => {
  const original = withJpegExtras(await (await source()).jpeg({ quality: 92 })
    .withMetadata({ orientation: 6, exif, icc: "srgb" }).withXmp(xmp).toBuffer());
  assert.ok(leaks(original).length >= 6);
  const clean = cleanImage(original);
  assert.equal(clean.mime, "image/jpeg");
  assert.equal(clean.orientation, 6);
  assert.deepEqual(leaks(clean.bytes), []);
  assert.ok(clean.bytes.length < original.length);
  assert.equal(imageGeometry(clean.bytes).orientation, 6);
  const [a, b] = [await pixels(original), await pixels(clean.bytes)];
  assert.equal(b.width, 24); assert.equal(b.height, 40);
  assert.ok(a.data.equals(b.data), "decoded pixels must be identical");
});

test("JPEG without rotation carries no EXIF at all; progressive scans survive", async () => {
  const original = await (await source()).jpeg({ progressive: true }).withMetadata({ exif }).toBuffer();
  assert.ok(leaks(original).includes("Canon"));
  const clean = cleanImage(original);
  assert.equal(clean.orientation, 1);
  assert.ok(!latin(clean.bytes).includes("Exif"));
  assert.ok(!latin(clean.bytes).includes("JFIF"));
  assert.equal(imageGeometry(clean.bytes).orientation_status, "absent");
  assert.ok((await pixels(original)).data.equals((await pixels(clean.bytes)).data));
});

test("PNG: text, EXIF and ICC chunks removed, orientation kept as eXIf", async () => {
  const original = await (await source()).png().withMetadata({ orientation: 8, exif, icc: "srgb" }).withXmp(xmp).toBuffer();
  // libvips writes no XMP into PNG: EXIF and ICC are the metadata under test here.
  assert.ok(leaks(original).includes("Canon") && leaks(original).includes("Mario Rossi"));
  assert.ok(latin(original).includes("iCCP") && latin(original).includes("eXIf"));
  const clean = cleanImage(original);
  assert.equal(clean.mime, "image/png");
  assert.deepEqual(leaks(clean.bytes), []);
  assert.ok(!latin(clean.bytes).includes("iCCP") && !latin(clean.bytes).includes("tEXt") && !latin(clean.bytes).includes("iTXt"));
  assert.equal(imageGeometry(clean.bytes).orientation, 8);
  assert.ok((await pixels(original)).data.equals((await pixels(clean.bytes)).data));
});

test("WebP: ICC, EXIF and XMP chunks removed, alpha kept, flags consistent", async () => {
  const raw = Buffer.alloc(16 * 16 * 4);
  for (let i = 0; i < 256; i++) raw.set([i, 255 - i, 40, i % 2 ? 255 : 90], i * 4);
  const original = await sharp(raw, { raw: { width: 16, height: 16, channels: 4 } }).webp({ lossless: true })
    .withMetadata({ orientation: 3, exif, icc: "srgb" }).withXmp(xmp).toBuffer();
  assert.deepEqual(leaks(original).filter(s => ["Canon", "Mario Rossi", "xmpmeta"].includes(s)).length, 3);
  assert.ok(latin(original).includes("ICCP"));
  const clean = cleanImage(original);
  assert.equal(clean.mime, "image/webp");
  assert.deepEqual(leaks(clean.bytes), []);
  assert.ok(!latin(clean.bytes).includes("ICCP") && !latin(clean.bytes).includes("XMP "));
  const flags = clean.bytes[20];
  assert.equal(flags & 0x2c, 0x08, "only the EXIF flag among ICC/EXIF/XMP");
  assert.equal(flags & 0x10, 0x10, "alpha flag kept");
  assert.equal(new DataView(clean.bytes.buffer).getUint32(4, true), clean.bytes.length - 8);
  assert.equal(imageGeometry(clean.bytes).orientation, 3);
  assert.ok((await pixels(original)).data.equals((await pixels(clean.bytes)).data));
});

test("JPEG JFIF header and its density are dropped", async () => {
  const plain = await (await source()).jpeg().toBuffer();
  const jfif = Buffer.from([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, 0, 0x48, 0, 0x48, 0, 0]);
  const original = Buffer.concat([plain.subarray(0, 2), jfif, plain.subarray(2)]);
  const clean = cleanImage(original);
  assert.ok(!latin(clean.bytes).includes("JFIF"));
  assert.ok((await pixels(original)).data.equals((await pixels(clean.bytes)).data));
});

test("simple lossy WebP passes through as a single image chunk", async () => {
  const original = await (await source()).webp({ quality: 80 }).toBuffer();
  const clean = cleanImage(original);
  assert.equal(clean.bytes.length, original.length);
  assert.ok((await pixels(original)).data.equals((await pixels(clean.bytes)).data));
});

test("malformed or unknown files fail closed instead of being served as they are", async () => {
  assert.throws(() => cleanImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>")));
  const jpeg = await (await source()).jpeg().withMetadata({ exif }).toBuffer();
  assert.throws(() => cleanImage(jpeg.subarray(0, 200)));
  await assert.rejects(gameCopy(new Response(jpeg.subarray(0, 200))), /senza metadati/);
});

test("game copy response: sniffed type, no metadata", async () => {
  const jpeg = await (await source()).jpeg().withMetadata({ exif }).toBuffer();
  const response = await gameCopy(new Response(jpeg, { headers: { "Content-Type": "application/octet-stream" } }));
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(leaks(new Uint8Array(await response.arrayBuffer())), []);
});
