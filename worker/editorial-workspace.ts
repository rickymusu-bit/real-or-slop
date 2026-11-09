import { body, HttpError, id, json, type Env } from "./core";
import { imageMime, topicKey, topicTitle } from "../shared/editorial-workspace.v1.0.0";
import { normalizeLinkBatch, proposalLinkUrl } from "../shared/editorial-link-batch.v1.0.0";
import { browseCommonsCategory, browseCommonsSearch } from "./commons-editorial.v1.0.0";
import { ensureSlopSeed } from "./editorial-learning.v1.0.0";
import { imageGeometry } from "../shared/image-geometry.v1.0.0";
import { createTopicSemantics, embedTopicOnSubmission, embeddingConfig, DEFAULT_TOPIC_EMBEDDING_MODEL, semanticTopicDescription, semanticTopicText } from "./topic-semantic-memory.v1.0.0";
import { hash } from "./core";
import { approveDescription, cancelDescription, descriptionDraft, proposeDescription, publicDraft } from "./topic-description.v1.0.0";

const base = "/api/admin/editorial/workspace";
type TopicRow = { id: string; title: string; normalized_key: string; created_at: string; description: string | null; embedding_status: string | null;
  notes: string; lot_status: string; lot_revision: number };
type ProposalRow = {
  id: string; topic_id: string; kind: "link" | "upload"; source_url: string | null;
  inbox_id: string | null; note: string; created_at: string; review_status: string | null;
};
function invalid(error: unknown): never {
  throw new HttpError(400, error instanceof Error ? error.message : "Dati non validi");
}
function valueText(value: unknown, limit: number, required = false) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, "Campo richiesto");
    return "";
  }
  if (typeof value !== "string" || value.length > limit || (required && !value.trim()))
    throw new HttpError(400, "Campo di testo non valido");
  return value.trim();
}
async function existingTopic(env: Env, topicId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(topicId)) throw new HttpError(400, "Argomento non valido");
  const row = await env.DB.prepare("SELECT id,title FROM editorial_workspace_topics WHERE id=?").bind(topicId).first<{ id: string; title: string }>();
  if (!row) throw new HttpError(404, "Argomento non trovato");
  return row;
}
export async function editorialWorkspace(request: Request, env: Env, path: string): Promise<Response> {
  if (path === base && request.method === "GET") {
    const [topics, proposals,drafts] = await Promise.all([
      env.DB.prepare("SELECT t.id,t.title,t.normalized_key,t.created_at,s.description,s.embedding_status,s.input_sha256,s.error_code,COALESCE(l.notes,s.description,'') AS notes,COALESCE(l.status,'open') AS lot_status,COALESCE(l.revision,0) AS lot_revision FROM editorial_workspace_topics t LEFT JOIN editorial_topic_semantics s ON s.topic_id=t.id LEFT JOIN editorial_lots l ON l.topic_id=t.id ORDER BY t.created_at DESC,t.id DESC").all<TopicRow>(),
      env.DB.prepare("SELECT p.id,p.topic_id,p.kind,p.source_url,COALESCE(p.inbox_id,a.inbox_id) AS inbox_id,p.note,p.created_at,i.status AS review_status FROM editorial_workspace_proposals p LEFT JOIN editorial_workspace_acquisitions a ON a.proposal_id=p.id LEFT JOIN editorial_review_inbox i ON i.id=COALESCE(p.inbox_id,a.inbox_id) WHERE NOT EXISTS(SELECT 1 FROM editorial_workspace_proposal_dismissals d WHERE d.proposal_id=p.id) ORDER BY p.created_at DESC,p.id DESC LIMIT 1000").all<ProposalRow>(),
      env.DB.prepare("SELECT id,title,status,description,ambiguity,proposal_sha256 FROM editorial_topic_description_drafts WHERE status IN ('ready','preparing','uncertain','failed') ORDER BY created_at DESC LIMIT 30").all(),
    ]);
    let embeddingReady=false;
    try{embeddingReady=!!embeddingConfig(env);}catch{ /* expose unconfigured state without losing topics */ }
    return json({ topics: topics.results, proposals: proposals.results,description_drafts:drafts.results,
      description_cost:env.REAL_DISCOVERY_CALL_USD || null,embedding_enabled:embeddingReady,
      embedding_cost:env.TOPIC_EMBEDDING_CALL_USD || null, paid_search_enabled: false,
      slop_generation_enabled: false, autonomous_suggestions_enabled: false });
  }
  const descriptionPath=path.match(/^\/api\/admin\/editorial\/workspace\/topic-descriptions\/([a-f0-9-]{36})(?:\/(approve|regenerate|cancel))?$/i);
  if(descriptionPath){
    const [,draftId,action]=descriptionPath;
    if(!action && request.method==="GET")return json({proposal:publicDraft(await descriptionDraft(env,draftId))});
    if(request.method!=="POST" || !action)throw new HttpError(405,"Operazione bozza non consentita");
    const data=await body(request,3000);
    const allowed=action==="approve"?["title","description","expected_sha256"]:
      action==="regenerate"?["title","expected_sha256","operation_id"]:["title","expected_sha256"];
    if(Object.keys(data).some(k=>!allowed.includes(k)))throw new HttpError(400,"Campi bozza non previsti");
    let title:string;
    try{title=topicTitle(data.title);}catch(error){return invalid(error);}
    if(action==="cancel"){
      await cancelDescription(env,draftId,title,data.expected_sha256);return json({cancelled:true});
    }
    if(action==="regenerate")return json({proposal:await proposeDescription(env,title,data.operation_id,{id:draftId,expected:data.expected_sha256})},202);
    const saved=await approveDescription(env,draftId,title,data.description,data.expected_sha256);
    await ensureSlopSeed(env,saved);
    const previous=saved.already_exists?await env.DB.prepare("SELECT embedding_status FROM editorial_topic_semantics WHERE topic_id=?")
      .bind(saved.id).first<{embedding_status:string}>():null;
    const embeddingStatus=saved.already_exists?(previous?.embedding_status || "pending"):
      await createTopicSemantics(env,saved.id,saved.title,saved.description);
    return json({...saved,embedding_status:embeddingStatus},saved.already_exists?200:201);
  }
  if(path===base+"/manual-stage" && request.method==="POST"){
    const data=await body(request,500);
    if(Object.keys(data).some(k=>!["topic_id","decision"].includes(k)) || !["finished","skip"].includes(String(data.decision)))
      throw new HttpError(400,"Confermare la fase delle fotografie manuali");
    const t=await existingTopic(env,valueText(data.topic_id,36,true));
    await env.DB.prepare("INSERT OR IGNORE INTO editorial_workspace_manual_stage VALUES(?,?,?)").bind(t.id,data.decision,new Date().toISOString()).run();
    return json({manual_stage_complete:true,paid_calls_started:false});
  }
  const semanticPath=path.match(/^\/api\/admin\/editorial\/workspace\/topics\/([a-f0-9-]{36})\/semantics$/i);
  if(semanticPath && request.method==="POST"){
    const data=await body(request,3000),current=await existingTopic(env,semanticPath[1]);
    if(Object.keys(data).some(key=>!["description","expected_sha256"].includes(key)))
      throw new HttpError(400,"Campi semantici non previsti");
    const previous=await env.DB.prepare("SELECT input_sha256,description,embedding_status,model FROM editorial_topic_semantics WHERE topic_id=?")
      .bind(current.id).first<{input_sha256:string;description:string;embedding_status:string;model:string}>();
    if((previous?.input_sha256 || null)!==data.expected_sha256)throw new HttpError(409,"Argomento aggiornato: ricaricare prima di salvare");
    if(previous && ["submitting","uncertain"].includes(previous.embedding_status))
      throw new HttpError(409,"Indicizzazione avviata o incerta: nessun reinvio consentito");
    let description:string;
    try{description=semanticTopicDescription(data.description);}catch(error){return invalid(error);}
    const inputText=semanticTopicText(current.title,description),digest=await hash(inputText);
    const model=env.TOPIC_EMBEDDING_MODEL || DEFAULT_TOPIC_EMBEDDING_MODEL;
    if(previous && (digest!==previous.input_sha256 || model!==previous.model)){
      const archived=await env.DB.prepare("SELECT vector_json,dimensions,input_tokens FROM editorial_topic_semantic_history WHERE topic_id=? AND input_sha256=? AND model=? AND embedding_status='ready' ORDER BY updated_at DESC LIMIT 1")
        .bind(current.id,digest,model).first<{vector_json:string;dimensions:number;input_tokens:number}>();
      const changed=await env.DB.prepare("UPDATE editorial_topic_semantics SET description=?,input_text=?,input_sha256=?,model=?,embedding_status=?,vector_json=?,dimensions=?,input_tokens=?,error_code=NULL,updated_at=? WHERE topic_id=? AND input_sha256=? AND model=? AND embedding_status NOT IN ('submitting','uncertain')")
        .bind(description,inputText,digest,model,archived?"ready":"pending",archived?.vector_json || null,archived?.dimensions || null,archived?.input_tokens || null,
          new Date().toISOString(),current.id,previous.input_sha256,previous.model).run();
      if(changed.meta.changes<1)throw new HttpError(409,"Modifica concorrente: ricaricare l'argomento");
    }
    const status=previous ? await embedTopicOnSubmission(env,current.id) :
      await createTopicSemantics(env,current.id,current.title,description);
    return json({id:current.id,embedding_status:status,input_sha256:digest});
  }
  const lotRoute=await editorialLots(request,env,path);
  if(lotRoute)return lotRoute;
  const removePath=path.match(/^\/api\/admin\/editorial\/workspace\/topics\/([a-f0-9-]{36})\/remove$/i);
  if(removePath && request.method==="POST")return json(await removeUnusedTopic(env,removePath[1],await body(request,500)));
  if (path === base + "/topics" && request.method === "POST") {
    const data = await body(request, 3000);
    if (Object.keys(data).some(key => !["title","description","operation_id"].includes(key))) throw new HttpError(400, "Campi argomento non previsti");
    let title: string, key: string, description: string;
    try { title = topicTitle(data.title); key = topicKey(title); description = semanticTopicDescription(data.description); }
    catch (error) { return invalid(error); }
    const existing = await env.DB.prepare("SELECT id,title FROM editorial_workspace_topics WHERE normalized_key=?").bind(key).first<{ id: string; title: string }>();
    if (existing) {
      const semantic=await env.DB.prepare("SELECT embedding_status FROM editorial_topic_semantics WHERE topic_id=?")
        .bind(existing.id).first<{embedding_status:string}>();
      return json({ ...existing, already_exists: true,embedding_status:semantic?.embedding_status||"not_indexed" });
    }
    if(!description)return json({proposal:await proposeDescription(env,title,data.operation_id)},202);
    const topic = { id: id(), title, normalized_key: key, created_at: new Date().toISOString() };
    try {
      await env.DB.prepare("INSERT INTO editorial_workspace_topics(id,title,normalized_key,created_at) VALUES(?,?,?,?)")
        .bind(topic.id, topic.title, topic.normalized_key, topic.created_at).run();
    } catch { throw new HttpError(409, "Argomento già registrato; aggiorna la pagina"); }
    await ensureSlopSeed(env,topic);
    let embeddingStatus="pending";
    try { embeddingStatus=await createTopicSemantics(env,topic.id,title,description); }
    catch { /* Topic remains saved: never pretend a vector was created on failure. */ }
    return json({...topic,description,embedding_status:embeddingStatus},201);
  }
  if (path === base + "/links/batch" && request.method === "POST") {
    const data = await body(request, 35000);
    if (Object.keys(data).some(key => !["topic_id","source_urls","note"].includes(key)))
      throw new HttpError(400, "Campi della proposta non previsti");
    const topicId = valueText(data.topic_id, 36, true);
    await existingTopic(env, topicId);
    const note = valueText(data.note, 1000);
    let urls: string[];
    try { urls = normalizeLinkBatch(data.source_urls); }
    catch (error) { return invalid(error); }
    const stamp = new Date().toISOString();
    const results = await env.DB.batch(urls.map(url =>
      env.DB.prepare("INSERT OR IGNORE INTO editorial_workspace_proposals(id,topic_id,kind,source_url,inbox_id,note,created_at) VALUES(?,?,'link',?,NULL,?,?)")
        .bind(id(), topicId, url, note, stamp)));
    const saved = results.filter(result => result.meta.changes === 1).length;
    return json({submitted: urls.length, saved, already_present: urls.length - saved,
      status: "awaiting_acquisition"}, 201);
  }
  if (path === base + "/links" && request.method === "POST") {
    const data = await body(request, 5000);
    if (Object.keys(data).some(key => !["topic_id","source_url","note"].includes(key)))
      throw new HttpError(400, "Campi della proposta non previsti");
    await existingTopic(env, valueText(data.topic_id, 36, true));
    let sourceUrl: string;
    try { sourceUrl = proposalLinkUrl(data.source_url); } catch (error) { return invalid(error); }
    const note = valueText(data.note, 1000);
    const proposal = { id: id(), topic_id: data.topic_id, source_url: sourceUrl, note, created_at: new Date().toISOString() };
    try {
      await env.DB.prepare("INSERT INTO editorial_workspace_proposals(id,topic_id,kind,source_url,inbox_id,note,created_at) VALUES(?,?,'link',?,NULL,?,?)")
        .bind(proposal.id, proposal.topic_id, proposal.source_url, proposal.note, proposal.created_at).run();
    } catch { throw new HttpError(409, "URL già proposto per questo argomento"); }
    // A URL alone is NOT a verified original and must not enter the image review inbox.
    return json({ ...proposal, status: "awaiting_acquisition" }, 201);
  }
  if (path === base + "/uploads" && request.method === "POST") {
    if (!env.QUARANTINE) throw new HttpError(503, "Quarantena privata non configurata");
    const params = new URL(request.url).searchParams;
    const topicId = params.get("topic_id") || "";
    await existingTopic(env, topicId);
    const title = valueText(params.get("title"), 200, true);
    const note = valueText(params.get("note"), 1000);
    if (Number(request.headers.get("content-length") || 0) > 12_000_000)
      throw new HttpError(413, "File oltre 12 MB");
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > 12_000_000) throw new HttpError(413, "File oltre 12 MB");
    const mime = imageMime(new Uint8Array(bytes));
    if (!mime) throw new HttpError(415, "Usare JPEG, PNG o WebP");
    let geometry;
    try { geometry=imageGeometry(new Uint8Array(bytes)); } catch { throw new HttpError(415, "Immagine non valida o oltre 32 megapixel"); }
    const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map(x => x.toString(16).padStart(2, "0")).join("");
    // A photo deleted definitively can be uploaded again, e.g. into the right lot (docs/spazio-file.v1.2.0.md).
    const [existing, published] = await Promise.all([
      env.DB.prepare("SELECT id FROM editorial_review_inbox WHERE origin='REAL' AND sha256=?").bind(sha256).first(),
      env.DB.prepare("SELECT id FROM images WHERE sha256=?").bind(sha256).first(),
    ]);
    if (existing) throw new HttpError(409, "Fotografia già presente nella coda di revisione");
    if (published) throw new HttpError(409, "Fotografia già nel catalogo");
    const inboxId = "owner-" + id(), proposalId = id(), key = "owner-proposals/" + inboxId;
    const created = new Date().toISOString();
    const metadata = JSON.stringify({ source_kind: "owner-upload", title, topic_id: topicId, author: "",
      source_url: "", license_url: "", provenance_status: "unverified", original_key:key, original_sha256:sha256,
      image_geometry:geometry });
    await env.QUARANTINE.put(key, bytes, { httpMetadata: { contentType: mime }, customMetadata: { sha256 } });
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO editorial_review_inbox(id,origin,sha256,media_key,metadata_json,created_at) VALUES(?,'REAL',?,?,?,?)")
          .bind(inboxId, sha256, key, metadata, created),
        env.DB.prepare("INSERT INTO editorial_workspace_proposals(id,topic_id,kind,source_url,inbox_id,note,created_at) VALUES(?,?,'upload',NULL,?,?,?)")
          .bind(proposalId, topicId, inboxId, note, created),
      ]);
    } catch {
      await env.QUARANTINE.delete(key);
      throw new HttpError(409, "Caricamento duplicato o coda non disponibile; nessuna approvazione eseguita");
    }
    return json({ id: proposalId, inbox_id: inboxId, sha256, status: "pending", published: false }, 201);
  }
  throw new HttpError(405, "Operazione editoriale non consentita");
}

