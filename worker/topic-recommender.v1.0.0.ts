import {hash,HttpError,type Env} from "./core";
import {topicKey} from "../shared/editorial-workspace.v1.0.0";
import {suggestedTopicTitle,similarTopic} from "../shared/editorial-intelligence.v1.0.0";
import {semanticNeighbors,type SemanticVector} from "../shared/topic-vectors.v1.0.0";
import {createTopicSemantics,semanticTopicDescription} from "./topic-semantic-memory.v1.0.0";
import {fields,modelJSON} from "./workspace-ai.v1.0.0";
import {eligibleTopic,topicAssessment,topicProposalInstructions,topicReviewInstructions,topicSuggestionPolicyVersion} from "../shared/topic-suggestion-policy.v1.0.0";

interface CorpusRow {id:string;title:string;description:string;model:string;template_version:string;vector_json:string|null}
async function corpus(env:Env,operationId:string):Promise<SemanticVector[]> {
 const rows=await env.DB.prepare(`SELECT 'topic:'||t.id AS id,t.title,s.description,s.model,s.template_version,s.vector_json
  FROM editorial_workspace_topics t JOIN editorial_topic_semantics s ON s.topic_id=t.id WHERE s.embedding_status='ready'
  UNION ALL SELECT 'history:'||h.topic_id||':'||h.input_sha256,t.title,h.description,h.model,h.template_version,h.vector_json
  FROM editorial_topic_semantic_history h JOIN editorial_workspace_topics t ON t.id=h.topic_id WHERE h.embedding_status='ready'
  UNION ALL SELECT 'suggestion:'||t.id,t.title,s.description,s.model,s.template_version,s.vector_json
  FROM editorial_topic_suggestions t JOIN editorial_topic_suggestion_semantics s ON s.topic_id=t.id
  LEFT JOIN editorial_topic_suggestion_assessments a ON a.suggestion_id=t.id
  LEFT JOIN editorial_topic_suggestion_screening c ON c.suggestion_id=t.id
  WHERE s.embedding_status='ready' AND (a.suggestion_id IS NULL OR a.status='eligible' OR (a.status='pending' AND c.operation_id=?))`)
   .bind(operationId).all<CorpusRow>();
 return rows.results.flatMap(row=>{
  try{const vector=JSON.parse(row.vector_json || "null") as number[];return Array.isArray(vector)?[{...row,vector}]:[];}
  catch{return [];}
 });
}
export async function topicMemoryStatus(env:Env){
 const topics=await env.DB.prepare("SELECT count(*) AS total,COALESCE(sum(s.embedding_status='ready'),0) AS indexed FROM editorial_workspace_topics t LEFT JOIN editorial_topic_semantics s ON s.topic_id=t.id")
  .first<{total:number;indexed:number}>();
 const proposals=await env.DB.prepare("SELECT count(*) AS total,COALESCE(sum(t.status IN ('accepted','rejected','deferred')),0) AS owner_reviewed FROM editorial_topic_suggestions t")
  .first<{total:number;owner_reviewed:number}>();
 return {topics:topics?.total || 0,indexed_topics:topics?.indexed || 0,proposals:proposals?.total || 0,
  owner_reviewed_proposals:proposals?.owner_reviewed || 0,quality_validated:false as const,coverage_validated:false as const};
}
export async function suggestTopics(env:Env,operationId:string){
 const prior=await env.DB.prepare("SELECT status,result_json FROM editorial_topic_suggestion_runs WHERE id=?")
  .bind(operationId).first<{status:string;result_json:string|null}>();
 if(prior){
  if(prior.status==="completed" && prior.result_json)return JSON.parse(prior.result_json) as Record<string,unknown>;
  throw new HttpError(409,"Suggerimento già avviato, fallito o incerto: nessun reinvio automatico");
 }
 const stamp=new Date().toISOString();
 const lease=await env.DB.prepare("INSERT OR IGNORE INTO editorial_topic_suggestion_runs VALUES(?,'preparing',NULL,?,?)")
  .bind(operationId,stamp,stamp).run();
 if(!lease.meta.changes)throw new HttpError(409,"Suggerimento concorrente già avviato");
 try{
  const result=await createSuggestions(env,operationId);
  await env.DB.prepare("UPDATE editorial_topic_suggestion_runs SET status='completed',result_json=?,updated_at=? WHERE id=? AND status='preparing'")
   .bind(JSON.stringify(result),new Date().toISOString(),operationId).run();
  return result;
 }catch(error){
  await env.DB.prepare("UPDATE editorial_topic_suggestion_runs SET status=?,updated_at=? WHERE id=? AND status='preparing'")
   .bind(error instanceof HttpError && error.status===502?"uncertain":"failed",new Date().toISOString(),operationId).run();
  throw error;
 }
}
async function createSuggestions(env:Env,operationId:string){
 // Read all topic outcomes, including zero-hit, deferred and rejected proposals.
 const history=(await env.DB.prepare(`SELECT t.id,t.title,s.description,COALESCE((SELECT CASE WHEN e.status='completed' AND e.candidates=0 THEN 'exhausted' ELSE e.status END FROM editorial_topic_explorations e WHERE e.topic_id=t.id ORDER BY e.created_at DESC LIMIT 1),'owner') AS status,NULL AS model_eligibility FROM editorial_workspace_topics t
  LEFT JOIN editorial_topic_semantics s ON s.topic_id=t.id UNION ALL
  SELECT t.id,t.title,COALESCE(s.description,a.description),t.status,a.status AS model_eligibility FROM editorial_topic_suggestions t
  LEFT JOIN editorial_topic_suggestion_semantics s ON s.topic_id=t.id
  LEFT JOIN editorial_topic_suggestion_assessments a ON a.suggestion_id=t.id`).all<{
   id:string;title:string;description:string|null;status:string
  }>()).results;
 const reply=await modelJSON(env,"suggest",null,"suggest:"+operationId,{history,policy_version:topicSuggestionPolicyVersion},
  topicProposalInstructions,
  "Topic history and owner outcomes: "+JSON.stringify(history),fields.suggestion);
 if(!Array.isArray(reply.suggestions) || reply.suggestions.length>5)throw new HttpError(502,"Risposta suggerimenti incompleta: nessun reinvio automatico");
 const values=reply.suggestions;
 const candidates:Array<{id:string;title:string;description:string;rationale:string;vector:SemanticVector|null}>=[];
 let invalidAssessment=false;
 for(let slot=0;slot<values.length;slot++){
  const raw=values[slot] as {title?:unknown;description?:unknown;rationale?:unknown;assessment?:unknown};
  let title:string,description:string;
  try{title=suggestedTopicTitle(raw?.title);description=semanticTopicDescription(raw?.description);}catch{continue;}
  if(!description || typeof raw.rationale!=="string" || !raw.rationale.trim())continue;
  const digest=await hash(operationId+":"+slot),id=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join("-");
  const existing=await env.DB.prepare("SELECT id FROM editorial_topic_suggestions WHERE normalized_key=?").bind(topicKey(title)).first<{id:string}>();
  if(existing && existing.id!==id)continue;
  // Exact identities can be excluded without a semantic claim. Cosine/lexical similarity alone cannot reject an event.
  if(history.some(row=>row.id!==id && topicKey(row.title)===topicKey(title)))continue;
  const stamp=new Date().toISOString(),rationale=raw.rationale.trim().slice(0,400);
  let assessment=null;
  try{assessment=topicAssessment(raw.assessment);}catch{invalidAssessment=true;}
  const state=assessment?(eligibleTopic(assessment)?"pending":"ineligible"):"uncertain";
  await env.DB.batch([
   env.DB.prepare("INSERT OR IGNORE INTO editorial_topic_suggestions(id,title,normalized_key,rationale,status,created_at,updated_at) VALUES(?,?,?,?,'suggested',?,?)")
    .bind(id,title,topicKey(title),rationale,stamp,stamp),
   env.DB.prepare("INSERT OR IGNORE INTO editorial_topic_suggestion_screening(suggestion_id,operation_id,slot) VALUES(?,?,?)").bind(id,operationId,slot),
   env.DB.prepare("INSERT OR IGNORE INTO editorial_topic_suggestion_assessments(suggestion_id,policy_version,description,assessment_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .bind(id,topicSuggestionPolicyVersion,description,JSON.stringify(assessment || {error:"invalid_assessment"}),state,stamp,stamp)
  ]);
  if(state!=="pending")continue; // Do not embed or compare an ineligible/unknown proposal.
  await createTopicSemantics(env,id,title,description,"suggestion");
  candidates.push({id,title,description,rationale,vector:null});
 }
 if(invalidAssessment)throw new HttpError(502,"Valutazione di plausibilità incompleta: proposte conservate senza ammissione");
 const all=await corpus(env,operationId);
 const batchIds=new Set((await env.DB.prepare("SELECT suggestion_id FROM editorial_topic_suggestion_screening WHERE operation_id=?")
  .bind(operationId).all<{suggestion_id:string}>()).results.map(row=>"suggestion:"+row.suggestion_id));
 const historical=all.filter(row=>!batchIds.has(row.id));
 const comparisons=candidates.map(item=>{
  item.vector=all.find(row=>row.id==="suggestion:"+item.id) || null;
  const neighbors=item.vector?semanticNeighbors(item.vector,historical):[];
  const batchNeighbors=item.vector?semanticNeighbors(item.vector,all.filter(row=>batchIds.has(row.id))):[];
  // Unindexed text remains part of duplicate review; do not silently omit historical topics.
  const lexical=history.filter(row=>row.id!==item.id&&similarTopic(row.title,item.title)).map(row=>({title:row.title,description:row.description}));
  return {id:item.id,title:item.title,description:item.description,neighbors,batch_neighbors:batchNeighbors,unindexed_text_matches:lexical};
 });
 if(!comparisons.length)return {suggested:0,compared_records:historical.length};
 let decisions:unknown;
 try{
  const result=await modelJSON(env,"suggest",null,"suggest-check:"+operationId,{comparisons},
   topicReviewInstructions,
   JSON.stringify(comparisons),fields.duplicates);
  decisions=result.decisions;
 }catch(error){
  await env.DB.prepare("UPDATE editorial_topic_suggestion_screening SET status='uncertain' WHERE operation_id=? AND status='pending'").bind(operationId).run();
  await env.DB.prepare("UPDATE editorial_topic_suggestion_assessments SET status='uncertain',updated_at=? WHERE status='pending' AND suggestion_id IN (SELECT suggestion_id FROM editorial_topic_suggestion_screening WHERE operation_id=?)").bind(new Date().toISOString(),operationId).run();
  throw error;
 }
 if(!Array.isArray(decisions) || decisions.length!==comparisons.length || comparisons.some(c=>decisions.filter((d:{id?:unknown})=>d?.id===c.id).length!==1) ||
   decisions.some(d=>!d || typeof d!=="object" || typeof d.eligible!=="boolean" || typeof d.duplicate!=="boolean" || typeof d.reason!=="string" || !d.reason.trim() || d.reason.length>1000)){
  await env.DB.prepare("UPDATE editorial_topic_suggestion_assessments SET status='uncertain',updated_at=? WHERE status='pending' AND suggestion_id IN (SELECT suggestion_id FROM editorial_topic_suggestion_screening WHERE operation_id=?)").bind(new Date().toISOString(),operationId).run();
  throw new HttpError(502,"Verifica semantica incompleta: proposte conservate senza ammissione");
 }
 let suggested=0;
 for(const comparison of comparisons){
  const decision=decisions.find((d:{id?:unknown})=>d?.id===comparison.id) as {eligible:boolean;duplicate:boolean;reason:string};
  const novelty=comparison.neighbors.length?1-comparison.neighbors[0].similarity:null;
  await env.DB.batch([
   env.DB.prepare("UPDATE editorial_topic_suggestion_screening SET status=?,novelty=?,neighbors_json=?,reason=? WHERE suggestion_id=?")
    .bind(decision.duplicate?"duplicate":"ready",novelty,JSON.stringify(comparison.neighbors),decision.reason.slice(0,1000),comparison.id),
   env.DB.prepare("UPDATE editorial_topic_suggestion_assessments SET status=?,review_json=?,updated_at=? WHERE suggestion_id=? AND status NOT IN ('ineligible')")
    .bind(decision.eligible?"eligible":"ineligible",JSON.stringify(decision),new Date().toISOString(),comparison.id)
  ]);
  if(decision.eligible && !decision.duplicate)suggested++;
 }
 return {suggested,compared_records:historical.length,embedding_ready:candidates.filter(c=>c.vector).length};
}
