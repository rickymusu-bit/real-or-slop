import schema from "./editorial-v2.json";
import { recognizedLicense } from "./licenses";

export const editorialV2Version = schema.version;
export type ObjectValue = Record<string, unknown>;
export class EditorialV2ValidationError extends Error {}
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new EditorialV2ValidationError(message);
}
export function object(value: unknown): ObjectValue {
  ensure(value && typeof value === "object" && !Array.isArray(value), "Oggetto v2 richiesto");
  return value as ObjectValue;
}
function exact(value: unknown, keys: string[], name: string): ObjectValue {
  const row = object(value);
  ensure(Object.keys(row).length === keys.length && keys.every(key => Object.hasOwn(row, key)), `${name}: campi mancanti o non ammessi`);
  return row;
}
export const v2Text = (value: unknown, limit = 8000): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 20 && value.every(item => v2Text(item, 2000));
export function v2Identifier(value: unknown): string {
  ensure(typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value), "Identificativo v2 non valido");
  return value;
}
function https(value: unknown): boolean {
  if (!v2Text(value, 2000)) return false;
  try { const url = new URL(value); return url.protocol === "https:" && !!url.hostname && !url.username && !url.password; } catch { return false; }
}
export function validateV2Profile(value: unknown): ObjectValue {
  const row = exact(value, ["version", "photographic", "usable", ...Object.keys(schema.enums), ...schema.scalars, ...schema.lists], "Profilo visivo");
  ensure(row.version === schema.version && typeof row.photographic === "boolean" && typeof row.usable === "boolean", "Versione o ammissibilità visiva non valida");
  for (const [key, choices] of Object.entries(schema.enums)) ensure(row[key] === null || choices.includes(row[key] as never), `Attributo visivo non valido: ${key}`);
  for (const key of schema.scalars) ensure(row[key] === null || typeof row[key] === "number" && Number.isFinite(row[key]) && row[key] >= 0 && row[key] <= 100, `Misura visiva non valida: ${key}`);
  for (const key of schema.lists) ensure(strings(row[key]), `Osservazioni visive non valide: ${key}`);
  ensure((row.observations as string[]).length && (row.uncertainties as string[]).length, "Servono osservazioni e limiti espliciti della lettura visiva");
  return row;
}
export function validateV2Plan(value: unknown): ObjectValue {
  const row = exact(value, ["version", "independent", "ideas"], "Piano SLOP autonomo");
  ensure(row.version === schema.version && row.independent === true, "Richiesta ideazione autonoma v2");
  ensure(Array.isArray(row.ideas) && row.ideas.length >= 1 && row.ideas.length <= 200, "Numero di idee non valido");
  const seen = new Set<string>();
  for (const item of row.ideas) {
    const idea = exact(item, ["id", "mode", "idea", "prompt"], "Idea SLOP"), uid = v2Identifier(idea.id);
    ensure(!seen.has(uid), "Idea duplicata"); seen.add(uid);
    ensure(schema.modes.includes(String(idea.mode)) && v2Text(idea.idea) && v2Text(idea.prompt), "Idea o prompt non valido");
    ensure(!/https?:\/\/|data:|\b(?:reference_id|source_url|image_url)\b/i.test(idea.prompt), "Nessun riferimento o URL nel prompt SLOP");
  }
  return row;
}
export function v2Evidence(value: unknown): Set<string> {
  ensure(Array.isArray(value) && value.length >= 1 && value.length <= 20, "Evidenze documentali richieste");
  const ids = new Set<string>();
  for (const item of value) {
    const row = exact(item, ["id", "url", "statement"], "Evidenza"), uid = v2Identifier(row.id);
    ensure(!ids.has(uid) && https(row.url) && v2Text(row.statement, 4000), "Evidenza non valida");
    ids.add(uid);
  }
  return ids;
}
export function validateV2Provenance(value: unknown, origin: unknown): ObjectValue {
  ensure(origin === "REAL" || origin === "AI", "Origine non valida");
  const common = ["kind", "content_kind", "license_url", "author", "evidence", "transformations"];
  const extra = origin === "REAL" ? ["provider", "source_id", "source_url", "authenticity", "semantic_edit"] : ["idea_id", "mode", "idea", "prompt", "model", "parameters", "input_kind", "fully_synthetic", "generated_at", "timestamp_source", "batch_id", "custom_id"];
  const row = exact(value, [...common, ...extra], "Provenienza");
  ensure(row.kind === origin && ["photograph", "synthetic", "artwork", "unknown"].includes(String(row.content_kind)), "Natura del contenuto non valida");
  ensure(recognizedLicense(String(row.license_url)) && v2Text(row.author, 500), "Diritti o autore da verificare");
  v2Evidence(row.evidence);
  ensure(Array.isArray(row.transformations) && row.transformations.every(item => schema.transformations.includes(item)), "Crop, restauro, upscaling o trasformazione non coperta: quarantena");
  if (origin === "REAL") {
    ensure(v2Text(row.provider, 100) && v2Text(row.source_id, 300) && https(row.source_url), "Fonte REAL incompleta");
    ensure(["verified", "unverified", "uncertain", "hybrid"].includes(String(row.authenticity)) && typeof row.semantic_edit === "boolean", "Verifica REAL incompleta");
  } else {
    validateV2Plan({ version: schema.version, independent: true, ideas: [{ id: row.idea_id, mode: row.mode, idea: row.idea, prompt: row.prompt }] });
    ensure(row.input_kind === "text-only" && row.fully_synthetic === true && row.content_kind === "synthetic", "Solo generazioni integralmente sintetiche da testo");
    ensure(v2Text(row.model, 150) && v2Text(row.generated_at, 100) && v2Text(row.batch_id, 150) && v2Text(row.custom_id, 150), "Tracciamento generazione incompleto");
    ensure(["provider_created", "retrieved_at"].includes(String(row.timestamp_source)), "Origine del timestamp richiesta");
    const params = exact(row.parameters, ["n", "size", "quality"], "Parametri generazione");
    ensure(params.n === 1 && ["1024x1024", "1024x1536", "1536x1024"].includes(String(params.size)) && ["low", "medium", "high"].includes(String(params.quality)), "Parametri non validi");
  }
  return row;
}
export function validateV2Feedback(value: unknown, proofIds: Set<string>): ObjectValue {
  const row = exact(value, ["observations", "misleading_assumptions", "uncertainty", "origin_evidence_ids"], "Feedback");
  ensure(strings(row.observations) && strings(row.misleading_assumptions) && v2Text(row.uncertainty, 4000), "Feedback incompleto");
  ensure(strings(row.origin_evidence_ids) && row.origin_evidence_ids.length && row.origin_evidence_ids.every(uid => proofIds.has(uid)), "Il feedback deve riferire evidenze esistenti");
  return row;
}
export function v2ApprovalBlockers(origin: unknown, profile: unknown, proof: unknown, feedback: unknown): string[] {
  const visual = validateV2Profile(profile), source = validateV2Provenance(proof, origin);
  validateV2Feedback(feedback, v2Evidence(source.evidence));
  const blockers: string[] = [];
  if (!visual.usable || !visual.photographic) blockers.push("visual_eligibility");
  if (origin === "REAL" && (source.authenticity !== "verified" || source.semantic_edit || source.content_kind !== "photograph")) blockers.push("authenticity_not_verified");
  return blockers;
}
