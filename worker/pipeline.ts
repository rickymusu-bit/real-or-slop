/** Gallery-wide, owner-gated pipeline. Each Workflow invocation claims exactly one operation. */
import { body, HttpError, json, type Env } from "./core";
import { paid } from "./paid";
import { chosenModel, chosenQuality } from "./models";
import { sweepGalleryFiles } from "./gallery-removal";
import { findGallery } from "./galleries";
import { create, find, viewsOf, type Row } from "./library";
import { imageMime } from "../shared/image-format";
import { imageGeometry } from "../shared/image-geometry";
import { AXES, PARAMETER_KEYS, REVIEW_SCHEMA, validProfile, variation, imageSize, normalizeCategory,
  normalizeProfile, vocabulary, type Parameter, type PipelineSettings, type Profile, type Proposal, type Review } from "../shared/pipeline";
import { proposalSchema, statCategory, taxonomyRules, TAXONOMY_KEYS, allowedOf, type TaxonomyKey, type TaxonomyKeys } from "../shared/taxonomy";
import type { VisualDescription } from "../shared/real-description";
import { VOCABULARY_RULE, annotate, base64Bytes, closeProfile, definitionsOf, dispatchPipeline, forBalancing, modelResponse, now, orientation,
  parse, profileOf, settingsOf, startJob as start, taxonomyOf, type Job, type Snapshot } from "./pipeline-core";
import { processTaxonomyJob, taxonomyRoute, TAXONOMY_TARGETS } from "./pipeline-taxonomy";
export { dispatchPipeline };
interface Source extends Row { pipeline_profile: string | null; pipeline_observed: string | null; visual_description_request: string | null; visual_description_claimed_at: string | null }
const sourceList = (env: Env, gallery: string) => env.DB.prepare("SELECT * FROM images WHERE gallery_id=? AND origin='REAL' AND status<>'trash' ORDER BY created_at,id")
  .bind(gallery).all<Source>();
const jobOf = async (env: Env, jobId: string, gallery: string) => {
  const job = await env.DB.prepare("SELECT * FROM pipeline_jobs WHERE id=? AND gallery_id=?").bind(jobId, gallery).first<Job>();
  if (!job) throw new HttpError(404, "Job not found"); return job;
};

function validProposal(value: unknown): value is Proposal {
  if (!value || typeof value !== "object") return false;
  const p = value as Proposal;
  return validProfile(p.profile) && JSON.stringify(p).length <= 22000 && AXES.every(a => typeof p.scene?.[a] === "string" && !!p.scene[a].trim()) && typeof p.changes === "string"
    && typeof p.dependencies === "string" && typeof p.genre === "string" && typeof p.aspect_ratio === "string";
}
function validReview(value: unknown): value is Review {
  const r = value as Review;
  return !!r && Array.isArray(r.findings) && r.findings.every(x => typeof x === "string") && Array.isArray(r.uncertainties)
    && r.uncertainties.every(x => typeof x === "string") && typeof r.assessment === "string" && Array.isArray(r.corrections)
    && r.corrections.every(c => [c.defect, c.instruction, c.benefit, c.risk].every(x => typeof x === "string")
      && c.region && Object.values(c.region).every(x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1)
      && c.region.width > 0 && c.region.height > 0 && c.region.x + c.region.width <= 1 && c.region.y + c.region.height <= 1);
}
/** Intended SLOP profile: closed categories and the orientation of the ratio actually requested. */
function intendedProfile(proposal: Proposal, keys: TaxonomyKeys | null) {
  const profile = closeProfile({ ...proposal.profile, genre: proposal.genre }, keys), [w, h] = proposal.aspect_ratio.split(/[:/]/).map(Number);
  if (w > 0 && h > 0) profile.parameters.aspect_ratio = { ...profile.parameters.aspect_ratio, value: proposal.aspect_ratio, category: orientation(w, h) };
  return profile;
}
const promptOf = (proposal: Proposal) => "One photograph. Follow this complete English scene on all eight axes. Preserve visible model-specific hardware and coherent physical support. No extra captions or montage.\n" + JSON.stringify(proposal.scene);
async function storeCandidate(env: Env, job: Job, payload: Record<string, unknown>) {
  const data = payload.data as { b64_json?: string }[] | undefined;
  if (!data?.[0]?.b64_json || data[0].b64_json.length > 18_000_000) throw new HttpError(502, "Invalid generated image");
  const bytes = base64Bytes(data[0].b64_json);
  const mime = imageMime(bytes); if (!mime) throw new HttpError(502, "Invalid image format");
  const geometry = imageGeometry(bytes);
  if (!geometry.width || !geometry.height || geometry.width * geometry.height > 32_000_000) throw new HttpError(502, "Invalid dimensions");
  const key = `pipeline/${job.id}/${job.request}`;
  if (job.previous_key) await env.DB.prepare("INSERT INTO gallery_files_to_delete(bucket,object_key) VALUES('quarantine',?)").bind(job.previous_key).run();
  await env.QUARANTINE!.put(key, bytes, { httpMetadata: { contentType: mime } });
  const proposal=parse<Proposal>(job.proposal,{} as Proposal);
  const format=JSON.stringify({requested_ratio:proposal.aspect_ratio,requested_size:imageSize(proposal.aspect_ratio),actual_width:geometry.width,actual_height:geometry.height});
  const result = await env.DB.prepare("UPDATE pipeline_jobs SET previous_key=candidate_key,candidate_key=?,format=?,state='candidate',error='',updated_at=? WHERE id=? AND state='working' AND request=?")
    .bind(key, format, now(), job.id, job.request).run();
  if (!result.meta.changes) { await env.QUARANTINE!.delete(key); throw new HttpError(409, "Job removed during the request"); }
}

