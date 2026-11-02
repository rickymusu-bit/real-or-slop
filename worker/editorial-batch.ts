import { body, hash, HttpError, id, json, type Env } from "./core";
import { importText, httpsUrl } from "./import";
interface Run { id: string; day: string; status: string; stage: string; capacity: number; config_json: string; checkpoint_json: string; files_json: string; revision: number; lease_hash: string | null; lease_until: number }
interface BlobFile { path: string; sha256: string; size: number }
const active = "('active','paused')";
const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;
function number(value: string | undefined, fallback = 0) { const n = value === undefined ? fallback : Number(value); if (!positive(n)) throw new HttpError(503, "Limiti Batch server non configurati"); return n; }
function hex(value: unknown, length = 64): string { if (typeof value !== "string" || !new RegExp(`^[0-9a-f]{${length}}$`).test(value)) throw new HttpError(400, "Impronta Batch non valida"); return value; }
function visible(row: Run) { return { id: row.id, day: row.day, status: row.status, stage: row.stage, capacity: row.capacity, config: JSON.parse(row.config_json), state: JSON.parse(row.checkpoint_json), files: JSON.parse(row.files_json), revision: row.revision }; }
export async function editorialBatch(request: Request, env: Env, path: string) {
  const base = "/api/admin/editorial/batch-runs";
  if (path === base && request.method === "GET") return json((await env.DB.prepare("SELECT id,day,status,stage,capacity,revision,updated_at FROM editorial_batch_runs ORDER BY (status IN ('active','paused')) DESC,created_at DESC LIMIT 100").all()).results);
  if (path === base && request.method === "POST") {
    if (env.ENABLE_EDITORIAL_PAID !== "true") throw new HttpError(503, "Batch pagati non abilitati");
    if (!env.QUARANTINE || !env.IMAGES) throw new HttpError(503, "Storage privato mancante");
    const data = await body(request, 100000), uid = importText(data, "id", 100);
    const cfg = data.config as Record<string, unknown>, photos = data.photos as Record<string, unknown>[];
    if (!cfg || !Array.isArray(photos) || photos.length < 1 || photos.length > 20 || !positive(cfg.run_usd) || !positive(cfg.daily_usd) || !positive(cfg.evaluation_usd) || !positive(cfg.generation_usd) || !["analysis_model","evaluator_model","image_model"].every(key => typeof cfg[key] === "string" && cfg[key])) throw new HttpError(400, "Configurazione e lotto Batch richiesti");
    for (const key of ["max_evaluations","max_generations","max_regenerations","queue_limit"]) if (!Number.isSafeInteger(cfg[key]) || !positive(cfg[key])) throw new HttpError(400, "Limiti Batch non validi");
    if (!/^[-\w]{1,100}$/.test(uid) || (photos.length<=2 && (cfg.attempts!==1 || Number(cfg.max_evaluations)>4 || Number(cfg.max_generations)>1))) throw new HttpError(400,"Limiti della prova controllata non rispettati");
    if (Number(cfg.evaluation_usd)<number(env.EDITORIAL_BATCH_EVALUATION_USD) || Number(cfg.generation_usd)<number(env.EDITORIAL_BATCH_GENERATION_USD)) throw new HttpError(409,"Stime Batch inferiori ai limiti server");
    number(env.EDITORIAL_TOTAL_USD); // A multi-day pilot must have a cumulative cap.
    const now = new Date().toISOString(), day = now.slice(0,10);
    const prior = await env.DB.prepare("SELECT * FROM editorial_batch_runs WHERE id=?").bind(uid).first<Run>();
    if (prior) { if (prior.config_json !== JSON.stringify(cfg)) throw new HttpError(409,"Run già presente con configurazione diversa"); return json(visible(prior)); }
    const known = (await env.DB.prepare("SELECT i.sha256,s.provider,s.source_id,s.page_url AS source_url FROM images i LEFT JOIN sources s ON s.id=i.source_id UNION ALL SELECT original_sha256 AS sha256,provider,source_id,source_url FROM reference_photos").all()).results;
    const claims = photos.map(photo => {
      const provider = importText(photo,"provider",100), source = importText(photo,"source_id",300), url = httpsUrl(importText(photo,"source_url",1000));
      const original = hex(photo.original_sha256), file = hex(photo.file_sha256);
      if (known.some(row => row.sha256 === original || row.sha256 === file || row.source_url === url || (row.provider === provider && row.source_id === source))) throw new HttpError(409,"Fotografia già presente nel catalogo o registro");
      return [importText(photo,"id",100),uid,provider,source,url,original,file,hex(photo.perceptual_hash,16)];
    });
    const event = env.DB.prepare(`INSERT INTO editorial_batch_runs(id,day,status,stage,capacity,config_json,created_at,updated_at)
      SELECT ?,?,'active','ranking',?,?,?,? WHERE
      (SELECT count(*) FROM images WHERE status IN ('candidate','in-review','approved') AND id NOT IN (SELECT image_id FROM published_images))+
      COALESCE((SELECT sum(capacity) FROM editorial_batch_runs WHERE status IN ${active}),0)+? <= min(?,(SELECT queue_limit FROM editorial_controls WHERE id=1))`)
      .bind(uid,day,photos.length,JSON.stringify(cfg),now,now,photos.length,cfg.queue_limit);
    try { const result = await env.DB.batch([event,...claims.map(values => env.DB.prepare("INSERT INTO editorial_batch_sources SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM editorial_batch_runs WHERE id=?)").bind(...values,uid))]); if (!result[0].meta.changes) throw Error(); }
    catch { throw new HttpError(409,"Lotto giornaliero già avviato, duplicato o coda piena"); }
    return json(visible((await env.DB.prepare("SELECT * FROM editorial_batch_runs WHERE id=?").bind(uid).first<Run>())!),201);
  }
  const match = path.match(/^\/api\/admin\/editorial\/batch-runs\/([\w-]+)(?:\/(lease|checkpoint|reserve|files)(?:\/([a-f0-9]{64}))?)?$/);
  if (!match) throw new HttpError(404,"API Batch inesistente");
  const run = await env.DB.prepare("SELECT * FROM editorial_batch_runs WHERE id=?").bind(match[1]).first<Run>();
  if (!run) throw new HttpError(404,"Run Batch non trovato");
  if (!match[2] && request.method === "GET") return json(visible(run));
  const now = Date.now();
  if (match[2] === "lease" && request.method === "POST") {
    const token = id()+id(), result = await env.DB.prepare("UPDATE editorial_batch_runs SET lease_hash=?,lease_until=? WHERE id=? AND lease_until<=?").bind(await hash(token),now+900000,run.id,now).run();
    if (!result.meta.changes) throw new HttpError(409,"Run già gestito da un altro processo");
    return json({ lease: token, revision: run.revision });
  }
  if (match[2] === "lease" && request.method === "DELETE") {
    await env.DB.prepare("UPDATE editorial_batch_runs SET lease_hash=NULL,lease_until=0 WHERE id=? AND lease_hash=?").bind(run.id,await hash(request.headers.get("X-Batch-Lease") || "")).run(); return json({released:true});
  }
  if (match[2] === "files" && match[3] && request.method === "GET") {
    if (!(JSON.parse(run.files_json) as BlobFile[]).some(file => file.sha256 === match[3])) throw new HttpError(404,"File fuori dal checkpoint");
    const object = await env.QUARANTINE?.get(`editorial-batches/${run.id}/${match[3]}`); if (!object) throw new HttpError(404,"File checkpoint mancante");
    return new Response(object.body,{headers:{"Content-Type":"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  }
  const lease = await hash(request.headers.get("X-Batch-Lease") || "");
  if (run.lease_hash !== lease || run.lease_until <= now) throw new HttpError(409,"Lease Batch scaduto: ricaricare lo stato");
  if (match[2] === "files" && match[3] && request.method === "PUT") {
    if (!env.QUARANTINE) throw new HttpError(503,"Quarantena mancante");
    if (Number(request.headers.get("Content-Length"))>12000000) throw new HttpError(413,"File Batch oltre 12 MB");
    const bytes=await request.arrayBuffer(); if (!bytes.byteLength || bytes.byteLength>12000000) throw new HttpError(413,"Dimensione non valida");
    const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(n=>n.toString(16).padStart(2,"0")).join(""); if (digest!==match[3]) throw new HttpError(409,"File Batch modificato");
    await env.QUARANTINE.put(`editorial-batches/${run.id}/${digest}`,bytes,{onlyIf:{etagDoesNotMatch:"*"}}); return json({saved:true});
  }
  if (match[2] === "checkpoint" && request.method === "PUT") {
    const data=await body(request,2000000), state=data.state as Record<string,unknown>, files=data.files as BlobFile[];
    if (!state || state.id!==run.id || !["active","paused","completed","cancelled","stopped"].includes(String(state.status)) || typeof state.stage!=="string" || !Number.isSafeInteger(data.revision) || !Array.isArray(files) || files.length>160 || new Set(files.map(f=>f.path)).size!==files.length) throw new HttpError(400,"Checkpoint Batch non valido");
    const old=JSON.parse(run.files_json) as BlobFile[];
    for (const file of files) if (!/^(inputs|generations)\/[a-zA-Z0-9_-]+\/(original\.(png|jpg|webp)|preview\.webp)$/.test(file.path) || !Number.isInteger(file.size) || file.size<1 || file.size>12000000 || hex(file.sha256)!==file.sha256) throw new HttpError(400,"Percorso o file checkpoint non valido");
    const added=files.filter(file=>!old.some(prior=>prior.sha256===file.sha256 && prior.size===file.size));
    if (added.length>40) throw new HttpError(413,"Troppi file nuovi in un checkpoint");
    for (const file of added) if ((await env.QUARANTINE?.head(`editorial-batches/${run.id}/${file.sha256}`))?.size!==file.size) throw new HttpError(409,"Checkpoint incompleto");
    const result=await env.DB.prepare("UPDATE editorial_batch_runs SET checkpoint_json=?,files_json=?,status=?,stage=?,revision=revision+1,updated_at=?,lease_until=? WHERE id=? AND revision=? AND lease_hash=? AND lease_until>?")
      .bind(JSON.stringify(state),JSON.stringify(files),state.status,state.stage,new Date().toISOString(),now+900000,run.id,data.revision,lease,now).run();
    if (!result.meta.changes) throw new HttpError(409,"Checkpoint concorrente o lease scaduto"); return json({revision:Number(data.revision)+1});
  }
  if (match[2] === "reserve" && request.method === "POST") {
    if (env.ENABLE_EDITORIAL_PAID!=="true" || !["active","paused"].includes(run.status)) throw new HttpError(503,"Nuove richieste Batch non abilitate");
    const data=await body(request), uid=importText(data,"id",100), requests=data.requests as {id:string;kind:string}[], cfg=JSON.parse(run.config_json) as Record<string,number>;
    if (!Array.isArray(requests) || !requests.length || requests.length>20 || new Set(requests.map(r=>r.id)).size!==requests.length || requests.some(r=>Object.keys(r).some(key=>!["id","kind"].includes(key)) || !/^[-\w]{1,100}$/.test(r.id) || !["evaluation","generation","regeneration"].includes(r.kind))) throw new HttpError(400,"Richieste Batch non valide");
    const prior=await env.DB.prepare("SELECT requests_json,reserved_usd FROM editorial_batch_reservations WHERE id=? AND run_id=?").bind(uid,run.id).first<{requests_json:string;reserved_usd:number}>();
    if (prior) { const saved=JSON.parse(prior.requests_json) as {id:string;kind:string}[]; if (JSON.stringify(saved.map(({id,kind})=>({id,kind})))!==JSON.stringify(requests.map(({id,kind})=>({id,kind})))) throw new HttpError(409,"Prenotazione diversa già presente"); return json({reserved_usd:prior.reserved_usd,already_reserved:true}); }
    const evaluation=number(env.EDITORIAL_BATCH_EVALUATION_USD), generation=number(env.EDITORIAL_BATCH_GENERATION_USD);
    const rows=requests.map(row=>({...row,cost:row.kind==="evaluation"?evaluation:generation}));
    if (rows.some(row=>row.cost>(row.kind==="evaluation"?cfg.evaluation_usd:cfg.generation_usd))) throw new HttpError(409,"Stime locali inferiori ai costi Batch server");
    const total=rows.reduce((sum,row)=>sum+row.cost,0), evals=rows.filter(r=>r.kind==="evaluation").length, gens=rows.length-evals, regens=rows.filter(r=>r.kind==="regeneration").length;
    const runCap=Math.min(cfg.run_usd,number(env.EDITORIAL_RUN_USD)), dailyCap=Math.min(cfg.daily_usd,number(env.EDITORIAL_DAILY_USD));
    const result=await env.DB.prepare(`INSERT INTO editorial_batch_reservations SELECT ?,?,?,?,?,? WHERE
      round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage),0)+?,6)<=? AND
      round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage WHERE run_id=?),0)+?,6)<=? AND round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage WHERE day=?),0)+?,6)<=? AND
      (SELECT count(*) FROM editorial_usage WHERE run_id=? AND kind='evaluation')+?<=? AND
      (SELECT count(*) FROM editorial_usage WHERE run_id=? AND kind IN ('generation','regeneration'))+?<=? AND
      (SELECT count(*) FROM editorial_usage WHERE run_id=? AND kind='regeneration')+?<=?`)
      .bind(uid,run.id,new Date().toISOString().slice(0,10),JSON.stringify(rows),total,new Date().toISOString(),total,number(env.EDITORIAL_TOTAL_USD),run.id,total,runCap,new Date().toISOString().slice(0,10),total,dailyCap,run.id,evals,Math.min(cfg.max_evaluations,number(env.EDITORIAL_MAX_EVALUATIONS,60)),run.id,gens,Math.min(cfg.max_generations,number(env.EDITORIAL_MAX_GENERATIONS,20)),run.id,regens,Math.min(cfg.max_regenerations,number(env.EDITORIAL_MAX_REGENERATIONS,10))).run();
    if (!result.meta.changes) throw new HttpError(409,"Budget Batch o limite di chiamate raggiunto"); return json({reserved_usd:total});
  }
  throw new HttpError(405,"Metodo Batch non consentito");
}
