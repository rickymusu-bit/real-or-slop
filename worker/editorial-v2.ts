import { body, hash, HttpError, id, json, type Env } from "./core";
import { EditorialV2ValidationError, editorialV2Version, ensure, object, v2Identifier, v2Text, validateV2Plan, validateV2Profile, validateV2Provenance, validateV2Feedback, v2Evidence, v2ApprovalBlockers, type ObjectValue } from "../shared/editorial-v2";

const base = "/api/admin/editorial/v2";
interface Run { id: string; origin: string; status: string; stage: string; config_json: string; input_json: string; checkpoint_json: string; files_json: string; revision: number; lease_hash: string | null; lease_until: number }
interface FileRecord { path: string; sha256: string; size: number }
interface Candidate { id: string; run_id: string; origin: string; original_sha256: string; preview_sha256: string; dossier_json: string; review_json: string; review_state: string; revision: number }
const parsed = (value: string) => JSON.parse(value) as ObjectValue;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ":" + canonical(item)).join(",") + "}";
  return JSON.stringify(value) ?? "undefined";
}
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function hex(value: unknown): string { ensure(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), "Impronta v2 non valida"); return value; }
function number(value: string | undefined): number { const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw new HttpError(503, "Budget v2 server non configurato"); return n; }
function visible(row: Run) { return { id: row.id, origin: row.origin, status: row.status, stage: row.stage, config: parsed(row.config_json), input: JSON.parse(row.input_json) as unknown, state: parsed(row.checkpoint_json), files: JSON.parse(row.files_json) as FileRecord[], revision: row.revision }; }
function publicCandidate(row: Candidate) { return { ...parsed(row.dossier_json), id: row.id, review: parsed(row.review_json), review_state: row.review_state, revision: row.revision, image: `${base}/candidates/${row.id}/preview` }; }
function validateConfig(value: unknown, origin: string): ObjectValue {
  const cfg = object(value);
  const keys = ["analysis_model", "image_model", "evaluator_model", "max_evaluations", "max_generations", "max_regenerations", "run_usd", "daily_usd", "evaluation_usd", "generation_usd", "size", "quality"];
  ensure(keys.every(key => Object.hasOwn(cfg, key)) && Object.keys(cfg).every(key => [...keys, "max_output_tokens", "reasoning_effort", "presentation_mode"].includes(key)), "Configurazione v2 incompatibile con il vecchio metodo");
  if (Object.hasOwn(cfg, "max_output_tokens")) ensure(Number.isSafeInteger(cfg.max_output_tokens) && Number(cfg.max_output_tokens) >= 1000 && Number(cfg.max_output_tokens) <= 4000, "Limite output v2 non valido");
  if (Object.hasOwn(cfg, "reasoning_effort")) ensure([null, "none", "low", "medium", "high"].includes(cfg.reasoning_effort as string | null), "Reasoning v2 non valido");
  if (Object.hasOwn(cfg, "presentation_mode")) ensure(["whole_frame", "square_crop"].includes(String(cfg.presentation_mode)), "Presentazione v2 non valida");
  for (const key of ["run_usd", "daily_usd", "evaluation_usd"]) ensure(typeof cfg[key] === "number" && Number.isFinite(cfg[key]) && cfg[key] > 0, "Budget v2 positivo richiesto");
  for (const key of ["max_evaluations", "max_generations"]) ensure(Number.isSafeInteger(cfg[key]) && Number(cfg[key]) >= 1 && Number(cfg[key]) <= 200, "Limiti v2 non validi");
  ensure(cfg.max_regenerations === 1 && v2Text(cfg.evaluator_model, 150), "Nessuna rigenerazione o modello implicito in v2");
  ensure(["auto", "1024x1024", "1024x1536", "1536x1024"].includes(String(cfg.size)) && ["low", "medium", "high"].includes(String(cfg.quality)), "Parametri v2 non validi");
  if (origin === "AI") ensure(v2Text(cfg.image_model, 150) && typeof cfg.generation_usd === "number" && Number.isFinite(cfg.generation_usd) && cfg.generation_usd > 0, "Generatore v2 non configurato");
  return cfg;
}
function validateInput(input: unknown, origin: string): number {
  if (origin === "AI") return (validateV2Plan(input).ideas as unknown[]).length;
  ensure(Array.isArray(input) && input.length >= 1 && input.length <= 200, "Manifest REAL v2 richiesto");
  const seen = new Set<string>();
  for (const item of input) {
    const row = object(item), uid = v2Identifier(row.id);
    ensure(Object.keys(row).length === 3 && Object.hasOwn(row, "file") && !seen.has(uid), "Manifest REAL v2 non valido");
    seen.add(uid); validateV2Provenance(row.provenance, "REAL");
  }
  return input.length;
}
function checkIdentity(run: Run, state: ObjectValue) {
  ensure(state.id === run.id && state.origin === run.origin && state.protocol_version === editorialV2Version && state.simulated === false && equal(state.config, parsed(run.config_json)), "Identità del checkpoint v2 diversa");
  ensure(Array.isArray(state.attempts), "Tentativi v2 richiesti");
  const inputs = JSON.parse(run.input_json) as ObjectValue | ObjectValue[];
  const records = state.attempts.map(object);
  if (run.origin === "AI") {
    const ideas = (inputs as ObjectValue).ideas as ObjectValue[];
    ensure(records.length === ideas.length && records.every((row, index) => row.id === ideas[index].id && row.origin === "AI" && equal(row.idea, ideas[index]) && !Object.hasOwn(row, "reference_id")), "Le idee autonome non possono cambiare durante il run");
  } else {
    const sources = inputs as ObjectValue[];
    ensure(records.length === sources.length && records.every((row, index) => row.id === sources[index].id && row.origin === "REAL" && equal(row.provenance, sources[index].provenance)), "Le fonti REAL non possono cambiare durante il run");
  }
}

