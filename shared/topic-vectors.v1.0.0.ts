/** Cosine finds neighbors, never certifies duplicates or factual authenticity. */
export interface SemanticVector {
 id:string; title:string; description:string; model:string; template_version:string; vector:number[];
}
export function cosine(a:number[],b:number[]):number|null {
 if(!a.length || a.length!==b.length)return null;
 let dot=0,left=0,right=0;
 for(let i=0;i<a.length;i++){
  if(!Number.isFinite(a[i]) || !Number.isFinite(b[i]))return null;
  dot+=a[i]*b[i];left+=a[i]*a[i];right+=b[i]*b[i];
 }
 return left>0&&right>0?Math.max(-1,Math.min(1,dot/Math.sqrt(left*right))):null;
}
export function semanticNeighbors(item:SemanticVector,corpus:SemanticVector[],limit=3){
 return corpus.filter(row=>row.id!==item.id && row.model===item.model && row.template_version===item.template_version)
  .flatMap(row=>{const similarity=cosine(item.vector,row.vector);
   return similarity===null?[]:[{id:row.id,title:row.title,description:row.description,similarity}];})
  .sort((a,b)=>b.similarity-a.similarity||a.id.localeCompare(b.id)).slice(0,limit);
}
