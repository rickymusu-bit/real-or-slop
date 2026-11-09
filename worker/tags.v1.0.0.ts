/** Per-photo tags, docs/lotti-editoriali.v1.5.0.md (manual only, no paid calls). v1.0.0, 2026-11-09T05:00:00Z.
 * No model calls. Tags belong to the photo (inbox id) and survive approval, admission and publication.
 * Every assignment or removal is an append-only event; `untagged` is derived, never stored. */
import { body, HttpError, id, json, type Env } from "./core";
import { checkTag, UNTAGGED } from "../shared/tags.v1.0.0";

const MAX_CHANGES = 30, MAX_TAGS_PER_PHOTO = 40;
const now = () => new Date().toISOString();
const PUBLISHED = "EXISTS(SELECT 1 FROM editorial_cycle_admissions a JOIN published_images p ON p.image_id=a.image_id WHERE a.inbox_id=q.id)";
/** SQL predicate on alias q (an inbox row): the photo has at least one active tag. */
export const TAGGED = "EXISTS(SELECT 1 FROM editorial_image_tags it JOIN editorial_tags t ON t.id=it.tag_id AND t.retired_at IS NULL WHERE it.inbox_id=q.id)";

export async function tagsFor(env: Env, inboxIds: readonly string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (let i = 0; i < inboxIds.length; i += 50) {
    const chunk = inboxIds.slice(i, i + 50);
    if (!chunk.length) break;
    const rows = await env.DB.prepare(`SELECT it.inbox_id,t.label FROM editorial_image_tags it JOIN editorial_tags t ON t.id=it.tag_id
      AND t.retired_at IS NULL WHERE it.inbox_id IN (${chunk.map(() => "?").join(",")}) ORDER BY t.label`).bind(...chunk).all<{ inbox_id: string; label: string }>();
    for (const row of rows.results) result.set(row.inbox_id, [...(result.get(row.inbox_id) || []), row.label]);
  }
  return result;
}
export async function hasTags(env: Env, inboxId: string): Promise<boolean> {
  return Boolean(await env.DB.prepare(`SELECT 1 FROM editorial_image_tags it JOIN editorial_tags t ON t.id=it.tag_id AND t.retired_at IS NULL
    WHERE it.inbox_id=? LIMIT 1`).bind(inboxId).first());
}
function labels(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CHANGES) throw new HttpError(400, "Elenco «" + field + "» non valido (massimo " + MAX_CHANGES + " tag)");
  const unique = new Set<string>();
  for (const item of value) {
    const checked = checkTag(item);
    if (!checked.ok) throw new HttpError(400, "«" + String(item).slice(0, 60) + "»: " + checked.reason + (checked.suggestion ? ". Prova «" + checked.suggestion + "»" : ""));
    unique.add(checked.tag);
  }
  return [...unique];
}
/** Active tag id for a label, created on first use by the owner. A concurrent creation of the same label is reused. */
async function ensureTag(env: Env, label: string): Promise<string> {
  const find = () => env.DB.prepare("SELECT id FROM editorial_tags WHERE label=? AND retired_at IS NULL").bind(label).first<{ id: string }>();
  const existing = await find();
  if (existing) return existing.id;
  try {
    await env.DB.prepare("INSERT INTO editorial_tags(id,label,source,created_at) VALUES(?,?,'owner',?)").bind(id(), label, now()).run();
  } catch { /* a concurrent request created it first */ }
  const created = await find();
  if (!created) throw new HttpError(409, "Tag non registrato: riprovare");
  return created.id;
}

/** GET/POST /api/admin/review-inbox/:id/tags. */
export async function photoTags(request: Request, env: Env, row: { id: string; sha256: string; status: string }): Promise<Response> {
  if (request.method === "GET") return json({ id: row.id, tags: (await tagsFor(env, [row.id])).get(row.id) || [] });
  if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
  const data = await body(request, 6000);
  if (Object.keys(data).some(key => !["add", "remove"].includes(key))) throw new HttpError(400, "Campi dei tag non previsti");
  const add = labels(data.add, "add"), remove = labels(data.remove, "remove");
  if (!add.length && !remove.length) throw new HttpError(400, "Nessun tag da aggiungere o togliere");
  if (add.some(label => remove.includes(label))) throw new HttpError(400, "Lo stesso tag non può essere aggiunto e tolto insieme");
  const current = (await tagsFor(env, [row.id])).get(row.id) || [];
  if (new Set([...current, ...add].filter(label => !remove.includes(label))).size > MAX_TAGS_PER_PHOTO)
    throw new HttpError(400, "Massimo " + MAX_TAGS_PER_PHOTO + " tag per foto");
  const stamp = now(), statements: D1PreparedStatement[] = [];
  for (const label of add) {
    const tagId = await ensureTag(env, label);
    statements.push(
      env.DB.prepare(`INSERT INTO editorial_image_tag_events(id,inbox_id,tag_id,action,image_sha256,source,created_at)
        SELECT ?,?,?,'add',?,'owner',? WHERE NOT EXISTS(SELECT 1 FROM editorial_image_tags WHERE inbox_id=? AND tag_id=?)`)
        .bind(id(), row.id, tagId, row.sha256, stamp, row.id, tagId),
      env.DB.prepare("INSERT OR IGNORE INTO editorial_image_tags(inbox_id,tag_id,source,added_at) VALUES(?,?,'owner',?)").bind(row.id, tagId, stamp));
  }
  for (const label of remove) {
    const tag = await env.DB.prepare("SELECT id FROM editorial_tags WHERE label=? AND retired_at IS NULL").bind(label).first<{ id: string }>();
    if (!tag) continue;
    statements.push(
      env.DB.prepare(`INSERT INTO editorial_image_tag_events(id,inbox_id,tag_id,action,image_sha256,source,created_at)
        SELECT ?,?,?,'remove',?,'owner',? WHERE EXISTS(SELECT 1 FROM editorial_image_tags WHERE inbox_id=? AND tag_id=?)`)
        .bind(id(), row.id, tag.id, row.sha256, stamp, row.id, tag.id),
      env.DB.prepare("DELETE FROM editorial_image_tags WHERE inbox_id=? AND tag_id=?").bind(row.id, tag.id));
  }
  if (statements.length) await env.DB.batch(statements);
  const tags = (await tagsFor(env, [row.id])).get(row.id) || [];
  return json({ id: row.id, tags, untagged: !tags.length });
}

