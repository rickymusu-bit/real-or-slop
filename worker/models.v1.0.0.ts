/** Model selectors of the dashboard Settings (docs/wizard-slop.v1.4.0.md, section 12). v1.0.0, 2026-11-10T22:11:48Z.
 * The choice is stored in D1 (table «settings», migration 0039). A model is selectable when it is in the list of the
 * code and in the list of the OpenAI project (GET /v1/models, free), kept for an hour. No prices. */
import { HttpError, type Env } from "./core";
import { DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL, IMAGE_MODELS, isImageModel, isTextModel, TEXT_MODELS, type ModelKind } from "../shared/models.v1.0.0";

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

async function state(env: Env) {
  const { ids, error } = await available(env);
  const option = (id: string) => ({ id, available: ids ? ids.has(id) : null });
  return {
    text_model: await chosenModel(env, "text_model"), image_model: await chosenModel(env, "image_model"),
    text_models: TEXT_MODELS.map(option), image_models: Object.keys(IMAGE_MODELS).map(id => ({ ...option(id), qualities: IMAGE_MODELS[id] })),
    note: error,
  };
}

/** GET /models; PUT /models {text_model?, image_model?}. A model missing from the OpenAI project is refused. */
export async function modelsRoute(env: Env, method: string, data: Record<string, unknown>) {
  if (method === "GET") return state(env);
  if (method !== "PUT") throw new HttpError(405, "Metodo non consentito");
  if (Object.keys(data).some(key => key !== "text_model" && key !== "image_model") || !Object.keys(data).length) throw new HttpError(400, "Campi non previsti");
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
  await env.DB.batch(writes);
  return state(env);
}
/** Test hook: forget the cached list of the OpenAI project. */
export const forgetProjectModels = () => { projectModels = null; };
