import { curationChoices, curationTextLimits, type CurationValues, type CurationRecord } from "../shared/curation";
import { body, hash, HttpError, id, json, type Env } from "./core";

export function validateCuration(data: Record<string, unknown>): CurationValues {
  if (!data.curation || typeof data.curation !== "object" || Array.isArray(data.curation))
    throw new HttpError(400, "Scheda editoriale richiesta");
  const input = data.curation as Record<string, unknown>;
  const values: Record<string, string | null> = {};
  const fields = [...Object.keys(curationChoices), ...Object.keys(curationTextLimits)];
  if (Object.keys(input).some((key) => !fields.includes(key)))
    throw new HttpError(400, "Campo editoriale sconosciuto");
  for (const key of fields) {
    const value = input[key];
    if (value === undefined || value === null || value === "") {
      values[key] = null;
      continue;
    }
    if (typeof value !== "string") throw new HttpError(400, `Campo non valido: ${key}`);
    const choices = (curationChoices as Record<string, readonly string[]>)[key];
    if (choices ? !choices.includes(value) : value.length > (curationTextLimits as Record<string, number>)[key])
      throw new HttpError(400, `Campo non valido: ${key}`);
    values[key] = value.trim() || null;
  }
  if ((values.verified_place || values.verified_date) && (!values.fact_evidence || data.facts_confirmed !== true))
    throw new HttpError(400, "Fatti verificati: prova documentale e conferma umana richieste");
  return values as CurationValues;
}

export async function curation(request: Request, env: Env, imageId: string) {
  const image = await env.DB.prepare("SELECT id FROM images WHERE id=?").bind(imageId).first();
  if (!image) throw new HttpError(404, "Immagine non trovata");
  const current = await env.DB.prepare("SELECT * FROM image_curation WHERE image_id=?").bind(imageId).first<CurationRecord>();
  if (request.method === "GET") {
    const events = (await env.DB.prepare("SELECT * FROM image_curation_events WHERE image_id=? ORDER BY revision DESC LIMIT 100").bind(imageId).all()).results;
    return json({ curation: current, events });
  }
  if (request.method !== "PUT") throw new HttpError(405, "Metodo non consentito");
  const data = await body(request);
  if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 0)
    throw new HttpError(400, "Revisione attesa richiesta");
  if (typeof data.reason !== "string" || !data.reason.trim() || data.reason.length > 2000)
    throw new HttpError(400, "Motivazione della modifica richiesta (massimo 2000 caratteri)");
  const values = validateCuration(data);
  const expected = Number(data.revision);
  if ((current?.revision || 0) !== expected) throw new HttpError(409, "Scheda modificata: ricaricare prima di salvare");
  const eventId = id();
  const reviewer = (await hash(env.ADMIN_TOKEN!)).slice(0, 12);
  const next = { ...values, image_id: imageId, revision: expected + 1, reviewer, updated_at: new Date().toISOString() };
  const columns = Object.keys(next);
  // D1 batch is transactional. Check the revision again inside SQL, so two
  // reviewers cannot both save an edit based on the same snapshot.
  const result = await env.DB.batch([
    env.DB.prepare("INSERT INTO image_curation_events(id,image_id,revision,reviewer,reason,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE COALESCE((SELECT revision FROM image_curation WHERE image_id=?),0)=?")
      .bind(eventId, imageId, next.revision, reviewer, data.reason.trim(), JSON.stringify(current), JSON.stringify(next), next.updated_at, imageId, expected),
    env.DB.prepare(`INSERT INTO image_curation(${columns.join(",")}) SELECT ${columns.map(() => "?").join(",")} WHERE EXISTS(SELECT 1 FROM image_curation_events WHERE id=?) ON CONFLICT(image_id) DO UPDATE SET ${columns.filter((key) => key !== "image_id").map((key) => `${key}=excluded.${key}`).join(",")}`)
      .bind(...Object.values(next), eventId),
  ]);
  if (!result[0].meta.changes) throw new HttpError(409, "Scheda modificata: ricaricare prima di salvare");
  return json({ curation: next });
}