export async function processPipelineJob(env: Env, jobId: string) {
  const claim = await env.DB.prepare("UPDATE pipeline_jobs SET state='working',updated_at=? WHERE id=? AND state='dispatching' RETURNING *").bind(now(), jobId).first<Job>();
  if (!claim) return;
  const job = claim, snap = parse<Snapshot>(job.snapshot, {} as Snapshot);
  try {
    await findGallery(env, job.gallery_id);
    if (!env.QUARANTINE) throw new HttpError(503, "Private storage unavailable");
    const source = job.source_id ? await find(env, job.source_id) as Source : null;
    // An accepted SLOP keeps its original while its copy is prepared or approved: only gallery and trash matter for its observation.
    if (source && (source.gallery_id !== job.gallery_id || source.status === "trash" || (snap.operation !== "observe" && source.revision !== snap.sourceRevision)))
      throw new HttpError(409, "Photo changed: create a new job");
    if (["taxonomy", "classify", "consistency", "observe"].includes(snap.operation)) { await processTaxonomyJob(env, job, snap, source); return; }
    if (snap.operation === "profile") {
      if (!source) throw new HttpError(409, "REAL unavailable");
      // A second enqueue may have read the source just before another job completed and released its unique claim.
      if (source.visual_description && profileOf(source.pipeline_profile)) {
        await env.DB.prepare("DELETE FROM pipeline_jobs WHERE id=?").bind(job.id).run(); return;
      }
      const { profile, description } = await annotate(env, job, snap, source, false);
      await env.DB.prepare("UPDATE images SET visual_description=?,pipeline_profile=? WHERE id=? AND gallery_id=? AND status<>'trash'")
        .bind(JSON.stringify(description), JSON.stringify(profile), source.id, job.gallery_id).run();
      await env.DB.prepare("DELETE FROM pipeline_jobs WHERE id=?").bind(job.id).run(); return;
    }
    if (snap.operation === "plan") {
      const answer = await modelResponse(env, job, snap, "pipeline_proposal", `Write a complete self-contained English scene on all eight axes. Input includes a source description, independent selected variation controls, sampled target values, a few relevant descriptions, gallery rules and observed peculiarities. Apply only selected controls; ordinary/absent/same values are valid. Honor each explicit peculiarity policy. preserve retains the detail faithfully while applicable; vary changes that detail coherently even without selecting its broader parameter; draw follows selection of its linked parameter. Default temporary particulars vary save names/progress/times instead of repeating their identifying combination; a deliberate owner preserve policy overrides this default, with copying risk disclosed. Identity particulars such as an official Tribal Edition retain the precise edition name and accurate geometry unless the linked model/edition changes; then adapt and declare the dependency. Use the precise product/edition name, not generic replacement ornament. Do not intensify wear. New plausible values are allowed only for selected controls when novelty=true, within the sampled type/severity; no default special editions or damage. Keep environment and physical light setup when environment=keep. same_genre changes setting and dependent light/support/composition coherently while retaining photographic genre. change_genre may also change technique/rendering and necessary people/handling; explain all dependencies. Source camera/pose remain unless selected or physically necessary and declared. Perspective depends on camera position, never invent source focal length. Preserve aspect ratio unless selected or required by an explicit genre transition; return a numeric w:h ratio. Respect screen state and model capabilities. Describe only visible surfaces in one exposure; stable support, correct hardware, no glass-like controls, invented vents or ports. Avoid recurring polishing, scratches, bokeh or commercial staging. The avoid_repeating records are intended controls of recent accepted SLOPs; avoid repeating their distinctive combinations or replacing identifying save data with a single habitual default. Common ordinary properties may recur. Return the intended resulting profile with coherent updated parameters and peculiarities, plus actual changes and dependencies separately. Preserve identity particulars accurately. For varied temporary details record the new values, never the original identifying combination. ${snap.taxonomy ? taxonomyRules(snap.taxonomy) : VOCABULARY_RULE + taxonomyRules(null)} This applies to the resulting profile and target genre. ${snap.settings.rules}`,
        { description: snap.description, profile: snap.profile, variation: snap.variation, relevant: snap.references, avoid_repeating: snap.recent,
          ...(snap.taxonomy ? { categories: definitionsOf(snap.taxonomy) } : { known_categories: snap.vocabulary ?? {} }) }, proposalSchema(snap.taxonomy ?? null));
      if (!validProposal(answer)) throw new HttpError(502, "Incomplete scene");
      answer.profile = closeProfile(answer.profile, snap.taxonomy ?? null); answer.genre = normalizeCategory(answer.genre);
      if (snap.taxonomy && !allowedOf(snap.taxonomy, "genre").includes(answer.genre)) answer.genre = answer.profile.genre;
      if (!snap.variation!.selected.includes("aspect_ratio") && snap.settings.environment !== "change_genre") answer.aspect_ratio = snap.profile!.parameters.aspect_ratio.value;
      imageSize(answer.aspect_ratio);
      await env.DB.prepare("UPDATE pipeline_jobs SET proposal=?,state='proposal',error='',updated_at=? WHERE id=? AND request=?")
        .bind(JSON.stringify(answer), now(), job.id, job.request).run(); return;
    }
    const proposal = parse<Proposal>(job.proposal, {} as Proposal);
    if (!validProposal(proposal)) throw new HttpError(409, "Scene unavailable");
    if (snap.operation === "generate") {
      await storeCandidate(env, job, await paid(env, "images", snap.imageModel, { model: snap.imageModel, prompt: promptOf(proposal),
        size: imageSize(proposal.aspect_ratio), quality: snap.quality, n: 1, output_format: "png" }, { request: `pipeline-${job.id}-${job.request}` })); return;
    }
    const file = job.candidate_key ? await env.QUARANTINE.get(job.candidate_key) : null;
    if (!file) throw new HttpError(404, "Candidate unavailable");
    if (snap.operation === "evaluate") {
      const answer = await modelResponse(env, job, snap, "pipeline_review", `Examine the entire generated photograph once, before game cropping/treatment. Write every generated field in English, including findings, uncertainties, assessment, defect descriptions, benefits, risks and local-edit instructions. Prioritize photographic plausibility, model-specific visible hardware, cartridge slots, ports, hinges, controls and support, people anatomy, genre, perspective, aspect ratio, condition, screen content and peculiarities. Distinguish serious geometry errors from minor decorative variation. Do not claim fidelity to original pixels: only its textual description is provided. Identify uncertainty instead of inventing defects. Check unselected controls and identifying temporary details that should not be copied. Suggest zero or more edits only when expected benefit justifies a paid call. Each requires defect, normalized region x/y/width/height in [0,1], full-image masked-edit instruction, benefit and collateral risk. The owner's confirmation is always required; no automatic retry, repair, regeneration or re-evaluation. A plausible reflection is not automatically a defect. ${snap.settings.rules}`,
        { source: snap.description, proposal, profile: snap.profile, variation: snap.variation }, REVIEW_SCHEMA,
        { bytes: await file.arrayBuffer(), mime: file.httpMetadata?.contentType || "image/png" });
      if (!validReview(answer)) throw new HttpError(502, "Invalid evaluation");
      await env.DB.prepare("UPDATE pipeline_jobs SET evaluation=?,state='review',updated_at=? WHERE id=? AND request=?")
        .bind(JSON.stringify(answer), now(), job.id, job.request).run(); return;
    }
    if (snap.operation === "edit" && snap.correction) {
      const mask = await env.QUARANTINE.get(snap.correction.maskKey); if (!mask) throw new HttpError(404, "Missing mask");
      const form = new FormData();
      for (const [k, v] of Object.entries({ model: snap.imageModel, prompt: snap.correction.instruction, size: imageSize(proposal.aspect_ratio), quality: snap.quality, n: "1", output_format: "png" })) form.set(k, v);
      form.set("image[]", new Blob([await file.arrayBuffer()], { type: file.httpMetadata?.contentType || "image/png" }), "whole-image.png");
      form.set("mask", new Blob([await mask.arrayBuffer()], { type: "image/png" }), "mask.png");
      await storeCandidate(env, job, await paid(env, "images", snap.imageModel, form, { endpoint: "images/edits", request: `pipeline-${job.id}-${job.request}` }));
      await env.QUARANTINE.delete(snap.correction.maskKey); return;
    }
    throw new HttpError(400, "Unsupported operation");
  } catch (error) {
    await env.DB.prepare("UPDATE pipeline_jobs SET state='attention',error=?,updated_at=? WHERE id=? AND request=?")
      .bind(error instanceof Error ? error.message : "Error", now(), job.id, job.request).run();
  } finally { await dispatchPipeline(env).catch(error=>console.error("pipeline dispatch",error)); }
}

