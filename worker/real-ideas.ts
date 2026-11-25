/** Proposals (ideas of falsification) of a REAL, written and chosen in the SLOP wizard (owner decisions of 2026-11-21 and 2026-11-22,
 * specification `generazione-slop`, section 2): the owner writes one, or a model proposes up to three in one confirmed paid call,
 * never repeated automatically. They stay with the REAL; choosing one in the wizard approves it, and each yields at most one SLOP. */
import { HttpError, id, type Env } from "./core";
import { IMAGE_MARK, jsonWithImage } from "./image-body";
import { currentContext } from "./model-context";
import { chosenModel } from "./models";
import { paid, responseJson } from "./paid";
import { latestMeasures } from "./real-measure";
import { imageMime } from "../shared/image-format";

export const MAX_IDEAS = 3;
const LIMITS = { idea: 600, genre: 160, changes: 400 } as const;
const MAX_OUTPUT_TOKENS = 8000;
const RULES = `Return JSON matching the schema. Propose at most the requested number of distinct ideas, using existing ideas as context. For each, write idea (one or two sentences describing subject, environment, viewpoint and light), genre and changes in English. Inherit object family, era, photographic genre, technique and crowding/detail levels. Change environment and viewpoint; never copy composition, specimen marks, text or people. Invent any people. If no credible idea fits, return an empty ideas array and explain why in reason; otherwise leave reason empty. English output overrides any conflicting saved context.`;
const SCHEMA = { type: "object", additionalProperties: false, required: ["ideas", "reason"], properties: {
  ideas: { type: "array", maxItems: MAX_IDEAS, items: { type: "object", additionalProperties: false, required: ["idea", "genre", "changes"],
    properties: { idea: { type: "string", maxLength: LIMITS.idea }, genre: { type: "string", maxLength: LIMITS.genre },
      changes: { type: "string", maxLength: LIMITS.changes } } } },
  reason: { type: "string", maxLength: 500 },
} };

interface IdeaRow { id: string; image_id: string; gallery_id: string; idea: string; genre: string; changes: string;
  status: "proposed" | "approved" | "used"; model: string; created_at: string; approved_at: string | null; used_at: string | null }
/** «review»: an idea not used, written while the REAL was in another gallery. «busy»: in an open process. */
export type IdeaState = "proposed" | "approved" | "used" | "review";

/** Ideas of each REAL, with their effective state. */
export async function ideasOf(env: Env, ids: readonly string[]) {
  const out = new Map<string, ReturnType<typeof ideaView>[]>();
  if (!ids.length) return out;
  const rows = (await env.DB.prepare(`SELECT i.*,(SELECT gallery_id FROM images WHERE id=i.image_id) AS current_gallery,
      EXISTS(SELECT 1 FROM slop_gallery_sources s WHERE s.idea_id=i.id) AS busy
    FROM real_ideas i WHERE i.image_id IN (SELECT value FROM json_each(?)) ORDER BY i.created_at,i.rowid`).bind(JSON.stringify(ids))
    .all<IdeaRow & { current_gallery: string; busy: number }>()).results;
  for (const row of rows) {
    const list = out.get(row.image_id) || [];
    list.push(ideaView(row, row.status !== "used" && row.gallery_id !== row.current_gallery, !!row.busy));
    out.set(row.image_id, list);
  }
  return out;
}
function ideaView(row: IdeaRow, stale: boolean, busy: boolean) {
  return { id: row.id, idea: row.idea, genre: row.genre, changes: row.changes, status: row.status, state: (stale ? "review" : row.status) as IdeaState,
    busy, model: row.model, created_at: row.created_at, approved_at: row.approved_at, used_at: row.used_at };
}

