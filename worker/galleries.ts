/** Gallery editing, readiness for automatic generation and thresholds of crowding and detail of its REAL. The SLOP instructions of a
 * gallery and their suggestion by a model were retired on 2026-11-22 (owner decision): each REAL has its own ideas. */
import { numberSettings } from "./app-settings";
import { HttpError, id, type Env } from "./core";
import { chosenModel } from "./models";
import { freeIdea } from "./real-ideas";

/** max_crowdedness, max_detail: the gallery's thresholds from 0 to 100, NULL for the default of the settings (spec `libreria-immagini`,
 * section 10). They never change the revision, which pending proposals check. */
export interface Gallery { id: string; title: string; description: string; revision: number;
  max_crowdedness: number | null; max_detail: number | null }
export const GALLERY_DESCRIPTION_MAX = 3000;
/** Automatic generation needs at least one REAL with a free approved idea. */
const ready = (gallery: {available: number}) => gallery.available > 0;
/** REAL a gallery can draw on for automatic SLOP: approved or published, with its original (no editorial description since 2026-11-20)
 * and, since 2026-11-21, with an approved idea that is free (worker/real-ideas.ts). */
export const GALLERY_SOURCE = "origin='REAL' AND status IN ('approved','published') AND original_key<>''";
/** REAL that the automatic extraction can draw: a gallery source with a free approved idea. */
export const DRAWABLE = (alias: string) => `${alias}.origin='REAL' AND ${alias}.status IN ('approved','published') AND ${alias}.original_key<>''
  AND EXISTS(SELECT 1 FROM real_ideas i WHERE ${freeIdea(alias)})`;

export async function findGallery(env: Env, value: unknown): Promise<Gallery> {
  if (typeof value !== "string" || !/^[\w-]{1,64}$/.test(value)) throw new HttpError(400, "Scegli una galleria");
  const gallery = await env.DB.prepare("SELECT * FROM galleries WHERE id=?").bind(value).first<Gallery>();
  if (!gallery) throw new HttpError(404, "Galleria inesistente");
  return gallery;
}
export async function galleryId(env: Env, value: unknown) {
  return (await findGallery(env, value)).id;
}
export async function galleries(env: Env) {
  const rows = (await env.DB.prepare(`SELECT g.*, (SELECT count(*) FROM images im WHERE im.gallery_id=g.id AND ${DRAWABLE("im")}) AS available
    FROM galleries g ORDER BY g.title COLLATE NOCASE,g.id`).all<Gallery & {available: number}>()).results;
  return rows.map(g => ({...g, ready: ready(g)}));
}
async function galleryPreviews(env: Env) {
  const rows = (await env.DB.prepare(`SELECT g.*,
    (SELECT count(*) FROM images im WHERE im.gallery_id=g.id AND ${DRAWABLE("im")}) AS available,
    (SELECT count(*) FROM images WHERE gallery_id=g.id AND status<>'trash') AS photos,
    (SELECT count(*) FROM images WHERE gallery_id=g.id AND origin='REAL' AND status<>'trash' AND source_missing_at IS NOT NULL) AS source_missing,
    (SELECT json_group_array(file) FROM (
      SELECT '/api/admin/library/'||id||'/file?v='||substr(COALESCE(copy_sha256,original_sha256),1,12) AS file
      FROM images WHERE gallery_id=g.id AND status<>'trash' ORDER BY created_at DESC,id LIMIT 3
    )) AS preview
    FROM galleries g ORDER BY g.title COLLATE NOCASE,g.id`).all<Gallery & {available: number; photos: number; source_missing: number; preview: string}>()).results;
  return rows.map(g => ({...g, ready: ready(g), preview: JSON.parse(g.preview) as string[]}));
}
function field(value: unknown, max: number, name: string, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new HttpError(400, `Campo non valido: ${name}`);
  return value.trim();
}
/** A threshold from 0 to 100, or null for the default of the settings. */
function threshold(value: unknown, name: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) throw new HttpError(400, `Soglia di ${name} da 0 a 100`);
  return value;
}
export async function galleryRoute(env: Env, method: string, target: string, data: Record<string, unknown>) {
  if (!target && method === "GET") {
    const defaults = await numberSettings(env);
    return {galleries: await galleryPreviews(env), paid_calls: !!env.OPENAI_API_KEY, text_model: await chosenModel(env, "text_model"),
      thresholds: {crowdedness: defaults.crowdedness_threshold, detail: defaults.detail_threshold}};
  }
  if (method === "GET" && /^[\w-]{1,64}$/.test(target)) return findGallery(env, target);
  if (method !== "POST" && method !== "PATCH") throw new HttpError(405, "Metodo non consentito");
  const [key, action] = target.split("/");
  const editing = method === "PATCH" && key && !action;
  if (!editing && (method !== "POST" || target)) throw new HttpError(404, "API delle gallerie inesistente");
  if (Object.keys(data).some(k => !["title", "description", "max_crowdedness", "max_detail", ...(editing ? ["revision"] : [])].includes(k)))
    throw new HttpError(400, "Campi non previsti");
  const title = field(data.title, 200, "titolo", true), description = field(data.description ?? "", GALLERY_DESCRIPTION_MAX, "descrizione");
  if (!editing) {
    const key = id();
    await env.DB.prepare("INSERT INTO galleries(id,title,description,max_crowdedness,max_detail) VALUES(?,?,?,?,?)")
      .bind(key, title, description, threshold(data.max_crowdedness, "affollamento"), threshold(data.max_detail, "dettaglio")).run();
    return findGallery(env, key);
  }
  const gallery = await findGallery(env, key);
  if (data.revision !== gallery.revision) throw new HttpError(409, "Galleria modificata: ricarica il modulo");
  const crowdedness = "max_crowdedness" in data ? threshold(data.max_crowdedness, "affollamento") : gallery.max_crowdedness;
  const detail = "max_detail" in data ? threshold(data.max_detail, "dettaglio") : gallery.max_detail;
  const text = title !== gallery.title || description !== gallery.description;
  if (!text && crowdedness === gallery.max_crowdedness && detail === gallery.max_detail) return gallery;
  const updated = await env.DB.prepare(`UPDATE galleries SET title=?,description=?,max_crowdedness=?,max_detail=?,
    revision=revision+? WHERE id=? AND revision=?`).bind(title, description, crowdedness, detail, text ? 1 : 0, key, gallery.revision).run();
  if (!updated.meta.changes) throw new HttpError(409, "Galleria modificata: ricarica il modulo");
  return findGallery(env, key);
}
