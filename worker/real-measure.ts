/** Crowding and detail of a REAL, measured by a model on request (owner decisions of 2026-11-21, spec `libreria-immagini`, section 10).
 * One confirmed paid call per measure, never repeated automatically. The model sees the whole original and the gallery's title and
 * description, and only observes objects, boxes and legible kinds of detail; the scores come from shared/real-measure.ts. Every
 * measure is kept with its model and context versions. Thresholds: the gallery's, else the default of the settings. */
import { MAX_OBJECTS, OBSERVATION_SCHEMA, overThresholds, scores, validObservation, type Observation, type Scores } from "../shared/real-measure";
import { imageMime } from "../shared/image-format";
import { numberSettings } from "./app-settings";
import { HttpError, id, type Env } from "./core";
import { IMAGE_MARK, jsonWithImage } from "./image-body";
import { currentContext } from "./model-context";
import { chosenModel } from "./models";
import { paid, responseJson } from "./paid";

/** The cap covers the model's reasoning too (see the old analysis: 2000 tokens cut one answer in ten). */
const MAX_OUTPUT_TOKENS = 8000;
const OUTPUT = `Rispondi solo con JSON conforme allo schema. subject è il soggetto; others gli altri oggetti, al massimo ${MAX_OBJECTS}; unlisted ` +
  "il numero degli oggetti riconoscibili che non hai elencato. box: x e y dell'angolo in alto a sinistra, width e height, tutti fra 0 e 1 " +
  "rispetto all'immagine intera. detail: true solo per le categorie leggibili su quell'oggetto.";

interface MeasureRow { id: string; image_id: string; model: string; base_context: string; measure_context: string; observation: string;
  crowdedness: number; detail: number; created_at: string }
export interface MeasureSummary extends Scores { id: string; model: string; created_at: string; objects: number }

const summary = (row: MeasureRow): MeasureSummary => {
  const observation = JSON.parse(row.observation) as Observation;
  return { id: row.id, model: row.model, created_at: row.created_at, crowdedness: row.crowdedness, detail: row.detail,
    objects: observation.others.length + observation.unlisted };
};

/** Latest measure of each photo. */
export async function latestMeasures(env: Env, ids: readonly string[]): Promise<Map<string, MeasureSummary>> {
  if (!ids.length) return new Map();
  const rows = (await env.DB.prepare(`SELECT m.* FROM real_measures m WHERE m.image_id IN (SELECT value FROM json_each(?1))
    AND m.rowid=(SELECT rowid FROM real_measures WHERE image_id=m.image_id ORDER BY created_at DESC,rowid DESC LIMIT 1)`)
    .bind(JSON.stringify(ids)).all<MeasureRow>()).results;
  return new Map(rows.map(r => [r.image_id, summary(r)]));
}
/** Thresholds in force for each gallery: its own, else the default of the settings. */
export async function galleryThresholds(env: Env, galleries: readonly string[]): Promise<Map<string, Scores>> {
  const defaults = await numberSettings(env);
  const rows = galleries.length ? (await env.DB.prepare("SELECT id,max_crowdedness,max_detail FROM galleries WHERE id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify([...new Set(galleries)])).all<{ id: string; max_crowdedness: number | null; max_detail: number | null }>()).results : [];
  return new Map(rows.map(g => [g.id, { crowdedness: g.max_crowdedness ?? defaults.crowdedness_threshold, detail: g.max_detail ?? defaults.detail_threshold }]));
}
/** What the photo's view says about its measure: the latest scores and those above the thresholds of its gallery. */
export function measureView(measure: MeasureSummary | undefined, limits: Scores | undefined) {
  return measure ? { ...measure, over: limits ? overThresholds(measure, limits) : [], limits: limits ?? null } : null;
}

/** GET /:id/measures: every measure of the photo, the latest first, with the objects the model saw. */
export async function measuresOf(env: Env, imageId: string) {
  const rows = (await env.DB.prepare("SELECT * FROM real_measures WHERE image_id=? ORDER BY created_at DESC,rowid DESC").bind(imageId).all<MeasureRow>()).results;
  return { measures: rows.map(r => ({ ...summary(r), base_context: r.base_context, measure_context: r.measure_context,
    observation: JSON.parse(r.observation) as Observation })) };
}

interface Target { id: string; origin: string; status: string; original_key: string; gallery_id: string }
/** POST /:id/measure {confirm: true, request}: one paid call. `request` (a UUID from the browser) records the call once: the same
 * confirmation sent twice is refused before reaching the model. */
export async function measureReal(env: Env, row: Target, data: Record<string, unknown>) {
  if (Object.keys(data).some(k => k !== "confirm" && k !== "request") || data.confirm !== true || typeof data.request !== "string"
    || !/^[a-f0-9-]{36}$/.test(data.request)) throw new HttpError(400, "Conferma la chiamata a pagamento");
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  if (row.origin !== "REAL") throw new HttpError(409, "Si misurano solo le REAL");
  if (row.status === "trash") throw new HttpError(409, "Foto nel cestino: ripristinala per misurarla");
  // Everything is read before the call is recorded: a failure here costs nothing.
  const original = row.original_key ? await env.QUARANTINE?.get(row.original_key) : null;
  if (!original) throw new HttpError(409, "Originale non disponibile");
  const bytes = new Uint8Array(await original.arrayBuffer()), mime = imageMime(bytes);
  if (!mime) throw new HttpError(409, "Formato dell'originale non leggibile dal modello");
  const gallery = await env.DB.prepare("SELECT title,description FROM galleries WHERE id=?").bind(row.gallery_id).first<{ title: string; description: string }>();
  const [model, base, task] = await Promise.all([chosenModel(env, "text_model"), currentContext(env, "base"), currentContext(env, "real_measure")]);
  const answer = responseJson(await paid(env, "analysis", model, jsonWithImage({ model,
    instructions: [base.body, task.body, OUTPUT].join("\n\n"), max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [{ role: "user", content: [
      { type: "input_text", text: JSON.stringify({ gallery: { title: gallery?.title || "", description: gallery?.description || "" } }) },
      { type: "input_image", image_url: IMAGE_MARK, detail: "high" }] }],
    text: { format: { type: "json_schema", name: "real_measure", strict: true, schema: OBSERVATION_SCHEMA } },
  }, bytes, mime), { image: row.id, request: `measure-${data.request}` }));
  const observation = validObservation(answer);
  if (!observation) throw new HttpError(502, "Risposta del modello non valida: misura non salvata");
  const result = scores(observation), stamp = new Date().toISOString(), measureId = id();
  // The photo may have been deleted during the call: then nothing is stored (the call stays in the register).
  const stored = await env.DB.prepare(`INSERT INTO real_measures(id,image_id,model,base_context,measure_context,observation,crowdedness,detail,created_at)
    SELECT ?,id,?,?,?,?,?,?,? FROM images WHERE id=?`).bind(measureId, model, base.id, task.id, JSON.stringify(observation),
    result.crowdedness, result.detail, stamp, row.id).run();
  if (!stored.meta.changes) throw new HttpError(404, "Foto eliminata durante la misura");
  return measureId;
}
