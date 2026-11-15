/** Model selectors of Settings (spec `libreria-immagini`, section 6): the chosen text and image models and the image
 * quality, among the models of the code available in the OpenAI project (list read for free, cached one hour). */
import { HttpError, type Env } from "./core";
import { DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL, IMAGE_MODELS, isImageModel, isTextModel, SHUTDOWN, TEXT_MODELS, type ModelKind } from "../shared/models";

const CACHE_MS = 60 * 60_000;
let projectModels: { at: number; ids: Set<string> | null; error: string } | null = null;

/** Models of the OpenAI project, or null when the list cannot be read (then every model of the code is offered). */
async function available(env: Env): Promise<{ ids: Set<string> | null; error: string }> {
  if (projectModels && Date.now() - projectModels.at < CACHE_MS) return projectModels;
  if (!env.OPENAI_API_KEY) return { ids: null, error: "Chiave OpenAI mancante" };
  try {
    const response = await fetch((env.OPENAI_BASE_URL || "https://api.openai.com/v1/") + "models", {
      headers: { Authorization: "Bearer " + env.OPENAI_API_KEY }, signal: AbortSignal.timeout(10_000), redirect: "manual" });
    if (!response.ok) throw new Error("OpenAI ha risposto " + response.status);
    const data = await response.json() as { data?: { id?: string }[] };
    projectModels = { at: Date.now(), ids: new Set((data.data || []).map(m => String(m.id))), error: "" };
  } catch (error) {
    // Not kept: the next request tries again.
    return { ids: null, error: "Elenco dei modelli OpenAI non disponibile: " + (error instanceof Error ? error.message : "errore") };
  }
  return projectModels;
}

export async function chosenModel(env: Env, kind: ModelKind): Promise<string> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(kind).first<{ value: string }>();
  const valid = kind === "text_model" ? isTextModel : isImageModel;
  return row && valid(row.value) ? row.value : kind === "text_model" ? DEFAULT_TEXT_MODEL : DEFAULT_IMAGE_MODEL;
}

/** The default quality: the stored one if the chosen image model accepts it, otherwise «high» (or the model's first). */
export async function chosenQuality(env: Env): Promise<string> {
  const qualities = IMAGE_MODELS[await chosenModel(env, "image_model")] || [];
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='image_quality'").first<{ value: string }>();
  return row && qualities.includes(row.value) ? row.value : qualities.includes("high") ? "high" : qualities[0] || "medium";
}

async function state(env: Env) {
  const { ids, error } = await available(env);
  const option = (id: string) => ({ id, available: ids ? ids.has(id) : null, shutdown: SHUTDOWN[id] || null });
  return {
    text_model: await chosenModel(env, "text_model"), image_model: await chosenModel(env, "image_model"), image_quality: await chosenQuality(env),
    text_models: TEXT_MODELS.map(option), image_models: Object.keys(IMAGE_MODELS).map(id => ({ ...option(id), qualities: IMAGE_MODELS[id] })),
    note: error,
  };
}

/** GET /models; PUT /models {text_model?, image_model?, image_quality?}. A model missing from the OpenAI project is refused; a quality
 * must be one of the image model's (the one chosen in the same request, or the current one). */
export async function modelsRoute(env: Env, method: string, data: Record<string, unknown>) {
  if (method === "GET") return state(env);
  if (method !== "PUT") throw new HttpError(405, "Metodo non consentito");
  if (Object.keys(data).some(key => !["text_model", "image_model", "image_quality"].includes(key)) || !Object.keys(data).length) throw new HttpError(400, "Campi non previsti");
  if (data.image_quality !== undefined) {
    const model = isImageModel(data.image_model) ? data.image_model : await chosenModel(env, "image_model");
    if (typeof data.image_quality !== "string" || !(IMAGE_MODELS[model] || []).includes(data.image_quality))
      throw new HttpError(400, `Qualità non ammessa da ${model}: ${(IMAGE_MODELS[model] || []).join(", ")}`);
  }
  if (data.text_model !== undefined && !isTextModel(data.text_model)) throw new HttpError(400, "Modello di testo non previsto");
  if (data.image_model !== undefined && !isImageModel(data.image_model)) throw new HttpError(400, "Modello di immagini non previsto");
  const { ids } = await available(env);
  const stamp = new Date().toISOString(), writes = [];
  for (const kind of ["text_model", "image_model"] as const) {
    const value = data[kind];
    if (typeof value !== "string") continue;
    if (ids && !ids.has(value)) throw new HttpError(409, `«${value}» non è disponibile nel progetto OpenAI`);
    writes.push(env.DB.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .bind(kind, value, stamp));
  }
  if (typeof data.image_quality === "string")
    writes.push(env.DB.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES('image_quality',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .bind(data.image_quality, stamp));
  await env.DB.batch(writes);
  return state(env);
}
/** Test hook: forget the cached list of the OpenAI project. */
export const forgetProjectModels = () => { projectModels = null; };
