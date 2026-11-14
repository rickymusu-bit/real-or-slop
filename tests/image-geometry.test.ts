import test from "node:test";
import assert from "node:assert/strict";
import { imageGeometry } from "../shared/image-geometry";

function tiff(orientation:number,little=true){
 const bytes=new Uint8Array(26),view=new DataView(bytes.buffer);
 bytes.set(new TextEncoder().encode(little?'II':'MM'));
 view.setUint16(2,42,little);view.setUint32(4,8,little);view.setUint16(8,1,little);
 view.setUint16(10,0x112,little);view.setUint16(12,3,little);view.setUint32(14,1,little);view.setUint16(18,orientation,little);
 return bytes;
}
function segment(tag:number,data:Uint8Array){return new Uint8Array([255,tag,(data.length+2)>>8,(data.length+2)&255,...data]);}
function jpeg(meta:Uint8Array|null,after=false){
 const sof=segment(0xc0,new Uint8Array([8,0,100,0,200]));
 const exif=meta?segment(0xe1,new Uint8Array([69,120,105,102,0,0,...meta])):new Uint8Array();
 return new Uint8Array([255,216,...(after?sof:exif),...(after?exif:sof),255,217]);
}
test('all eight EXIF orientations preserve encoded dimensions and resolve display geometry in both byte orders',()=>{
 for(const little of [true,false])for(let orientation=1;orientation<=8;orientation++){
  const original=jpeg(tiff(orientation,little),true),copy=original.slice(),g=imageGeometry(original);
  assert.equal(g.orientation,orientation);assert.equal(g.orientation_status,'explicit');
  assert.equal(g.encoded_width,200);assert.equal(g.encoded_height,100);
  assert.equal(g.width,orientation>=5?100:200);assert.equal(g.height,orientation>=5?200:100);
  assert.deepEqual(original,copy,'Reading orientation must not change the original bytes');
 }
 assert.equal(imageGeometry(jpeg(null)).orientation_status,'absent');
});
test('invalid TIFF offsets, fields and conflicting EXIF remain explicitly unknown',()=>{
 const invalid=[tiff(9),new Uint8Array([73,73]),tiff(1),tiff(1)];
 new DataView(invalid[2].buffer).setUint32(4,0xfffffff0,true);
 new DataView(invalid[3].buffer).setUint16(12,4,true);
 for(const bytes of invalid){const g=imageGeometry(jpeg(bytes));assert.equal(g.orientation_status,'unknown');assert.equal(g.width,null);assert.ok(g.diagnostic);}
 const first=jpeg(tiff(6)),duplicate=segment(0xe1,new Uint8Array([69,120,105,102,0,0,...tiff(8)]));
 const combined=new Uint8Array([...first.subarray(0,first.length-2),...duplicate,255,217]);
 assert.equal(imageGeometry(combined).diagnostic,'exif_multiple_blocks');
 const repeated=Array.from({length:5000},()=>[255,208]).flat();
 const bounded=new Uint8Array([...jpeg(null).subarray(0,-2),...repeated,255,217]);
 assert.equal(imageGeometry(bounded).diagnostic,'metadata_scan_limit');
});
test('EXIF chunks in PNG and WebP use the same bounded orientation parser',()=>{
 const chunk=(kind:string,data:Uint8Array)=>{
  const out=new Uint8Array(12+data.length);new DataView(out.buffer).setUint32(0,data.length);
  out.set(new TextEncoder().encode(kind),4);out.set(data,8);return out;
 };
 const ihdr=new Uint8Array(13);new DataView(ihdr.buffer).setUint32(0,200);new DataView(ihdr.buffer).setUint32(4,100);
 const png=new Uint8Array([137,80,78,71,13,10,26,10,...chunk('IHDR',ihdr),...chunk('eXIf',tiff(6)),...chunk('IEND',new Uint8Array())]);
 assert.equal(imageGeometry(png).height,200);
 const webp=new Uint8Array(30+8+26),view=new DataView(webp.buffer);
 webp.set(new TextEncoder().encode('RIFF'),0);view.setUint32(4,webp.length-8,true);webp.set(new TextEncoder().encode('WEBPVP8X'),8);view.setUint32(16,10,true);
 webp[20]=8;webp[24]=199;webp[27]=99;webp.set(new TextEncoder().encode('EXIF'),30);view.setUint32(34,26,true);webp.set(tiff(8,false),38);
 assert.equal(imageGeometry(webp).width,100);assert.equal(imageGeometry(webp).height,200);
});