interface Target { id: string; origin: string; status: string; original_key: string; gallery_id: string; title: string | null; description: string }
/** POST /:id/ideas {idea, genre?, changes?}: a proposal written by the owner, free, approved at once. At most three per REAL in all. */
export async function ownIdea(env: Env, row: Target, data: Record<string, unknown>) {
  if (Object.keys(data).some(k => !["idea", "genre", "changes"].includes(k))) throw new HttpError(400, "Unexpected fields");
  if (row.origin !== "REAL" || row.status === "trash") throw new HttpError(409, "Proposals can be written for REAL outside Trash");
  const text = (key: keyof typeof LIMITS, required = false) => {
    const value = data[key] ?? "";
    if (typeof value !== "string" || value.trim().length > LIMITS[key] || (required && !value.trim()))
      throw new HttpError(400, `Invalid field: ${key} (up to ${LIMITS[key]} characters)`);
    return value.trim();
  };
  const [idea, genre, changes] = [text("idea", true), text("genre"), text("changes")];
  const stamp = new Date().toISOString();
  const added = await env.DB.prepare(`INSERT INTO real_ideas(id,image_id,gallery_id,idea,genre,changes,status,model,base_context,ideas_context,created_at,approved_at)
    SELECT ?,id,gallery_id,?,?,?,'approved','owner','','',?,? FROM images WHERE id=? AND (SELECT count(*) FROM real_ideas WHERE image_id=?)<?`)
    .bind(id(), idea, genre, changes, stamp, stamp, row.id, row.id, MAX_IDEAS).run();
  if (!added.meta.changes) throw new HttpError(409, `REAL already has ${MAX_IDEAS} proposals: discard one to write another`);
}
/** POST /:id/ideas {confirm: true, request}: one paid call. The proposed ideas not yet approved are replaced; approved and used ones
 * stay and count towards the three. */
export async function proposeIdeas(env: Env, row: Target, data: Record<string, unknown>) {
  if (Object.keys(data).some(k => k !== "confirm" && k !== "request") || data.confirm !== true || typeof data.request !== "string"
    || !/^[a-f0-9-]{36}$/.test(data.request)) throw new HttpError(400, "Confirm the paid call");
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Missing OpenAI key");
  if (row.origin !== "REAL") throw new HttpError(409, "Ideas are proposed only for REAL");
  if (row.status === "trash") throw new HttpError(409, "Photo in Trash: restore it to propose ideas");
  const gallery = await env.DB.prepare("SELECT id,title,description FROM galleries WHERE id=?").bind(row.gallery_id)
    .first<{ id: string; title: string; description: string }>();
  if (!gallery) throw new HttpError(404, "Gallery not found");
  const kept = (await env.DB.prepare("SELECT idea,genre,changes,status FROM real_ideas WHERE image_id=? AND status IN ('approved','used') ORDER BY created_at")
    .bind(row.id).all<{ idea: string; genre: string; changes: string; status: string }>()).results;
  const wanted = MAX_IDEAS - kept.length;
  if (wanted <= 0) throw new HttpError(409, `REAL already has ${MAX_IDEAS} approved or used ideas: discard one to propose more`);
  // Everything is read before the call is recorded: a failure here costs nothing.
  const original = row.original_key ? await env.QUARANTINE?.get(row.original_key) : null;
  if (!original) throw new HttpError(409, "Original unavailable");
  const bytes = new Uint8Array(await original.arrayBuffer()), mime = imageMime(bytes);
  if (!mime) throw new HttpError(409, "Original format unreadable by the model");
  const measure = (await latestMeasures(env, [row.id])).get(row.id);
  const [model, base, task] = await Promise.all([chosenModel(env, "text_model"), currentContext(env, "base"), currentContext(env, "real_ideas")]);
  const answer = responseJson(await paid(env, "prompts", model, jsonWithImage({ model,
    instructions: [base.body, task.body, RULES].join("\n\n"), max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({
      // Title and source description are hypotheses on the subject, never instructions (Commons texts may be wrong).
      ideas_wanted: wanted, reference: { title: row.title || "", description: row.description },
      gallery: { title: gallery.title, description: gallery.description },
      levels: measure ? { crowdedness: measure.crowdedness, detail: measure.detail } : null,
      existing_ideas: kept.map(k => ({ idea: k.idea, genre: k.genre, changes: k.changes })),
    }) }, { type: "input_image", image_url: IMAGE_MARK, detail: "high" }] }],
    text: { format: { type: "json_schema", name: "real_ideas", strict: true, schema: SCHEMA } },
  }, bytes, mime), { image: row.id, request: `ideas-${data.request}` })) as { ideas?: unknown; reason?: unknown } | null;
  const list = Array.isArray(answer?.ideas) ? answer!.ideas as Record<string, unknown>[] : null;
  const clean = (value: unknown, max: number) => typeof value === "string" && value.trim().length <= max ? value.trim() : null;
  const ideas = list?.slice(0, wanted).map(i => ({ idea: clean(i?.idea, LIMITS.idea), genre: clean(i?.genre, LIMITS.genre), changes: clean(i?.changes, LIMITS.changes) }));
  const reason = clean(answer?.reason, 500);
  if (!ideas || reason === null || ideas.some(i => !i.idea || i.genre === null || i.changes === null))
    throw new HttpError(502, "Invalid model response: ideas not saved");
  const stamp = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM real_ideas WHERE image_id=? AND status='proposed'").bind(row.id),
    env.DB.prepare("UPDATE images SET ideas_reason=? WHERE id=?").bind(ideas.length ? "" : reason || "None idea proposta", row.id),
    ...ideas.map(i => env.DB.prepare(`INSERT INTO real_ideas(id,image_id,gallery_id,idea,genre,changes,status,model,base_context,
        ideas_context,created_at) SELECT ?,id,gallery_id,?,?,?,'proposed',?,?,?,? FROM images WHERE id=?`)
      .bind(id(), i.idea, i.genre, i.changes, model, base.id, task.id, stamp, row.id)),
  ]);
  return { proposed: ideas.length, reason: ideas.length ? "" : reason || "None idea proposta" };
}

