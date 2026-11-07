import { body, HttpError, id, json, type Env } from "./core";
import { imageMime, sourcePageUrl, topicKey, topicTitle } from "../shared/editorial-workspace.v1.0.0";
import { ensureSlopSeed } from "./editorial-learning.v1.0.0";
import { imageDimensions } from "../shared/image-dimensions.v1.0.0";
import { createTopicSemantics, embedTopicOnSubmission, embeddingConfig, DEFAULT_TOPIC_EMBEDDING_MODEL, semanticTopicDescription, semanticTopicText } from "./topic-semantic-memory.v1.0.0";
import { hash } from "./core";

const base = "/api/admin/editorial/workspace";
type TopicRow = { id: string; title: string; normalized_key: string; created_at: string; description: string | null; embedding_status: string | null };
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
    const [topics, proposals] = await Promise.all([
      env.DB.prepare("SELECT t.id,t.title,t.normalized_key,t.created_at,s.description,s.embedding_status,s.input_sha256,s.error_code FROM editorial_workspace_topics t LEFT JOIN editorial_topic_semantics s ON s.topic_id=t.id ORDER BY t.created_at DESC,t.id DESC").all<TopicRow>(),
      env.DB.prepare("SELECT p.id,p.topic_id,p.kind,p.source_url,COALESCE(p.inbox_id,a.inbox_id) AS inbox_id,p.note,p.created_at,i.status AS review_status FROM editorial_workspace_proposals p LEFT JOIN editorial_workspace_acquisitions a ON a.proposal_id=p.id LEFT JOIN editorial_review_inbox i ON i.id=COALESCE(p.inbox_id,a.inbox_id) ORDER BY p.created_at DESC,p.id DESC LIMIT 1000").all<ProposalRow>(),
    ]);
    let embeddingReady=false;
    try{embeddingReady=!!embeddingConfig(env);}catch{ /* expose unconfigured state without losing topics */ }
    return json({ topics: topics.results, proposals: proposals.results, embedding_enabled:embeddingReady,
      embedding_cost:env.TOPIC_EMBEDDING_CALL_USD || null, paid_search_enabled: false,
      slop_generation_enabled: false, autonomous_suggestions_enabled: false });
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
  if (path === base + "/topics" && request.method === "POST") {
    const data = await body(request, 3000);
    if (Object.keys(data).some(key => !["title","description"].includes(key))) throw new HttpError(400, "Campi argomento non previsti");
    let title: string, key: string, description: string;
    try { title = topicTitle(data.title); key = topicKey(title); description = semanticTopicDescription(data.description); }
    catch (error) { return invalid(error); }
    const existing = await env.DB.prepare("SELECT id,title FROM editorial_workspace_topics WHERE normalized_key=?").bind(key).first<{ id: string; title: string }>();
    if (existing) {
      const semantic=await env.DB.prepare("SELECT embedding_status FROM editorial_topic_semantics WHERE topic_id=?")
        .bind(existing.id).first<{embedding_status:string}>();
      return json({ ...existing, already_exists: true,embedding_status:semantic?.embedding_status||"not_indexed" });
    }
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
  if (path === base + "/links" && request.method === "POST") {
    const data = await body(request, 5000);
    if (Object.keys(data).some(key => !["topic_id","source_url","note"].includes(key)))
      throw new HttpError(400, "Campi della proposta non previsti");
    await existingTopic(env, valueText(data.topic_id, 36, true));
    let sourceUrl: string;
    try { sourceUrl = sourcePageUrl(data.source_url); } catch (error) { return invalid(error); }
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
    try { geometry=imageDimensions(new Uint8Array(bytes)); } catch { throw new HttpError(415, "Immagine non valida o oltre 32 megapixel"); }
    const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map(x => x.toString(16).padStart(2, "0")).join("");
    const [existing, rejected, published] = await Promise.all([
      env.DB.prepare("SELECT id FROM editorial_review_inbox WHERE origin='REAL' AND sha256=?").bind(sha256).first(),
      env.DB.prepare("SELECT image_id FROM editorial_review_deleted_images WHERE origin='REAL' AND sha256=?").bind(sha256).first(),
      env.DB.prepare("SELECT id FROM images WHERE sha256=?").bind(sha256).first(),
    ]);
    if (existing || rejected || published) throw new HttpError(409, "Fotografia già presente o precedentemente eliminata");
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
