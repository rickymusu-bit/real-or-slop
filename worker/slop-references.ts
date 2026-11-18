/** Private REAL allocation and catalogue counts. Snapshot metrics keep copies independent of the reference. */
import { HttpError, type Env } from "./core";
import { type Tag, type InspirationItem } from "../shared/slop-proposals";
import type { Category } from "../shared/tag-categories";

const DONE = "status IN ('approved','published')";
/** Independent SLOP catalogue and anonymous editorial inputs. */


export interface RealRow { revision: number; id: string; title: string; description: string; tags: Tag[]; measured: boolean; described: boolean; created_at: string; available: boolean }
/** Library REAL with their tags, oldest first. Explicit batch selections can also use prepared new photos. */
export async function realRows(env: Env, includeNew = false): Promise<RealRow[]> {
  const rows = (await env.DB.prepare(`SELECT i.id,i.title,i.description,i.created_at,i.revision,NOT EXISTS(SELECT 1 FROM slop_reference_uses u WHERE u.source_id=i.id) AS available,i.real_description IS NOT NULL AS described,i.copy_metrics IS NOT NULL AS measured,
    (SELECT json_group_array(json_object('label',t.label,'category',t.category)) FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=i.id) AS tags
    FROM images i WHERE i.origin='REAL' AND (i.${DONE} OR (?=1 AND i.status='new')) ORDER BY i.created_at,i.id`).bind(Number(includeNew))
    .all<{ revision: number; id: string; title: string; description: string; created_at: string; measured: number; described: number; available: number; tags: string }>()).results;
  return rows.map(r => ({ revision: r.revision, id: r.id, title: r.title, description: r.description, created_at: r.created_at, measured: !!r.measured, described: !!r.described, available: !!r.available,
    tags: (JSON.parse(r.tags) as Tag[]).sort((a, b) => a.label.localeCompare(b.label)) }));
}
/** Independent SLOP catalogue and anonymous editorial inputs. */
export async function catalogCounts(env: Env) {
  const row = await env.DB.prepare(`SELECT
    coalesce(sum(origin='REAL' AND status IN ('approved','published')),0) AS real,
    coalesce(sum(origin='SLOP' AND status IN ('approved','published')),0) AS slop,
    coalesce(sum(origin='SLOP' AND status='new'),0) AS pending,
    coalesce(sum(origin='REAL' AND status IN ('approved','published') AND real_description IS NOT NULL
      AND EXISTS(SELECT 1 FROM image_tags WHERE image_id=images.id) AND NOT EXISTS(SELECT 1 FROM slop_reference_uses u WHERE u.source_id=images.id)),0) AS available
    FROM images`).first<{ real: number; slop: number; pending: number; available: number }>();
  return row || { real: 0, slop: 0, pending: 0, available: 0 };
}
export const readyReference = (row: RealRow) => row.available && row.described && row.tags.length > 0;

/** Preserves the chosen order. Studio drafts retain the approved/published requirement. */
export async function inspirationItems(env: Env, ids: readonly string[], reviewed = false): Promise<InspirationItem[]> {
  const all = await realRows(env, reviewed), byId = new Map(all.map(r => [r.id, r]));
  return ids.map(sourceId => {
    const source = byId.get(sourceId);
    if (!source?.available || (reviewed && !readyReference(source)))
      throw new HttpError(409, "Una REAL scelta è occupata o non ha più tag e descrizione editoriale disponibili");
    return { source: source.id, title: source.title, tags: source.tags };
  });
}
/** Tags by category, as the text model reads them. */
export const byCategory = (tags: readonly Tag[]) => {
  const out: Partial<Record<Category, string[]>> = {};
  for (const t of tags) (out[t.category] ||= []).push(t.label);
  return out;
};

