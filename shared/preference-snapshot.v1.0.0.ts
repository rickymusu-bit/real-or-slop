/** Bounded JSON arrays keep immutable audit payloads below individual D1 row limits. */
export function snapshotJsonChunks(items:unknown[]):string[]{
 const chunks:string[]=[],current:string[]=[];let size=2;
 for(const item of items){
  const value=JSON.stringify(item);
  if(typeof value!=='string')throw new Error("Fonte di preferenza non serializzabile");
  const bytes=new TextEncoder().encode(value).length;
  if(bytes>499998)throw new Error("Singola fonte di preferenza oltre il limite di audit");
  if(current.length && size+bytes+1>500000){chunks.push('['+current.join(',')+']');current.length=0;size=2;}
  current.push(value);size+=bytes+1;
 }
 if(current.length)chunks.push('['+current.join(',')+']');
 return chunks;
}
