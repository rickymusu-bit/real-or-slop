import { body, hash, HttpError, id, json, type Env } from "./core";
import { prepareImport, importText } from "./import";
import { recognizedLicense } from "../shared/licenses";
import { hasTags } from "./tags.v1.0.0";
import { GAME_COPY_MISSING, hasGameCopy } from "./review-inbox";

const base = "/api/admin/editorial/cycle";
interface Review { id: string; origin: string; sha256: string; source_sha256: string; media_key: string; metadata_json: string; revision: number; status: string }
function cycleId(value: unknown) {
  if (typeof value !== "string" || !/^[\w-]{1,100}$/.test(value)) throw new HttpError(400, "ID ciclo non valido");
  return value;
}
async function bytes(env: Env, key: string, expected: string) {
  const file = await env.QUARANTINE!.get(key);
  if (!file || !file.size || file.size > 12_000_000) throw new HttpError(409, "Originale o anteprima mancanti");
  const buffer = await file.arrayBuffer();
  const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map(x => x.toString(16).padStart(2,"0")).join("");
  if (sha !== expected) throw new HttpError(409, "Pixel diversi dalla revisione");
  return { buffer, httpMetadata: file.httpMetadata };
}
export async function editorialCycle(request: Request, env: Env, path: string): Promise<Response> {
  if (path === base && request.method === "GET") {
    const cycle = cycleId(new URL(request.url).searchParams.get("cycle_id"));
    const rows = (await env.DB.prepare(`SELECT q.origin,q.status,count(*) AS count FROM editorial_review_effective_images q
      WHERE json_extract(q.metadata_json,'$.cycle_id')=? OR EXISTS(SELECT 1 FROM editorial_cycle_admissions a WHERE a.inbox_id=q.id AND a.cycle_id=?)
      GROUP BY q.origin,q.status`).bind(cycle,cycle).all()).results;
    const ready = (await env.DB.prepare(`SELECT r.type,count(*) AS count FROM editorial_cycle_ready_images r
      WHERE r.cycle_id=? AND NOT EXISTS(SELECT 1 FROM published_images p WHERE p.image_id=r.image_id) GROUP BY r.type`).bind(cycle).all()).results;
    const published = (await env.DB.prepare(`SELECT i.type,count(DISTINCT p.image_id) AS count FROM editorial_cycle_admissions a
      JOIN published_images p ON p.image_id=a.image_id JOIN images i ON i.id=p.image_id WHERE a.cycle_id=? GROUP BY i.type`).bind(cycle).all()).results;
    return json({ cycle_id:cycle, reviews:rows, ready, published });
  }
  if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
  const data = await body(request, 24000), cycle = cycleId(data.cycle_id);
  if (path === base + "/publish") {
    if (Object.keys(data).some(k => !["cycle_id","confirm"].includes(k)) || data.confirm !== true)
      throw new HttpError(400, "Confermare la pubblicazione del ciclo");
    const uid = id(), stamp = new Date().toISOString();
    // One statement + existing triggers: exact balance and membership are atomic.
    const result = await env.DB.prepare(`WITH waiting AS (
      SELECT r.image_id,r.type,row_number() OVER(PARTITION BY r.type ORDER BY r.created_at,r.image_id) AS n
      FROM editorial_cycle_ready_images r WHERE r.cycle_id=?
      AND NOT EXISTS(SELECT 1 FROM published_images p WHERE p.image_id=r.image_id)
      AND EXISTS(SELECT 1 FROM editorial_cycle_admissions a JOIN editorial_image_tags it ON it.inbox_id=a.inbox_id
        JOIN editorial_tags t ON t.id=it.tag_id AND t.retired_at IS NULL WHERE a.image_id=r.image_id)
    ), capacity AS (SELECT min(sum(type='REAL'),sum(type='AI')) AS cap FROM waiting)
    INSERT INTO publication_batches SELECT ?,json_group_array(w.image_id),?,? FROM waiting w,capacity c
      WHERE w.n<=c.cap HAVING count(*)>0`).bind(cycle,uid,(await hash(env.ADMIN_TOKEN!)).slice(0,12),stamp).run();
    const count = result.meta.changes ? await env.DB.prepare("SELECT count(*) AS count FROM published_images WHERE batch_id=?").bind(uid).first<{count:number}>() : null;
    return json({ published:Boolean(result.meta.changes), batch_id:count ? uid : null, per_origin:(count?.count || 0)/2 });
  }
  if (path !== base + "/admit") throw new HttpError(404, "API ciclo inesistente");
  const allowed = ["cycle_id","inbox_id","revision","sha256","rights_confirmed","authenticity_confirmed","title","author","source_url","license_url","evidence","explanation","categories","owner_declaration"];
  if (Object.keys(data).some(k => !allowed.includes(k)) || data.rights_confirmed !== true || data.authenticity_confirmed !== true ||
      typeof data.inbox_id !== "string" || !/^[\w-]{1,160}$/.test(data.inbox_id) || !Number.isSafeInteger(data.revision) ||
      typeof data.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(data.sha256) || !recognizedLicense(data.license_url))
    throw new HttpError(400, "Confermare separatamente origine, diritti, licenza e revisione");
  if (!env.QUARANTINE || !env.IMAGES) throw new HttpError(503, "Storage non configurato");
  const row = await env.DB.prepare("SELECT * FROM editorial_review_effective_images WHERE id=?").bind(data.inbox_id).first<Review>();
  if (!row || row.status !== "approved" || row.revision !== data.revision || row.sha256 !== data.sha256)
    throw new HttpError(409, "Approvazione personale assente o cambiata");
  const event = await env.DB.prepare("SELECT id FROM editorial_review_inbox_events WHERE image_id=? AND revision=? AND image_sha256=? AND decision='approved'")
    .bind(row.id,row.revision,row.sha256).first<{id:string}>();
  if (!event) throw new HttpError(409, "Approvare personalmente questi pixel nella coda del sito");
  if (!(await hasTags(env, row.id))) throw new HttpError(409, "Aggiungi almeno un tag prima dell'ammissione: una foto con il solo «untagged» non si pubblica");
  // Approvals given on an original before game copies existed do not count: the copy must be the voted file.
  if (!(await hasGameCopy(env, row)))
    throw new HttpError(409, GAME_COPY_MISSING);
  const metadata = JSON.parse(row.metadata_json) as Record<string,unknown>;
  if (metadata.cycle_id && metadata.cycle_id !== cycle) throw new HttpError(409, "Usare il ciclo di provenienza dell'immagine");
  if (typeof metadata.original_key !== "string" || typeof metadata.original_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(metadata.original_sha256))
    throw new HttpError(409, "Originale documentato necessario prima dell'ammissione");
  const proof = metadata.provenance as Record<string,unknown> | undefined;
  if (row.origin === "AI" && (data.owner_declaration !== true || !proof || proof.input_kind !== "text-only" || proof.fully_synthetic !== true ||
      typeof proof.freeze_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(proof.freeze_sha256) || !proof.request_id))
    throw new HttpError(400, "Dichiarazione e ricevuta SLOP da prompt congelato richieste");
  const payload = { ...data, type:row.origin, provider:"editorial-cycle", source_id:row.id,
    ai_model:proof?.model, ai_prompt:proof?.prompt, generation_date:String(proof?.generated_at || "").slice(0,10) };
  // Validate even on replay; attestation includes all human-supplied documentary fields.
  const guard = {sql:"EXISTS(SELECT 1 FROM editorial_review_effective_images WHERE id=? AND status='approved' AND revision=? AND sha256=?)",
    values:[row.id,row.revision,row.sha256]};
  const prepared = prepareImport(env,payload,guard);
  const categories = data.categories as unknown[];
  if (!Array.isArray(categories) || !categories.length || categories.length > 12 || new Set(categories).size !== categories.length ||
      categories.some(c => typeof c !== "string") ||
      (await env.DB.prepare(`SELECT count(*) AS n FROM categories WHERE id IN (${categories.map(() => "?").join(",")})`).bind(...categories).first<{n:number}>())?.n !== categories.length)
    throw new HttpError(400, "Scegliere categorie esistenti e distinte");
  const attestation = JSON.stringify(Object.fromEntries(Object.keys(data).sort().map(k => [k,data[k]])));
  const previous = await env.DB.prepare("SELECT cycle_id,attestation_json,image_id FROM editorial_cycle_admissions WHERE inbox_id=? AND review_revision=?")
    .bind(row.id,row.revision).first<{cycle_id:string;attestation_json:string;image_id:string}>();
  if (previous) {
    if (previous.cycle_id !== cycle || previous.attestation_json !== attestation) throw new HttpError(409, "Ammissione già registrata con attestazioni diverse");
    const published = Boolean(await env.DB.prepare("SELECT 1 FROM published_images WHERE image_id=?").bind(previous.image_id).first());
    return json({ admitted:true, image_id:previous.image_id, already_admitted:true, published });
  }
  const existing = await env.DB.prepare(`SELECT i.id,i.sha256,i.r2_key FROM images i JOIN sources s ON s.id=i.source_id
    WHERE s.provider='editorial-cycle' AND s.source_id=?`).bind(row.id).first<{id:string;sha256:string;r2_key:string}>();
  const priorCycle = await env.DB.prepare("SELECT cycle_id FROM editorial_cycle_admissions WHERE inbox_id=? LIMIT 1").bind(row.id).first<{cycle_id:string}>();
  if (existing && (existing.sha256 !== row.sha256 || priorCycle?.cycle_id !== cycle)) throw new HttpError(409, "Immagine già ammessa con identità o ciclo diversi");
  const [original, preview] = await Promise.all([bytes(env,metadata.original_key,metadata.original_sha256),bytes(env,row.media_key,row.sha256)]);
  const imageId = existing?.id || prepared.id, key = existing?.r2_key || "editorial-cycle/"+row.origin+"/"+row.sha256;
  await Promise.all([
    env.QUARANTINE.put("originals/"+imageId,original.buffer,{httpMetadata:original.httpMetadata,customMetadata:{sha256:metadata.original_sha256}}),
    env.QUARANTINE.put(key,preview.buffer,{httpMetadata:preview.httpMetadata}),
    env.IMAGES.put(key,preview.buffer,{httpMetadata:preview.httpMetadata}),
  ]);
  const insertion = existing ? [] : prepared.statements;
  const target = imageId;
  const license = recognizedLicense(data.license_url)!;
  const phash = typeof metadata.perceptual_hash === "string" && /^[a-f0-9]{16}$/.test(metadata.perceptual_hash) ? metadata.perceptual_hash : null;
  const uid = id(), reviewer = (await hash(env.ADMIN_TOKEN!)).slice(0,12), stamp = new Date().toISOString();
  try {
    await env.DB.batch([
      ...insertion,
      ...(existing ? [
        env.DB.prepare(`UPDATE sources SET page_url=?,evidence=? WHERE id=(SELECT source_id FROM images WHERE id=?) AND ${guard.sql}`)
          .bind(importText(data,"source_url"),importText(data,"evidence"),target,...guard.values),
        env.DB.prepare(`UPDATE licenses SET url=?,name=? WHERE id=(SELECT license_id FROM images WHERE id=?) AND ${guard.sql}`)
          .bind(license.url,license.name,target,...guard.values),
        env.DB.prepare(`DELETE FROM image_categories WHERE image_id=? AND ${guard.sql}`).bind(target,...guard.values),
        ...categories.map(c => env.DB.prepare(`INSERT INTO image_categories SELECT ?,? WHERE ${guard.sql}`).bind(target,c,...guard.values)),
      ] : []),
      env.DB.prepare(`UPDATE images SET sha256=?,r2_key=?,status='approved',rights_verified_at=?,explanation=?,title=?,author=?,authenticity_evidence=?,perceptual_hash=?
        WHERE id=? AND ${guard.sql}`).bind(row.sha256,key,stamp,importText(data,"explanation"),importText(data,"title",300),importText(data,"author",300),importText(data,"evidence"),phash,target,...guard.values),
      env.DB.prepare(`INSERT INTO review_events SELECT ?,?,?,?,?,? WHERE ${guard.sql}`)
        .bind(uid,target,reviewer,"approved",JSON.stringify({interface:"cycle-documentary-admission",inbox_event:event.id,attestation:JSON.parse(attestation) as unknown}),stamp,...guard.values),
      env.DB.prepare(`INSERT INTO editorial_cycle_admissions VALUES(?,?,?,?,?,?,?,?,?)`)
        .bind(id(),cycle,row.id,target,row.sha256,row.revision,attestation,reviewer,stamp),
    ]);
  } catch {
    const raced = await env.DB.prepare("SELECT image_id,attestation_json FROM editorial_cycle_admissions WHERE inbox_id=? AND review_revision=?")
      .bind(row.id,row.revision).first<{image_id:string;attestation_json:string}>();
    if (raced?.attestation_json === attestation) return json({admitted:true,image_id:raced.image_id,already_admitted:true,published:false});
    throw new HttpError(409,"Ammissione interrotta: ricaricare voti, verificare duplicati e capienza della coda");
  }
  return json({admitted:true,image_id:target,already_admitted:false,published:false},201);
}
