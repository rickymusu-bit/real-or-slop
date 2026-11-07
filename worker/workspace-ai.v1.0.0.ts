/** Audited, opt-in model calls for the private owner dashboard.
 * The existing discovery ledger is authoritative; no cron or retry of uncertain calls.
 */
import { hash, HttpError, id, type Env } from "./core";
import { realDiscovery } from "./real-discovery";
import { descriptionProposal } from "../shared/topic-description.v1.0.0";

export type WorkspaceStage = "describe" | "suggest" | "search" | "profile" | "slop_plan" | "slop_generate";
const stages:Record<WorkspaceStage,"brief"|"strategies"|"adaptation"|"visual"|"generation"> = {
  describe:"brief",suggest:"strategies",search:"adaptation",profile:"visual",slop_plan:"brief",slop_generate:"generation"
};
// Closed allowlist, never interpolated from a request.
const jobTable=(kind:WorkspaceStage)=>kind==="describe"?"editorial_topic_description_jobs":"editorial_workspace_jobs";
const endpoint="https://api.openai.com/v1/";
function configured(env:Env,kind:WorkspaceStage):string {
  if (env.WORKSPACE_AI_ENABLED!=="true" || env.ENABLE_REAL_DISCOVERY_PAID!=="true" || !env.OPENAI_API_KEY)
    throw new HttpError(503,"IA admin disabilitata: configurare secret, flag e budget espliciti");
  if(kind==="slop_generate"){
    if(env.ENABLE_EDITORIAL_CYCLE_GENERATION!=="true" || !env.EDITORIAL_CYCLE_IMAGE_MODEL)
      throw new HttpError(503,"Generazione SLOP non abilitata");
    return env.EDITORIAL_CYCLE_IMAGE_MODEL;
  }
  if(!env.REAL_DISCOVERY_MODEL)throw new HttpError(503,"Modello editoriale non configurato");
  return env.REAL_DISCOVERY_MODEL;
}
interface Envelope {
  jobId:string; topicId:string|null; operationKey:string; kind:WorkspaceStage;
  model:string; input:Record<string,unknown>; now:string;
}
async function start(env:Env,kind:WorkspaceStage,topicId:string|null,operationKey:string,input:Record<string,unknown>) {
  const model=configured(env,kind);
  const current=await env.DB.prepare(`SELECT status,result_json FROM ${jobTable(kind)} WHERE operation_key=?`)
    .bind(operationKey).first<{status:string;result_json:string|null}>();
  if(current){
    if(current.status==="completed" && current.result_json) return {cached:JSON.parse(current.result_json) as unknown};
    throw new HttpError(409,"Operazione già avviata o incerta: non inviare nuovamente chiamate a pagamento");
  }
  const now=new Date().toISOString(),jobId=id();
  const incoming:Envelope={jobId,topicId,operationKey,kind,model,input,now};
  try {
    await env.DB.prepare(`INSERT INTO ${jobTable(kind)}(id,kind,topic_id,operation_key,status,input_json,created_at,updated_at) VALUES(?,?,?,?,'prepared',?,?,?)`)
      .bind(jobId,kind,topicId,operationKey,JSON.stringify({model,...input}),now,now).run();
  } catch {throw new HttpError(409,"Operazione concorrente già registrata");}
  const fingerprint=await hash(JSON.stringify({operationKey,model,kind,input}));
  const reserveBody={run_id:topicId || jobId,stage:stages[kind],model,fingerprint};
  try {
    const req=new Request("https://internal.invalid/api/admin/editorial/real-discovery/reserve",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(reserveBody)
    });
    await realDiscovery(req,env);
  } catch(error) {
    await env.DB.prepare(`UPDATE ${jobTable(kind)} SET status='failed',updated_at=? WHERE id=?`)
      .bind(new Date().toISOString(),jobId).run();
    throw error;
  }
  await env.DB.prepare(`UPDATE ${jobTable(kind)} SET status='submitting',updated_at=? WHERE id=? AND status='prepared'`)
    .bind(new Date().toISOString(),jobId).run();
  return {job:incoming};
}
async function finish(env:Env,job:Envelope,result:unknown) {
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE ${jobTable(job.kind)} SET status='completed',result_json=?,updated_at=? WHERE id=? AND status='submitting'`)
    .bind(JSON.stringify(result),now,job.jobId).run();
}
async function unknown(env:Env,job:Envelope) {
  await env.DB.prepare(`UPDATE ${jobTable(job.kind)} SET status='uncertain',updated_at=? WHERE id=? AND status='submitting'`)
    .bind(new Date().toISOString(),job.jobId).run();
}
function outputText(value:Record<string,unknown>):string {
  const outputs=Array.isArray(value.output) ? value.output as Array<{content?:Array<{type?:string;text?:string}>}> : [];
  return outputs.flatMap(x=>x.content || []).filter(x=>x.type==="output_text" && typeof x.text==="string").map(x=>x.text!).join("");
}
function schema(name:string,properties:Record<string,unknown>) {
  return {type:"json_schema",name,strict:true,schema:{
    type:"object",additionalProperties:false,required:Object.keys(properties),properties
  }};
}
export const fields={
  description:schema("topic_description",{description:{type:"string",minLength:1,maxLength:500},ambiguity:{type:"string",maxLength:500}}),
  suggestion:schema("topic_suggestions",{suggestions:{type:"array",items:{type:"object",additionalProperties:false,
    required:["title","description","rationale"],properties:{title:{type:"string"},description:{type:"string",maxLength:500},rationale:{type:"string"}}}}}),
  duplicates:schema("topic_duplicate_checks",{decisions:{type:"array",items:{type:"object",additionalProperties:false,
    required:["id","duplicate","reason"],properties:{id:{type:"string"},duplicate:{type:"boolean"},reason:{type:"string"}}}}}),
  relevance:schema("topic_relevance",{match:{type:"string",enum:["visible_match","mismatch","uncertain"]},reason:{type:"string"}}),
  search:schema("commons_queries",{queries:{type:"array",items:{type:"string"}}}),
  profile:schema("visual_profile",{subject:{type:"string"},action:{type:"string"},setting:{type:"string"},
    composition:{type:"string"},visibility:{type:"string"},interest:{type:"string"},
    tags:{type:"array",items:{type:"string"}}}),
  slop:schema("slop_prompts",{prompts:{type:"array",items:{type:"string"}}}),
};
export async function modelJSON(
  env:Env,kind:Exclude<WorkspaceStage,"slop_generate">,topicId:string|null,operationKey:string,
  input:Record<string,unknown>,system:string,user:string,format:Record<string,unknown>,
  image?:{mime:string;bytes:ArrayBuffer}
):Promise<Record<string,unknown>> {
  const receipt=await start(env,kind,topicId,operationKey,input);
  if("cached" in receipt)return receipt.cached as Record<string,unknown>;
  const job=receipt.job;
  const userContent:Array<Record<string,unknown>>=[{type:"input_text",text:user}];
  if(image) {
    if(image.bytes.byteLength>2_000_000){
      await unknown(env,job);
      throw new HttpError(413,"Profilo visivo: creare una copia fedele entro 2 MB prima dell'invio al modello");
    }
    const a=new Uint8Array(image.bytes);let binary="";
    for(let i=0;i<a.length;i+=8192)binary+=String.fromCharCode(...a.slice(i,i+8192));
    userContent.push({type:"input_image",image_url:"data:"+image.mime+";base64,"+btoa(binary)});
  }
  const payload={model:job.model,store:false,max_output_tokens:2000,
    input:[{role:"system",content:system},{role:"user",content:userContent}],
    text:{format}};
  try{
    const response=await fetch(endpoint+"responses",{method:"POST",redirect:"manual",signal:AbortSignal.timeout(45_000),
      headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify(payload)});
    if(response.status!==200)throw new Error("Risposta API "+response.status);
    const reply=await response.json() as Record<string,unknown>,text=outputText(reply);
    if(!text)throw Error("Risposta AI priva di JSON verificabile");
    const parsed=JSON.parse(text) as Record<string,unknown>;
    if(kind==="describe")descriptionProposal(parsed);
    await finish(env,job,parsed);
    return parsed;
  } catch {
    await unknown(env,job);
    throw new HttpError(502,"Chiamata AI incerta: vedere lo storico operazioni, non ripetere alla cieca");
  }
}
export async function modelImage(env:Env,topicId:string,operationKey:string,prompt:string,size:string) {
  const input={prompt,size};
  const receipt=await start(env,"slop_generate",topicId,operationKey,input);
  if("cached" in receipt)throw new HttpError(409,"Immagine già generata: consultare la coda");
  const job=receipt.job;
  try {
    const response=await fetch(endpoint+"images/generations",{method:"POST",redirect:"manual",
      headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({model:job.model,prompt,n:1,size,quality:"medium",output_format:"webp"})});
    if(response.status!==200)throw Error("Image API "+response.status);
    const data=await response.json() as {data?:Array<{b64_json?:string}>};
    const b64=data.data?.[0]?.b64_json;
    if(!b64 || b64.length>16_000_000)throw Error("Immagine mancante o troppo grande");
    const raw=atob(b64),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    // Mark complete only after the caller archives bytes and records the review identity.
    return {bytes:bytes.buffer,job,finish:(result:unknown)=>finish(env,job,result),
      uncertain:()=>unknown(env,job)};
  } catch {
    await unknown(env,job);
    throw new HttpError(502,"Generazione incerta: non ritentare automaticamente");
  }
}
