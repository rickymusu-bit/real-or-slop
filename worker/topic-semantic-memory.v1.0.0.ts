/** v1.0.0: incremental semantic memory on every owner topic submission.
 * Topic Discovery OFF never disables recording/embedding. No fabricated vectors.
 */
import { hash, HttpError, type Env } from "./core";

export const TOPIC_SEMANTIC_TEMPLATE_VERSION="1.0.0";
export const TOPIC_EMBEDDING_DIMENSIONS=1536;
export const DEFAULT_TOPIC_EMBEDDING_MODEL="text-embedding-3-small";
export type EmbeddingStatus = "pending"|"submitting"|"ready"|"uncertain"|"failed";

export function semanticTopicDescription(raw: unknown):string {
  if(raw===undefined || raw===null)return "";
  if(typeof raw!=="string")throw new Error("Descrizione semantica non valida");
  const value=raw.normalize("NFKC").trim().replace(/\s+/g," ");
  if(value.length>500)throw new Error("Descrizione semantica: massimo 500 caratteri");
  return value;
}
export function semanticTopicText(title:string,description:string):string {
  return "Topic: "+title.normalize("NFKC").trim()+"\n"+
    (description ? "Description: "+description.normalize("NFKC").trim() : "Description: (not yet supplied)");
}
export function embeddingConfig(env:Env):{model:string;cost:number;daily:number;total:number}|null {
  const model=env.TOPIC_EMBEDDING_MODEL || DEFAULT_TOPIC_EMBEDDING_MODEL;
  const cost=Number(env.TOPIC_EMBEDDING_CALL_USD),daily=Number(env.TOPIC_EMBEDDING_DAILY_USD),
    total=Number(env.TOPIC_EMBEDDING_TOTAL_USD);
  if(!env.OPENAI_API_KEY || !env.TOPIC_EMBEDDING_CALL_USD ||
    !env.TOPIC_EMBEDDING_DAILY_USD || !env.TOPIC_EMBEDDING_TOTAL_USD)return null;
  if(!["text-embedding-3-small","text-embedding-3-large"].includes(model))
    throw new HttpError(503,"Modello embedding non supportato");
  if(![cost,daily,total].every(x=>Number.isFinite(x)&&x>=0.000001) || cost>daily || daily>total)
    throw new HttpError(503,"Limiti economici per gli embedding non validi");
  return {model,cost,daily,total};
}
interface State {embedding_status:EmbeddingStatus;model:string;input_sha256:string}
async function storeStatus(env:Env,topicId:string,status:EmbeddingStatus,code:string|null) {
  await env.DB.prepare("UPDATE editorial_topic_semantics SET embedding_status=?,error_code=?,updated_at=? WHERE topic_id=? AND embedding_status!='ready'")
    .bind(status,code,new Date().toISOString(),topicId).run();
}
export async function embedTopicOnSubmission(env:Env,topicId:string):Promise<EmbeddingStatus> {
  const row=await env.DB.prepare("SELECT embedding_status,model,input_sha256 FROM editorial_topic_semantics WHERE topic_id=?")
    .bind(topicId).first<State>();
  if(!row)throw new HttpError(503,"Dati semantici dell'argomento non disponibili");
  if(row.embedding_status!=="pending")return row.embedding_status;
  const config=embeddingConfig(env);
  if(!config)return "pending"; // The text was recorded; no misleading claim of completed embedding.
  if(row.model!==config.model){await storeStatus(env,topicId,"failed","model_mismatch");return "failed";}
  const reservationId="topicemb-"+await hash([topicId,row.input_sha256,config.model].join("\0"));
  const run="topic-"+topicId,day=new Date().toISOString().slice(0,10),now=new Date().toISOString();
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO editorial_usage
    SELECT ?,?,?,?,?,? WHERE
    round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage),0)+?,6)<=? AND
    round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage WHERE day=?),0)+?,6)<=? AND
    (SELECT count(*) FROM editorial_usage WHERE run_id=?)=0`)
    .bind(reservationId,run,day,"evaluation",config.cost,now,
      config.cost,config.total,day,config.cost,config.daily,run).run();
  if(result.meta.changes!==1){
    // No extra request if the reservation has already been used, or the budget is exhausted.
    const previous=await env.DB.prepare("SELECT id FROM editorial_usage WHERE id=?")
      .bind(reservationId).first<{id:string}>();
    if(previous){await storeStatus(env,topicId,"uncertain","previous_reservation");return "uncertain";}
    await env.DB.prepare("UPDATE editorial_topic_semantics SET error_code='budget_limited' WHERE topic_id=?")
      .bind(topicId).run();
    return "pending";
  }
  const lock=await env.DB.prepare("UPDATE editorial_topic_semantics SET embedding_status='submitting',updated_at=? WHERE topic_id=? AND embedding_status='pending'")
    .bind(new Date().toISOString(),topicId).run();
  if(lock.meta.changes!==1)return "uncertain";
  const inputRow=await env.DB.prepare("SELECT input_text FROM editorial_topic_semantics WHERE topic_id=?")
    .bind(topicId).first<{input_text:string}>();
  if(!inputRow){await storeStatus(env,topicId,"uncertain","input_missing");return "uncertain";}
  try {
    const response=await fetch("https://api.openai.com/v1/embeddings",{
      method:"POST",redirect:"manual",
      headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({model:config.model,input:inputRow.input_text,
        dimensions:TOPIC_EMBEDDING_DIMENSIONS,encoding_format:"float"})
    });
    if(response.status!==200)throw new Error("Provider returned "+response.status);
    const result=await response.json() as {model?:string;data?:Array<{index:number;embedding:unknown}>;usage?:{total_tokens?:number}};
    const vector=result.data?.[0]?.embedding;
    if(result.model!==config.model || result.data?.length!==1 || result.data[0].index!==0 ||
      !Array.isArray(vector) || vector.length!==TOPIC_EMBEDDING_DIMENSIONS ||
      vector.some(x=>typeof x!=="number" || !Number.isFinite(x)))
      throw new Error("Embedding API response invalid");
    const tokens=result.usage?.total_tokens;
    if(!Number.isInteger(tokens) || !tokens || tokens>8192)throw new Error("Token usage invalid");
    await env.DB.prepare("UPDATE editorial_topic_semantics SET embedding_status='ready',vector_json=?,dimensions=?,input_tokens=?,error_code=NULL,updated_at=? WHERE topic_id=? AND embedding_status='submitting'")
      .bind(JSON.stringify(vector),vector.length,tokens,new Date().toISOString(),topicId).run();
    return "ready";
  }catch{
    await storeStatus(env,topicId,"uncertain","provider_result_uncertain");
    return "uncertain"; // never silently retry a potentially billable call
  }
}
export async function createTopicSemantics(env:Env,topicId:string,title:string,description:string):Promise<EmbeddingStatus> {
  // Always persist semantic text before inspecting provider config or budgets.
  const model=env.TOPIC_EMBEDDING_MODEL || DEFAULT_TOPIC_EMBEDDING_MODEL;
  const inputText=semanticTopicText(title,description);
  const digest=await hash(inputText);
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO editorial_topic_semantics
    (topic_id,description,input_text,input_sha256,template_version,model,embedding_status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'pending',?,?)`).bind(topicId,description,inputText,digest,
      TOPIC_SEMANTIC_TEMPLATE_VERSION,model,now,now).run();
  return embedTopicOnSubmission(env,topicId);
}
