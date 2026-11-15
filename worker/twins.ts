/** Editorial REAL references, proposal counts and compatibility items. Treatment follows the source REAL only. */
import { HttpError, type Env } from "./core";
import { type Tag, type TwinItem } from "../shared/twins";
import type { Category } from "../shared/tag-categories";

const DONE = "status IN ('approved','published')";
/** A twin that counts: new, approved or published. In the trash it frees its REAL. */
const LIVE_TWIN = "EXISTS(SELECT 1 FROM images s WHERE s.generation_source=i.id AND s.origin='SLOP' AND s.status IN ('new','approved','published'))";

export interface RealRow { id: string; title: string; description: string; tags: Tag[]; measured: boolean; described: boolean; twin: boolean; created_at: string }
/** Approved and published REAL with their tags, oldest first. */
export async function realRows(env: Env): Promise<RealRow[]> {
  const rows = (await env.DB.prepare(`SELECT i.id,i.title,i.description,i.created_at,i.real_description IS NOT NULL AS described,i.copy_metrics IS NOT NULL AS measured,${LIVE_TWIN} AS twin,
    (SELECT json_group_array(json_object('label',t.label,'category',t.category)) FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=i.id) AS tags
    FROM images i WHERE i.origin='REAL' AND i.${DONE} ORDER BY i.created_at,i.id`)
    .all<{ id: string; title: string; description: string; created_at: string; measured: number; described: number; twin: number; tags: string }>()).results;
  return rows.map(r => ({ id: r.id, title: r.title, description: r.description, created_at: r.created_at, measured: !!r.measured, described: !!r.described, twin: !!r.twin,
    tags: (JSON.parse(r.tags) as Tag[]).sort((a, b) => a.label.localeCompare(b.label)) }));
}
/** Counts of the proposal: REAL, REAL whose twin is approved or published, REAL with no live twin. */
export async function twinCounts(env: Env) {
  const row = await env.DB.prepare(`SELECT count(*) AS real,
    coalesce(sum(EXISTS(SELECT 1 FROM images s WHERE s.generation_source=i.id AND s.origin='SLOP' AND s.${DONE})),0) AS twinned,
    coalesce(sum(NOT ${LIVE_TWIN}),0) AS waiting FROM images i WHERE i.origin='REAL' AND i.${DONE}`).first<{ real: number; twinned: number; waiting: number }>();
  return row || { real: 0, twinned: 0, waiting: 0 };
}
/** The items of a batch for the given REAL, in that order: each must be approved or published and without a live twin. */
export async function twinItems(env: Env, ids: readonly string[], random: () => number = Math.random): Promise<TwinItem[]> {
  void random;
  const all = await realRows(env), byId = new Map(all.map(r => [r.id, r]));
  return ids.map(sourceId => {
    const source = byId.get(sourceId);
    if (!source) throw new HttpError(409, "Una REAL scelta non è più approvata o pubblicata");
    if (source.twin) throw new HttpError(409, `«${source.title.slice(0, 60)}» ha già una SLOP gemella`);
    return { source: source.id, sample: source.measured ? source.id : null, title: source.title, tags: source.tags };
  });
}
/** Tags by category, as the text model reads them. */
export const byCategory = (tags: readonly Tag[]) => {
  const out: Partial<Record<Category, string[]>> = {};
  for (const t of tags) (out[t.category] ||= []).push(t.label);
  return out;
};
