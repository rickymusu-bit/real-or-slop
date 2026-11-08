/** Display geometry from encoded headers and bounded EXIF metadata; never edits pixels. */
import { imageDimensions, type Dimensions } from "./image-dimensions.v1.0.0";
export interface ImageGeometry {
 parser_version:"1.0.0";mime:Dimensions["mime"];encoded_width:number;encoded_height:number;
 width:number|null;height:number|null;orientation:number|null;orientation_status:"explicit"|"absent"|"unknown";
 diagnostic:string|null;
}
function orientationOf(input:Uint8Array):number|null {
 let bytes=input;
 if(bytes.length>=6 && String.fromCharCode(...bytes.subarray(0,6))==="Exif\0\0")bytes=bytes.subarray(6);
 if(bytes.length<8)throw Error("exif_truncated");
 const order=String.fromCharCode(bytes[0],bytes[1]);
 if(order!=="II" && order!=="MM")throw Error("exif_byte_order");
 const little=order==="II",view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint16(2,little)!==42)throw Error("exif_header");
 const offset=view.getUint32(4,little);
 if(offset<8 || offset+2>bytes.length)throw Error("exif_ifd_offset");
 const count=view.getUint16(offset,little);
 if(count>4096 || offset+2+count*12+4>bytes.length)throw Error("exif_ifd_truncated");
 let result:number|null=null;
 for(let i=0;i<count;i++){
  const entry=offset+2+i*12;
  if(view.getUint16(entry,little)!==0x112)continue;
  if(result!==null || view.getUint16(entry+2,little)!==3 || view.getUint32(entry+4,little)!==1)throw Error("exif_orientation_field");
  result=view.getUint16(entry+8,little);
  if(result<1 || result>8)throw Error("exif_orientation_value");
 }
 return result;
}
function exifBlocks(bytes:Uint8Array,mime:Dimensions["mime"]):Uint8Array[] {
 const blocks:Uint8Array[]=[];
 let scanned=0;
 const step=()=>{if(++scanned>4096)throw Error("metadata_scan_limit");};
 const add=(block:Uint8Array)=>{if(blocks.length)throw Error("exif_multiple_blocks");blocks.push(block);};
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(mime==="image/jpeg"){
  let offset=2;
  while(offset<bytes.length){
   step();
   if(bytes[offset++]!==0xff)throw Error("jpeg_marker");
   while(offset<bytes.length && bytes[offset]===0xff)offset++;
   if(offset>=bytes.length)throw Error("jpeg_truncated");
   const marker=bytes[offset++];
   if(marker===0xda || marker===0xd9)break;
   if(marker===0x01 || marker>=0xd0 && marker<=0xd7)continue;
   if(offset+2>bytes.length)throw Error("jpeg_segment");
   const size=view.getUint16(offset);
   if(size<2 || offset+size>bytes.length)throw Error("jpeg_segment");
   if(marker===0xe1 && size>=8 && String.fromCharCode(...bytes.subarray(offset+2,offset+8))==="Exif\0\0")
    add(bytes.subarray(offset+2,offset+size));
   offset+=size;
  }
 }else if(mime==="image/png"){
  let offset=8;
  while(offset+12<=bytes.length){
   step();
   const size=view.getUint32(offset),end=offset+12+size;
   if(end>bytes.length)throw Error("png_chunk");
   const kind=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
   if(kind==="eXIf")add(bytes.subarray(offset+8,offset+8+size));
   offset=end;if(kind==="IEND")break;
  }
 }else{
  let offset=12;
  while(offset+8<=bytes.length){
   step();
   const size=view.getUint32(offset+4,true),end=offset+8+size;
   if(end>bytes.length)throw Error("webp_chunk");
   const kind=String.fromCharCode(...bytes.subarray(offset,offset+4));
   if(kind==="EXIF")add(bytes.subarray(offset+8,end));
   offset=end+(size%2);
  }
 }
 return blocks;
}
export function imageGeometry(bytes:Uint8Array):ImageGeometry {
 const raw=imageDimensions(bytes);
 const base={parser_version:"1.0.0" as const,mime:raw.mime,encoded_width:raw.width,encoded_height:raw.height};
 try{
  const blocks=exifBlocks(bytes,raw.mime);
  if(blocks.length>1)throw Error("exif_multiple_blocks");
  const explicit=blocks.length?orientationOf(blocks[0]):null,orientation=explicit || 1;
  const swapped=orientation>=5;
  return {...base,width:swapped?raw.height:raw.width,height:swapped?raw.width:raw.height,
   orientation,orientation_status:explicit===null?"absent":"explicit",diagnostic:null};
 }catch(error){
  return {...base,width:null,height:null,orientation:null,orientation_status:"unknown",
   diagnostic:error instanceof Error?error.message:"metadata_unresolved"};
 }
}