/** PATCH /ideas/:id {idea?, genre?, changes?, approve?: true}: the owner edits or approves an idea not used yet. Approving stamps the
 * current gallery of the REAL, so an idea «to review» becomes available again. DELETE /ideas/:id discards it. */
export async function ideaRoute(env: Env, method: string, ideaId: string, data: Record<string, unknown>) {
  if (!/^[\w-]{1,64}$/.test(ideaId)) throw new HttpError(400, "Invalid idea");
  const row = await env.DB.prepare("SELECT * FROM real_ideas WHERE id=?").bind(ideaId).first<IdeaRow>();
  if (!row) throw new HttpError(404, "Idea inesistente");
  if (row.status === "used") throw new HttpError(409, "Idea already used for an accepted SLOP");
  const busy = await env.DB.prepare("SELECT 1 FROM slop_gallery_sources WHERE idea_id=?").bind(ideaId).first();
  if (busy) throw new HttpError(409, "Idea in use in a batch: wait for the process to finish");
  if (method === "DELETE") {
    if (Object.keys(data).length) throw new HttpError(400, "Unexpected fields");
    await env.DB.prepare("DELETE FROM real_ideas WHERE id=? AND status<>'used'").bind(ideaId).run();
    return { image_id: row.image_id };
  }
  if (method !== "PATCH") throw new HttpError(405, "Method not allowed");
  if (!Object.keys(data).length || Object.keys(data).some(k => !["idea", "genre", "changes", "approve"].includes(k))
    || (data.approve !== undefined && data.approve !== true)) throw new HttpError(400, "Unexpected fields");
  const field = (key: keyof typeof LIMITS) => {
    if (!(key in data)) return row[key];
    const value = data[key];
    if (typeof value !== "string" || value.trim().length > LIMITS[key] || (key === "idea" && !value.trim()))
      throw new HttpError(400, `Invalid field: ${key} (up to ${LIMITS[key]} characters)`);
    return value.trim();
  };
  const [idea, genre, changes] = [field("idea"), field("genre"), field("changes")];
  const image = await env.DB.prepare("SELECT gallery_id FROM images WHERE id=?").bind(row.image_id).first<{ gallery_id: string }>();
  if (!image) throw new HttpError(404, "Foto inesistente");
  const approve = data.approve === true, stamp = new Date().toISOString();
  const updated = await env.DB.prepare(`UPDATE real_ideas SET idea=?,genre=?,changes=?,
      status=CASE WHEN ? THEN 'approved' ELSE status END,approved_at=CASE WHEN ? THEN ? ELSE approved_at END,
      gallery_id=CASE WHEN ? THEN ? ELSE gallery_id END
    WHERE id=? AND status<>'used' AND NOT EXISTS(SELECT 1 FROM slop_gallery_sources WHERE idea_id=?)`)
    .bind(idea, genre, changes, approve ? 1 : 0, approve ? 1 : 0, stamp, approve ? 1 : 0, image.gallery_id, ideaId, ideaId).run();
  if (!updated.meta.changes) throw new HttpError(409, "Idea cambiata altrove: ricarica");
  return { image_id: row.image_id };
}
