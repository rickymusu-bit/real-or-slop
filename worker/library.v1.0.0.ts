/** Image library (docs/libreria-immagini.v1.1.0.md). v1.0.0, 2026-11-09T16:30:00Z.
 * One flat collection of REAL and SLOP images, handled like a file system: add (device or Commons), edit in place,
 * approve, publish, withdraw, move to the trash, restore, delete for good. Deleting removes every row about the
 * image (cascade) and every file: no register, no snapshot (owner decision of 2026-11-09). No paid calls here. */
import { body, HttpError, id, json, type Env } from "./core";
import { browseCommonsCategory, browseCommonsSearch, commonsFile, MAX_IMAGE_BYTES } from "./commons-editorial.v1.0.0";
import { imageMime } from "../shared/image-format.v1.0.0";
import { imageGeometry } from "../shared/image-geometry.v1.0.0";
import { imageDimensions } from "../shared/image-dimensions.v1.0.0";
import { cleanImage } from "../shared/media-clean.v1.0.0";
import { GAME_COPY, gameCopyDimensions } from "../shared/game-copy.v1.0.0";
import { checkTag } from "../shared/tags.v2.0.0";

const base = "/api/admin/library";
const MAX_PIXELS = 32_000_000;
type Origin = "REAL" | "SLOP";
type Status = "new" | "approved" | "published" | "trash";
interface Row {
  id: string; origin: Origin; status: Status; trashed_from: Status | null; title: string; description: string; caption: string;
  explanation: string; source_url: string; author: string; license_name: string; license_url: string; prompt: string; model: string;
  original_key: string; original_sha256: string; original_mime: string; width: number; height: number;
  copy_key: string | null; copy_sha256: string | null; copy_width: number | null; copy_height: number | null; copy_bytes: number | null;
  rights_confirmed: number; revision: number; created_at: string; updated_at: string; approved_at: string | null;
  published_at: string | null; trashed_at: string | null;
}
const now = () => new Date().toISOString();
const sha256 = async (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2, "0")).join("");
const TEXT_FIELDS: Record<string, number> = { title: 200, description: 1000, caption: 160, explanation: 2000, source_url: 1000,
  author: 300, license_name: 200, license_url: 1000, prompt: 4000, model: 100 };

