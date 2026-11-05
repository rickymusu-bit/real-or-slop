import { check, isCell } from "./editorial-matrix.v4.0.0";
export interface MatrixBrief {
  brief_id: string; revision: number; taxonomy_version: "4.0.0"; intent_emotion: string; intent_topic: string;
  medium: "photograph" | "artwork"; description: string; tags: string[]; search_queries: string[]; slop_prompt: string;
  seed: number; model: string; instructions_version: string;
  catalog: { id: string; version: string; sha256: string };
  selection: {run_id:string;method:"uniform"|"adaptive";events_sha256:string;config_sha256:string;weight:number};
  parameters: {size:"1024x1024";quality:"low"|"medium"|"high";image_model:string;evaluator_model:string};
}
const keys=(v:object,list:string[])=>Object.keys(v).sort().join()===list.sort().join();
export const sha256 = (v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
export const identifier = (v:unknown):v is string=>typeof v==="string"&&/^[\w-]{1,160}$/.test(v);
const model=(v:unknown)=>typeof v==="string"&&/^[\w.-]{1,160}$/.test(v);
const english=(v:unknown,max:number)=>typeof v==="string"&&v.trim()&&v.length<=max&&!/\b(una|uno|della|delle|nella|vicino|ritratto|visibile|circostante)\b/i.test(v)&&new Set(v.toLowerCase().match(/\b(a|an|the|of|with|and|on|near|beside|surrounding|visible)\b/g)||[]).size>=2;
export function validateBrief(value:unknown):MatrixBrief {
  check(value&&typeof value==="object"&&!Array.isArray(value),"Frozen brief required");const b=value as MatrixBrief;
  check(keys(b,["brief_id","revision","taxonomy_version","intent_emotion","intent_topic","medium","description","tags","search_queries","slop_prompt","seed","model","instructions_version","catalog","selection","parameters"]),"Frozen brief has unexpected/source-derived fields");
  check(identifier(b.brief_id)&&Number.isSafeInteger(b.revision)&&b.revision>0&&b.taxonomy_version==="4.0.0"&&isCell(b.intent_emotion+":"+b.intent_topic),"Invalid brief identity or cell");
  check(["photograph","artwork"].includes(b.medium)&&english(b.description,1000)&&english(b.slop_prompt,2000)&&!/(https?:\/\/|data:image|base64)/i.test(b.slop_prompt),"Standalone canonical English brief required");
  check(Array.isArray(b.tags)&&b.tags.length>=1&&b.tags.length<=12&&new Set(b.tags).size===b.tags.length&&b.tags.every(t=>typeof t==="string"&&/^[a-z][a-z0-9_ -]{0,99}$/.test(t)),"Canonical English tags required");
  check(Array.isArray(b.search_queries)&&b.search_queries.length>=2&&b.search_queries.length<=8&&b.search_queries.every(q=>typeof q==="string"&&q.trim()&&q.length<=200),"Invalid initial search queries");
  check(Number.isSafeInteger(b.seed)&&b.seed>=0&&b.seed<=4294967295&&model(b.model)&&/^\d+\.\d+\.\d+$/.test(b.instructions_version),"Frozen generation instructions/seed required");
  check(b.catalog&&keys(b.catalog,["id","version","sha256"])&&identifier(b.catalog.id)&&/^\d+\.\d+\.\d+$/.test(b.catalog.version)&&sha256(b.catalog.sha256),"Versioned catalogue reference required");
  check(b.selection&&keys(b.selection,["run_id","method","events_sha256","config_sha256","weight"])&&identifier(b.selection.run_id)&&["uniform","adaptive"].includes(b.selection.method)&&sha256(b.selection.events_sha256)&&sha256(b.selection.config_sha256)&&Number.isFinite(b.selection.weight)&&b.selection.weight>0&&b.selection.weight<=1,"Frozen selection context required");
  check(b.parameters&&keys(b.parameters,["size","quality","image_model","evaluator_model"])&&b.parameters.size==="1024x1024"&&["low","medium","high"].includes(b.parameters.quality)&&model(b.parameters.image_model)&&model(b.parameters.evaluator_model),"Frozen output parameters required");
  return b;
}
