import { editorialThreshold } from "./editorial-policy";
import { hash, HttpError, type Env, type ImageRow } from "./core";
import { recognizedLicense } from "../shared/licenses";
import { preferenceFeatures } from "../shared/editorial-preferences";
type Row = ImageRow & { sha256: string; ai_prompt: string | null; ai_model: string | null; status: string; source_url: string; provider: string; source_asset_id: string; source_evidence: string; license_url: string; source_id: string; license_id: string; owner_declaration: number; generation_date: string };
interface Assessment { score?: number; reason?: string; concrete_motive?: string; photographic?: boolean; visual_tags?: unknown; editorial_threshold?: number }
export interface Preparation { image_id: string; token: string; ready: boolean; features: string[]; blockers: string[]; snapshot: Record<string, unknown> }
function parse(value: string | null | undefined): Record<string, unknown> {
  try { const result = JSON.parse(value || "{}"); return result && typeof result === "object" && !Array.isArray(result) ? result : {}; } catch { return {}; }
}
export async function prepareCandidate(env: Env, imageId: string): Promise<Preparation> {
  const image = await env.DB.prepare("SELECT i.*,s.page_url AS source_url,s.provider,s.source_id AS source_asset_id,s.evidence AS source_evidence,l.url AS license_url FROM images i LEFT JOIN sources s ON s.id=i.source_id LEFT JOIN licenses l ON l.id=i.license_id WHERE i.id=?").bind(imageId).first<Row>();
  if (!image) throw new HttpError(404, "Immagine non trovata");
  const [categories, real, attempt, curation] = await Promise.all([
    env.DB.prepare("SELECT category_id FROM image_categories WHERE image_id=? ORDER BY category_id").bind(imageId).all<{ category_id: string }>(),
    env.DB.prepare("SELECT e.evaluation_json,r.metadata_json,r.original_sha256,r.file_sha256,r.provider,r.source_id,r.source_url,r.role FROM editorial_image_reviews e JOIN reference_photos r ON r.id=e.reference_id WHERE e.image_id=?").bind(imageId).first<{ evaluation_json: string; metadata_json: string; original_sha256: string; file_sha256: string; provider: string; source_id: string; source_url: string; role: string }>(),
    env.DB.prepare("SELECT a.dossier_json,r.role FROM editorial_attempt_images a JOIN reference_photos r ON r.id=a.reference_id WHERE a.image_id=?").bind(imageId).first<{ dossier_json: string; role: string }>(),
    env.DB.prepare("SELECT revision FROM image_curation WHERE image_id=?").bind(imageId).first<{ revision: number }>(),
  ]);
  const dossier = parse(attempt?.dossier_json);
  const evaluation = (image.type === "REAL" ? parse(real?.evaluation_json) : dossier.evaluation || {}) as Assessment;
  const threshold = await editorialThreshold(env);
  const blockers: string[] = [];
  if (image.status !== "in-review") blockers.push("already_reviewed");
  if (!recognizedLicense(image.license_url)) blockers.push("license_unresolved");
  if (!categories.results.length) blockers.push("categories_missing");
  if (!image.author?.trim() || !image.source_evidence?.trim() || !image.source_url?.startsWith("https://")) blockers.push("provenance_incomplete");
  if (!image.explanation?.trim() || image.explanation.includes("da completare prima")) blockers.push("explanation_incomplete");
  if (!Number.isFinite(evaluation.score) || !Number.isFinite(threshold) || threshold < 0 || threshold > 100 || Number(evaluation.score) < threshold || Number(evaluation.score) > 100 || evaluation.photographic !== true || typeof evaluation.reason !== "string" || !evaluation.reason.trim() || typeof evaluation.concrete_motive !== "string" || !evaluation.concrete_motive.trim()) blockers.push("visual_assessment_incomplete");
  let expectedOriginal: unknown;
  if (image.type === "REAL") {
    expectedOriginal = real?.original_sha256;
    if (!real || real.role !== "REAL" || real.file_sha256 !== image.sha256 || real.provider !== image.provider || real.source_id !== image.source_asset_id || real.source_url !== image.source_url || recognizedLicense(String(parse(real.metadata_json).license_url || ""))?.url !== recognizedLicense(image.license_url)?.url) blockers.push("real_reference_incomplete");
  } else {
    expectedOriginal = dossier.original_sha256;
    const description = dossier.description as Record<string, unknown> | undefined;
    const descriptionKeys = ["subject","environment","objects_relations","materials","composition","situation","details","direct_observations","documented_information","inferences"];
    if (!attempt || attempt.role !== "SLOP" || !["accepted", "discarded"].includes(String(dossier.status)) || dossier.sha256 !== image.sha256 || dossier.prompt !== image.ai_prompt || dossier.model !== image.ai_model || !dossier.timestamp || !dossier.creative_brief || !description || descriptionKeys.some(key => typeof description[key] !== "string" || !String(description[key]).trim()) || image.owner_declaration !== 1 || !image.generation_date) blockers.push("generation_dossier_incomplete");
  }
  let derivativeEtag: string | null = null;
  if (!env.QUARANTINE || !env.IMAGES || image.sha256 === "pending") blockers.push("storage_incomplete");
  else {
    const [original, object] = await Promise.all([env.QUARANTINE.head(`originals/${image.id}`), env.QUARANTINE.get(image.r2_key)]);
    if (!original || !expectedOriginal || original.customMetadata?.sha256 !== expectedOriginal) blockers.push("original_archive_incomplete");
    if (!object || object.size > 12_000_000) blockers.push("image_file_missing");
    else {
      const bytes = await object.arrayBuffer();
      const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2,"0")).join("");
      if (sha !== image.sha256) blockers.push("image_file_changed");
      derivativeEtag = object.etag;
    }
  }
  const features = preferenceFeatures(categories.results.map(row => row.category_id), evaluation.visual_tags);
  const snapshot = { editorial_threshold: threshold, curation_revision: curation?.revision || 0, version: "1.0.0", image_id: image.id, sha256: image.sha256, original_sha256: expectedOriginal || null, derivative_etag: derivativeEtag, type: image.type, title: image.title, author: image.author, source_url: image.source_url, source_evidence: image.source_evidence, license_url: image.license_url, explanation: image.explanation, categories: categories.results.map(row => row.category_id), evaluation, dossier_hash: await hash(attempt?.dossier_json || real?.evaluation_json || ""), features };
  const token = await hash(JSON.stringify(snapshot));
  const prepared = { image_id: image.id, token, ready: blockers.length === 0, snapshot, features, blockers };
  if (image.status === "in-review") await env.DB.prepare(`INSERT INTO editorial_preparations
    SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM images i JOIN sources s ON s.id=i.source_id JOIN licenses l ON l.id=i.license_id
    WHERE i.id=? AND i.status='in-review' AND i.sha256=? AND i.explanation=? AND i.type=? AND i.title=? AND i.author=? AND i.ai_prompt IS ? AND i.ai_model IS ? AND i.owner_declaration=? AND i.generation_date IS ?
    AND s.page_url=? AND s.evidence=? AND s.provider=? AND s.source_id=? AND l.url=?
    AND COALESCE((SELECT revision FROM image_curation WHERE image_id=i.id),0)=?
    AND (SELECT json_group_array(category_id) FROM (SELECT category_id FROM image_categories WHERE image_id=i.id ORDER BY category_id))=? AND (SELECT editorial_threshold FROM editorial_controls WHERE id=1)=?)
    ON CONFLICT(image_id) DO UPDATE SET token=excluded.token,ready=excluded.ready,snapshot_json=excluded.snapshot_json,features_json=excluded.features_json,blockers_json=excluded.blockers_json,prepared_at=excluded.prepared_at`)
    .bind(image.id, token, prepared.ready ? 1 : 0, JSON.stringify(snapshot), JSON.stringify(features), JSON.stringify(blockers), new Date().toISOString(), image.id, image.sha256, image.explanation, image.type, image.title, image.author, image.ai_prompt, image.ai_model, image.owner_declaration, image.generation_date, image.source_url, image.source_evidence, image.provider, image.source_asset_id, image.license_url, curation?.revision || 0, JSON.stringify(categories.results.map(row => row.category_id)), threshold).run();
  return prepared;
}
