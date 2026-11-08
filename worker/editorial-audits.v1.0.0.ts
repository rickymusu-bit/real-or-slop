import { hash,HttpError,json,type Env } from "./core";
import { imageGeometry } from "../shared/image-geometry.v1.0.0";

export async function preferenceSnapshotHistory(request:Request,env:Env,snapshotId?:string) {
 if(snapshotId){
  if(!/^[a-f0-9]{64}$/.test(snapshotId))throw new HttpError(400,"Snapshot non valido");
  const row=await env.DB.prepare("SELECT * FROM editorial_preference_snapshots WHERE id=?").bind(snapshotId).first();
  if(!row)throw new HttpError(404,"Snapshot non trovato");
  const chunks=await env.DB.prepare("SELECT kind,items_json FROM editorial_preference_snapshot_chunks WHERE snapshot_id=? ORDER BY kind,slot")
   .bind(snapshotId).all<{kind:string;items_json:string}>();
  const items=(kind:string)=>chunks.results.filter(c=>c.kind===kind).flatMap(c=>JSON.parse(c.items_json) as unknown[]);
  const metadata=JSON.parse(String(row.state_json));
  // Preserve the canonical state field order used by the content hash.
  const state={observations:metadata.observations,approved:metadata.approved,rejected:metadata.rejected,
   counts:items('counts'),version:metadata.version,parameters:metadata.parameters};
  return json({...row,state,sources:items('sources')});
 }
 const query=new URL(request.url).searchParams,origin=query.get('origin') || 'all',offset=Number(query.get('offset') || '0');
 if(!['REAL','AI','all'].includes(origin) || !Number.isSafeInteger(offset) || offset<0 || offset>100000)throw new HttpError(400,"Filtro snapshot non valido");
 const where=origin==='all'?'1=1':'origin=?',params=origin==='all'?[]:[origin];
 const [rows,total]=await Promise.all([
  env.DB.prepare(`SELECT id,origin,learner_version,observations,approved,rejected,source_updated_at,created_at FROM editorial_preference_snapshots WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?`).bind(...params,offset).all(),
  env.DB.prepare(`SELECT count(*) AS n FROM editorial_preference_snapshots WHERE ${where}`).bind(...params).first<{n:number}>()
 ]);
 return json({snapshots:rows.results,total:total?.n || 0,offset,limit:20});
}
const formatRows=`WITH frames AS (
 SELECT q.id,q.origin,q.sha256,json_extract(q.metadata_json,'$.title') AS title,
  COALESCE(g.geometry_json,CASE WHEN json_type(q.metadata_json,'$.image_geometry')='object' THEN json_extract(q.metadata_json,'$.image_geometry') ELSE '{}' END) AS geometry,
  EXISTS(SELECT 1 FROM editorial_cycle_admissions a JOIN published_images p ON p.image_id=a.image_id WHERE a.inbox_id=q.id) AS published
 FROM editorial_review_effective_images q LEFT JOIN editorial_image_geometry g ON g.inbox_id=q.id AND g.sha256=q.sha256 AND g.parser_version='1.0.0'
), classified AS (
 SELECT *,CASE
  WHEN json_type(geometry,'$.width') NOT IN ('integer','real') OR json_type(geometry,'$.height') NOT IN ('integer','real')
   OR json_extract(geometry,'$.width') IS NULL OR json_extract(geometry,'$.height') IS NULL
   OR json_extract(geometry,'$.width')<=0 OR json_extract(geometry,'$.height')<=0
   OR json_extract(geometry,'$.orientation_status')='unknown'
   OR (json_extract(geometry,'$.mime')='image/jpeg' AND json_extract(geometry,'$.parser_version') IS NULL) THEN 'unknown'
  WHEN max(json_extract(geometry,'$.width')*1.0/json_extract(geometry,'$.height'),json_extract(geometry,'$.height')*1.0/json_extract(geometry,'$.width'))>2.5 THEN 'panorama'
  WHEN abs(json_extract(geometry,'$.width')*1.0/json_extract(geometry,'$.height')-1)<0.02 THEN 'square'
  WHEN json_extract(geometry,'$.width')>json_extract(geometry,'$.height') THEN 'landscape' ELSE 'portrait' END AS format
 FROM frames
)`;
export async function formatAudit(env:Env) {
 const [formats,unknown]=await Promise.all([
  env.DB.prepare(formatRows+" SELECT origin,published,format,count(*) AS n FROM classified GROUP BY origin,published,format").all(),
  env.DB.prepare(formatRows+" SELECT id,origin,sha256,title,COALESCE(json_extract(geometry,'$.diagnostic'),'geometry_not_audited') AS diagnostic FROM classified WHERE format='unknown' ORDER BY id LIMIT 50").all()
 ]);
 return {formats:formats.results,unknown:unknown.results};
}
export async function auditGeometry(env:Env,inboxId:unknown,sha:unknown){
 if(typeof inboxId!=='string' || !/^[\w-]{1,160}$/.test(inboxId) || typeof sha!=='string' || !/^[a-f0-9]{64}$/.test(sha))throw new HttpError(400,"Immagine o hash non validi");
 const row=await env.DB.prepare("SELECT media_key,sha256 FROM editorial_review_effective_images WHERE id=?").bind(inboxId).first<{media_key:string;sha256:string}>();
 if(!row || row.sha256!==sha)throw new HttpError(409,"Pixel aggiornati: ricaricare l'audit");
 const prior=await env.DB.prepare("SELECT geometry_json FROM editorial_image_geometry WHERE inbox_id=? AND sha256=? AND parser_version='1.0.0'")
  .bind(inboxId,sha).first<{geometry_json:string}>();
 if(prior)return {geometry:JSON.parse(prior.geometry_json),already_audited:true};
 const file=await env.QUARANTINE?.get(row.media_key);
 if(!file || file.size>12_000_000)throw new HttpError(404,"Originale privato non disponibile");
 const bytes=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
 if(Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')!==sha)throw new HttpError(409,"Hash del file diverso dai pixel correnti");
 let geometry;
 try{geometry=imageGeometry(new Uint8Array(bytes));}catch{throw new HttpError(415,"Geometria non leggibile: originale e giudizi conservati");}
 await env.DB.prepare("INSERT OR IGNORE INTO editorial_image_geometry VALUES(?,?,'1.0.0',?,?)")
  .bind(inboxId,sha,JSON.stringify(geometry),new Date().toISOString()).run();
 return {geometry,already_audited:false,sha256:await hash(JSON.stringify(geometry))};
}
