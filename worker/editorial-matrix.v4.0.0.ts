import {body,hash,HttpError,id,json,type Env} from "./core";
import {canonical,isCell,matrixVersion,MatrixValidationError,replay,marginals,scheduler,taxonomy,emotions,topics,validateEvent,type MatrixEvent,type MatrixFilter} from "../shared/editorial-matrix.v4.0.0";
import {identifier,sha256,validateBrief} from "../shared/editorial-brief.v4.0.0";
import {validateCaption,CaptionValidationError} from "../shared/game-caption.v1.0.0";
import {validateV2Provenance,EditorialV2ValidationError} from "../shared/editorial-v2";
import {recognizedLicense} from "../shared/licenses";
const base="/api/admin/editorial/matrix";
const ensure=(ok:unknown,message:string)=>{if(!ok)throw new HttpError(400,message);};
const object=(v:unknown):Record<string,unknown>=>{ensure(v&&typeof v==="object"&&!Array.isArray(v),"Oggetto richiesto");return v as Record<string,unknown>;};
const note=(v:unknown)=>{ensure(v===undefined||typeof v==="string"&&v.length<=2000,"Nota non valida");return String(v??"");};
interface EventRow extends Omit<MatrixEvent,"data">{data_json:string}
interface Linked {candidate_id:string;image_sha256:string;origin:"REAL"|"AI";brief_ref:string;observed_cell:string;provider:string;batch:string;created_at:string;intent_cell:string;brief_id:string;metadata_json:string;media_key:string;status:string}
const fromRow=(r:EventRow):MatrixEvent=>{const {data_json,...event}=r;return {...event,data:JSON.parse(data_json) as Record<string,unknown>};};
async function linked(env:Env,candidate:string){
  const row=await env.DB.prepare(`SELECT c.*,b.intent_cell,b.brief_id,q.metadata_json,q.media_key,q.status FROM editorial_matrix_candidates c JOIN editorial_matrix_briefs b ON b.id=c.brief_ref JOIN editorial_review_effective_images q ON q.id=c.candidate_id AND q.sha256=c.image_sha256 WHERE c.candidate_id=?`).bind(candidate).first<Linked>();
  if(!row)throw new HttpError(404,"Candidata v4 o presentazione corrente non trovata");return row;
}
function proof(metadata:Record<string,unknown>){const dossier=object(metadata.provenance);return object(dossier.provenance||dossier);}
async function pixels(env:Env,row:Linked){const file=await env.QUARANTINE?.get(row.media_key);if(!file||file.size>12000000)throw new HttpError(409,"Pixel finali non disponibili");const bytes=await file.arrayBuffer();const checksum=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(x=>x.toString(16).padStart(2,"0")).join("");if(checksum!==row.image_sha256)throw new HttpError(409,"Pixel cambiati: nuova revisione necessaria");}
export async function editorialMatrix(request:Request,env:Env,path:string):Promise<Response>{
 try{return await route(request,env,path);}catch(error){if(error instanceof HttpError)throw error;if(error instanceof MatrixValidationError||error instanceof CaptionValidationError||error instanceof EditorialV2ValidationError)throw new HttpError(400,error.message);throw error;}
}
async function route(request:Request,env:Env,path:string):Promise<Response>{
 const url=new URL(request.url);
 if(path===base&&request.method==="GET"){
  const rows=(await env.DB.prepare(`SELECT id,kind,origin,intent_cell,observed_cell,candidate_id,image_sha256,brief_id,revision,decision,provider,batch,created_at,
    CASE WHEN kind='attempt' THEN json_object('stage',COALESCE(json_extract(data_json,'$.stage'),'search'),'source_hits',json_extract(data_json,'$.source_hits'),'documentary_eligible',json_extract(data_json,'$.documentary_eligible'),'duplicates',json_extract(data_json,'$.duplicates'),'cost',json_extract(data_json,'$.cost')) ELSE '{}' END AS data_json
    FROM editorial_matrix_events ORDER BY rowid LIMIT 20001`).all<EventRow>()).results;
  if(rows.length>20000)throw new HttpError(409,"Oltre 20000 eventi: esportare gli eventi paginati e calcolare lo snapshot offline");
  const filter:MatrixFilter={};for(const key of ["emotion","topic","origin","provider","batch","status"]as const){const value=url.searchParams.get(key);if(value)filter[key]=value;}
  ensure(!filter.origin||["REAL","AI"].includes(filter.origin),"Origine non valida");ensure(!filter.status||["approved","rejected","pending"].includes(filter.status),"Stato non valido");
  ensure((!filter.emotion||emotions.includes(filter.emotion))&&(!filter.topic||topics.includes(filter.topic)),"Cella non valida");
  const reports=(await env.DB.prepare("SELECT kind,report_json FROM editorial_matrix_reports ORDER BY created_at DESC,id DESC LIMIT 6").all<{kind:string;report_json:string}>()).results.map(r=>({kind:r.kind,report:JSON.parse(r.report_json) as unknown}));
  const events=rows.map(fromRow),counts=replay(events,filter),now=new Date().toISOString(),weights=scheduler(counts,now),allMargins=marginals(counts);
  const visible=Object.fromEntries(Object.entries(counts).filter(([cell])=>(!filter.emotion||cell.split(":")[0]===filter.emotion)&&(!filter.topic||cell.split(":")[1]===filter.topic)));
  return json({version:matrixVersion,kind:"private_editorial_matrix",created_at:now,snapshot_id:await hash(canonical(events)),taxonomy,cells:visible,marginals:allMargins,weights,events:events.length,event_projection:"counts.v4.0.0",filter,reports,semantic_diagnostics:{state:"not_calculated",source_issue:45},visual_diagnostics:{state:"not_calculated",source_issue:46},publication_available:false});
 }
 if(path===base+"/events"&&request.method==="GET"){
  const cursor=Number(url.searchParams.get("cursor")||0);ensure(Number.isSafeInteger(cursor)&&cursor>=0,"Cursore non valido");
  const rows=(await env.DB.prepare("SELECT rowid AS cursor,* FROM editorial_matrix_events WHERE rowid>? ORDER BY rowid LIMIT 1001").bind(cursor).all<EventRow&{cursor:number}>()).results;
  return json({version:matrixVersion,kind:"private_editorial_matrix_events",events:rows.slice(0,1000).map(r=>fromRow({id:r.id,kind:r.kind,origin:r.origin,intent_cell:r.intent_cell,observed_cell:r.observed_cell,candidate_id:r.candidate_id,image_sha256:r.image_sha256,brief_id:r.brief_id,revision:r.revision,decision:r.decision,provider:r.provider,batch:r.batch,data_json:r.data_json,created_at:r.created_at})),cursor:rows.slice(0,1000).at(-1)?.cursor||cursor,has_more:rows.length>1000});
 }
 if(path===base+"/reports"&&request.method==="POST"){
  const data=await body(request,500000);ensure(["brief_variety","visual_variety"].includes(String(data.kind))&&typeof data.version==="string"&&/^\d+\.\d+\.\d+$/.test(data.version),"Report versionato richiesto");object(data.report);
  const serialized=canonical(data.report),uid=await hash(canonical({kind:data.kind,version:data.version,report:data.report}));
  await env.DB.prepare("INSERT INTO editorial_matrix_reports VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(uid,data.kind,data.version,serialized,new Date().toISOString()).run();return json({saved:true,id:uid,read_only:true});
 }
 if(path===base+"/briefs"&&request.method==="POST"){
  const data=await body(request,25000),brief=validateBrief(data.brief);ensure(sha256(data.id)&&typeof data.frozen_at==="string"&&Number.isFinite(Date.parse(data.frozen_at))&&Date.parse(data.frozen_at)<=Date.now()+60000,"Freeze non valido");
  const serialized=canonical({brief,frozen_at:data.frozen_at});ensure(await hash(serialized)===data.id,"Hash del freeze diverso");
  const prior=await env.DB.prepare("SELECT body_json FROM editorial_matrix_briefs WHERE id=?").bind(data.id).first<{body_json:string}>();
  if(prior)ensure(prior.body_json===serialized,"Freeze esistente diverso");else await env.DB.prepare("INSERT INTO editorial_matrix_briefs VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(data.id,brief.brief_id,brief.revision,brief.intent_emotion+":"+brief.intent_topic,serialized,data.frozen_at).run();
  return json({saved:true,id:data.id,published:false});
 }
 if(path===base+"/attempts"&&request.method==="POST"){
  const data=await body(request,20000),event=validateEvent(data.event as MatrixEvent);ensure(event.kind==="attempt"&&sha256(data.brief_ref),"Tentativo e freeze richiesti");
  const brief=await env.DB.prepare("SELECT brief_id,intent_cell,frozen_at FROM editorial_matrix_briefs WHERE id=?").bind(data.brief_ref).first<{brief_id:string;intent_cell:string;frozen_at:string}>();
  ensure(brief&&brief.brief_id===event.brief_id&&brief.intent_cell===event.intent_cell&&Date.parse(event.created_at)>=Date.parse(brief.frozen_at),"La ricerca deve seguire il freeze");
  ensure(Array.isArray(event.data.queries)&&event.data.queries.length<=20&&event.data.queries.every(q=>typeof q==="string"&&q.length<=200),"Registro query richiesto");
  const prior=await env.DB.prepare("SELECT * FROM editorial_matrix_events WHERE id=?").bind(event.id).first<EventRow>();
  if(prior)ensure(canonical(fromRow(prior))===canonical(event),"Tentativo già registrato con altri dati");else await env.DB.prepare("INSERT INTO editorial_matrix_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(event.id,event.kind,event.origin,event.intent_cell,event.observed_cell,event.candidate_id,event.image_sha256,event.brief_id,event.revision,event.decision,event.provider,event.batch,canonical(event.data),event.created_at).run();
  const saved=await env.DB.prepare("SELECT * FROM editorial_matrix_events WHERE id=?").bind(event.id).first<EventRow>();
  if(!saved||canonical(fromRow(saved))!==canonical(event))throw new HttpError(409,"Tentativo concorrente con dati diversi");
  return json({saved:true,published:false});
 }
 if(path===base+"/candidates"&&request.method==="POST"){
  const data=await body(request,10000);ensure(identifier(data.candidate_id)&&sha256(data.image_sha256)&&sha256(data.brief_ref)&&isCell(data.observed_cell)&&identifier(data.provider)&&identifier(data.batch),"Associazione candidata non valida");
  let current=await env.DB.prepare("SELECT origin,sha256,metadata_json,media_key FROM editorial_review_effective_images WHERE id=?").bind(data.candidate_id).first<{origin:"REAL"|"AI";sha256:string;metadata_json:string;media_key:string}>();
  // The unified inbox keeps one canonical alias per origin/final hash.
  if(!current&&["REAL","AI"].includes(String(data.origin))){
    const alias=await env.DB.prepare("SELECT id,origin,sha256,metadata_json,media_key FROM editorial_review_effective_images WHERE sha256=? AND origin=?").bind(data.image_sha256,data.origin).first<{id:string;origin:"REAL"|"AI";sha256:string;metadata_json:string;media_key:string}>();
    if(alias){current=alias;data.candidate_id=alias.id;}
  }
  ensure(current&&current.sha256===data.image_sha256&&(data.origin===undefined||data.origin===current.origin),"Hash o origine della candidata diversi");
  const metadata=JSON.parse(current!.metadata_json) as Record<string,unknown>;ensure(metadata.simulated!==true&&object(metadata.provenance).simulated!==true,"Una simulazione non è evidenza editoriale o fotografica");
  const p=validateV2Provenance(proof(metadata),current!.origin);
  const frozen=await env.DB.prepare("SELECT body_json,frozen_at FROM editorial_matrix_briefs WHERE id=?").bind(data.brief_ref).first<{body_json:string;frozen_at:string}>();ensure(frozen,"Freeze non trovato");
  const expected=validateBrief(object(JSON.parse(frozen!.body_json)).brief);
  if(current!.origin==="AI")ensure(p.idea_id===expected.brief_id&&p.idea===expected.description&&p.prompt===expected.slop_prompt&&p.model===expected.parameters.image_model&&canonical(p.parameters)===canonical({n:1,size:expected.parameters.size,quality:expected.parameters.quality})&&Date.parse(String(p.generated_at))+1000>=Date.parse(frozen!.frozen_at),"La generazione deve usare prompt, modello e parametri congelati prima dei pixel");

  ensure(recognizedLicense(String(p.license_url))&&(current!.origin!=="REAL"||p.authenticity==="verified"&&!p.semantic_edit&&["photograph","artwork"].includes(String(p.content_kind))),"Autenticità e diritti sono gate documentali separati");
  const prior=await env.DB.prepare("SELECT * FROM editorial_matrix_candidates WHERE candidate_id=?").bind(data.candidate_id).first<Record<string,unknown>>();
  if(prior)ensure(["image_sha256","brief_ref","observed_cell","provider","batch"].every(key=>prior[key]===data[key]),"Associazione immutabile già presente");
  else {await pixels(env,{...current,candidate_id:data.candidate_id,image_sha256:data.image_sha256}as Linked);await env.DB.prepare("INSERT INTO editorial_matrix_candidates VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(candidate_id) DO NOTHING").bind(data.candidate_id,data.image_sha256,current!.origin,data.brief_ref,data.observed_cell,data.provider,data.batch,new Date().toISOString()).run();}
  const saved=await env.DB.prepare("SELECT * FROM editorial_matrix_candidates WHERE candidate_id=?").bind(data.candidate_id).first<Record<string,unknown>>();
  if(!saved||!["image_sha256","brief_ref","observed_cell","provider","batch"].every(key=>saved[key]===data[key]))throw new HttpError(409,"Associazione concorrente con dati diversi");
  return json({saved:true,candidate_id:data.candidate_id,published:false});
 }
 if(path===base+"/candidates"&&request.method==="GET"){
  const cell=url.searchParams.get("cell")||"",origin=url.searchParams.get("origin")||"",provider=url.searchParams.get("provider")||"",batch=url.searchParams.get("batch")||"",state=url.searchParams.get("status")||"",offset=Number(url.searchParams.get("offset")||0);
  ensure((!cell||isCell(cell))&&(!origin||["REAL","AI"].includes(origin))&&(!state||["approved","rejected","pending"].includes(state))&&Number.isSafeInteger(offset)&&offset>=0&&offset<=100000,"Filtri non validi");
  const rows=await env.DB.prepare(`SELECT c.*,b.brief_id,b.intent_cell,b.body_json,q.status,q.revision AS image_revision,
    COALESCE((SELECT observed_cell FROM editorial_matrix_events WHERE candidate_id=c.candidate_id AND kind='classification' ORDER BY revision DESC LIMIT 1),c.observed_cell) AS effective_cell,
    COALESCE((SELECT max(revision) FROM editorial_matrix_events WHERE candidate_id=c.candidate_id AND kind='classification'),0) AS classification_revision
    FROM editorial_matrix_candidates c JOIN editorial_matrix_briefs b ON b.id=c.brief_ref JOIN editorial_review_inbox q ON q.id=c.candidate_id
    WHERE (?='' OR b.intent_cell=?) AND (?='' OR c.origin=?) AND (?='' OR c.provider=?) AND (?='' OR c.batch=?) AND (?='' OR q.status=?) ORDER BY c.created_at DESC,c.candidate_id LIMIT 50 OFFSET ?`).bind(cell,cell,origin,origin,provider,provider,batch,batch,state,state,offset).all<Record<string,unknown>>();
  const records=await Promise.all(rows.results.map(async r=>({...r,brief:JSON.parse(String(r.body_json))as unknown,body_json:undefined,image:`/api/admin/review-inbox/${r.candidate_id}/image`,caption:await env.DB.prepare("SELECT * FROM editorial_caption_current WHERE candidate_id=? ORDER BY revision DESC LIMIT 1").bind(r.candidate_id).first()})));
  const attempts=(await env.DB.prepare("SELECT * FROM editorial_matrix_events WHERE kind='attempt' AND (?='' OR intent_cell=?) AND (?='' OR origin=?) AND (?='' OR provider=?) AND (?='' OR batch=?) ORDER BY created_at DESC,id DESC LIMIT 100").bind(cell,cell,origin,origin,provider,provider,batch,batch).all<EventRow>()).results.map(fromRow);
  return json({version:matrixVersion,candidates:records,attempts,offset,limit:50});
 }
 const match=path.match(/^\/api\/admin\/editorial\/matrix\/candidates\/([\w-]+)\/(classification|caption|caption-review|game-binding)$/);
 if(match&&request.method==="POST"){
  const row=await linked(env,match[1]),data=await body(request,20000);ensure(data.image_sha256===row.image_sha256,"Pixel diversi dalla revisione corrente");const timestamp=new Date().toISOString();
  if(match[2]==="classification"){
   ensure(isCell(data.observed_cell)&&Number.isSafeInteger(data.revision),"Classificazione e revisione richieste");const secondary=data.secondary_emotions??[];ensure(Array.isArray(secondary)&&secondary.length<=11&&new Set(secondary).size===secondary.length&&secondary.every(e=>typeof e==="string"&&emotions.includes(e)),"Emozioni secondarie non valide");const reason=data.reason||null;ensure(reason===null||taxonomy.policy.review_reasons.includes(String(reason)),"Motivo facoltativo non valido");
   const changed=await env.DB.prepare(`INSERT INTO editorial_matrix_events SELECT ?,'classification',?,?,?,?,?,?,?,NULL,?,?,?,? WHERE COALESCE((SELECT max(revision) FROM editorial_matrix_events WHERE candidate_id=? AND kind='classification'),0)=?`).bind(id(),row.origin,row.intent_cell,data.observed_cell,row.candidate_id,row.image_sha256,row.brief_id,Number(data.revision)+1,row.provider,row.batch,canonical({note:note(data.note),reason,secondary_emotions:secondary}),timestamp,row.candidate_id,data.revision).run();
   if(!changed.meta.changes)throw new HttpError(409,"Classificazione concorrente: ricaricare");return json({saved:true,revision:Number(data.revision)+1});
  }
  if(match[2]==="caption"){
   await pixels(env,row);const draft=validateCaption(data.caption,row.origin);ensure(Number.isSafeInteger(data.revision)&&Number(data.revision)>=0,"Revisione didascalia richiesta");
   if(row.origin==="REAL"&&draft.context_mode==="documented"){
    const p=proof(JSON.parse(row.metadata_json)as Record<string,unknown>),ids=new Set((p.evidence as {id:string}[]).map(e=>e.id));ensure(p.authenticity==="verified"&&draft.caption_provenance_refs.every(ref=>ids.has(ref)),"Riferimenti documentali verificati richiesti");
   }
   const changed=await env.DB.prepare(`INSERT INTO editorial_game_captions SELECT ?,?,?,?, ?,? WHERE COALESCE((SELECT max(revision) FROM editorial_game_captions WHERE candidate_id=?),0)=?`).bind(row.candidate_id,Number(data.revision)+1,row.image_sha256,draft.game_caption,canonical(draft),timestamp,row.candidate_id,data.revision).run();
   if(!changed.meta.changes)throw new HttpError(409,"Didascalia concorrente: ricaricare");return json({saved:true,revision:Number(data.revision)+1,status:"draft",image_decision_unchanged:true});
  }
  if(match[2]==="caption-review"){
   ensure(data.confirm_reviewed===true&&["approved","rejected","pending"].includes(String(data.decision))&&Number.isSafeInteger(data.caption_revision)&&Number.isSafeInteger(data.revision),"Revisione esplicita didascalia richiesta");await pixels(env,row);
   const changed=await env.DB.prepare(`INSERT INTO editorial_caption_reviews SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM editorial_game_captions WHERE candidate_id=? AND revision=? AND image_sha256=?) AND COALESCE((SELECT max(revision) FROM editorial_caption_reviews WHERE candidate_id=? AND caption_revision=?),0)=?`).bind(id(),row.candidate_id,data.caption_revision,Number(data.revision)+1,data.decision,(await hash(env.ADMIN_TOKEN!)).slice(0,12),note(data.note),timestamp,row.candidate_id,data.caption_revision,row.image_sha256,row.candidate_id,data.caption_revision,data.revision).run();
   if(!changed.meta.changes)throw new HttpError(409,"Didascalia o giudizio aggiornati: ricaricare");return json({saved:true,revision:Number(data.revision)+1,image_decision_unchanged:true,published:false});
  }
  ensure(identifier(data.image_id),"Immagine di gioco richiesta");const prior=await env.DB.prepare("SELECT image_id FROM editorial_game_bindings WHERE candidate_id=?").bind(row.candidate_id).first<{image_id:string}>();if(prior)ensure(prior.image_id===data.image_id,"Associazione gioco già presente");else await env.DB.prepare("INSERT INTO editorial_game_bindings VALUES(?,?)").bind(row.candidate_id,data.image_id).run();return json({saved:true,published:false});
 }
 throw new HttpError(404,"API matrice inesistente");
}
