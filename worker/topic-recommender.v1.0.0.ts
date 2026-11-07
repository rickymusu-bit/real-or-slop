import {hash,HttpError,type Env} from "./core";
import {topicKey} from "../shared/editorial-workspace.v1.0.0";
import {suggestedTopicTitle,similarTopic} from "../shared/editorial-intelligence.v1.0.0";
import {semanticNeighbors,type SemanticVector} from "../shared/topic-vectors.v1.0.0";
import {createTopicSemantics,semanticTopicDescription} from "./topic-semantic-memory.v1.0.0";
import {fields,modelJSON} from "./workspace-ai.v1.0.0";

interface CorpusRow {id:string;title:string;description:string;model:string;template_version:string;vector_json:string|null}
async function corpus(env:Env):Promise<SemanticVector[]> {
 const rows=await env.DB.prepare(`SELECT 'topic:'||t.id AS id,t.title,s.description,s.model,s.template_version,s.vector_json
  FROM editorial_workspace_topics t JOIN editorial_topic_semantics s ON s.topic_id=t.id WHERE s.embedding_status='ready'
  UNION ALL SELECT 'history:'||h.topic_id||':'||h.input_sha256,t.title,h.description,h.model,h.template_version,h.vector_json
  FROM editorial_topic_semantic_history h JOIN editorial_workspace_topics t ON t.id=h.topic_id WHERE h.embedding_status='ready'
  UNION ALL SELECT 'suggestion:'||t.id,t.title,s.description,s.model,s.template_version,s.vector_json
  FROM editorial_topic_suggestions t JOIN editorial_topic_suggestion_semantics s ON s.topic_id=t.id WHERE s.embedding_status='ready'`).all<CorpusRow>();
 return rows.results.flatMap(row=>{
  try{const vector=JSON.parse(row.vector_json || "null") as number[];return Array.isArray(vector)?[{...row,vector}]:[];}
  catch{return [];}
 });
}
export async function suggestTopics(env:Env,operationId:string){
 // Read all topic outcomes, including zero-hit, deferred and rejected proposals.
 const history=(await env.DB.prepare(`SELECT t.id,t.title,s.description,COALESCE((SELECT CASE WHEN e.status='completed' AND e.candidates=0 THEN 'exhausted' ELSE e.status END FROM editorial_topic_explorations e WHERE e.topic_id=t.id ORDER BY e.created_at DESC LIMIT 1),'owner') AS status FROM editorial_workspace_topics t
  LEFT JOIN editorial_topic_semantics s ON s.topic_id=t.id UNION ALL
  SELECT t.id,t.title,s.description,t.status FROM editorial_topic_suggestions t
  LEFT JOIN editorial_topic_suggestion_semantics s ON s.topic_id=t.id`).all<{
   id:string;title:string;description:string|null;status:string
  }>()).results;
 const reply=await modelJSON(env,"suggest",null,"suggest:"+operationId,{history},
  "Propose five specific, diverse, photographically feasible topics. Each needs a self-contained English description of at most 500 characters and a rationale. Use owner topic feedback and coverage, never image preferences. Do not invent factual events. Avoid redundant topics but allow distinct events, periods, or perspectives within similar subjects. No taxonomy or required date/location fields.",
  "Topic history and owner outcomes: "+JSON.stringify(history),fields.suggestion);
 const values=Array.isArray(reply.suggestions)?reply.suggestions.slice(0,5):[];
 const candidates:Array<{id:string;title:string;description:string;rationale:string;vector:SemanticVector|null}>=[];
 for(let slot=0;slot<values.length;slot++){
  const raw=values[slot] as {title?:unknown;description?:unknown;rationale?:unknown};
  let title:string,description:string;
  try{title=suggestedTopicTitle(raw?.title);description=semanticTopicDescription(raw?.description);}catch{continue;}
  if(!description || typeof raw.rationale!=="string" || !raw.rationale.trim())continue;
  const digest=await hash(operationId+":"+slot),id=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join("-");
  const existing=await env.DB.prepare("SELECT id FROM editorial_topic_suggestions WHERE normalized_key=?").bind(topicKey(title)).first<{id:string}>();
  if(existing && existing.id!==id)continue;
  // Exact identities can be excluded without a semantic claim. Cosine/lexical similarity alone cannot reject an event.
  if(history.some(row=>row.id!==id && topicKey(row.title)===topicKey(title)))continue;
  const stamp=new Date().toISOString(),rationale=raw.rationale.trim().slice(0,400);
  await env.DB.batch([
   env.DB.prepare("INSERT OR IGNORE INTO editorial_topic_suggestions(id,title,normalized_key,rationale,status,created_at,updated_at) VALUES(?,?,?,?,'suggested',?,?)")
    .bind(id,title,topicKey(title),rationale,stamp,stamp),
   env.DB.prepare("INSERT OR IGNORE INTO editorial_topic_suggestion_screening(suggestion_id,operation_id,slot) VALUES(?,?,?)").bind(id,operationId,slot)
  ]);
  await createTopicSemantics(env,id,title,description,"suggestion");
  candidates.push({id,title,description,rationale,vector:null});
 }
 const all=await corpus(env);
 const comparisons=candidates.map(item=>{
  item.vector=all.find(row=>row.id==="suggestion:"+item.id) || null;
  const neighbors=item.vector?semanticNeighbors(item.vector,all):[];
  // Unindexed text remains part of duplicate review; do not silently omit historical topics.
  const lexical=history.filter(row=>row.id!==item.id&&similarTopic(row.title,item.title)).map(row=>({title:row.title,description:row.description}));
  return {id:item.id,title:item.title,description:item.description,neighbors,unindexed_text_matches:lexical};
 });
 if(!comparisons.length)return {suggested:0,compared_records:all.length};
 let decisions:unknown;
 try{
  const result=await modelJSON(env,"suggest",null,"suggest-check:"+operationId,{comparisons},
   "Review proposed topics against nearest semantic neighbors and text matches. Mark duplicate ONLY for the same subject, episode and perspective restated. Similar events on different dates, locations, durations or perspectives are valid distinct topics. High cosine alone never proves identity. Return one decision and a concise reason for each candidate id. Assess feasibility and specificity. Do not certify an event as true.",
   JSON.stringify(comparisons),fields.duplicates);
  decisions=result.decisions;
 }catch(error){
  await env.DB.prepare("UPDATE editorial_topic_suggestion_screening SET status='uncertain' WHERE operation_id=? AND status='pending'").bind(operationId).run();
  throw error;
 }
 if(!Array.isArray(decisions) || comparisons.some(c=>decisions.filter((d:{id?:unknown})=>d?.id===c.id).length!==1))
  throw new HttpError(502,"Verifica semantica incompleta: proposte conservate in attesa");
 let suggested=0;
 for(const comparison of comparisons){
  const decision=decisions.find((d:{id?:unknown})=>d?.id===comparison.id) as {duplicate:unknown;reason:unknown};
  if(typeof decision.duplicate!=="boolean" || typeof decision.reason!=="string" || !decision.reason.trim())
   throw new HttpError(502,"Esito semantico non valido");
  const novelty=comparison.neighbors.length?1-comparison.neighbors[0].similarity:null;
  await env.DB.prepare("UPDATE editorial_topic_suggestion_screening SET status=?,novelty=?,neighbors_json=?,reason=? WHERE suggestion_id=?")
   .bind(decision.duplicate?"duplicate":"ready",novelty,JSON.stringify(comparison.neighbors),decision.reason.slice(0,1000),comparison.id).run();
  if(!decision.duplicate)suggested++;
 }
 return {suggested,compared_records:all.length,embedding_ready:candidates.filter(c=>c.vector).length};
}
