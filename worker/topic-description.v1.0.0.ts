import { hash, HttpError, id, type Env } from "./core";
import { topicKey, topicTitle } from "../shared/editorial-workspace.v1.0.0";
import { descriptionInstructions, descriptionProposal } from "../shared/topic-description.v1.0.0";
import { DEFAULT_TOPIC_EMBEDDING_MODEL, semanticTopicDescription, semanticTopicText, TOPIC_SEMANTIC_TEMPLATE_VERSION } from "./topic-semantic-memory.v1.0.0";
import { fields, modelJSON } from "./workspace-ai.v1.0.0";

type Draft={id:string;title:string;normalized_key:string;status:string;description:string|null;ambiguity:string|null;
  proposal_sha256:string|null;topic_id:string|null;approved_description:string|null;successor_id:string|null};
const table="editorial_topic_description_drafts";
const now=()=>new Date().toISOString();
function uuid(value:unknown):string {
  if(typeof value!=="string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))
    throw new HttpError(400,"Identificativo operazione richiesto");
  return value;
}
export async function descriptionDraft(env:Env,draftId:string):Promise<Draft> {
  const row=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(uuid(draftId)).first<Draft>();
  if(!row)throw new HttpError(404,"Bozza non trovata");
  return row;
}
function current(draft:Draft,title:string,expected:unknown) {
  if(draft.title!==title || !draft.proposal_sha256 || draft.proposal_sha256!==expected)
    throw new HttpError(409,"Proposta o titolo modificati: ricaricare la bozza prima di confermare");
}
export function publicDraft(draft:Draft) {
  return {id:draft.id,title:draft.title,status:draft.status,description:draft.description,ambiguity:draft.ambiguity,
    proposal_sha256:draft.proposal_sha256};
}
export async function proposeDescription(env:Env,title:string,operationId:unknown,previous?:{id:string;expected:unknown}) {
  const draftId=uuid(operationId),key=topicKey(title),operationKey="topic-description:"+draftId;
  // Deduplicate before model configuration, budget reservation or any provider call.
  const existing=await env.DB.prepare("SELECT id FROM editorial_workspace_topics WHERE normalized_key=?").bind(key).first();
  if(existing)throw new HttpError(409,"Argomento già registrato: selezionarlo dalla lista");
  const parent=previous?await descriptionDraft(env,previous.id):null;
  if(parent && previous){
    current(parent,title,previous.expected);
    if(parent.status!=="ready" && !(parent.status==="superseded" && parent.successor_id===draftId))
      throw new HttpError(409,"La proposta non è più rigenerabile");
  }
  const replay=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(draftId).first<Draft>();
  if(replay){
    if(replay.title!==title)throw new HttpError(409,"Identificativo già usato per un altro titolo");
    if(replay.status==="ready")return publicDraft(replay);
    // A completed provider receipt can recover a crash after the paid response, without resending.
    const job=await env.DB.prepare("SELECT status,result_json FROM editorial_topic_description_jobs WHERE operation_key=?")
      .bind(operationKey).first<{status:string;result_json:string|null}>();
    if(replay.status==="preparing" && job?.status==="completed" && job.result_json)
      return storeProposal(env,replay,JSON.parse(job.result_json));
    throw new HttpError(409,"Bozza già avviata, chiusa o incerta: nessun reinvio automatico");
  }
  const timestamp=now();
  if(parent){
    const old=parent;
    if(old.status!=="ready")throw new HttpError(409,"La proposta non è più rigenerabile");
    const result=await env.DB.batch([
      env.DB.prepare(`UPDATE ${table} SET status='superseded',successor_id=?,updated_at=? WHERE id=? AND status='ready' AND proposal_sha256=?`)
        .bind(draftId,timestamp,old.id,old.proposal_sha256),
      env.DB.prepare(`INSERT INTO ${table}(id,title,normalized_key,status,created_at,updated_at) SELECT ?,?,?,'preparing',?,? FROM ${table} WHERE id=? AND successor_id=? AND status='superseded'`)
        .bind(draftId,title,key,timestamp,timestamp,old.id,draftId)
    ]);
    if(!result[1].meta.changes)throw new HttpError(409,"Rigenerazione concorrente: ricaricare la bozza");
  }else{
    try{
      await env.DB.prepare(`INSERT INTO ${table}(id,title,normalized_key,status,created_at,updated_at) VALUES(?,?,?,'preparing',?,?)`)
        .bind(draftId,title,key,timestamp,timestamp).run();
    }catch{throw new HttpError(409,"Esiste già una proposta attiva o incerta per questo titolo: riprendere la bozza o scrivere una descrizione");}
  }
  try{
    const result=await modelJSON(env,"describe",null,operationKey,{title,template_version:"1.0.0"},
      descriptionInstructions,JSON.stringify({title}),fields.description);
    return await storeProposal(env,await descriptionDraft(env,draftId),result);
  }catch(error){
    const job=await env.DB.prepare("SELECT status FROM editorial_topic_description_jobs WHERE operation_key=?")
      .bind(operationKey).first<{status:string}>();
    const uncertain=job && job.status!=="failed";
    await env.DB.prepare(`UPDATE ${table} SET status=?,updated_at=? WHERE id=? AND status='preparing'`)
      .bind(uncertain?"uncertain":"failed",now(),draftId).run();
    throw error;
  }
}
async function storeProposal(env:Env,draft:Draft,value:unknown) {
  let proposal;
  try{proposal=descriptionProposal(value);}catch{throw new HttpError(502,"Risposta GPT non valida: nessuna indicizzazione; non ritentare alla cieca");}
  const digest=await hash(JSON.stringify({version:"1.0.0",id:draft.id,title:draft.title,...proposal}));
  const result=await env.DB.prepare(`UPDATE ${table} SET status='ready',description=?,ambiguity=?,proposal_sha256=?,updated_at=? WHERE id=? AND status='preparing'`)
    .bind(proposal.description,proposal.ambiguity,digest,now(),draft.id).run();
  if(!result.meta.changes)throw new HttpError(409,"Proposta annullata o aggiornata durante la generazione");
  return publicDraft(await descriptionDraft(env,draft.id));
}
export async function cancelDescription(env:Env,draftId:string,title:string,expected:unknown) {
  const draft=await descriptionDraft(env,draftId);current(draft,title,expected);
  if(draft.status==="cancelled")return;
  const result=await env.DB.prepare(`UPDATE ${table} SET status='cancelled',updated_at=? WHERE id=? AND status='ready' AND proposal_sha256=?`)
    .bind(now(),draft.id,draft.proposal_sha256).run();
  if(!result.meta.changes)throw new HttpError(409,"Proposta non annullabile o già confermata");
}
export async function approveDescription(env:Env,draftId:string,titleValue:unknown,descriptionValue:unknown,expected:unknown) {
  let title:string,description:string;
  try{title=topicTitle(titleValue);description=semanticTopicDescription(descriptionValue);}catch{throw new HttpError(400,"Titolo o descrizione non validi");}
  if(!description)throw new HttpError(400,"Scrivere una descrizione prima di approvare");
  const draft=await descriptionDraft(env,draftId);current(draft,title,expected);
  if(draft.status==="approved" && draft.approved_description===description && draft.topic_id)
    return {id:draft.topic_id,title,description,created_at:"",already_exists:true};
  if(draft.status!=="ready")throw new HttpError(409,"La proposta non è più approvabile");
  const topic={id:id(),title,description,created_at:now()};
  const inputText=semanticTopicText(title,description),digest=await hash(inputText);
  try{
    const result=await env.DB.batch([
      env.DB.prepare(`INSERT INTO editorial_workspace_topics(id,title,normalized_key,created_at) SELECT ?,?,?,? FROM ${table} WHERE id=? AND status='ready' AND proposal_sha256=?`)
        .bind(topic.id,title,topicKey(title),topic.created_at,draft.id,draft.proposal_sha256),
      env.DB.prepare("INSERT INTO editorial_topic_semantics(topic_id,description,input_text,input_sha256,template_version,model,embedding_status,created_at,updated_at) SELECT id,?,?,?,?,?,'pending',?,? FROM editorial_workspace_topics WHERE id=?")
        .bind(description,inputText,digest,TOPIC_SEMANTIC_TEMPLATE_VERSION,env.TOPIC_EMBEDDING_MODEL || DEFAULT_TOPIC_EMBEDDING_MODEL,topic.created_at,topic.created_at,topic.id),
      env.DB.prepare(`UPDATE ${table} SET status='approved',topic_id=?,approved_description=?,updated_at=? WHERE id=? AND status='ready' AND proposal_sha256=? AND EXISTS(SELECT 1 FROM editorial_workspace_topics WHERE id=?)`)
        .bind(topic.id,description,topic.created_at,draft.id,draft.proposal_sha256,topic.id)
    ]);
    if(!result[0].meta.changes)throw Error("stale");
  }catch{
    // A concurrent identical approval is idempotent; a different confirmation is a conflict.
    const latest=await descriptionDraft(env,draft.id);
    if(latest.status==="approved" && latest.approved_description===description && latest.topic_id)
      return {id:latest.topic_id,title,description,created_at:"",already_exists:true};
    throw new HttpError(409,"Argomento già registrato o proposta superata: ricaricare");
  }
  return {...topic,already_exists:false};
}
