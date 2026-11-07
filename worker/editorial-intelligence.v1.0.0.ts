import { body, hash, HttpError, id, json, type Env } from "./core";
import { topicKey, topicTitle, imageMime } from "../shared/editorial-workspace.v1.0.0";
import { imageFormatChoice, profileTags, similarTopic, suggestedTopicTitle, type Profile } from "../shared/editorial-intelligence.v1.0.0";
import { commonsFile, searchCommons, type CommonsFile, MAX_IMAGE_BYTES } from "./commons-editorial.v1.0.0";
import { ensureSlopSeed, headlineStats, rankPending } from "./editorial-learning.v1.0.0";
import { fields, modelImage, modelJSON } from "./workspace-ai.v1.0.0";

const base="/api/admin/editorial/intelligence";
interface Topic { id:string;title:string }
interface Proposal { id:string;topic_id:string;source_url:string;kind:string }
function uid(value:unknown):string {
  if(typeof value!=="string" || !/^[a-f0-9-]{36}$/i.test(value))throw new HttpError(400,"ID non valido");
  return value;
}
async function topic(env:Env,value:unknown):Promise<Topic> {
  const key=uid(value);
  const row=await env.DB.prepare("SELECT id,title FROM editorial_workspace_topics WHERE id=?").bind(key).first<Topic>();
  if(!row)throw new HttpError(404,"Argomento assente");
  return row;
}
function text(value:unknown,max:number):string {
  if(typeof value!=="string" || value.length>max || !value.trim())throw new HttpError(400,"Testo non valido");
  return value.trim();
}
const now=()=>new Date().toISOString();
async function saveCommons(env:Env,t:Topic,photo:CommonsFile,kind:"gpt-commons"|"owner-link",proposalId?:string) {
  if(!env.QUARANTINE)throw new HttpError(503,"Quarantena privata mancante");
  if(photo.bytes.byteLength>MAX_IMAGE_BYTES || !imageMime(new Uint8Array(photo.bytes)))
    throw new HttpError(415,"Contenuto non fotografico o eccessivo");
  const sha=[...new Uint8Array(await crypto.subtle.digest("SHA-256",photo.bytes))]
    .map(n=>n.toString(16).padStart(2,"0")).join("");
  const [old,removed,catalog]=await Promise.all([
    env.DB.prepare("SELECT id FROM editorial_review_inbox WHERE origin='REAL' AND sha256=?").bind(sha).first(),
    env.DB.prepare("SELECT image_id FROM editorial_review_deleted_images WHERE origin='REAL' AND sha256=?").bind(sha).first(),
    env.DB.prepare("SELECT id FROM images WHERE sha256=?").bind(sha).first()
  ]);
  if(old || removed || catalog)throw new HttpError(409,"Fotografia già presente o scartata");
  const inbox="commons-"+id(),mediaKey="editorial-intelligence/"+inbox;
  const metadata=JSON.stringify({source_kind:kind,topic_id:t.id,title:photo.title,
    author:photo.author,source_url:photo.source_url,license_url:photo.license_url,
    original_key:mediaKey,original_sha256:sha,provenance_status:"unverified",
    provenance:{provider:"commons",original_url:photo.download_url,original_is_preview:photo.original_is_preview,
      source_evidence:photo.description,width:photo.width,height:photo.height}});
  await env.QUARANTINE.put(mediaKey,photo.bytes,{httpMetadata:{contentType:photo.mime},customMetadata:{sha256:sha}});
  try{
    const statements=[
      env.DB.prepare("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES(?,'REAL',?,?,?,?)")
        .bind(inbox,sha,mediaKey,metadata,now()),
    ];
    if(proposalId)statements.push(env.DB.prepare("INSERT INTO editorial_workspace_acquisitions(proposal_id,inbox_id,source_json,created_at) VALUES(?,?,?,?)")
      .bind(proposalId,inbox,metadata,now()));
    await env.DB.batch(statements);
  } catch{
    await env.QUARANTINE.delete(mediaKey);
    throw new HttpError(409,"Fotografia duplicata o acquisizione concorrente");
  }
  return {inbox_id:inbox,sha256:sha,title:photo.title,source_url:photo.source_url};
}
export async function editorialIntelligence(request:Request,env:Env,path:string):Promise<Response>{
  if(path===base && request.method==="GET"){
    const [stats,reals,slops,suggestions,searches,jobs]=await Promise.all([
      headlineStats(env),rankPending(env,"REAL"),rankPending(env,"AI"),
      env.DB.prepare("SELECT * FROM editorial_topic_suggestions ORDER BY created_at DESC LIMIT 100").all(),
      env.DB.prepare("SELECT * FROM editorial_topic_explorations ORDER BY created_at DESC LIMIT 50").all(),
      env.DB.prepare("SELECT kind,status,topic_id,created_at,updated_at FROM editorial_workspace_jobs ORDER BY created_at DESC LIMIT 30").all()
    ]);
    return json({version:"1.0.0",preferences:stats,ranked_real:reals.ranked.slice(0,30),ranked_slop:slops.ranked.slice(0,30),
      suggestions:suggestions.results,searches:searches.results,jobs:jobs.results,
      enabled:env.WORKSPACE_AI_ENABLED==="true" && env.ENABLE_REAL_DISCOVERY_PAID==="true" && !!env.OPENAI_API_KEY,
      generation_enabled:env.WORKSPACE_AI_ENABLED==="true" && env.ENABLE_EDITORIAL_CYCLE_GENERATION==="true" && !!env.OPENAI_API_KEY,
      cost_per_text_call:env.REAL_DISCOVERY_CALL_USD || null,
      cost_per_image_call:env.EDITORIAL_CYCLE_GENERATION_USD || null});
  }
  if(request.method!=="POST")throw new HttpError(405,"Metodo non consentito");
  const match=path.match(/^\/api\/admin\/editorial\/intelligence\/suggestions\/([a-f0-9-]{36})\/decision$/);
  if(match){
    const data=await body(request,1200);
    if(!["accepted","rejected","deferred"].includes(String(data.decision)))throw new HttpError(400,"Decisione non valida");
    const row=await env.DB.prepare("SELECT title,normalized_key,status FROM editorial_topic_suggestions WHERE id=?")
      .bind(match[1]).first<{title:string;normalized_key:string;status:string}>();
    if(!row)throw new HttpError(404,"Suggerimento non trovato");
    if(row.status!== "suggested" && row.status!=="deferred")throw new HttpError(409,"Suggerimento già deciso");
    await env.DB.prepare("UPDATE editorial_topic_suggestions SET status=?,updated_at=? WHERE id=? AND status IN ('suggested','deferred')")
      .bind(data.decision,now(),match[1]).run();
    if(data.decision==="accepted"){
      const existing=await env.DB.prepare("SELECT id FROM editorial_workspace_topics WHERE normalized_key=?")
        .bind(topicKey(row.title)).first<{id:string}>();
      if(!existing){
        const item={id:id(),title:topicTitle(row.title)};
        await env.DB.prepare("INSERT OR IGNORE INTO editorial_workspace_topics(id,title,normalized_key,created_at) VALUES(?,?,?,?)")
          .bind(item.id,item.title,topicKey(item.title),now()).run();
        await ensureSlopSeed(env,item);
      }
    }
    return json({saved:true,decision:data.decision});
  }
  if(path===base+"/acquire"){
    const data=await body(request,1500),proposalId=uid(data.proposal_id);
    const p=await env.DB.prepare("SELECT id,topic_id,kind,source_url FROM editorial_workspace_proposals WHERE id=?")
      .bind(proposalId).first<Proposal>();
    if(!p || p.kind!=="link")throw new HttpError(404,"Link da acquisire non trovato");
    const existing=await env.DB.prepare("SELECT inbox_id FROM editorial_workspace_acquisitions WHERE proposal_id=?")
      .bind(p.id).first<{inbox_id:string}>();
    if(existing)return json({acquired:true,inbox_id:existing.inbox_id,already_acquired:true});
    const t=await topic(env,p.topic_id);
    const file=await commonsFile(p.source_url);
    const row=await saveCommons(env,t,file,"owner-link",p.id);
    return json({acquired:true,...row},201);
  }
  if(path===base+"/suggest"){
    const data=await body(request,1800);
    const operationKey=uid(data.operation_id);
    const [topics,old,stats]=await Promise.all([
      env.DB.prepare("SELECT title FROM editorial_workspace_topics ORDER BY created_at DESC LIMIT 200").all<{title:string}>(),
      env.DB.prepare("SELECT title FROM editorial_topic_suggestions ORDER BY created_at DESC LIMIT 200").all<{title:string}>(),
      headlineStats(env)
    ]);
    const seen=[...topics.results,...old.results].map(x=>x.title);
    const response=await modelJSON(env,"suggest",null,"suggest:"+operationKey,
      {known_titles:seen,preferences:{real:stats.real.counts,slop:stats.slop.counts}},
      "You are a photo-editorial topic recommender. Return 5 concrete, diverse, verifiable photographic subjects, with place/time/event/action if applicable. Do not invent real historical incidents; do not repeat semantic equivalents of prior subjects. Never generate, retrieve or describe specific REAL photos.",
      "Previously attempted topics, including failed searches and rejected suggestions: "+JSON.stringify(seen)+
      ". Human REAL preference tags: "+JSON.stringify(stats.real.counts)+". Suggest specific NEW topics and rationale.",
      fields.suggestion);
    const values=Array.isArray(response.suggestions)?response.suggestions:[],selected:Array<{title:string;rationale:string}>=[];
    for(const v of values.slice(0,10)){
      if(!v || typeof v!=="object")continue;
      const pair=v as {title?:unknown;rationale?:unknown};
      let title:string;
      try{title=suggestedTopicTitle(pair.title);}catch{continue;}
      const rationale=typeof pair.rationale==="string" ? pair.rationale.trim().slice(0,400) : "";
      if(!rationale || [...seen,...selected.map(x=>x.title)].some(x=>similarTopic(x,title)))continue;
      selected.push({title,rationale});
      if(selected.length>=5)break;
    }
    for(const row of selected){
      await env.DB.prepare("INSERT OR IGNORE INTO editorial_topic_suggestions(id,title,normalized_key,rationale,status,created_at,updated_at) VALUES(?,?,?,?,'suggested',?,?)")
        .bind(id(),row.title,topicKey(row.title),row.rationale,now(),now()).run();
    }
    return json({suggested:selected.length,rejected_as_duplicate:values.length-selected.length});
  }
  if(path===base+"/profile"){
    const data=await body(request,1300),inboxId=text(data.inbox_id,160),sha=text(data.sha256,64);
    if(!/^[a-f0-9]{64}$/.test(sha))throw new HttpError(400,"SHA non valido");
    const row=await env.DB.prepare("SELECT * FROM editorial_review_effective_images WHERE id=?")
      .bind(inboxId).first<{sha256:string;origin:"REAL"|"AI";media_key:string}>();
    if(!row || row.sha256!==sha)throw new HttpError(409,"Fotografia o pixel aggiornati");
    if(!env.QUARANTINE)throw new HttpError(503,"Storage privato non configurato");
    const existing=await env.DB.prepare("SELECT profile_json FROM editorial_image_profiles WHERE inbox_id=? AND sha256=?")
      .bind(inboxId,sha).first<{profile_json:string}>();
    if(existing)return json({profile:JSON.parse(existing.profile_json),already_profiled:true});
    const file=await env.QUARANTINE.get(row.media_key);
    if(!file)throw new HttpError(404,"File originale non disponibile");
    const image=await file.arrayBuffer();
    if(image.byteLength>2_000_000)throw new HttpError(413,"Profilo visivo: servono immagini entro 2 MB; originali intatti");
    const mime=imageMime(new Uint8Array(image));
    if(!mime)throw new HttpError(415,"Immagine non supportata");
    const reply=await modelJSON(env,"profile",null,"profile:"+inboxId+":"+sha,{origin:row.origin,sha256:sha},
      "Examine ONLY the visible pixels, not filenames, EXIF, titles, source, metadata or their claims. Describe visible subject, visible action, scene, photographic composition, subject visibility, editorial interest. Never infer if image is real or AI-generated, never certify an event, license or identity. Return 3 to 12 concrete lowercase English snake_case visual tags.",
      "Profile the image strictly from pixels. Do not read or infer provenance.",fields.profile,{mime,bytes:image});
    const profile=reply as unknown as Profile;
    if(["subject","action","setting","composition","visibility","interest"].some(k=>typeof profile[k as keyof Profile]!=="string") ||
       profileTags(profile).length<2)throw new HttpError(502,"Profilo visivo non utilizzabile");
    await env.DB.prepare("INSERT OR IGNORE INTO editorial_image_profiles(inbox_id,sha256,origin,profile_json,model,created_at) VALUES(?,?,?,?,?,?)")
      .bind(inboxId,sha,row.origin,JSON.stringify({...profile,tags:profileTags(profile)}),env.REAL_DISCOVERY_MODEL,now()).run();
    return json({profile,already_profiled:false});
  }
  if(path===base+"/search"){
    const data=await body(request,1800),t=await topic(env,data.topic_id);
    const limit=Number(data.limit);
    if(!Number.isSafeInteger(limit) || limit<1 || limit>10)throw new HttpError(400,"Limite 1–10");
    const operationId=uid(data.operation_id);
    await ensureSlopSeed(env,t);
    const stats=await headlineStats(env);
    const resp=await modelJSON(env,"search",t.id,"search:"+operationId,
      {topic:t.title,limit,real_preference:stats.real.counts},
      "Write 2-3 specific Wikimedia Commons MediaWiki text search queries for authentic photos of the user's subject. Match Commons terminology and the relevant historical time/place; no URLs or QIDs. Favor visual subjects/actions fitting the editor's learned visual tags; avoid generic moods. Never claim results are authentic. Output only queries.",
      "Subject: "+t.title+". REAL approved/rejected visual tags: "+JSON.stringify(stats.real.counts)+
        ". Need up to "+limit+" varied candidate photos.",fields.search);
    const queries=(Array.isArray(resp.queries)?resp.queries:[]).filter((q):q is string=>
      typeof q==="string" && q.trim().length>=3 && q.length<=200).slice(0,3);
    if(!queries.length)throw new HttpError(502,"Nessuna query Commons valida");
    const runId=id(),stamp=now();
    await env.DB.prepare("INSERT INTO editorial_topic_explorations(id,topic_id,query,source,status,created_at,updated_at) VALUES(?,?,?,'commons','planned',?,?)")
      .bind(runId,t.id,JSON.stringify(queries),stamp,stamp).run();
    const discovered:string[]=[];
    for(const query of queries){
      try {const found=await searchCommons(query,10);for(const item of found)if(!discovered.includes(item))discovered.push(item);}
      catch { /* provider errors are visible in final count; no arbitrary fallback host */ }
      if(discovered.length>35)break;
    }
    const candidates:Array<{inbox_id:string;sha256:string;title:string;source_url:string}>=[];
    for(const title of discovered){
      if(candidates.length>=limit)break;
      try {const file=await commonsFile(title);
        candidates.push(await saveCommons(env,t,file,"gpt-commons"));
      } catch { /* unsuitable license or duplicate can remain in discovery logs */ }
    }
    await env.DB.prepare("UPDATE editorial_topic_explorations SET status='completed',candidates=?,updated_at=? WHERE id=?")
      .bind(candidates.length,now(),runId).run();
    return json({topic:t.title,queries,candidates,found:candidates.length,source:"commons",unverified:true});
  }
  if(path===base+"/slop/plan"){
    const data=await body(request,1000),t=await topic(env,data.topic_id);
    const previous=await env.DB.prepare("SELECT slot,prompt,variant FROM editorial_slop_prompt_bank WHERE topic_id=? ORDER BY slot")
      .bind(t.id).all<{slot:number;prompt:string;variant:string}>();
    if(previous.results.length)return json({prompts:previous.results,already_frozen:true});
    const {seed,sha256}=await ensureSlopSeed(env,t);
    const reply=await modelJSON(env,"slop_plan",t.id,"slop-plan:"+t.id,
      {frozen_seed_sha256:sha256},
      "Generate original photographic prompts for synthetic images. You are isolated from all REAL photos of the current cycle. ONLY use subject and historical SLOP judgements supplied, never reproduce any actual photograph or assert a fictional event really happened. Diverse scenes from mundane to visually surprising, plausible camera artifacts and naturally variable aspect ratios. Output 8 distinct detailed English prompts.",
      "Immutable context frozen from subject and ONLY historic SLOP reviews: "+JSON.stringify(seed),fields.slop);
    const prompts=(Array.isArray(reply.prompts)?reply.prompts:[]).filter((p):p is string=>
      typeof p==="string" && p.trim().length>=30 && p.length<=4000).slice(0,8);
    if(prompts.length<3)throw new HttpError(502,"Banca di prompt SLOP troppo piccola");
    for(let slot=0;slot<prompts.length;slot++){
      const variant=imageFormatChoice(slot);
      const instruction=prompts[slot].trim();
      const frozenHash=await hash(JSON.stringify({seed:sha256,slot,prompt:instruction,variant:variant.variant}));
      await env.DB.prepare("INSERT OR IGNORE INTO editorial_slop_prompt_bank(id,topic_id,slot,prompt,variant,model,frozen_sha256,created_at) VALUES(?,?,?,?,?,?,?,?)")
        .bind(id(),t.id,slot,instruction,variant.variant,env.REAL_DISCOVERY_MODEL,frozenHash,now()).run();
    }
    return json({prompts:(await env.DB.prepare("SELECT slot,prompt,variant FROM editorial_slop_prompt_bank WHERE topic_id=? ORDER BY slot")
      .bind(t.id).all()).results,already_frozen:false});
  }
  if(path===base+"/slop/generate"){
    const data=await body(request,800),t=await topic(env,data.topic_id);
    const slot=Number(data.slot);
    if(!Number.isSafeInteger(slot) || slot<0 || slot>31)throw new HttpError(400,"Slot non valido");
    if(!env.QUARANTINE)throw new HttpError(503,"Quarantena privata non disponibile");
    const prompt=await env.DB.prepare("SELECT * FROM editorial_slop_prompt_bank WHERE topic_id=? AND slot=?")
      .bind(t.id,slot).first<{slot:number;prompt:string;variant:string;frozen_sha256:string}>();
    if(!prompt)throw new HttpError(409,"Preparare prima la banca di prompt SLOP");
    const exists=await env.DB.prepare("SELECT 1 FROM editorial_review_inbox WHERE origin='AI' AND json_extract(metadata_json,'$.topic_id')=? AND json_extract(metadata_json,'$.slot')=?")
      .bind(t.id,slot).first();
    if(exists)throw new HttpError(409,"Slot già generato: rivedere la SLOP esistente");
    const counts=await env.DB.prepare("SELECT origin,status,count(*) AS n FROM editorial_review_effective_images WHERE json_extract(metadata_json,'$.topic_id')=? GROUP BY origin,status")
      .bind(t.id).all<{origin:string;status:string;n:number}>();
    const sum=(origin:string,status:string)=>counts.results.filter(x=>x.origin===origin&&x.status===status).reduce((s,x)=>s+x.n,0);
    const needed=sum("REAL","approved")-sum("AI","approved")-sum("AI","pending");
    if(needed<=0)throw new HttpError(409,"Non servono SLOP: approvare prima altre REAL o revisionare le SLOP pendenti");
    const size=imageFormatChoice(slot);
    const result=await modelImage(env,t.id,"slop-generate:"+t.id+":"+slot,
      prompt.prompt+"\nFictional composite scene; no reference image. Photorealistic candid camera appearance.",size.size);
    try {
      const bytes=result.bytes;
      if(bytes.byteLength>MAX_IMAGE_BYTES || imageMime(new Uint8Array(bytes))!=="image/webp")
        throw new HttpError(415,"Generazione SLOP non in formato WebP previsto");
      const sha=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))]
        .map(x=>x.toString(16).padStart(2,"0")).join("");
      const inbox="generated-"+id(),key="workspace-slop/"+inbox,stamp=now();
      const metadata=JSON.stringify({source_kind:"workspace-slop",topic_id:t.id,slot,
        title:"Studio sintetico "+t.title,author:"OpenAI",original_key:key,original_sha256:sha,
        provenance:{input_kind:"text-only",fully_synthetic:true,freeze_sha256:prompt.frozen_sha256,
          request_id:result.job.jobId,prompt:prompt.prompt,model:env.EDITORIAL_CYCLE_IMAGE_MODEL,
          generated_at:stamp,aspect_ratio:size.variant}});
      await env.QUARANTINE.put(key,bytes,{httpMetadata:{contentType:"image/webp"},customMetadata:{sha256:sha}});
      try {
        await env.DB.prepare("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES(?,'AI',?,?,?,?)")
          .bind(inbox,sha,key,metadata,stamp).run();
      } catch(error) {await env.QUARANTINE.delete(key);throw error;}
      await result.finish({inbox_id:inbox,sha256:sha,topic_id:t.id,slot,size:size.size});
      return json({inbox_id:inbox,sha256:sha,size:size.size,pending:true},201);
    } catch {
      await result.uncertain();
      throw new HttpError(502,"Generazione non archiviata con certezza: ispezionare lo storico prima di proseguire");
    }
  }
  throw new HttpError(404,"Operazione editoriale non trovata");
}
