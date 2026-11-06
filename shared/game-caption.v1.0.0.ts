/** Public text is the sole pre-answer field. All other fields stay private. */
export {default as captionStyle} from "./game-caption-style.v1.1.0.json";
export class CaptionValidationError extends Error {}
export interface CaptionDraft {
  game_caption: string; caption_version: "1.0.0"; caption_generator_version: string;
  caption_provenance_refs: string[]; caption_context_fictional: boolean;
  context_mode: "visible" | "documented" | "fictional";
}
export function validateCaption(value: unknown, origin: "REAL" | "AI"): CaptionDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CaptionValidationError("Didascalia non valida");
  const v=value as CaptionDraft;
  if(Object.keys(v).sort().join()!==["game_caption","caption_version","caption_generator_version","caption_provenance_refs","caption_context_fictional","context_mode"].sort().join()) throw new CaptionValidationError("Campi della didascalia non validi");
  const text=v.game_caption;
  if(typeof text!=="string" || !text.trim() || text!==text.trim() || Array.from(text).length>120 || /[<>\r\n!?]|\p{Extended_Pictographic}/u.test(text) || /[.]\s+\S/.test(text) || /\b(real|slop|ai.generated|generat[aoie]|sintetic[aoie]|incredibile|straordinari[ao]|capolavoro|vergogn[ao]|clicca|scopri)\b/i.test(text)) throw new CaptionValidationError("Usare una sola frase neutra, senza markup, entro 120 caratteri");
  if(v.caption_version!=="1.0.0" || typeof v.caption_generator_version!=="string" || !/^[\w.-]{1,100}$/.test(v.caption_generator_version) || !Array.isArray(v.caption_provenance_refs) || v.caption_provenance_refs.length>20 || !v.caption_provenance_refs.every(r=>typeof r==="string"&&/^[\w:-]{1,160}$/.test(r)) || new Set(v.caption_provenance_refs).size!==v.caption_provenance_refs.length) throw new CaptionValidationError("Versione o riferimenti privati non validi");
  if(origin==="REAL" && (v.caption_context_fictional!==false || !["visible","documented"].includes(v.context_mode) || v.context_mode==="documented"&&!v.caption_provenance_refs.length)) throw new CaptionValidationError("Contesto REAL specifico richiede evidenze documentali verificate");
  if(origin==="AI" && (v.caption_context_fictional!==true || v.context_mode!=="fictional" || v.caption_provenance_refs.length!==0)) throw new CaptionValidationError("Contesto SLOP fittizio e separato dalle fonti REAL richiesto");
  return v;
}
export function captionDiagnostics(rows:{origin:"REAL"|"AI";text:string;emotion:string;geographic:boolean;temporal:boolean}[]) {
  const byOrigin=(["REAL","AI"]as const).map(origin=>{const r=rows.filter(r=>r.origin===origin);return {origin,n:r.length,mean_length:r.length?r.reduce((n,r)=>n+Array.from(r.text).length,0)/r.length:null,geographic:r.filter(r=>r.geographic).length,temporal:r.filter(r=>r.temporal).length};});
  // Leave-one-emotion-out lexical Naive Bayes. Paired/grouped folds avoid
  // training on the other class's copy of a held-out style example.
  let correct=0,n=0;
  const tokens=(text:string)=>text.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
  for(const emotion of new Set(rows.map(r=>r.emotion))){const train=rows.filter(r=>r.emotion!==emotion),test=rows.filter(r=>r.emotion===emotion),vocabulary=new Set(train.flatMap(r=>tokens(r.text)));
    const models=(["REAL","AI"]as const).map(origin=>{const words=train.filter(r=>r.origin===origin).flatMap(r=>tokens(r.text)),counts=new Map<string,number>();for(const word of words)counts.set(word,(counts.get(word)||0)+1);return {origin,counts,total:words.length};});
    for(const row of test){const scores=models.map(m=>tokens(row.text).reduce((s,w)=>s+Math.log(((m.counts.get(w)||0)+1)/(m.total+Math.max(1,vocabulary.size))),0));correct+=Math.abs(scores[0]-scores[1])<1e-10?.5:models[scores[0]>scores[1]?0:1].origin===row.origin?1:0;n++;}
  }
  return {version:"1.0.0",by_origin:byOrigin,caption_only_accuracy:n?correct/n:null,n,method:"leave-one-emotion-out lexical Naive Bayes; ties count one half",limitations:"Small editorial fixtures do not establish absence of leakage on a production corpus; owner review and a held-out real corpus remain required."};
}
