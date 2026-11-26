/** Gallery editing and readiness for legacy generation. The SLOP instructions of a
 * gallery and their suggestion by a model were retired on 2026-11-22 (owner decision): each REAL has its own ideas. */
import { HttpError, id, type Env } from "./core";
import { chosenModel } from "./models";

export interface Gallery { id: string; title: string; description: string; revision: number }
export const GALLERY_DESCRIPTION_MAX = 3000;
/** The SLOP wizard needs at least one approved or published REAL. */
const ready = (gallery: {available: number}) => gallery.available > 0;
/** REAL the SLOP wizard can use: approved or published, with its original (no editorial description since 2026-11-20). Proposals
 * are written or asked for in the wizard (owner decision of 2026-11-22). */
export const GALLERY_SOURCE = "origin='REAL' AND status IN ('approved','published') AND original_key<>''";


export async function findGallery(env: Env, value: unknown): Promise<Gallery> {
  if (typeof value !== "string" || !/^[\w-]{1,64}$/.test(value)) throw new HttpError(400, "Choose a gallery");
  const gallery = await env.DB.prepare("SELECT * FROM galleries WHERE id=?").bind(value).first<Gallery>();
  if (!gallery) throw new HttpError(404, "Gallery not found");
  return gallery;
}
export async function galleryId(env: Env, value: unknown) {
  return (await findGallery(env, value)).id;
}
export async function galleries(env: Env) {
  const rows = (await env.DB.prepare(`SELECT g.*, (SELECT count(*) FROM images WHERE gallery_id=g.id AND ${GALLERY_SOURCE}) AS available
    FROM galleries g ORDER BY g.title COLLATE NOCASE,g.id`).all<Gallery & {available: number}>()).results;
  return rows.map(g => ({...g, ready: ready(g)}));
}
async function galleryPreviews(env: Env) {
  const rows = (await env.DB.prepare(`SELECT g.*,
    (SELECT count(*) FROM images WHERE gallery_id=g.id AND ${GALLERY_SOURCE}) AS available,
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
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new HttpError(400, `Invalid field: ${name}`);
  return value.trim();
}
export async function galleryRoute(env: Env, method: string, target: string, data: Record<string, unknown>) {
  if (!target && method === "GET") {
    return {galleries: await galleryPreviews(env), paid_calls: !!env.OPENAI_API_KEY, text_model: await chosenModel(env, "text_model")};
  }
  if (method === "GET" && /^[\w-]{1,64}$/.test(target)) return { ...await findGallery(env, target), paid_calls: !!env.OPENAI_API_KEY };
  if (method !== "POST" && method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const [key, action] = target.split("/");
  const editing = method === "PATCH" && key && !action;
  if (!editing && (method !== "POST" || target)) throw new HttpError(404, "Gallery API not found");
  if (Object.keys(data).some(k => !["title", "description", ...(editing ? ["revision"] : [])].includes(k)))
    throw new HttpError(400, "Unexpected fields");
  const title = field(data.title, 200, "titolo", true), description = field(data.description ?? "", GALLERY_DESCRIPTION_MAX, "descrizione");
  if (!editing) {
    const key = id();
    await env.DB.prepare("INSERT INTO galleries(id,title,description) VALUES(?,?,?)")
      .bind(key, title, description).run();
    return findGallery(env, key);
  }
  const gallery = await findGallery(env, key);
  if (data.revision !== gallery.revision) throw new HttpError(409, "Gallery changed: reload the form");
  if (title === gallery.title && description === gallery.description) return gallery;
  const updated = await env.DB.prepare(`UPDATE galleries SET title=?,description=?,revision=revision+1 WHERE id=? AND revision=?`)
    .bind(title, description, key, gallery.revision).run();
  if (!updated.meta.changes) throw new HttpError(409, "Gallery changed: reload the form");
  return findGallery(env, key);
}
