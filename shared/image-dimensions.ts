/** Header dimension guard for JPEG, PNG and WebP before private storage: an anti-bomb and format check, not a decoder. */
import { imageMime } from "./image-format";
export interface Dimensions {width:number;height:number;mime:"image/jpeg"|"image/png"|"image/webp"}
export function imageDimensions(bytes:Uint8Array):Dimensions {
  const mime=imageMime(bytes);
  if(!mime)throw new Error("JPEG, PNG o WebP richiesti");
  let width=0,height=0;
  if(mime==="image/png"){
    if(bytes.length<24 || String.fromCharCode(...bytes.slice(12,16))!=="IHDR")throw new Error("PNG privo di IHDR");
    width=(bytes[16]*0x1000000)+(bytes[17]<<16)+(bytes[18]<<8)+bytes[19];
    height=(bytes[20]*0x1000000)+(bytes[21]<<16)+(bytes[22]<<8)+bytes[23];
  } else if(mime==="image/webp"){
    if(bytes.length<30)throw new Error("WebP incompleto");
    const kind=String.fromCharCode(...bytes.slice(12,16));
    if(kind==="VP8X"){
      width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);
      height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);
    } else if(kind==="VP8L" && bytes[20]===0x2f){
      width=1+bytes[21]+((bytes[22]&0x3f)<<8);
      height=1+((bytes[22]>>6)&3)+(bytes[23]<<2)+((bytes[24]&0xf)<<10);
    } else if(kind==="VP8 " && bytes[23]===0x9d && bytes[24]===0x01 && bytes[25]===0x2a){
      width=((bytes[27]<<8)+bytes[26])&0x3fff;
      height=((bytes[29]<<8)+bytes[28])&0x3fff;
    } else throw new Error("WebP senza intestazione immagine riconoscibile");
  } else {
    let offset=2,found=false;
    while(offset+9<bytes.length){
      if(bytes[offset]!==0xff){offset++;continue;}
      let marker=bytes[offset+1];offset+=2;
      while(marker===0xff&&offset<bytes.length){marker=bytes[offset++];}
      if(marker===0xda || marker===0xd9)break;
      if(marker===0xd8 || marker===0x01 || (marker>=0xd0 && marker<=0xd7))continue;
      if(offset+2>bytes.length)break;
      const length=bytes[offset]*256+bytes[offset+1];
      if(length<2||offset+length>bytes.length)break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
        if(length<7)break;
        height=bytes[offset+3]*256+bytes[offset+4];
        width=bytes[offset+5]*256+bytes[offset+6];
        found=true;break;
      }
      offset+=length;
    }
    if(!found)throw new Error("JPEG senza dimensioni valide");
  }
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>16_000||height>16_000||width*height>32_000_000)
    throw new Error("Dimensioni immagine non consentite (massimo 32 megapixel)");
  return {width,height,mime};
}