function text(value: unknown, field: string, required = false): string {
  if (value === undefined || value === null) { if (required) throw new HttpError(400, "Campo obbligatorio: " + field); return ""; }
  if (typeof value !== "string") throw new HttpError(400, "Campo non valido: " + field);
  // Control characters out, except tab and line breaks.
  const clean = [...value.normalize("NFC")].filter(ch => { const c = ch.charCodeAt(0); return c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127); }).join("").trim();
  if (clean.length > TEXT_FIELDS[field]) throw new HttpError(400, `Campo «${field}» oltre ${TEXT_FIELDS[field]} caratteri`);
  if (required && !clean) throw new HttpError(400, "Campo obbligatorio: " + field);
  if ((field === "source_url" || field === "license_url") && clean && !/^https:\/\/[^\s]+$/.test(clean))
    throw new HttpError(400, "Indirizzo HTTPS richiesto: " + field);
  return clean;
}
function origin(value: unknown): Origin {
  if (value !== "REAL" && value !== "SLOP") throw new HttpError(400, "Origine REAL o SLOP richiesta");
  return value;
}
function imageId(value: string): string {
  if (!/^[\w-]{1,64}$/.test(value)) throw new HttpError(400, "Immagine non valida");
  return value;
}
async function find(env: Env, imageIdValue: string): Promise<Row> {
  const row = await env.DB.prepare("SELECT * FROM images WHERE id=?").bind(imageIdValue).first<Row>();
  if (!row) throw new HttpError(404, "Immagine non trovata");
  return row;
}
async function tagsOf(env: Env, ids: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const rows = await env.DB.prepare(`SELECT it.image_id,t.label FROM image_tags it JOIN tags t ON t.id=it.tag_id
      WHERE it.image_id IN (${chunk.map(() => "?").join(",")}) ORDER BY t.label`).bind(...chunk).all<{ image_id: string; label: string }>();
    for (const row of rows.results) out.set(row.image_id, [...(out.get(row.image_id) || []), row.label]);
  }
  return out;
}
function view(row: Row, tags: string[]) {
  const v = row.copy_sha256 ? row.copy_sha256.slice(0, 12) : row.original_sha256.slice(0, 12);
  return {
    id: row.id, origin: row.origin, status: row.status, trashed_from: row.trashed_from, title: row.title,
    description: row.description, caption: row.caption, explanation: row.explanation, source_url: row.source_url,
    author: row.author, license_name: row.license_name, license_url: row.license_url, prompt: row.prompt, model: row.model,
    width: row.width, height: row.height, original_mime: row.original_mime, original_sha256: row.original_sha256,
    copy: row.copy_key ? { sha256: row.copy_sha256, width: row.copy_width, height: row.copy_height, bytes: row.copy_bytes } : null,
    rights_confirmed: row.rights_confirmed === 1, revision: row.revision, tags,
    created_at: row.created_at, updated_at: row.updated_at, approved_at: row.approved_at, published_at: row.published_at,
    trashed_at: row.trashed_at,
    file: `${base}/${row.id}/file?v=${v}`, original: `${base}/${row.id}/original`,
  };
}
async function viewOf(env: Env, imageIdValue: string) {
  const row = await find(env, imageIdValue);
  return view(row, (await tagsOf(env, [row.id])).get(row.id) || []);
}
function labels(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 40) throw new HttpError(400, "Elenco di tag non valido (massimo 40)");
  const out = new Set<string>();
  for (const item of value) {
    const checked = checkTag(item);
    if (!checked.ok) throw new HttpError(400, "«" + String(item).slice(0, 60) + "»: " + checked.reason + (checked.suggestion ? ". Prova «" + checked.suggestion + "»" : ""));
    out.add(checked.tag);
  }
  return [...out];
}
/** Statements that make the image's tags exactly `wanted`; tags rows are created on first use. */
function tagStatements(env: Env, imageIdValue: string, wanted: string[], guard: { sql: string; values: unknown[] }) {
  const stamp = now();
  return [
    ...wanted.map(label => env.DB.prepare(`INSERT INTO tags(id,label,created_at) SELECT ?,?,? WHERE ${guard.sql}
      ON CONFLICT(label) DO NOTHING`).bind(id(), label, stamp, ...guard.values)),
    env.DB.prepare(`DELETE FROM image_tags WHERE image_id=? AND tag_id NOT IN (SELECT id FROM tags WHERE label IN (SELECT value FROM json_each(?)))
      AND ${guard.sql}`).bind(imageIdValue, JSON.stringify(wanted), ...guard.values),
    env.DB.prepare(`INSERT OR IGNORE INTO image_tags(image_id,tag_id) SELECT ?,id FROM tags WHERE label IN (SELECT value FROM json_each(?))
      AND ${guard.sql}`).bind(imageIdValue, JSON.stringify(wanted), ...guard.values),
  ];
}

