/** v1.0.0. Browser-only full-frame profile preview; source file is never changed. */
export function previewDimensions(width:number,height:number,maximum=1152) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||!Number.isSafeInteger(maximum) ||
    width<1||height<1||maximum<128||maximum>2048)throw Error("Dimensioni non valide");
  const scale=Math.min(1,maximum/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),
    height:Math.max(1,Math.round(height*scale))};
}
export async function visualProfilePreview(inboxId: string): Promise<string> {
  if (!/^[\w-]{1,160}$/.test(inboxId)) throw Error("Identità fotografica non valida");
  const response = await fetch("/api/admin/review-inbox/" + encodeURIComponent(inboxId) + "/image",
    {credentials:"same-origin",headers:{"Accept":"image/jpeg,image/png,image/webp"}});
  if (!response.ok) throw Error("Fotografia privata non disponibile per l'anteprima");
  const blob = await response.blob();
  if (blob.size > 12_000_000) throw Error("File oltre il limite di caricamento");
  const source = await createImageBitmap(blob,{imageOrientation:"from-image"});
  try {
    if (source.width*source.height>32_000_000) throw Error("Fotografia troppo grande");
    for(const maximum of [1152,896,640]) {
      const {width,height}=previewDimensions(source.width,source.height,maximum);
      const canvas=document.createElement("canvas");
      canvas.width=width;canvas.height=height;
      const context=canvas.getContext("2d",{alpha:false});
      if(!context)throw Error("Canvas non disponibile");
      context.fillStyle="#fff";context.fillRect(0,0,width,height);
      context.drawImage(source,0,0,width,height);
      const preview=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",0.76));
      if(!preview || preview.type!=="image/webp") throw Error("Esportazione WebP non supportata");
      if(preview.size<=1_500_000){
        const bytes=new Uint8Array(await preview.arrayBuffer());let binary="";
        for(let index=0;index<bytes.length;index+=8192)
          binary+=String.fromCharCode(...bytes.subarray(index,index+8192));
        return btoa(binary);
      }
    }
    throw Error("Anteprima fotografica troppo complessa: impossibile comprimere sotto 1,5 MB");
  } finally {source.close();}
}