/** /api/admin/tags: vocabulary, creation, removal impact and removal. */
export async function tagsAdmin(request: Request, env: Env, path: string): Promise<Response> {
  if (path === "/api/admin/tags" && request.method === "GET") {
    const rows = await env.DB.prepare(`SELECT t.id,t.label,t.source,t.created_at,count(q.id) AS photos FROM editorial_tags t
      LEFT JOIN editorial_image_tags it ON it.tag_id=t.id LEFT JOIN editorial_review_inbox q ON q.id=it.inbox_id
      WHERE t.retired_at IS NULL GROUP BY t.id ORDER BY t.label`).all();
    const untagged = await env.DB.prepare(`SELECT count(*) AS photos,coalesce(sum(${PUBLISHED}),0) AS published FROM editorial_review_inbox q
      WHERE q.status<>'rejected' AND NOT ${TAGGED}`).first<{ photos: number; published: number }>();
    return json({ tags: rows.results, placeholder: UNTAGGED, untagged: { photos: untagged?.photos || 0, published: untagged?.published || 0 } });
  }
  if (path === "/api/admin/tags" && request.method === "POST") {
    const data = await body(request, 500);
    if (Object.keys(data).some(key => key !== "label")) throw new HttpError(400, "Campi del tag non previsti");
    const [label] = labels([data.label], "label");
    const existed = Boolean(await env.DB.prepare("SELECT 1 FROM editorial_tags WHERE label=? AND retired_at IS NULL").bind(label).first());
    const tagId = await ensureTag(env, label);
    return json({ id: tagId, label, created: !existed }, existed ? 200 : 201);
  }
  const match = path.match(/^\/api\/admin\/tags\/([\w-]{1,64})\/(impact|retire)$/);
  if (!match) throw new HttpError(404, "API dei tag inesistente");
  const tag = await env.DB.prepare("SELECT id,label FROM editorial_tags WHERE id=? AND retired_at IS NULL").bind(match[1]).first<{ id: string; label: string }>();
  if (!tag) throw new HttpError(404, "Tag non trovato o già rimosso");
  const impact = async () => {
    const counts = await env.DB.prepare(`SELECT count(*) AS photos,
      coalesce(sum(q.status<>'rejected' AND NOT EXISTS(SELECT 1 FROM editorial_image_tags o JOIN editorial_tags ot ON ot.id=o.tag_id AND ot.retired_at IS NULL
        WHERE o.inbox_id=q.id AND o.tag_id<>?) AND ${PUBLISHED}),0) AS untagged_published,
      coalesce(sum(q.status<>'rejected' AND NOT EXISTS(SELECT 1 FROM editorial_image_tags o JOIN editorial_tags ot ON ot.id=o.tag_id AND ot.retired_at IS NULL
        WHERE o.inbox_id=q.id AND o.tag_id<>?) AND NOT ${PUBLISHED}),0) AS untagged_unpublished
      FROM editorial_image_tags it JOIN editorial_review_inbox q ON q.id=it.inbox_id WHERE it.tag_id=?`)
      .bind(tag.id, tag.id, tag.id).first<{ photos: number; untagged_published: number; untagged_unpublished: number }>();
    return { id: tag.id, label: tag.label, photos: counts?.photos || 0, untagged_published: counts?.untagged_published || 0,
      untagged_unpublished: counts?.untagged_unpublished || 0 };
  };
  if (match[2] === "impact" && request.method === "GET") return json(await impact());
  if (match[2] !== "retire" || request.method !== "POST") throw new HttpError(405, "Metodo non consentito");
  const data = await body(request, 500);
  if (Object.keys(data).some(key => !["label", "expected_photos"].includes(key)) || data.label !== tag.label || !Number.isSafeInteger(data.expected_photos))
    throw new HttpError(400, "Confermare il tag da rimuovere e il numero di foto coinvolte");
  const before = await impact();
  if (before.photos !== data.expected_photos) throw new HttpError(409, "Le foto con questo tag sono cambiate: ricontrollare l'impatto");
  const stamp = now();
  // Removal events for every photo, then current rows, then the vocabulary entry: one atomic batch.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO editorial_image_tag_events(id,inbox_id,tag_id,action,image_sha256,source,created_at)
      SELECT lower(hex(randomblob(16))),it.inbox_id,it.tag_id,'remove',q.sha256,'retirement',? FROM editorial_image_tags it
      LEFT JOIN editorial_review_inbox q ON q.id=it.inbox_id WHERE it.tag_id=?`).bind(stamp, tag.id),
    env.DB.prepare("DELETE FROM editorial_image_tags WHERE tag_id=?").bind(tag.id),
    env.DB.prepare("UPDATE editorial_tags SET retired_at=? WHERE id=? AND retired_at IS NULL").bind(stamp, tag.id),
  ]);
  return json({ ...before, retired: true });
}