/** Adds a new image to the library. The original goes to quarantine; the browser then uploads its game copy. */
async function create(env: Env, input: { origin: Origin; title: string; description?: string; bytes: ArrayBuffer;
  source_url?: string; author?: string; license_name?: string; license_url?: string; prompt?: string; model?: string }) {
  if (!env.QUARANTINE) throw new HttpError(503, "Quarantena privata non configurata");
  const bytes = new Uint8Array(input.bytes);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new HttpError(413, "File vuoto o oltre 12 MB");
  const mime = imageMime(bytes);
  if (!mime) throw new HttpError(415, "Usare JPEG, PNG o WebP");
  let geometry;
  try { geometry = imageGeometry(bytes); } catch { throw new HttpError(415, "Immagine non leggibile"); }
  const width = geometry.width ?? geometry.encoded_width, height = geometry.height ?? geometry.encoded_height;
  if (width * height > MAX_PIXELS) throw new HttpError(413, "Immagine oltre 32 megapixel");
  const hash = await sha256(bytes);
  const twin = await env.DB.prepare("SELECT id,status,title FROM images WHERE original_sha256=?").bind(hash).first<{ id: string; status: string; title: string }>();
  if (twin) throw new HttpError(409, twin.status === "trash" ? `È già nel cestino come «${twin.title}»: ripristinala` : `È già nella libreria come «${twin.title}»`);
  const imageIdValue = id(), key = `library/${imageIdValue}/original`, stamp = now();
  await env.QUARANTINE.put(key, bytes, { httpMetadata: { contentType: mime }, customMetadata: { sha256: hash } });
  try {
    await env.DB.prepare(`INSERT INTO images(id,origin,title,description,source_url,author,license_name,license_url,prompt,model,
      original_key,original_sha256,original_mime,width,height,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(imageIdValue, input.origin, text(input.title, "title", true), text(input.description, "description"),
        text(input.source_url, "source_url"), text(input.author, "author"), text(input.license_name, "license_name"),
        text(input.license_url, "license_url"), text(input.prompt, "prompt"), text(input.model, "model"),
        key, hash, mime, width, height, stamp, stamp).run();
  } catch (error) {
    await env.QUARANTINE.delete(key);
    if (error instanceof HttpError) throw error;
    throw new HttpError(409, "Immagine già presente o caricamento concorrente");
  }
  return viewOf(env, imageIdValue);
}

/** Stores the WebP game copy made in the owner's browser from the original (docs/copie-di-gioco.v2.0.0.md). */
async function storeCopy(request: Request, env: Env, row: Row) {
  if (!env.QUARANTINE) throw new HttpError(503, "Quarantena privata non configurata");
  if (row.copy_key) return json({ ...(await viewOf(env, row.id)), already_prepared: true });
  if (row.status !== "new") throw new HttpError(409, "Copia di gioco solo per immagini nuove");
  if (Number(request.headers.get("content-length") || 0) > GAME_COPY.maxBytes) throw new HttpError(413, "Copia di gioco oltre 4 MB");
  const upload = new Uint8Array(await request.arrayBuffer());
  if (!upload.length || upload.length > GAME_COPY.maxBytes) throw new HttpError(413, "Copia di gioco vuota o oltre 4 MB");
  let copy;
  try { copy = cleanImage(upload); } catch { throw new HttpError(415, "Copia di gioco non leggibile"); }
  if (copy.mime !== GAME_COPY.mime) throw new HttpError(415, "La copia di gioco deve essere WebP");
  const expected = gameCopyDimensions(row.width, row.height), actual = imageDimensions(copy.bytes);
  if (actual.width !== expected.width || actual.height !== expected.height)
    throw new HttpError(409, `Dimensioni della copia ${actual.width}×${actual.height}, attese ${expected.width}×${expected.height}`);
  const hash = await sha256(copy.bytes), key = `library/${row.id}/copy-${hash.slice(0, 16)}.webp`;
  await env.QUARANTINE.put(key, copy.bytes, { httpMetadata: { contentType: GAME_COPY.mime }, customMetadata: { sha256: hash } });
  const result = await env.DB.prepare(`UPDATE images SET copy_key=?,copy_sha256=?,copy_width=?,copy_height=?,copy_bytes=?,
    revision=revision+1,updated_at=? WHERE id=? AND copy_key IS NULL AND status='new'`)
    .bind(key, hash, actual.width, actual.height, copy.bytes.length, now(), row.id).run();
  if (!result.meta.changes) { await env.QUARANTINE.delete(key); return json({ ...(await viewOf(env, row.id)), already_prepared: true }); }
  return json({ ...(await viewOf(env, row.id)), already_prepared: false }, 201);
}

async function edit(env: Env, row: Row, data: Record<string, unknown>) {
  const allowed = ["revision", "tags", ...Object.keys(TEXT_FIELDS)];
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new HttpError(400, "Campi non previsti");
  if (data.revision !== row.revision) throw new HttpError(409, "Immagine modificata altrove: ricaricare");
  if (row.status === "published") throw new HttpError(409, "Immagine pubblicata: ritirala dal gioco per modificarla");
  if (row.status === "trash") throw new HttpError(409, "Immagine nel cestino: ripristinala per modificarla");
  const fields = Object.keys(TEXT_FIELDS).filter(key => key in data);
  const values = fields.map(key => text(data[key], key, key === "title"));
  const wanted = data.tags === undefined ? null : labels(data.tags);
  // Approval covers what the player sees: any change brings the image back to «new».
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE images SET ${fields.map(key => key + "=?").join(",")}${fields.length ? "," : ""}
      status='new',approved_at=NULL,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status IN ('new','approved')`)
      .bind(...values, now(), row.id, row.revision),
    ...(wanted ? tagStatements(env, row.id, wanted, { sql: "EXISTS(SELECT 1 FROM images WHERE id=? AND revision=?)", values: [row.id, row.revision + 1] }) : []),
  ]);
  if (!result[0].meta.changes) throw new HttpError(409, "Immagine modificata altrove: ricaricare");
  return viewOf(env, row.id);
}