// v1.0.0 (2026-11-08T15:40:00Z): owner-requested removal of an obsolete, unused topic.
// Only topics without photographs, paid jobs, frozen SLOP prompts or immutable audit rows can be removed;
// those records are never deleted or orphaned here. The normalized title becomes free again.
const topicRemovalBlockers:[string,string][]=([
  // v1.1.0 (2026-11-08T21:00:00Z, spec lotti 1.4.0): unacquired links no longer block; photos do.
  ["editorial_workspace_proposals p","p.topic_id=?1 AND (p.kind<>'link' OR p.inbox_id IS NOT NULL OR EXISTS(SELECT 1 FROM editorial_workspace_acquisitions a WHERE a.proposal_id=p.id))","fotografie caricate o acquisite"],
  ["editorial_topic_explorations","topic_id=?1","ricerche GPT"],
  ["editorial_slop_prompt_bank","topic_id=?1","prompt SLOP congelati"],
  ["editorial_workspace_jobs","topic_id=?1","operazioni AI registrate"],
  ["editorial_image_relevance","topic_id=?1","valutazioni di pertinenza"],
  ["editorial_workspace_generation_claims","topic_id=?1","generazioni SLOP"],
  ["editorial_topic_semantic_history","topic_id=?1","revisioni semantiche archiviate"],
  ["editorial_topic_semantics","topic_id=?1 AND embedding_status IN ('submitting','uncertain')","embedding avviato o incerto"],
  ["editorial_topic_description_drafts","topic_id=?1 AND status IN ('preparing','ready','uncertain')","bozze di descrizione attive"]
] as [string,string,string][]).map(([table,where,label]):[string,string]=>["SELECT 1 FROM "+table+" WHERE "+where,label]);
const topicUnused=topicRemovalBlockers.map(([sql])=>"NOT EXISTS("+sql+")").join(" AND ");
export async function removeUnusedTopic(env:Env,topicId:string,data:Record<string,unknown>) {
  if(Object.keys(data).some(key=>key!=="title"))throw new HttpError(400,"Campi di rimozione non previsti");
  const topic=await existingTopic(env,topicId);
  if(data.title!==topic.title)throw new HttpError(409,"Titolo di conferma diverso: ricaricare l'argomento");
  const found:string[]=[];
  for(const [sql,label] of topicRemovalBlockers)
    if(await env.DB.prepare(sql).bind(topic.id).first())found.push(label);
  if(found.length)throw new HttpError(409,"Argomento non rimovibile perché collegato a: "+found.join(", ")+". Nessun dato è stato cancellato.");
  // Every statement repeats the guard so a concurrent change aborts the whole removal instead of leaving it half done.
  const guarded=(sql:string)=>env.DB.prepare(sql+" AND "+topicUnused).bind(topic.id);
  // The append-only snapshot comes first: migration 0030 lets unacquired link rows go only after it exists.
  const snapshot=env.DB.prepare(`INSERT INTO editorial_lot_removals(topic_id,title,normalized_key,snapshot_json,removed_at)
    SELECT t.id,t.title,t.normalized_key,json_object('version','1.0.0','created_at',t.created_at,
      'notes',(SELECT notes FROM editorial_lots WHERE topic_id=t.id),
      'semantic_description',(SELECT description FROM editorial_topic_semantics WHERE topic_id=t.id),
      'proposals',json((SELECT json_group_array(json_object('id',p.id,'source_url',p.source_url,'note',p.note,'created_at',p.created_at,
        'dismissed_at',d.created_at,'dismiss_reason',d.reason)) FROM editorial_workspace_proposals p
        LEFT JOIN editorial_workspace_proposal_dismissals d ON d.proposal_id=p.id WHERE p.topic_id=t.id)),
      'note_events',json((SELECT json_group_array(json_object('revision',e.revision,'value',e.value,'created_at',e.created_at))
        FROM editorial_lot_events e WHERE e.topic_id=t.id))),?2
    FROM editorial_workspace_topics t WHERE t.id=?1 AND `+topicUnused).bind(topic.id,new Date().toISOString());
  const result=await env.DB.batch([
    snapshot,
    guarded("UPDATE editorial_topic_description_drafts SET topic_id=NULL WHERE topic_id=?1"),
    guarded("UPDATE editorial_topic_description_jobs SET topic_id=NULL WHERE topic_id=?1"),
    guarded("DELETE FROM editorial_topic_semantics WHERE topic_id=?1"),
    guarded("DELETE FROM editorial_topic_slop_seed WHERE topic_id=?1"),
    guarded("DELETE FROM editorial_workspace_manual_stage WHERE topic_id=?1"),
    guarded("DELETE FROM editorial_workspace_proposal_dismissals WHERE proposal_id IN (SELECT id FROM editorial_workspace_proposals WHERE topic_id=?1)"),
    guarded("DELETE FROM editorial_workspace_proposals WHERE topic_id=?1"),
    guarded("DELETE FROM editorial_lot_events WHERE topic_id=?1"),
    guarded("DELETE FROM editorial_lots WHERE topic_id=?1"),
    guarded("DELETE FROM editorial_workspace_topics WHERE id=?1")
  ]);
  if(!result[result.length-1].meta.changes)throw new HttpError(409,"Argomento modificato durante la rimozione: ricaricare");
  return {removed:true,id:topic.id,title:topic.title,removed_links:result[result.length-4].meta.changes,paid_calls_started:false};
}