/** Free status reads and approved queued work share the same recovery path. Acquired calls are never resent. */
async function recoverPipeline(env: Env) {
  await env.DB.prepare("UPDATE pipeline_jobs SET state='attention',error='Request interrupted or outcome uncertain: no automatic retry' WHERE state IN ('working','dispatching','accepting') AND updated_at<?")
    .bind(new Date(Date.now() - 15 * 60_000).toISOString()).run();
  await dispatchPipeline(env);
}

export async function pipelineRoute(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), parts = url.pathname.slice("/api/admin/pipeline/".length).split("/");
  const galleryId = parts[0], target = parts[1] || "", action = parts[2] || "";
  const gallery = await findGallery(env, galleryId) as Awaited<ReturnType<typeof findGallery>> & { pipeline_settings?: string };
  if (request.method === "GET" && target && action === "file") {
    const job = await jobOf(env, target, galleryId), key = url.searchParams.has("previous") ? job.previous_key : job.candidate_key;
    const file = key ? await env.QUARANTINE?.get(key) : null;
    if (!file) throw new HttpError(404, "Image unavailable");
    return new Response(file.body, { headers: { "Content-Type": file.httpMetadata?.contentType || "image/png", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (request.method === "GET" && target === "descriptions" && !action) {
    await recoverPipeline(env);
    const sources = (await env.DB.prepare("SELECT id,title,visual_description IS NOT NULL AS described FROM images WHERE gallery_id=? AND origin='REAL' AND status<>'trash'")
      .bind(galleryId).all<{ id: string; title: string; described: number }>()).results;
    const jobs = (await env.DB.prepare(`SELECT id,source_id,state,error FROM pipeline_jobs WHERE gallery_id=? AND json_extract(snapshot,'$.operation')='profile' ORDER BY created_at DESC,rowid DESC`)
      .bind(galleryId).all<{ id: string; source_id: string; state: string; error: string }>()).results;
    const latest = new Map<string, typeof jobs[number]>();
    for (const job of jobs) if (!latest.has(job.source_id)) latest.set(job.source_id, job);
    return json({ images: sources.map(source => ({ ...source, described: !!source.described, job: latest.get(source.id) || null })) });
  }
  if (request.method === "GET" && target === "status" && !action) {
    // Light polling for the progress dialog: job states only, without views, profiles or snapshots.
    await recoverPipeline(env);
    return json({ jobs: (await env.DB.prepare("SELECT id,state,error FROM pipeline_jobs WHERE gallery_id=? ORDER BY created_at,id").bind(galleryId)
      .all<{ id: string; state: string; error: string }>()).results });
  }
  if (request.method === "GET" && !target) {
    const accepted = (await env.DB.prepare("SELECT * FROM images WHERE gallery_id=? AND origin='SLOP' AND status<>'trash' AND pipeline_scene IS NOT NULL ORDER BY created_at DESC LIMIT 100").bind(galleryId).all<Row>()).results;
    const images = await viewsOf(env, accepted);
    await recoverPipeline(env);
    const sources = (await sourceList(env, galleryId)).results;
    const jobs = (await env.DB.prepare("SELECT * FROM pipeline_jobs WHERE gallery_id=? ORDER BY created_at,id").bind(galleryId).all<Job>()).results;
    const profiles = new Map(sources.map(r => [r.id, profileOf(r.pipeline_profile)]));
    const reals = [...profiles.values()].filter((p): p is Profile => !!p);
    const slopRows = (await env.DB.prepare("SELECT id,pipeline_profile,pipeline_observed FROM images WHERE gallery_id=? AND origin='SLOP' AND status<>'trash' ORDER BY created_at,id").bind(galleryId)
      .all<{ id: string; pipeline_profile: string | null; pipeline_observed: string | null }>()).results;
    const slops = slopRows.map(r => profileOf(r.pipeline_profile)).filter((p): p is Profile => !!p);
    const observed = slopRows.map(r => profileOf(r.pipeline_observed)).filter((p): p is Profile => !!p);
    const taxonomy = await taxonomyOf(env, galleryId), keys = taxonomy.approved?.keys ?? null;
    const histogram = (list: Profile[], key: TaxonomyKey | "aspect_ratio") => {
      const counts: Record<string, number> = {};
      for (const p of list) { const value = statCategory(p, key, keys); counts[value] = (counts[value] || 0) + 1; }
      return counts;
    };
    // Combinations that independent sampling can break: compared only where both categories are known.
    const joint = (list: Profile[], a: TaxonomyKey, b: TaxonomyKey) => {
      const counts: Record<string, number> = {};
      for (const p of list) { const x = statCategory(p, a, keys), y = statCategory(p, b, keys);
        if (![x, y].some(v => v === "unknown" || v === "pending")) counts[`${x} × ${y}`] = (counts[`${x} × ${y}`] || 0) + 1; }
      return counts;
    };
    const pendingOf = (list: Profile[]) => keys ? list.filter(p => TAXONOMY_KEYS.some(k => statCategory(p, k, keys) === "pending")).length : 0;
    const stats = { real_count: reals.length, slop_count: slops.length, observed_count: observed.length,
      unmeasured: slopRows.filter(r => !profileOf(r.pipeline_observed)).map(r => r.id),
      pending: { real: pendingOf(reals), slop: pendingOf(slops), observed: pendingOf(observed) },
      rows: (["genre", ...PARAMETER_KEYS] as (TaxonomyKey | "aspect_ratio")[]).map(key => ({ key, real: histogram(reals, key), slop: histogram(slops, key), observed: histogram(observed, key) })),
      joints: ([["genre", "model"], ["genre", "viewpoint"], ["genre", "composition"], ["model", "colour"]] as [TaxonomyKey, TaxonomyKey][])
        .map(([a, b]) => ({ keys: [a, b], real: joint(reals, a, b), observed: joint(observed, a, b) })) };
    return json({ stats, images, settings: settingsOf(gallery.pipeline_settings || null), paid_calls: !!env.OPENAI_API_KEY, taxonomy,
      sources: sources.map(s => ({ id: s.id, title: s.title, revision: s.revision, described: !!s.visual_description, profile: profiles.get(s.id) ?? null, metrics: parse(s.copy_metrics, null), copy: s.copy_key ? {sha256:s.copy_sha256} : null, width: s.width, height: s.height })),
      // The frozen snapshot can hold several descriptions: the page only needs the operation and the drawn controls.
      jobs: jobs.map(j => { const snapshot = parse<Snapshot | null>(j.snapshot, null); return { ...j, snapshot: snapshot && { operation: snapshot.operation, variation: snapshot.variation }, format: parse(j.format,null), proposal: parse(j.proposal, null), evaluation: parse(j.evaluation, null), file: j.candidate_key ? `/api/admin/pipeline/${galleryId}/${j.id}/file?v=${encodeURIComponent(j.updated_at)}` : null }; }) });
  }
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed");
  const data = await body(request, 2_000_000);
  if (TAXONOMY_TARGETS.includes(target)) return taxonomyRoute(env, galleryId, target, action, data);
  if (target === "stop") {
    if(data.confirm!==true)throw new HttpError(400,"Confirm stopping queued requests");
    const result=await env.DB.prepare("UPDATE pipeline_jobs SET state='attention',error='Canceled before sending to the model',updated_at=? WHERE gallery_id=? AND state IN ('queued','dispatching')").bind(now(),galleryId).run();
    return json({cancelled:result.meta.changes});
  }
  if (target === "profile") {
    if (typeof data.id !== "string" || !validProfile(data.profile)) throw new HttpError(400, "Invalid profile");
    const source = await find(env, data.id);
    if (source.gallery_id !== galleryId || source.origin !== "REAL" || source.status === "trash") throw new HttpError(409, "REAL unavailable");
    const active = await env.DB.prepare("SELECT 1 FROM pipeline_jobs WHERE source_id=? AND state IN ('queued','dispatching','working','proposal','candidate','review','accepting')").bind(source.id).first();
    if (active) throw new HttpError(409, "Close the active job first");
    const profile = normalizeProfile(data.profile), stored = profileOf((source as Source).pipeline_profile), keys = (await taxonomyOf(env, galleryId)).approved?.keys ?? null;
    // With an approved list, a changed category must be one of its values; untouched legacy values wait for classification.
    if (keys) for (const key of TAXONOMY_KEYS) {
      const value = key === "genre" ? profile.genre : profile.parameters[key].category, before = stored ? (key === "genre" ? stored.genre : stored.parameters[key].category) : null;
      if (value !== before && !allowedOf(keys, key).includes(value)) throw new HttpError(400, `“${value}” is not in the gallery list for ${key}`);
    }
    const saved = await env.DB.prepare("UPDATE images SET pipeline_profile=?,revision=revision+1 WHERE id=? AND revision=?").bind(JSON.stringify(profile), source.id, source.revision).run();
    if (!saved.meta.changes) throw new HttpError(409, "REAL changed: reload before saving");
    return json({ saved: true });
  }
  if (target === "categories") {
    // Free consolidation of synonyms already stored in this gallery's REAL and SLOP profiles; descriptions and values are untouched.
    const key = data.key as Parameter | "genre", into = typeof data.into === "string" ? normalizeCategory(data.into) : "";
    if (data.confirm !== true || !["genre", ...PARAMETER_KEYS].includes(key) || !Array.isArray(data.from) || !data.from.length || data.from.length > 200
      || data.from.some(x => typeof x !== "string") || !into || into === "unspecified") throw new HttpError(400, "Choose the categories to merge and their new name");
    const from = new Set((data.from as string[]).map(normalizeCategory)); from.delete(into);
    if (!from.size) return json({ updated: 0 });
    if ((await taxonomyOf(env, galleryId)).approved) throw new HttpError(409, "This gallery has approved category lists: edit them instead");
    if (await env.DB.prepare("SELECT 1 FROM pipeline_jobs WHERE gallery_id=? AND state IN ('queued','dispatching','working') AND json_extract(snapshot,'$.operation') IN ('profile','classify','observe')").bind(galleryId).first())
      throw new HttpError(409, "Wait for the REAL preparation in progress");
    const rows = (await env.DB.prepare("SELECT id,pipeline_profile FROM images WHERE gallery_id=? AND pipeline_profile IS NOT NULL").bind(galleryId).all<{ id: string; pipeline_profile: string }>()).results;
    const writes = [];
    for (const row of rows) {
      const profile = profileOf(row.pipeline_profile);
      if (!profile || !from.has(key === "genre" ? profile.genre : profile.parameters[key].category)) continue;
      if (key === "genre") profile.genre = into; else profile.parameters[key].category = into;
      // Compare-and-set on the stored text: a concurrent edit of the same profile is never overwritten.
      writes.push(env.DB.prepare("UPDATE images SET pipeline_profile=? WHERE id=? AND pipeline_profile=?").bind(JSON.stringify(profile), row.id, row.pipeline_profile));
    }
    const results = writes.length ? await env.DB.batch(writes) : [];
    return json({ updated: results.reduce((n, r) => n + (r.meta.changes || 0), 0), matched: writes.length });
  }
  if (target === "settings") {
    const value = data as unknown as PipelineSettings;
    if (typeof value.rules !== "string" || value.rules.length > 12000 || !["keep", "same_genre", "change_genre"].includes(value.environment)
      || !Number.isFinite(value.novelty) || value.novelty < 0 || value.novelty > 1 || !value.probabilities
      || Object.entries(value.probabilities).some(([k, v]) => !PARAMETER_KEYS.includes(k as typeof PARAMETER_KEYS[number]) || typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1)) throw new HttpError(400, "Invalid settings");
    const saved = await env.DB.prepare("UPDATE galleries SET pipeline_settings=?,revision=revision+1 WHERE id=? AND revision=?")
      .bind(JSON.stringify({ rules: value.rules, probabilities: value.probabilities, environment: value.environment, novelty: value.novelty }), galleryId, gallery.revision).run();
    if (!saved.meta.changes) throw new HttpError(409, "Gallery changed: reload before saving");
    return json({ saved: true });
  }
  if (data.confirm !== true || typeof data.request !== "string" || !/^[\da-f-]{36}$/i.test(data.request)) throw new HttpError(400, "Explicit confirmation required");
  if (!env.OPENAI_API_KEY || !env.SLOP_RUNNER || !env.QUARANTINE) throw new HttpError(503, "Models or Workflow not configured");
  if (target === "prepare" || target === "plan") {
    if (!Array.isArray(data.ids) || !data.ids.length || data.ids.length > (target === "prepare" ? 5000 : 500) || new Set(data.ids).size !== data.ids.length || data.max_calls !== data.ids.length) throw new HttpError(400, "Confirm the exact number of calls, one per REAL");
    const rows = (await sourceList(env, galleryId)).results;
    const selected = data.ids.map(key => rows.find(r => r.id === key));
    if (selected.some(r => !r)) throw new HttpError(409, "Selection changed");
    const profiles = new Map(rows.map(r => [r.id, profileOf(r.pipeline_profile)]));
    if (target === "plan" && selected.some(r => !r?.visual_description || !profiles.get(r.id))) throw new HttpError(409, "Prepare all selected REAL first");
    if (target === "prepare") {
      const targets = (selected as Source[]).filter(row => !row.visual_description || !profiles.get(row.id));
      if (!targets.length) return json({ jobs: [] });
      if (targets.some(row => row.visual_description_request && row.visual_description_claimed_at && row.visual_description_claimed_at >= new Date(Date.now() - 5 * 60_000).toISOString())) throw new HttpError(409, "A selected REAL is already being described. Check its progress before starting again.");
      const [textModel, imageModel, quality] = await Promise.all([chosenModel(env, "text_model"), chosenModel(env, "image_model"), chosenQuality(env)]);
      const settings = settingsOf(gallery.pipeline_settings || null), stamp = now();
      // Persist the entire approved selection atomically before any Workflow starts. Closing the client cannot truncate the batch.
      const entries = targets.map(row => ({ id: `${data.request}-${row.id}`, source: row.id, revision: row.revision }));
      const snapshot: Snapshot = { operation: "profile", sourceRevision: 0, settings, textModel, imageModel, quality };
      const inserted = (await env.DB.prepare(`INSERT OR IGNORE INTO pipeline_jobs(id,gallery_id,source_id,state,snapshot,request,created_at,updated_at)
        SELECT json_extract(entry.value,'$.id'),i.gallery_id,i.id,'queued',
          json_set(?1,'$.sourceRevision',i.revision),?2,?3,?3 FROM json_each(?4) entry JOIN images i ON i.id=json_extract(entry.value,'$.source')
        WHERE i.gallery_id=?5 AND i.origin='REAL' AND i.status<>'trash' AND i.revision=json_extract(entry.value,'$.revision')
          AND (i.visual_description_request IS NULL OR i.visual_description_claimed_at<?6) RETURNING id`)
        .bind(JSON.stringify(snapshot), data.request, stamp, JSON.stringify(entries), galleryId, new Date(Date.now() - 5 * 60_000).toISOString()).all<{ id: string }>()).results;
      await dispatchPipeline(env);
      return json({ jobs: inserted.map(job => job.id) });
    }
    // Oldest first, so the last entries really are the most recently accepted SLOP.
    const generated = (await env.DB.prepare("SELECT pipeline_profile FROM images WHERE gallery_id=? AND origin='SLOP' AND status<>'trash' AND pipeline_profile IS NOT NULL ORDER BY created_at,id").bind(galleryId).all<{pipeline_profile:string}>()).results
      .map(r => profileOf(r.pipeline_profile)).filter((p): p is Profile => !!p);
    const prepared = rows.flatMap(r => { const profile = profiles.get(r.id), description = parse<VisualDescription | null>(r.visual_description, null);
      return profile && description ? [{ row: r, profile, description }] : []; });
    const preparedById = new Map(prepared.map(p => [p.row.id, p]));
    const keys = (await taxonomyOf(env, galleryId)).approved?.keys ?? null;
    const population = [...profiles.values()].filter((p): p is Profile => !!p).map(p => forBalancing(p, keys)), known = keys ? undefined : vocabulary(population);
    const settings = settingsOf(gallery.pipeline_settings || null);
    const [textModel, imageModel, quality] = await Promise.all([chosenModel(env, "text_model"), chosenModel(env, "image_model"), chosenQuality(env)]);
    const stamp = now(), inserts = [];
    for (const row of selected as Source[]) {
      const entry = preparedById.get(row.id);
      if (!entry) throw new HttpError(409, "Prepare descriptions and parameters first");
      const { profile, description } = entry;
      // Same model category first; the stable sort keeps gallery order otherwise.
      const references = prepared.filter(p => p.row.id !== row.id && (settings.environment === "change_genre" || p.profile.genre === profile.genre))
        .sort((a, b) => Number(b.profile.parameters.model.category === profile.parameters.model.category) - Number(a.profile.parameters.model.category === profile.parameters.model.category))
        .slice(0, 3).map(p => ({ sections: p.description.sections, profile: p.profile }));
      const snapshot: Snapshot = { operation: "plan", sourceRevision: row.revision, settings, textModel, imageModel, quality, vocabulary: known, ...(keys ? { taxonomy: keys } : {}),
        recent: generated.filter(p => settings.environment === "change_genre" || p.genre === profile.genre).slice(-3).map(p => ({ genre: p.genre, parameters: p.parameters })),
        profile, description, variation: variation(forBalancing(profile, keys), population, settings, Math.random, generated.map(p => forBalancing(p, keys))), references };
      inserts.push(env.DB.prepare("INSERT OR IGNORE INTO pipeline_jobs(id,gallery_id,source_id,state,snapshot,request,created_at,updated_at) VALUES(?,?,?,'queued',?,?,?,?) RETURNING id")
        .bind(`${data.request}-${row.id}`, galleryId, row.id, JSON.stringify(snapshot), data.request, stamp, stamp));
    }
    // Every confirmed scene is recorded before any Workflow starts; snapshots are large, so batches stay small.
    const jobs: string[] = [];
    for (let at = 0; at < inserts.length; at += 50)
      for (const result of await env.DB.batch<{ id: string }>(inserts.slice(at, at + 50))) jobs.push(...result.results.map(x => x.id));
    await dispatchPipeline(env);
    return json({ jobs });
  }
  const job = await jobOf(env, target, galleryId), snap = parse<Snapshot>(job.snapshot, {} as Snapshot);
  if (action === "scene") {
    if (job.state !== "proposal" || !validProposal(data.proposal)) throw new HttpError(409, "Scene cannot be edited");
    try { imageSize(data.proposal.aspect_ratio); } catch {throw new HttpError(400,"Invalid or unsupported aspect ratio");}
    await env.DB.prepare("UPDATE pipeline_jobs SET proposal=?,updated_at=? WHERE id=? AND state='proposal'").bind(JSON.stringify(data.proposal), now(), job.id).run();
    return json({ saved: true });
  }
  if (action === "close") {
    if (["queued", "dispatching", "working", "accepting"].includes(job.state)) throw new HttpError(409, "Wait for the request to finish");
    await env.DB.prepare("DELETE FROM pipeline_jobs WHERE id=? AND state NOT IN ('queued','dispatching','working','accepting')").bind(job.id).run(); await sweepGalleryFiles(env).catch(error=>console.error("pipeline cleanup",error)); return json({ closed: true });
  }
  if (action === "accept") {
    if (!job.candidate_key || !["candidate", "review", "attention"].includes(job.state)) throw new HttpError(409, "No acceptable candidate");
    const claimed = await env.DB.prepare("UPDATE pipeline_jobs SET state='accepting',updated_at=? WHERE id=? AND state=?").bind(now(), job.id, job.state).run();
    if (!claimed.meta.changes) throw new HttpError(409, "Decision already recorded");
    try {
      const file = await env.QUARANTINE.get(job.candidate_key); if (!file) throw new HttpError(404, "Candidate unavailable");
      const proposal = parse<Proposal>(job.proposal, {} as Proposal);
      const genre = normalizeCategory(proposal.genre);
      const candidates = (await sourceList(env, galleryId)).results.filter(r => r.copy_metrics && profileOf(r.pipeline_profile)?.genre === genre);
      const sample = candidates.length ? candidates[crypto.getRandomValues(new Uint32Array(1))[0] % candidates.length] : null;
      const result = await create(env, { origin: "SLOP", gallery_id: galleryId, bytes: await file.arrayBuffer(), prompt: promptOf(proposal), model: snap.imageModel }) as { id: string };
      // Keep anonymous scene controls for dataset comparison, never a permanent source link.
      await env.DB.prepare("UPDATE images SET pipeline_profile=?,pipeline_scene=?,generation_slot=? WHERE id=?")
        .bind(JSON.stringify(intendedProfile(proposal, (await taxonomyOf(env, galleryId)).approved?.keys ?? null)), JSON.stringify({ proposal, variation: snap.variation }), JSON.stringify({ target_metrics: sample ? parse(sample.copy_metrics, null) : null, acceptance: { by: "owner" } }), result.id).run();
      await env.DB.prepare("DELETE FROM pipeline_jobs WHERE id=?").bind(job.id).run();
      await sweepGalleryFiles(env).catch(error=>console.error("pipeline cleanup",error));
      return json(result);
    } catch (error) { await env.DB.prepare("UPDATE pipeline_jobs SET state='attention',error=? WHERE id=?").bind(error instanceof Error ? error.message : "Error", job.id).run(); throw error; }
  }
  const allowed = action === "generate" ? ["proposal"] : action === "evaluate" ? ["candidate", "review"] : action === "edit" ? ["candidate", "review"] : [];
  if (!allowed.includes(job.state) || data.max_calls !== 1) throw new HttpError(409, "Confirm one call for this operation");
  if(action === "generate" && data.proposal !== undefined && JSON.stringify(data.proposal)!==job.proposal) throw new HttpError(409,"Scene changed: review and reconfirm generation");
  if (action === "edit") {
    if (typeof data.instruction !== "string" || !data.instruction.trim() || data.instruction.length > 12000 || typeof data.mask !== "string" || data.mask.length > 1_500_000) throw new HttpError(400, "Instruction and mask required");
    let bytes: Uint8Array;
    try { bytes = base64Bytes(data.mask); } catch { throw new HttpError(400, "A PNG mask matching candidate dimensions is required"); }
    const candidate = await env.QUARANTINE.get(job.candidate_key!); if (!candidate) throw new HttpError(404, "Missing candidate");
    const a = imageGeometry(bytes), b = imageGeometry(new Uint8Array(await candidate.arrayBuffer()));
    if (imageMime(bytes) !== "image/png" || a.width !== b.width || a.height !== b.height) throw new HttpError(400, "A PNG mask matching candidate dimensions is required");
    const maskKey = `pipeline/${job.id}/mask-${data.request}`;
    await env.QUARANTINE.put(maskKey, bytes, { httpMetadata: { contentType: "image/png" } });
    // The snapshot keeps only the latest mask: a mask left by an earlier failed edit would otherwise never be swept.
    if (snap.correction?.maskKey) await env.DB.prepare("INSERT INTO gallery_files_to_delete(bucket,object_key) VALUES('quarantine',?)").bind(snap.correction.maskKey).run();
    snap.correction = { instruction: data.instruction, maskKey };
  }
  snap.operation = action as Snapshot["operation"];
  const claim = await env.DB.prepare("UPDATE pipeline_jobs SET snapshot=?,state='queued',request=?,error='',updated_at=? WHERE id=? AND state=? AND request=? AND proposal IS ?")
    .bind(JSON.stringify(snap), data.request, now(), job.id, job.state, job.request, job.proposal).run();
  if (!claim.meta.changes) {if(action === "edit" && snap.correction) await env.QUARANTINE.delete(snap.correction.maskKey);throw new HttpError(409, "Operation already claimed");}
  await start(env, job.id); return json({ queued: true });
}