/** State changes. Each is guarded by the current status, so repeated or concurrent requests are harmless. */
async function transition(env: Env, row: Row, action: string, data: Record<string, unknown>) {
  const stamp = now();
  if (action === "approve") {
    if (row.status !== "new") throw new HttpError(409, "Si approvano solo immagini nuove");
    if (!row.copy_key) throw new HttpError(409, "Prepara prima la copia di gioco: si approva ciò che vedrà il giocatore");
    if (!((await tagsOf(env, [row.id])).get(row.id) || []).length) throw new HttpError(409, "Aggiungi almeno un tag");
    if (row.origin === "REAL" && data.rights_confirmed !== true && row.rights_confirmed !== 1)
      throw new HttpError(409, "Conferma di aver verificato diritti e licenza della foto");
    const result = await env.DB.prepare(`UPDATE images SET status='approved',approved_at=?,rights_confirmed=CASE WHEN origin='REAL' THEN 1 ELSE rights_confirmed END,
      revision=revision+1,updated_at=? WHERE id=? AND status='new' AND copy_key IS NOT NULL
      AND EXISTS(SELECT 1 FROM image_tags WHERE image_id=images.id)`).bind(stamp, stamp, row.id).run();
    if (!result.meta.changes) throw new HttpError(409, "Immagine cambiata: ricaricare");
  } else if (action === "publish") {
    if (row.status === "published") return;
    if (row.status !== "approved" || !row.copy_key) throw new HttpError(409, "Si pubblicano solo immagini approvate");
    if (!env.QUARANTINE || !env.IMAGES) throw new HttpError(503, "Storage non configurato");
    const file = await env.QUARANTINE.get(row.copy_key);
    if (!file) throw new HttpError(409, "Copia di gioco mancante");
    await env.IMAGES.put(row.copy_key, await file.arrayBuffer(), { httpMetadata: { contentType: GAME_COPY.mime } });
    await env.DB.prepare("UPDATE images SET status='published',published_at=?,revision=revision+1,updated_at=? WHERE id=? AND status='approved'")
      .bind(stamp, stamp, row.id).run();
  } else if (action === "withdraw") {
    if (row.status !== "published") throw new HttpError(409, "L'immagine non è pubblicata");
    await env.DB.prepare("UPDATE images SET status='approved',published_at=NULL,revision=revision+1,updated_at=? WHERE id=? AND status='published'")
      .bind(stamp, row.id).run();
    if (row.copy_key) await env.IMAGES?.delete(row.copy_key);
  } else if (action === "trash") {
    if (row.status === "trash") return;
    if (row.status === "published") throw new HttpError(409, "Ritira prima l'immagine dal gioco");
    await env.DB.prepare("UPDATE images SET status='trash',trashed_from=status,trashed_at=?,revision=revision+1,updated_at=? WHERE id=? AND status IN ('new','approved')")
      .bind(stamp, stamp, row.id).run();
  } else if (action === "restore") {
    if (row.status !== "trash") return;
    await env.DB.prepare("UPDATE images SET status=trashed_from,trashed_from=NULL,trashed_at=NULL,revision=revision+1,updated_at=? WHERE id=? AND status='trash'")
      .bind(stamp, row.id).run();
  } else throw new HttpError(404, "Azione inesistente");
}

