import assert from "node:assert/strict";
import test from "node:test";
import { imageDimensions } from "../shared/image-dimensions.v1.0.0";

test("PNG dimensions are read from IHDR without cropping",()=>{
  const image=new Uint8Array(40);
  image.set([137,80,78,71,13,10,26,10],0);
  image.set([73,72,68,82],12);
  image[19]=64;image[23]=32;
  assert.deepEqual(imageDimensions(image),{mime:"image/png",width:64,height:32});
  image[16]=0xff;image[17]=0xff;image[18]=0xff;image[19]=0xff;
  assert.throws(()=>imageDimensions(image),/Dimensioni/);
});
test("JPEG dimensions found in SOF and rejects truncated/malformed JPEG",()=>{
  const image=new Uint8Array(20);
  image.set([0xff,0xd8,0xff,0xc0,0,7,8,0,16,0,32],0);
  assert.deepEqual(imageDimensions(image),{mime:"image/jpeg",width:32,height:16});
  image[5]=0;
  assert.throws(()=>imageDimensions(image),/dimensioni/);
});
test("WebP VP8X dimensions preserve portrait proportions",()=>{
  const bytes=new Uint8Array(32);
  bytes.set(new TextEncoder().encode("RIFFxxxxWEBPVP8X"),0);
  bytes[24]=31;bytes[27]=63;
  assert.deepEqual(imageDimensions(bytes),{mime:"image/webp",width:32,height:64});
  assert.throws(()=>imageDimensions(new TextEncoder().encode("<svg><script/></svg>")),/JPEG/);
});
