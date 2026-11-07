import { body, hash, HttpError, id, json, type Env } from "./core";
import { topicKey, topicTitle, imageMime } from "../shared/editorial-workspace.v1.0.0";
import { imageFormatChoice, topicImageFormatChoice, profileTags, type Profile } from "../shared/editorial-intelligence.v1.0.0";
import { commonsFile, searchCommons, type CommonsFile, MAX_IMAGE_BYTES } from "./commons-editorial.v1.0.0";
import { imageDimensions } from "../shared/image-dimensions.v1.0.0";
import { ensureSlopSeed, headlineStats, rankPending } from "./editorial-learning.v1.0.0";
import { fields, modelImage, modelJSON } from "./workspace-ai.v1.0.0";
import { topicDiscoveryEnabled, setTopicDiscoveryEnabled } from "./topic-discovery-opt-in.v1.0.0";
import { suggestTopics } from "./topic-recommender.v1.0.0";
import { createTopicSemantics, semanticTopicDescription } from "./topic-semantic-memory.v1.0.0";

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
    original_key:mediaKey,original_sha256:sha,provenance_status:"unverified",image_geometry:imageDimensions(new Uint8Array(photo.bytes)),
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
    const requestedTopic = new URL(request.url).searchParams.get("topic_id");
    const selectedTopic = requestedTopic ? uid(requestedTopic) : null;
    const manualStage=await env.DB.prepare("SELECT decision FROM editorial_workspace_manual_stage WHERE topic_id=?").bind(selectedTopic || "").first();
    const [discoveryOn,stats,reals,slops,suggestions,searches,jobs,prompts,topicCounts,reviewedUnprofiled,formats]=await Promise.all([
      topicDiscoveryEnabled(env),
      headlineStats(env),rankPending(env,"REAL",selectedTopic),rankPending(env,"AI",selectedTopic),
      env.DB.prepare("SELECT t.*,s.description,s.embedding_status,c.status AS screening_status,c.novelty,c.neighbors_json,c.reason AS screening_reason FROM editorial_topic_suggestions t LEFT JOIN editorial_topic_suggestion_semantics s ON s.topic_id=t.id LEFT JOIN editorial_topic_suggestion_screening c ON c.suggestion_id=t.id ORDER BY t.created_at DESC LIMIT 100").all(),
      env.DB.prepare("SELECT * FROM editorial_topic_explorations ORDER BY created_at DESC LIMIT 50").all(),
      env.DB.prepare("SELECT kind,status,topic_id,created_at,updated_at FROM editorial_workspace_jobs UNION ALL SELECT kind,status,topic_id,created_at,updated_at FROM editorial_topic_description_jobs ORDER BY created_at DESC LIMIT 30").all(),
      env.DB.prepare("SELECT slot,prompt,variant,frozen_sha256 FROM editorial_slop_prompt_bank WHERE topic_id=? ORDER BY slot").bind(selectedTopic || "").all(),
      env.DB.prepare("SELECT origin,status,count(*) AS n FROM editorial_review_effective_images WHERE json_extract(metadata_json,'$.topic_id')=? GROUP BY origin,status").bind(selectedTopic || "").all(),
      env.DB.prepare("SELECT q.id,q.sha256,q.origin,q.status FROM editorial_review_effective_images q " +
        "LEFT JOIN editorial_image_profiles p ON p.inbox_id=q.id AND p.sha256=q.sha256 " +
        "WHERE p.inbox_id IS NULL AND q.status IN ('approved','rejected') ORDER BY q.created_at DESC LIMIT 40").all(),
      env.DB.prepare(`WITH geometry AS (
        SELECT q.id,q.origin,q.metadata_json,
          json_extract(q.metadata_json,'$.image_geometry.width') AS w,
          json_extract(q.metadata_json,'$.image_geometry.height') AS h,
          EXISTS(SELECT 1 FROM editorial_cycle_admissions a JOIN published_images p ON p.image_id=a.image_id WHERE a.inbox_id=q.id) AS published
        FROM editorial_review_effective_images q
      ) SELECT origin,published,CASE
        WHEN w IS NULL OR h IS NULL OR h<=0 OR json_extract(metadata_json,'$.image_geometry.mime')='image/jpeg' THEN 'unknown'
        WHEN max(w*1.0/h,h*1.0/w)>2.5 THEN 'panorama'
        WHEN abs(w*1.0/h-1)<0.02 THEN 'square'
        WHEN w>h THEN 'landscape' ELSE 'portrait' END AS format,count(*) AS n
        FROM geometry GROUP BY origin,published,format`).all()
    ]);
    return json({version:"1.0.0",topic_discovery_enabled:discoveryOn,preferences:stats,ranked_real:reals.ranked.slice(0,30),ranked_slop:slops.ranked.slice(0,30),
      suggestions:suggestions.results,searches:searches.results,jobs:jobs.results,prompts:prompts.results,topic_counts:topicCounts.results,
      reviewed_unprofiled:reviewedUnprofiled.results,
      formats:formats.results,
      manual_stage_complete:!!manualStage,
      enabled:env.WORKSPACE_AI_ENABLED==="true" && env.ENABLE_REAL_DISCOVERY_PAID==="true" && !!env.OPENAI_API_KEY,
      generation_enabled:env.WORKSPACE_AI_ENABLED==="true" && env.ENABLE_EDITORIAL_CYCLE_GENERATION==="true" && !!env.OPENAI_API_KEY,
      cost_per_text_call:env.REAL_DISCOVERY_CALL_USD || null,
      cost_per_image_call:env.EDITORIAL_CYCLE_GENERATION_USD || null});
  }
  if(path===base+"/topic-discovery/settings"){
    if(request.method!=="POST")throw new HttpError(405,"Metodo non consentito");
    const data=await body(request,300);
    if(Object.keys(data).length!==1 || typeof data.enabled!=="boolean")
      throw new HttpError(400,"Specificare enabled come valore booleano");
    await setTopicDiscoveryEnabled(env,data.enabled);
    return json({topic_discovery_enabled:data.enabled,paid_calls_started:false});
  }
  if(request.method!=="POST")throw new HttpError(405,"Metodo non consentito");
  const match=path.match(/^\/api\/admin\/editorial\/intelligence\/suggestions\/([a-f0-9-]{36})\/decision$/);
  if(match){
    const data=await body(request,1200);
    if(!["accepted","rejected","deferred"].includes(String(data.decision)))throw new HttpError(400,"Decisione non valida");
    const row=await env.DB.prepare("SELECT t.title,t.normalized_key,t.status,t.rationale,s.description,c.status AS screening_status FROM editorial_topic_suggestions t LEFT JOIN editorial_topic_suggestion_semantics s ON s.topic_id=t.id LEFT JOIN editorial_topic_suggestion_screening c ON c.suggestion_id=t.id WHERE t.id=?")
      .bind(match[1]).first<{title:string;normalized_key:string;status:string;rationale:string;description:string|null;screening_status:string|null}>();
    if(!row)throw new HttpError(404,"Suggerimento non trovato");
    if(data.decision==="accepted" && row.screening_status && row.screening_status!=="ready")throw new HttpError(409,"La verifica della proposta non è completa o rileva un duplicato");
    if(row.status!== "suggested" && row.status!=="deferred")throw new HttpError(409,"Suggerimento già deciso");
    await env.DB.prepare("UPDATE editorial_topic_suggestions SET status=?,updated_at=? WHERE id=? AND status IN ('suggested','deferred')")
      .bind(data.decision,now(),match[1]).run();
    if(data.decision==="accepted"){
      const existing=await env.DB.prepare("SELECT id FROM editorial_workspace_topics WHERE normalized_key=?")
        .bind(topicKey(row.title)).first<{id:string}>();
      if(!existing){
        const item={id:id(),title:topicTitle(row.title)};
        const inserted=await env.DB.prepare("INSERT OR IGNORE INTO editorial_workspace_topics(id,title,normalized_key,created_at) VALUES(?,?,?,?)")
          .bind(item.id,item.title,topicKey(item.title),now()).run();
        if(inserted.meta.changes===1){
          await ensureSlopSeed(env,item);
          // Accepted suggestions become semantic memory even when discovery is later switched OFF.
          await createTopicSemantics(env,item.id,item.title,semanticTopicDescription(row.description || ""));
        }
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
    if(!await topicDiscoveryEnabled(env))throw new HttpError(409,"Topic Discovery è disattivato: attivalo dalla dashboard");
    const data=await body(request,1800);
    const operationKey=uid(data.operation_id);
    return json(await suggestTopics(env,operationKey));
  }

  if(path===base+"/relevance"){
    const data=await body(request,1200),inboxId=text(data.inbox_id,160),sha=text(data.sha256,64);
    const row=await env.DB.prepare("SELECT sha256,metadata_json FROM editorial_review_effective_images WHERE id=? AND origin='REAL'")
      .bind(inboxId).first<{sha256:string;metadata_json:string}>();
    if(!row || row.sha256!==sha)throw new HttpError(409,"Pixel aggiornati o fotografia assente");
    const metadata=JSON.parse(row.metadata_json) as {topic_id?:string};
    const t=await topic(env,metadata.topic_id);
    const semantic=await env.DB.prepare("SELECT input_text,input_sha256 FROM editorial_topic_semantics WHERE topic_id=?")
      .bind(t.id).first<{input_text:string;input_sha256:string}>();
    const topicText=semantic?.input_text || t.title,topicSha=semantic?.input_sha256 || await hash(topicText);
    const profile=await env.DB.prepare("SELECT profile_json FROM editorial_image_profiles WHERE inbox_id=? AND sha256=?")
      .bind(inboxId,sha).first<{profile_json:string}>();
    if(!profile)throw new HttpError(409,"Analizza prima i pixel, senza titolo o metadati");
    const previous=await env.DB.prepare("SELECT assessment_json FROM editorial_image_relevance WHERE inbox_id=? AND sha256=? AND topic_id=? AND topic_sha256=?")
      .bind(inboxId,sha,t.id,topicSha).first<{assessment_json:string}>();
    if(previous)return json({assessment:JSON.parse(previous.assessment_json),already_assessed:true});
    const assessment=await modelJSON(env,"profile",t.id,"relevance:"+inboxId+":"+sha+":"+topicSha,
      {visual_profile:JSON.parse(profile.profile_json),topic:topicText},
      "Compare the independently produced pixel-only profile with the editorial topic. Distinguish visible subject/action match, mismatch (e.g. invisible claimed subject), and uncertain. A visible match NEVER verifies date, event, identity, authenticity or license. Unknown historical claims must remain uncertain. Do not judge aesthetic taste.",
      JSON.stringify({topic:topicText,pixel_profile:JSON.parse(profile.profile_json)}),fields.relevance);
    if(!["visible_match","mismatch","uncertain"].includes(String(assessment.match)) || typeof assessment.reason!=="string" || !assessment.reason.trim())
      throw new HttpError(502,"Confronto visivo non valido");
    await env.DB.prepare("INSERT OR IGNORE INTO editorial_image_relevance VALUES(?,?,?,?,?,?,?)")
      .bind(inboxId,sha,t.id,topicSha,JSON.stringify(assessment),env.REAL_DISCOVERY_MODEL,now()).run();
    return json({assessment,already_assessed:false});
  }
  if(path===base+"/profile"){
    const data=await body(request,2_100_000),inboxId=text(data.inbox_id,160),sha=text(data.sha256,64);
    if(!/^[a-f0-9]{64}$/.test(sha))throw new HttpError(400,"SHA non valido");
    if(Object.keys(data).some(key=>!["inbox_id","sha256","preview_base64"].includes(key)))
      throw new HttpError(400,"Dati della profilazione non previsti");
    const row=await env.DB.prepare("SELECT * FROM editorial_review_effective_images WHERE id=?")
      .bind(inboxId).first<{sha256:string;origin:"REAL"|"AI";media_key:string}>();
    if(!row || row.sha256!==sha)throw new HttpError(409,"Fotografia o pixel aggiornati");
    if(!env.QUARANTINE)throw new HttpError(503,"Storage privato non configurato");
    const existing=await env.DB.prepare("SELECT profile_json FROM editorial_image_profiles WHERE inbox_id=? AND sha256=?")
      .bind(inboxId,sha).first<{profile_json:string}>();
    if(existing)return json({profile:JSON.parse(existing.profile_json),already_profiled:true});
    const file=await env.QUARANTINE.get(row.media_key);
    if(!file || file.size>12_000_000)throw new HttpError(404,"File originale non disponibile");
    const original=await file.arrayBuffer();
    const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",original))]
      .map(x=>x.toString(16).padStart(2,"0")).join("");
    if(digest!==sha)throw new HttpError(409,"Hash dell'originale diverso dai pixel approvati");
    const sourceMime=imageMime(new Uint8Array(original));
    if(!sourceMime)throw new HttpError(415,"Originale non supportato");
    const originalGeometry=imageDimensions(new Uint8Array(original));
    let visualBytes=original, visualMime=sourceMime,previewHash:string|null=null;
    if(data.preview_base64!==undefined){
      if(typeof data.preview_base64!=="string" || data.preview_base64.length>2_000_000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(data.preview_base64))
        throw new HttpError(400,"Anteprima base64 non valida");
      let binary:string;
      try{binary=atob(data.preview_base64);}catch{throw new HttpError(400,"Anteprima base64 non decodificabile");}
      if(binary.length>1_500_000)throw new HttpError(413,"Anteprima oltre 1,5 MB");
      const array=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)array[i]=binary.charCodeAt(i);
      const mime=imageMime(array);
      if(!mime || mime!=="image/webp")throw new HttpError(415,"Anteprima WebP richiesta");
      const previewGeometry=imageDimensions(array);
      if(Math.max(previewGeometry.width,previewGeometry.height)>1152)
        throw new HttpError(413,"Lato massimo anteprima 1152 pixel");
      const sourceRatio=originalGeometry.width/originalGeometry.height;
      const previewRatio=previewGeometry.width/previewGeometry.height;
      const unrotated=Math.abs(previewRatio/sourceRatio-1);
      const rotated=Math.abs(previewRatio*sourceRatio-1);
      if(Math.min(unrotated,rotated)>0.035)
        throw new HttpError(400,"L'anteprima non conserva il rapporto d'aspetto");
      visualBytes=array.buffer;visualMime=mime;
      previewHash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",visualBytes))]
        .map(x=>x.toString(16).padStart(2,"0")).join("");
    } else if(original.byteLength>2_000_000){
      throw new HttpError(413,"Per immagini oltre 2 MB usare l'anteprima integrale proporzionale generata dall'admin");
    }
    const reply=await modelJSON(env,"profile",null,"profile:"+inboxId+":"+sha,
      {origin:row.origin,sha256:sha,preview_sha256:previewHash},
      "Examine ONLY the visible pixels, not filenames, EXIF, titles, source, metadata or their claims. Describe visible subject, visible action, scene, photographic composition, subject visibility, editorial interest. Never infer if image is real or AI-generated, never certify an event, license or identity. Return 3 to 12 concrete lowercase English snake_case visual tags.",
      "Profile the image strictly from pixels. Do not read or infer provenance.",fields.profile,{mime:visualMime,bytes:visualBytes});
    const profile=reply as unknown as Profile;
    if(["subject","action","setting","composition","visibility","interest"].some(k=>typeof profile[k as keyof Profile]!=="string") ||
       profileTags(profile).length<2)throw new HttpError(502,"Profilo visivo non utilizzabile");
    const stored={...profile,tags:profileTags(profile),
      visual_source:previewHash?"proportional_browser_preview":"original_file",
      original_sha256:sha,preview_sha256:previewHash};
    await env.DB.prepare("INSERT OR IGNORE INTO editorial_image_profiles(inbox_id,sha256,origin,profile_json,model,created_at) VALUES(?,?,?,?,?,?)")
      .bind(inboxId,sha,row.origin,JSON.stringify(stored),env.REAL_DISCOVERY_MODEL,now()).run();
    return json({profile:stored,already_profiled:false});
  }
  if(path===base+"/search"){
    const data=await body(request,1800),t=await topic(env,data.topic_id);
    if(!await env.DB.prepare("SELECT 1 FROM editorial_workspace_manual_stage WHERE topic_id=?").bind(t.id).first())
      throw new HttpError(409,"Prima proponi le tue fotografie oppure scegli esplicitamente di continuare senza foto manuali");
    const limit=Number(data.limit);
    if(!Number.isSafeInteger(limit) || limit<1 || limit>10)throw new HttpError(400,"Limite 1–10");
    const operationId=uid(data.operation_id);
    const prior=await env.DB.prepare("SELECT status,candidates,diagnostics_json FROM editorial_topic_explorations WHERE id=? AND topic_id=?")
      .bind(operationId,t.id).first<{status:string;candidates:number;diagnostics_json:string}>();
    if(prior)return json({already_searched:true,status:prior.status,found:prior.candidates,diagnostics:JSON.parse(prior.diagnostics_json)});
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
    const runId=operationId,stamp=now();
    await env.DB.prepare("INSERT INTO editorial_topic_explorations(id,topic_id,query,source,status,created_at,updated_at) VALUES(?,?,?,'commons','planned',?,?)")
      .bind(runId,t.id,JSON.stringify(queries),stamp,stamp).run();
    const discovered:string[]=[];
    const errors:Array<{stage:string;code:number}> = [];
    let successfulQueries=0,skipped=0;
    for(const query of queries){
      try {const found=await searchCommons(query,10);successfulQueries++;for(const item of found)if(!discovered.includes(item))discovered.push(item);}
      catch(error) {errors.push({stage:"query",code:error instanceof HttpError?error.status:502});}
      if(discovered.length>35)break;
    }
    const candidates:Array<{inbox_id:string;sha256:string;title:string;source_url:string}>=[];
    for(const title of discovered){
      if(candidates.length>=limit)break;
      try {const file=await commonsFile(title);
        candidates.push(await saveCommons(env,t,file,"gpt-commons"));
      } catch(error) {skipped++;errors.push({stage:"acquisition",code:error instanceof HttpError?error.status:502});}
    }
    const status=successfulQueries===0?"failed":"completed";
    const diagnostics={successful_queries:successfulQueries,errors,skipped,partial:errors.length>0};
    await env.DB.prepare("UPDATE editorial_topic_explorations SET status=?,candidates=?,diagnostics_json=?,updated_at=? WHERE id=?")
      .bind(status,candidates.length,JSON.stringify(diagnostics),now(),runId).run();
    return json({topic:t.title,queries,candidates,found:candidates.length,status,diagnostics,source:"commons",unverified:true});
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
      const variant=topicImageFormatChoice(t.id,slot);
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
    // Honor old frozen banks as well as new independent per-topic format rotations.
    const size=[0,1,2].map(imageFormatChoice).find(choice=>choice.variant===prompt.variant);
    if(!size)throw new HttpError(409,"Formato congelato non valido");
    const claim=await env.DB.prepare(`INSERT OR IGNORE INTO editorial_workspace_generation_claims
      SELECT ?,?,'reserved',? WHERE
      (SELECT count(*) FROM editorial_review_effective_images WHERE origin='REAL' AND status='approved' AND json_extract(metadata_json,'$.topic_id')=?) >
      (SELECT count(*) FROM editorial_review_effective_images WHERE origin='AI' AND status IN ('approved','pending') AND json_extract(metadata_json,'$.topic_id')=?) +
      (SELECT count(*) FROM editorial_workspace_generation_claims WHERE topic_id=? AND status IN ('reserved','uncertain'))`)
      .bind(t.id,slot,now(),t.id,t.id,t.id).run();
    if(claim.meta.changes!==1)throw new HttpError(409,"Capacità già prenotata o slot già avviato: controllare le operazioni");
    let result:Awaited<ReturnType<typeof modelImage>>;
    try{
      result=await modelImage(env,t.id,"slop-generate:"+t.id+":"+slot,
        prompt.prompt+"\nFictional composite scene; no reference image. Photorealistic candid camera appearance.",size.size);
    }catch(error){
      const job=await env.DB.prepare("SELECT status FROM editorial_workspace_jobs WHERE operation_key=?")
        .bind("slop-generate:"+t.id+":"+slot).first<{status:string}>();
      await env.DB.prepare("UPDATE editorial_workspace_generation_claims SET status=? WHERE topic_id=? AND slot=?")
        .bind(job && ["submitting","uncertain","completed"].includes(job.status)?"uncertain":"failed",t.id,slot).run();
      throw error;
    }
    try {
      const bytes=result.bytes;
      if(bytes.byteLength>MAX_IMAGE_BYTES || imageMime(new Uint8Array(bytes))!=="image/webp")
        throw new HttpError(415,"Generazione SLOP non in formato WebP previsto");
      const dimensions=imageDimensions(new Uint8Array(bytes));
      if(dimensions.width+"x"+dimensions.height!==size.size)
        throw new HttpError(415,"La SLOP non rispetta le dimensioni richieste");
      const sha=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))]
        .map(x=>x.toString(16).padStart(2,"0")).join("");
      const inbox="generated-"+id(),key="workspace-slop/"+inbox,stamp=now();
      const metadata=JSON.stringify({source_kind:"workspace-slop",topic_id:t.id,slot,
        title:"Studio sintetico "+t.title,author:"OpenAI",original_key:key,original_sha256:sha,image_geometry:dimensions,
        provenance:{input_kind:"text-only",fully_synthetic:true,freeze_sha256:prompt.frozen_sha256,
          request_id:result.job.jobId,prompt:prompt.prompt,model:env.EDITORIAL_CYCLE_IMAGE_MODEL,
          generated_at:stamp,aspect_ratio:size.variant}});
      await env.QUARANTINE.put(key,bytes,{httpMetadata:{contentType:"image/webp"},customMetadata:{sha256:sha}});
      try {
        await env.DB.prepare("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES(?,'AI',?,?,?,?)")
          .bind(inbox,sha,key,metadata,stamp).run();
      } catch(error) {await env.QUARANTINE.delete(key);throw error;}
      await result.finish({inbox_id:inbox,sha256:sha,topic_id:t.id,slot,size:size.size});
      await env.DB.prepare("UPDATE editorial_workspace_generation_claims SET status='completed' WHERE topic_id=? AND slot=?").bind(t.id,slot).run();
      return json({inbox_id:inbox,sha256:sha,size:size.size,pending:true},201);
    } catch {
      await result.uncertain();
      await env.DB.prepare("UPDATE editorial_workspace_generation_claims SET status='uncertain' WHERE topic_id=? AND slot=?").bind(t.id,slot).run();
      throw new HttpError(502,"Generazione non archiviata con certezza: ispezionare lo storico prima di proseguire");
    }
  }
  throw new HttpError(404,"Operazione editoriale non trovata");
}