/** Deletes trashed images for good: every row (cascade) and every file. */
async function destroy(env: Env, ids: readonly string[]): Promise<number> {
  if (!ids.length) return 0;
  const rows = (await env.DB.prepare(`SELECT id,original_key,copy_key FROM images WHERE status='trash'
    AND id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(ids)).all<{ id: string; original_key: string; copy_key: string | null }>()).results;
  if (!rows.length) return 0;
  await env.DB.prepare("DELETE FROM images WHERE status='trash' AND id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(rows.map(r => r.id))).run();
  const keys = rows.flatMap(r => [r.original_key, ...(r.copy_key ? [r.copy_key] : [])]);
  for (let i = 0; i < keys.length; i += 1000) await env.QUARANTINE?.delete(keys.slice(i, i + 1000));
  const copies = rows.flatMap(r => r.copy_key ? [r.copy_key] : []);
  for (let i = 0; i < copies.length; i += 1000) await env.IMAGES?.delete(copies.slice(i, i + 1000));
  return rows.length;
}

async function list(env: Env, url: URL) {
  const status = url.searchParams.get("status") || "library", originFilter = url.searchParams.get("origin") || "all";
  const tag = url.searchParams.get("tag") || "", q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  if (!["library", "new", "approved", "published", "trash"].includes(status) || !["all", "REAL", "SLOP"].includes(originFilter))
    throw new HttpError(400, "Filtro non valido");
  const where = [status === "library" ? "status<>'trash'" : "status=?1", "(?2='all' OR origin=?2)",
    "(?3='' OR id IN (SELECT it.image_id FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE t.label=?3))",
    "(?4='' OR title LIKE '%'||?4||'%' COLLATE NOCASE)"].join(" AND ");
  const rows = (await env.DB.prepare(`SELECT * FROM images WHERE ${where} ORDER BY updated_at DESC,id LIMIT 500`)
    .bind(status, originFilter, tag, q).all<Row>()).results;
  const tags = await tagsOf(env, rows.map(r => r.id));
  const counts = (await env.DB.prepare("SELECT status,origin,count(*) AS n FROM images GROUP BY status,origin").all<{ status: string; origin: string; n: number }>()).results;
  return json({ items: rows.map(r => view(r, tags.get(r.id) || [])), counts });
}

export async function library(request: Request, env: Env, path: string): Promise<Response> {
  const url = new URL(request.url);
  if (path === base && request.method === "GET") return list(env, url);
  if (path === base + "/tags" && request.method === "GET")
    return json({ tags: (await env.DB.prepare(`SELECT t.label,count(it.image_id) AS images FROM tags t LEFT JOIN image_tags it ON it.tag_id=t.id
      GROUP BY t.id ORDER BY t.label`).all()).results });
  if (path === base + "/upload" && request.method === "POST") {
    const params = url.searchParams;
    return json(await create(env, { origin: origin(params.get("origin")), title: params.get("title") || "", bytes: await request.arrayBuffer(),
      description: params.get("description") || "", prompt: params.get("prompt") || "", model: params.get("model") || "" }), 201);
  }
  if (path === base + "/commons" && request.method === "POST") {
    const data = await body(request, 2000);
    if (Object.keys(data).some(key => key !== "url") || typeof data.url !== "string") throw new HttpError(400, "Link Commons richiesto");
    const file = await commonsFile(data.url);
    return json(await create(env, { origin: "REAL", bytes: file.bytes, title: file.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").slice(0, 200),
      description: file.description.slice(0, 1000), source_url: file.source_url, author: file.author.slice(0, 300),
      license_name: file.license_name, license_url: /^https:\/\//.test(file.license_url) ? file.license_url : "" }), 201);
  }
  if (path === base + "/commons/search" && request.method === "GET")
    return json(await browseCommonsSearch(url.searchParams.get("q") || "", url.searchParams.get("offset") || "", url.searchParams.get("sort") || "relevance"));
  if (path === base + "/commons/category" && request.method === "GET")
    return json(await browseCommonsCategory(url.searchParams.get("name") || "", url.searchParams.get("cont") || ""));
  if (path === base + "/trash/empty" && request.method === "POST") {
    const ids = (await env.DB.prepare("SELECT id FROM images WHERE status='trash'").all<{ id: string }>()).results.map(r => r.id);
    return json({ deleted: await destroy(env, ids) });
  }
  if (path === base + "/bulk" && request.method === "POST") {
    const data = await body(request, 40_000);
    const ids = Array.isArray(data.ids) ? [...new Set(data.ids.map(String))].map(imageId) : [];
    if (!ids.length || ids.length > 500) throw new HttpError(400, "Selezione vuota o oltre 500 immagini");
    const action = String(data.action);
    if (action === "delete") return json({ deleted: await destroy(env, ids) });
    const done: string[] = [], failed: { id: string; error: string }[] = [];
    for (const target of ids) {
      try {
        const row = await find(env, target);
        if (action === "tag-add" || action === "tag-remove") {
          const current = (await tagsOf(env, [row.id])).get(row.id) || [], change = labels(data.tags);
          const wanted = action === "tag-add" ? [...new Set([...current, ...change])] : current.filter(t => !change.includes(t));
          await edit(env, row, { revision: row.revision, tags: wanted });
        } else await transition(env, row, action, data);
        done.push(target);
      } catch (error) { failed.push({ id: target, error: error instanceof HttpError ? error.message : "Errore" }); }
    }
    return json({ done: done.length, failed });
  }
  const match = path.match(/^\/api\/admin\/library\/([\w-]{1,64})(?:\/(file|original|copy|approve|publish|withdraw|trash|restore))?$/);
  if (!match) throw new HttpError(404, "API della libreria inesistente");
  const row = await find(env, match[1]);
  if (match[2] === "file" || match[2] === "original") {
    if (request.method !== "GET") throw new HttpError(405, "Metodo non consentito");
    const key = match[2] === "file" && row.copy_key ? row.copy_key : row.original_key;
    const file = await env.QUARANTINE?.get(key);
    if (!file) throw new HttpError(404, "File non disponibile");
    return new Response(file.body, { headers: { "Content-Type": file.httpMetadata?.contentType || "image/webp", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (match[2] === "copy") {
    if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
    return storeCopy(request, env, row);
  }
  if (match[2]) {
    if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
    await transition(env, row, match[2], await body(request, 1000));
    return json(await viewOf(env, row.id));
  }
  if (request.method === "GET") return json(await viewOf(env, row.id));
  if (request.method === "PATCH") return json(await edit(env, row, await body(request, 20_000)));
  if (request.method === "DELETE") {
    if (row.status !== "trash") throw new HttpError(409, "Si elimina definitivamente solo dal cestino");
    return json({ deleted: await destroy(env, [row.id]) });
  }
  throw new HttpError(405, "Metodo non consentito");
}