// v1.0.0 (2026-11-08T20:00:26Z): editorial lots, phase 1 of docs/lotti-editoriali.v1.3.1.md.
// A lot reuses the topic identity. Creating it needs only a title: no GPT proposal, embedding or SLOP seed.
const LOT_NOTES_MAX=500;
function lotNotes(value:unknown):string {
  if(value===undefined || value===null)return "";
  if(typeof value!=="string")throw new HttpError(400,"Note del lotto non valide");
  const notes=value.normalize("NFKC").trim();
  if(notes.length>LOT_NOTES_MAX)throw new HttpError(400,"Note del lotto oltre 500 caratteri");
  return notes;
}
async function recordNotes(env:Env,topicId:string,notes:string,expected:number,stamp:string) {
  const revision=expected+1;
  const result=await env.DB.batch([
    env.DB.prepare("INSERT INTO editorial_lots(topic_id,notes,status,revision,created_at,updated_at) SELECT ?,?,'open',?,?,? WHERE ?=0 AND NOT EXISTS(SELECT 1 FROM editorial_lots WHERE topic_id=?)")
      .bind(topicId,notes,revision,stamp,stamp,expected,topicId),
    env.DB.prepare("UPDATE editorial_lots SET notes=?,revision=?,updated_at=? WHERE topic_id=? AND revision=?")
      .bind(notes,revision,stamp,topicId,expected),
    env.DB.prepare("INSERT INTO editorial_lot_events(id,topic_id,kind,value,revision,created_at) SELECT ?,?,'notes',?,?,? WHERE EXISTS(SELECT 1 FROM editorial_lots WHERE topic_id=? AND revision=? AND notes=?)")
      .bind(id(),topicId,notes,revision,stamp,topicId,revision,notes)
  ]);
  if(!result[0].meta.changes && !result[1].meta.changes)throw new HttpError(409,"Note modificate altrove: ricaricare il lotto");
  return revision;
}
async function editorialLots(request:Request,env:Env,path:string):Promise<Response|null> {
  if(path===base+"/lots" && request.method==="POST"){
    const data=await body(request,3000);
    if(Object.keys(data).some(key=>!["title","notes"].includes(key)))throw new HttpError(400,"Campi del lotto non previsti");
    let title:string,key:string;
    try{title=topicTitle(data.title);key=topicKey(title);}catch(error){return invalid(error);}
    const notes=lotNotes(data.notes);
    const existing=await env.DB.prepare("SELECT id,title FROM editorial_workspace_topics WHERE normalized_key=?").bind(key).first<{id:string;title:string}>();
    if(existing)return json({...existing,already_exists:true,paid_calls_started:false});
    const lot={id:id(),title,created_at:new Date().toISOString()};
    try{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO editorial_workspace_topics(id,title,normalized_key,created_at) VALUES(?,?,?,?)").bind(lot.id,title,key,lot.created_at),
        env.DB.prepare("INSERT INTO editorial_lots(topic_id,notes,status,revision,created_at,updated_at) VALUES(?,?,'open',?,?,?)")
          .bind(lot.id,notes,notes?1:0,lot.created_at,lot.created_at),
        ...(notes?[env.DB.prepare("INSERT INTO editorial_lot_events(id,topic_id,kind,value,revision,created_at) VALUES(?,?,'notes',?,1,?)")
          .bind(id(),lot.id,notes,lot.created_at)]:[])
      ]);
    }catch{
      const raced=await env.DB.prepare("SELECT id,title FROM editorial_workspace_topics WHERE normalized_key=?").bind(key).first<{id:string;title:string}>();
      if(raced)return json({...raced,already_exists:true,paid_calls_started:false});
      throw new HttpError(409,"Lotto non registrato: ricaricare la pagina");
    }
    return json({...lot,notes,lot_status:"open",lot_revision:notes?1:0,already_exists:false,paid_calls_started:false},201);
  }
  const notesPath=path.match(/^\/api\/admin\/editorial\/workspace\/lots\/([a-f0-9-]{36})\/notes$/i);
  if(notesPath && request.method==="POST"){
    const data=await body(request,3000);
    if(Object.keys(data).some(key=>!["notes","expected_revision"].includes(key)))throw new HttpError(400,"Campi delle note non previsti");
    const expected=data.expected_revision;
    if(!Number.isSafeInteger(expected) || (expected as number)<0)throw new HttpError(400,"Revisione delle note richiesta");
    const lot=await existingTopic(env,notesPath[1]);
    const notes=lotNotes(data.notes);
    const current=await env.DB.prepare("SELECT notes,revision FROM editorial_lots WHERE topic_id=?").bind(lot.id).first<{notes:string;revision:number}>();
    if(current && current.revision===expected && current.notes===notes)return json({id:lot.id,notes,lot_revision:current.revision,changed:false});
    const revision=await recordNotes(env,lot.id,notes,expected as number,new Date().toISOString());
    return json({id:lot.id,notes,lot_revision:revision,changed:true});
  }
  const dismissPath=path.match(/^\/api\/admin\/editorial\/workspace\/proposals\/([a-f0-9-]{36})\/dismiss$/i);
  if(dismissPath && request.method==="POST"){
    const data=await body(request,1000);
    if(Object.keys(data).some(key=>key!=="reason"))throw new HttpError(400,"Campi dello scarto non previsti");
    const reason=data.reason===undefined?"":String(data.reason).normalize("NFKC").trim();
    if(typeof data.reason!=="undefined" && typeof data.reason!=="string" || reason.length>300)throw new HttpError(400,"Motivo dello scarto non valido");
    const proposal=await env.DB.prepare("SELECT p.id,p.kind,p.inbox_id,a.inbox_id AS acquired,d.proposal_id AS dismissed FROM editorial_workspace_proposals p LEFT JOIN editorial_workspace_acquisitions a ON a.proposal_id=p.id LEFT JOIN editorial_workspace_proposal_dismissals d ON d.proposal_id=p.id WHERE p.id=?")
      .bind(dismissPath[1]).first<{id:string;kind:string;inbox_id:string|null;acquired:string|null;dismissed:string|null}>();
    if(!proposal)throw new HttpError(404,"Proposta non trovata");
    if(proposal.dismissed)return json({id:proposal.id,dismissed:true,already_dismissed:true});
    if(proposal.kind!=="link" || proposal.inbox_id || proposal.acquired)
      throw new HttpError(409,"Si possono scartare solo link mai acquisiti: le fotografie seguono la revisione");
    try{
      await env.DB.prepare("INSERT INTO editorial_workspace_proposal_dismissals(proposal_id,reason,created_at) VALUES(?,?,?)")
        .bind(proposal.id,reason,new Date().toISOString()).run();
    }catch{
      const again=await env.DB.prepare("SELECT 1 FROM editorial_workspace_proposal_dismissals WHERE proposal_id=?").bind(proposal.id).first();
      if(again)return json({id:proposal.id,dismissed:true,already_dismissed:true});
      throw new HttpError(409,"Proposta acquisita nel frattempo: non scartata");
    }
    return json({id:proposal.id,dismissed:true,already_dismissed:false});
  }
  if(path===base+"/commons/search" && request.method==="GET"){
    const params=new URL(request.url).searchParams;
    return json(await browseCommonsSearch(params.get("q") || "",params.get("offset") || "",params.get("sort") || "relevance"));
  }
  if(path===base+"/commons/category" && request.method==="GET"){
    const params=new URL(request.url).searchParams;
    return json(await browseCommonsCategory(params.get("name") || "",params.get("continue") || ""));
  }
  return null;
}
