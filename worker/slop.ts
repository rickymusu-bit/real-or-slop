import { slopTemplateVersion, type SlopPlan } from "../shared/slop";
import { body, hash, HttpError, id, json, type Env } from "./core";
import { validateCuration } from "./curation";
import { prepareImport } from "./import";
import { slopProposals, validateSlopImport, validateSlopPlan } from "./slop-validation";

interface PlanRow {
  id: string; revision: number; plan_json: string; template_version: string;
  template_prompt: string; image_id: string | null; reviewer: string;
  created_at: string; updated_at: string;
}
function reason(data: Record<string, unknown>) {
  if (typeof data.reason !== "string" || !data.reason.trim() || data.reason.length > 2000)
    throw new HttpError(400, "Motivazione della modifica richiesta (massimo 2000 caratteri)");
  return data.reason.trim();
}
function revision(data: Record<string, unknown>, current: PlanRow) {
  if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 1) throw new HttpError(400, "Revisione attesa richiesta");
  if (data.revision !== current.revision) throw new HttpError(409, "Scheda modificata: ricaricare prima di procedere");
}
async function categories(env: Env, plan: SlopPlan) {
  if (!plan.category_id && !plan.subcategory_id) return;
  const root = await env.DB.prepare("SELECT id FROM categories WHERE id=? AND parent_id IS NULL").bind(plan.category_id).first();
  if (!root) throw new HttpError(400, "Categoria principale non valida");
  if (plan.subcategory_id && !await env.DB.prepare("SELECT id FROM categories WHERE id=? AND parent_id=?").bind(plan.subcategory_id, plan.category_id).first())
    throw new HttpError(400, "Sottocategoria non appartenente alla categoria scelta");
}
function event(env: Env, eventId: string, current: PlanRow | null, next: PlanRow, action: string, note: string, checks?: Record<string, boolean>) {
  return env.DB.prepare(`INSERT INTO slop_plan_events(id,plan_id,revision,action,reviewer,reason,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,?,?,? ${current ? "WHERE EXISTS(SELECT 1 FROM slop_plans WHERE id=? AND revision=? AND image_id IS NULL)" : ""}`)
    .bind(eventId, next.id, next.revision, action, next.reviewer, note, JSON.stringify(current), JSON.stringify(checks ? { ...next, checks } : next), next.updated_at,
      ...(current ? [current.id, current.revision] : []));
}
async function wire(env: Env, row: PlanRow) {
  const image = row.image_id ? await env.DB.prepare("SELECT status FROM images WHERE id=?").bind(row.image_id).first<{ status: string }>() : null;
  const { plan_json, ...rest } = row;
  return { ...rest, plan: JSON.parse(plan_json) as SlopPlan, status: image?.status || "draft" };
}
export async function slopStudio(request: Request, env: Env, path: string) {
  const base = "/api/admin/slop";
  if (path === base && request.method === "GET") {
    const rows = (await env.DB.prepare("SELECT p.id,p.revision,json_extract(p.plan_json,'$.title') AS title,json_extract(p.plan_json,'$.profile') AS profile,p.image_id,COALESCE(i.status,'draft') AS status,p.updated_at FROM slop_plans p LEFT JOIN images i ON i.id=p.image_id ORDER BY p.updated_at DESC,p.id LIMIT 100").all()).results;
    return json(rows);
  }
  if (path === base + "/preview" && request.method === "POST") {
    const data = await body(request, 64000), plan = validateSlopPlan(data.plan);
    await categories(env, plan);
    return json({ ...slopProposals(plan), template_version: slopTemplateVersion });
  }
  if (path === base && request.method === "POST") {
    const data = await body(request, 64000), plan = validateSlopPlan(data.plan);
    await categories(env, plan);
    const proposals = slopProposals(plan);
    if (!plan.prompt.trim()) plan.prompt = proposals.prompt;
    if (!plan.reveal_explanation) plan.reveal_explanation = proposals.reveal;
    const now = new Date().toISOString();
    const row: PlanRow = { id: id(), revision: 1, plan_json: JSON.stringify(plan), template_version: slopTemplateVersion, template_prompt: proposals.prompt, image_id: null, reviewer: (await hash(env.ADMIN_TOKEN!)).slice(0, 12), created_at: now, updated_at: now };
    const note = reason(data);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO slop_plans(id,revision,plan_json,template_version,template_prompt,image_id,reviewer,created_at,updated_at) VALUES(?,?,?,?,?,NULL,?,?,?)")
        .bind(row.id, row.revision, row.plan_json, row.template_version, row.template_prompt, row.reviewer, now, now),
      event(env, id(), null, row, "created", note),
    ]);
    return json(await wire(env, row), 201);
  }
  if (path === base || path === base + "/preview") throw new HttpError(405, "Metodo non consentito");
  const match = path.match(/^\/api\/admin\/slop\/([\w-]+)(?:\/(import))?$/);
  if (!match) throw new HttpError(404, "API studio inesistente");
  const current = await env.DB.prepare("SELECT * FROM slop_plans WHERE id=?").bind(match[1]).first<PlanRow>();
  if (!current) throw new HttpError(404, "Scheda SLOP non trovata");
  if (!match[2] && request.method === "GET") {
    const events = (await env.DB.prepare("SELECT * FROM slop_plan_events WHERE plan_id=? ORDER BY revision DESC LIMIT 100").bind(current.id).all()).results;
    return json({ ...await wire(env, current), events });
  }
  if (match[2] === "import" && request.method === "POST") {
    if (current.image_id) return json({ id: current.image_id, upload: `/api/admin/assets/${current.image_id}`, already_imported: true });
    const data = await body(request, 64000);
    revision(data, current);
    const plan = validateSlopPlan(JSON.parse(current.plan_json));
    validateSlopImport(plan, data);
    await categories(env, plan);
    const eventId = id(), note = reason(data), now = new Date().toISOString();
    const guard = { sql: "EXISTS(SELECT 1 FROM slop_plan_events WHERE id=?)", values: [eventId] as unknown[] };
    const prepared = prepareImport(env, {
      type: "AI", title: plan.title, description: plan.scene_description, author: plan.generation_owner,
      provider: "manual-ai-studio", source_id: current.id, source_url: plan.generation_source_url,
      evidence: `Dichiarazione di generazione IA del proprietario ${plan.generation_owner}. Modello: ${plan.ai_model}; data: ${plan.generation_date}; versione: ${plan.generation_version}; iterazione: ${plan.iteration}. Dossier privato ${current.id}, revisione ${current.revision}. Scena sintetica: nessuna attribuzione a una fotografia archivistica autentica.`,
      license_name: plan.license_name, license_url: plan.license_url, explanation: plan.reveal_explanation,
      categories: [plan.category_id, plan.subcategory_id], difficulty: plan.profile,
      ai_model: plan.ai_model, ai_prompt: plan.prompt, generation_date: plan.generation_date, owner_declaration: true,
    }, guard);
    const next: PlanRow = { ...current, revision: current.revision + 1, image_id: prepared.id, reviewer: (await hash(env.ADMIN_TOKEN!)).slice(0, 12), updated_at: now };
    const curation = validateCuration({ curation: {
      subject_kind: plan.subject_kind, country_or_region: plan.country_or_region, period_bucket: plan.period_bucket,
      image_medium: plan.image_medium, composition: plan.composition, cognitive_mechanism: plan.cognitive_mechanism,
      represented_country: plan.country, represented_place: plan.place, represented_period: plan.period,
      fact_evidence: `Fatti di contesto e riferimenti completi nel dossier privato ${current.id}, revisione ${current.revision}. Non attestano l'esistenza della scena sintetica.`,
      reviewer_notes: `Studio SLOP ${current.id}; template ${current.template_version}; profilo previsto ${plan.profile}. Valutazioni e iterazioni complete conservate nel dossier privato.`,
    } });
    const curationRecord = { ...curation, image_id: prepared.id, revision: 1, reviewer: next.reviewer, updated_at: now };
    const keys = Object.keys(curationRecord);
    const result = await env.DB.batch([
      event(env, eventId, current, next, "imported", note, { facts_confirmed: true, rights_confirmed: true, safety_confirmed: true, comparability_confirmed: true, owner_declaration: true }),
      ...prepared.statements,
      env.DB.prepare(`INSERT INTO image_curation(${keys.join(",")}) SELECT ${keys.map(() => "?").join(",")} WHERE ${guard.sql}`)
        .bind(...Object.values(curationRecord), eventId),
      env.DB.prepare(`INSERT INTO image_curation_events(id,image_id,revision,reviewer,reason,before_json,after_json,created_at) SELECT ?,?,1,?,?,'null',?,? WHERE ${guard.sql}`)
        .bind(id(), prepared.id, next.reviewer, "Importazione del contesto rappresentato dallo studio SLOP", JSON.stringify(curationRecord), now, eventId),
      env.DB.prepare("UPDATE slop_plans SET revision=?,image_id=?,reviewer=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM slop_plan_events WHERE id=?)")
        .bind(next.revision, prepared.id, next.reviewer, now, current.id, eventId),
    ]);
    if (!result[0].meta.changes) throw new HttpError(409, "Scheda modificata o già importata: ricaricare");
    return json({ id: prepared.id, upload: `/api/admin/assets/${prepared.id}`, status: "in-review" }, 201);
  }
  if (!match[2] && request.method === "PUT") {
    if (current.image_id) throw new HttpError(409, "Scheda importata: provenienza congelata; annotare la revisione nella coda immagini o creare una nuova scheda");
    const data = await body(request, 64000);
    revision(data, current);
    const plan = validateSlopPlan(data.plan);
    await categories(env, plan);
    const proposals = slopProposals(plan);
    if (!plan.prompt.trim()) plan.prompt = proposals.prompt;
    if (!plan.reveal_explanation) plan.reveal_explanation = proposals.reveal;
    const note = reason(data), eventId = id();
    const next: PlanRow = { ...current, plan_json: JSON.stringify(plan), template_version: slopTemplateVersion, template_prompt: proposals.prompt, revision: current.revision + 1, reviewer: (await hash(env.ADMIN_TOKEN!)).slice(0, 12), updated_at: new Date().toISOString() };
    const result = await env.DB.batch([
      event(env, eventId, current, next, "updated", note),
      env.DB.prepare("UPDATE slop_plans SET revision=?,plan_json=?,template_version=?,template_prompt=?,reviewer=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM slop_plan_events WHERE id=?)")
        .bind(next.revision, next.plan_json, next.template_version, next.template_prompt, next.reviewer, next.updated_at, next.id, eventId),
    ]);
    if (!result[0].meta.changes) throw new HttpError(409, "Scheda modificata: ricaricare");
    return json(await wire(env, next));
  }
  throw new HttpError(405, "Metodo non consentito");
}