export async function editorialV2(request: Request, env: Env, path: string): Promise<Response> {
  if (env.ENABLE_EDITORIAL_V2_EXPERIMENTS !== "true") throw new HttpError(503, "Protocollo v2 sperimentale non attivo");
  try { return await route(request, env, path); }
  catch (error) { if (error instanceof EditorialV2ValidationError) throw new HttpError(400, error.message); throw error; }
}
async function route(request: Request, env: Env, path: string): Promise<Response> {
  if (path === base || path === base + "/runs") {
    if (request.method === "GET") return json({ version: editorialV2Version, experimental: true, publication_available: false, runs: (await env.DB.prepare("SELECT id,origin,status,stage,revision,created_at,updated_at FROM editorial_v2_runs ORDER BY created_at DESC LIMIT 200").all()).results });
    if (request.method === "POST" && path === base + "/runs") {
      if (env.ENABLE_EDITORIAL_V2_PAID !== "true") throw new HttpError(503, "Batch v2 pagati non abilitati");
      if (!env.QUARANTINE) throw new HttpError(503, "Quarantena v2 mancante");
      const data = await body(request, 1_900_000), uid = v2Identifier(data.id), origin = String(data.origin);
      ensure(origin === "REAL" || origin === "AI", "Origine v2 non valida");
      const cfg = validateConfig(data.config, origin), count = validateInput(data.input, origin);
      ensure(count <= Number(cfg.max_evaluations) && (origin !== "AI" || count <= Number(cfg.max_generations)), "Capacità v2 insufficiente");
      number(env.EDITORIAL_V2_TOTAL_USD);
      ensure(Number(cfg.evaluation_usd) >= number(env.EDITORIAL_V2_EVALUATION_USD) && (origin !== "AI" || Number(cfg.generation_usd) >= number(env.EDITORIAL_V2_GENERATION_USD)), "Stime v2 inferiori ai prezzi server");
      const prior = await env.DB.prepare("SELECT * FROM editorial_v2_runs WHERE id=?").bind(uid).first<Run>();
      if (prior) { ensure(prior.origin === origin && equal(parsed(prior.config_json), cfg) && equal(JSON.parse(prior.input_json), data.input), "Run v2 già registrato con dati diversi"); return json(visible(prior)); }
      const now = new Date().toISOString();
      await env.DB.prepare("INSERT INTO editorial_v2_runs(id,origin,status,stage,config_json,input_json,created_at,updated_at) VALUES(?,?,'active','planned',?,?,?,?)").bind(uid, origin, JSON.stringify(cfg), JSON.stringify(data.input), now, now).run();
      return json({ id: uid, revision: 0 }, 201);
    }
  }
  if (path === base + "/candidates" && request.method === "GET") {
    const runId = new URL(request.url).searchParams.get("run_id");
    const query = runId ? env.DB.prepare("SELECT * FROM editorial_v2_candidates WHERE run_id=? ORDER BY id LIMIT 200").bind(v2Identifier(runId)) : env.DB.prepare("SELECT * FROM editorial_v2_candidates ORDER BY created_at DESC,id LIMIT 200");
    return json({ version: editorialV2Version, experimental: true, publication_available: false, candidates: (await query.all<Candidate>()).results.map(publicCandidate) });
  }
  const candidatePath = path.match(/^\/api\/admin\/editorial\/v2\/candidates\/([\w-]+)\/(preview|review)$/);
  if (candidatePath) {
    const row = await env.DB.prepare("SELECT * FROM editorial_v2_candidates WHERE id=?").bind(candidatePath[1]).first<Candidate>();
    if (!row) throw new HttpError(404, "Candidata v2 non trovata");
    if (candidatePath[2] === "preview" && request.method === "GET") {
      const file = await env.QUARANTINE?.get(`editorial-v2/${row.run_id}/${row.preview_sha256}`);
      if (!file) throw new HttpError(404, "Anteprima v2 mancante");
      return new Response(file.body, { headers: { "Content-Type": "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    if (candidatePath[2] === "review" && request.method === "POST") {
      const data = await body(request, 100_000), dossier = parsed(row.dossier_json);
      ensure(data.confirm_reviewed === true && ["approved", "rejected"].includes(String(data.decision)) && data.revision === row.revision, "Revisione esplicita e revisione corrente richieste");
      const proof = validateV2Provenance(data.provenance, row.origin), explanation = validateV2Feedback(data.feedback, v2Evidence(proof.evidence));
      const original = object(dossier.provenance);
      const trace = original.transport === "synchronous" ? ["transport", "request_id"] : ["batch_id", "custom_id"];
      const identity = row.origin === "REAL" ? ["provider", "source_id", "source_url"] : ["idea_id", "mode", "idea", "prompt", "model", "parameters", "input_kind", "fully_synthetic", "generated_at", "timestamp_source", ...trace];
      ensure(identity.every(key => equal(proof[key], original[key])), "La revisione non può cambiare l'origine della candidata");
      const blockers = v2ApprovalBlockers(row.origin, dossier.profile, proof, explanation);
      if (data.decision === "approved") ensure(!blockers.length, "Approvazione bloccata: " + blockers.join(", "));
      if (data.decision === "approved") for (const checksum of [row.original_sha256, row.preview_sha256]) ensure(await env.QUARANTINE?.head(`editorial-v2/${row.run_id}/${checksum}`), "Archivio originale o anteprima incompleto");
      const review = JSON.stringify({ provenance: proof, feedback: explanation }), now = new Date().toISOString();
      const result = await env.DB.batch([
        env.DB.prepare("INSERT INTO editorial_v2_reviews SELECT ?,id,revision+1,?,?,?,? FROM editorial_v2_candidates WHERE id=? AND revision=?").bind(id(), (await hash(env.ADMIN_TOKEN!)).slice(0, 12), data.decision, review, now, row.id, row.revision),
        env.DB.prepare("UPDATE editorial_v2_candidates SET review_json=?,review_state=?,revision=revision+1 WHERE id=? AND revision=?").bind(review, data.decision, row.id, row.revision),
      ]);
      if (!result[1].meta.changes) throw new HttpError(409, "Candidata già revisionata: ricaricare");
      return json({ reviewed: true, published: false, revision: row.revision + 1 });
    }
  }
  const match = path.match(/^\/api\/admin\/editorial\/v2\/runs\/([\w-]+)(?:\/(lease|checkpoint|reserve|files|candidates)(?:\/([a-f0-9]{64}))?)?$/);
  if (!match) throw new HttpError(404, "API v2 inesistente; pubblicazione sperimentale non disponibile");
  const run = await env.DB.prepare("SELECT * FROM editorial_v2_runs WHERE id=?").bind(match[1]).first<Run>();
  if (!run) throw new HttpError(404, "Run v2 non trovato");
  if (!match[2] && request.method === "GET") return json(visible(run));
  const now = Date.now();
  if (match[2] === "lease" && request.method === "POST") {
    const token = id() + id(), result = await env.DB.prepare("UPDATE editorial_v2_runs SET lease_hash=?,lease_until=? WHERE id=? AND lease_until<=?").bind(await hash(token), now + 900_000, run.id, now).run();
    if (!result.meta.changes) throw new HttpError(409, "Run v2 gestito da un altro processo");
    return json({ lease: token, revision: run.revision });
  }
  if (match[2] === "lease" && request.method === "DELETE") {
    await env.DB.prepare("UPDATE editorial_v2_runs SET lease_hash=NULL,lease_until=0 WHERE id=? AND lease_hash=?").bind(run.id, await hash(request.headers.get("X-Batch-Lease") || "")).run();
    return json({ released: true });
  }
  if (match[2] === "files" && match[3] && request.method === "GET") {
    ensure((JSON.parse(run.files_json) as FileRecord[]).some(file => file.sha256 === match[3]), "File fuori dal checkpoint v2");
    const file = await env.QUARANTINE?.get(`editorial-v2/${run.id}/${match[3]}`);
    if (!file) throw new HttpError(404, "File v2 mancante");
    return new Response(file.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  const lease = await hash(request.headers.get("X-Batch-Lease") || "");
  if (run.lease_hash !== lease || run.lease_until <= now) throw new HttpError(409, "Lease v2 scaduto: ricaricare");
  if (match[2] === "files" && match[3] && request.method === "PUT") {
    if (!env.QUARANTINE) throw new HttpError(503, "Quarantena v2 mancante");
    if (Number(request.headers.get("Content-Length")) > 12_000_000) throw new HttpError(413, "File v2 oltre 12 MB");
    const bytes = await request.arrayBuffer();
    ensure(bytes.byteLength > 0 && bytes.byteLength <= 12_000_000, "Dimensione file v2 non valida");
    const checksum = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
    ensure(checksum === match[3], "File v2 modificato");
    await env.QUARANTINE.put(`editorial-v2/${run.id}/${checksum}`, bytes, { onlyIf: { etagDoesNotMatch: "*" } });
    return json({ saved: true });
  }
  if (match[2] === "checkpoint" && request.method === "PUT") {
    const data = await body(request, 1_900_000), state = object(data.state), files = data.files as FileRecord[];
    checkIdentity(run, state);
    ensure(["active", "paused", "completed", "cancelled", "stopped"].includes(String(state.status)) && v2Text(state.stage, 100) && Number.isSafeInteger(data.revision), "Checkpoint v2 non valido");
    ensure(Array.isArray(files) && files.length <= 800 && new Set(files.map(file => file.path)).size === files.length, "Manifest file v2 non valido");
    const old = JSON.parse(run.files_json) as FileRecord[];
    for (const file of files) {
      ensure(/^(inputs|generations)\/[A-Za-z0-9_-]+\/(original\.(png|jpg|webp)|preview\.webp)$/.test(file.path) && Number.isInteger(file.size) && file.size > 0 && file.size <= 12_000_000, "Percorso file v2 non valido");
      hex(file.sha256);
      if (!old.some(prior => equal(prior, file))) ensure((await env.QUARANTINE?.head(`editorial-v2/${run.id}/${file.sha256}`))?.size === file.size, "Checkpoint v2 incompleto");
    }
    // Completed/cancelled runs remain an archive, not an editable restart point.
    if (["completed", "cancelled", "stopped"].includes(run.status)) ensure(equal(state, parsed(run.checkpoint_json)) && equal(files, old), "Run v2 concluso immutabile");
    const result = await env.DB.prepare("UPDATE editorial_v2_runs SET checkpoint_json=?,files_json=?,status=?,stage=?,revision=revision+1,updated_at=?,lease_until=? WHERE id=? AND revision=? AND lease_hash=? AND lease_until>?").bind(JSON.stringify(state), JSON.stringify(files), state.status, state.stage, new Date().toISOString(), now + 900_000, run.id, data.revision, lease, now).run();
    if (!result.meta.changes) throw new HttpError(409, "Checkpoint v2 concorrente");
    return json({ revision: Number(data.revision) + 1 });
  }
  if (match[2] === "reserve" && request.method === "POST") return reserve(request, env, run, lease, now);
  if (match[2] === "candidates" && request.method === "POST") {
    ensure(run.status === "completed", "Completare il run prima di archiviare le candidate");
    const data = await body(request, 1_900_000), state = parsed(run.checkpoint_json), records = data.candidates;
    ensure(Array.isArray(records) && records.length <= 200 && equal(records, state.candidates), "Candidate diverse dal checkpoint congelato");
    const files = JSON.parse(run.files_json) as FileRecord[];
    for (const item of records) {
      const row = object(item), uid = v2Identifier(row.id);
      ensure(row.run_id === run.id && row.origin === run.origin && row.simulated === false, "Candidate di un altro run o simulate");
      const original = hex(row.original_sha256), preview = hex(row.sha256);
      ensure(files.some(file => file.path === row.file && file.sha256 === original) && files.some(file => file.path === row.derived_file && file.sha256 === preview), "File candidata non presenti nel checkpoint");
      validateV2Profile(row.profile); const proof = validateV2Provenance(row.provenance, run.origin); validateV2Feedback(row.feedback, v2Evidence(proof.evidence));
      const prior = await env.DB.prepare("SELECT dossier_json FROM editorial_v2_candidates WHERE id=?").bind(uid).first<{ dossier_json: string }>();
      if (prior) ensure(equal(parsed(prior.dossier_json), row), "Dossier v2 già archiviato con dati diversi");
      else await env.DB.prepare("INSERT INTO editorial_v2_candidates(id,run_id,origin,original_sha256,preview_sha256,dossier_json,created_at) VALUES(?,?,?,?,?,?,?)").bind(uid, run.id, run.origin, original, preview, JSON.stringify(row), new Date().toISOString()).run();
    }
    return json({ archived: records.length, published: false });
  }
  throw new HttpError(405, "Metodo v2 non consentito");
}

async function reserve(request: Request, env: Env, run: Run, lease: string, now: number): Promise<Response> {
  if (env.ENABLE_EDITORIAL_V2_PAID !== "true" || !["active", "paused"].includes(run.status)) throw new HttpError(503, "Nuove richieste v2 non abilitate");
  const data = await body(request), uid = v2Identifier(data.id), calls = data.requests;
  ensure(Array.isArray(calls) && calls.length > 0 && calls.length <= 20, "Richieste v2 non valide");
  const seen = new Set<string>();
  for (const item of calls) { const call = object(item), callId = v2Identifier(call.id); ensure(Object.keys(call).length === 2 && ["evaluation", "generation"].includes(String(call.kind)) && (run.origin === "AI" || call.kind === "evaluation") && !seen.has(callId), "Richiesta v2 duplicata o non ammessa"); seen.add(callId); }
  const prior = await env.DB.prepare("SELECT requests_json,reserved_usd FROM editorial_v2_reservations WHERE id=? AND run_id=?").bind(uid, run.id).first<{ requests_json: string; reserved_usd: number }>();
  if (prior) { ensure(equal((JSON.parse(prior.requests_json) as ObjectValue[]).map(({ id, kind }) => ({ id, kind })), calls), "Prenotazione v2 diversa già presente"); return json({ reserved_usd: prior.reserved_usd, already_reserved: true }); }
  const cfg = parsed(run.config_json), evaluation = number(env.EDITORIAL_V2_EVALUATION_USD);
  const generation = run.origin === "AI" ? number(env.EDITORIAL_V2_GENERATION_USD) : 0;
  const rows = calls.map(item => { const call = object(item); return { id: call.id, kind: call.kind, cost: call.kind === "evaluation" ? evaluation : generation }; });
  ensure(evaluation <= Number(cfg.evaluation_usd) && generation <= Number(cfg.generation_usd), "Prezzi v2 superiori alle stime congelate");
  const total = rows.reduce((sum, row) => sum + row.cost, 0), evaluations = rows.filter(row => row.kind === "evaluation").length, generations = rows.length - evaluations, ledgerRun = "v2-" + run.id;
  const day = new Date().toISOString().slice(0, 10);
  const result = await env.DB.prepare(`INSERT INTO editorial_v2_reservations SELECT ?,?,?,?,?,? WHERE
    EXISTS(SELECT 1 FROM editorial_v2_runs WHERE id=? AND lease_hash=? AND lease_until>? AND status IN ('active','paused')) AND
    round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage),0)+?,6)<=? AND
    round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage WHERE run_id=?),0)+?,6)<=? AND
    round(COALESCE((SELECT sum(reserved_usd) FROM editorial_usage WHERE day=?),0)+?,6)<=? AND
    (SELECT count(*) FROM editorial_usage WHERE run_id=? AND kind='evaluation')+?<=? AND
    (SELECT count(*) FROM editorial_usage WHERE run_id=? AND kind IN ('generation','regeneration'))+?<=?`)
    .bind(uid, run.id, day, JSON.stringify(rows), total, new Date().toISOString(), run.id, lease, now, total, number(env.EDITORIAL_V2_TOTAL_USD), ledgerRun, total, Math.min(Number(cfg.run_usd), number(env.EDITORIAL_V2_RUN_USD)), day, total, Math.min(Number(cfg.daily_usd), number(env.EDITORIAL_V2_DAILY_USD)), ledgerRun, evaluations, Math.min(Number(cfg.max_evaluations), number(env.EDITORIAL_V2_MAX_EVALUATIONS)), ledgerRun, generations, Math.min(Number(cfg.max_generations), number(env.EDITORIAL_V2_MAX_GENERATIONS))).run();
  if (!result.meta.changes) throw new HttpError(409, "Budget o limite v2 raggiunto");
  return json({ reserved_usd: total });
}
