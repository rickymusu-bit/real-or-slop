/** Editable model instructions and their versions: the base shared by every call, the
 * ideas of falsification of a REAL, the SLOP proposals of a gallery and the evaluation of the SLOP. The description of the REAL, and its «analysis» part, were retired on
 * 2026-11-20 (owner decision); its old versions stay in the table, unused. The crowding/detail measurement context was retired on 2026-11-26. */
import { HttpError, id, type Env } from "./core";

export type Part = "base" | "real_ideas" | "slop_evaluation" | "slop_gallery_prompt";
export const PARTS: Part[] = ["base", "real_ideas", "slop_gallery_prompt", "slop_evaluation"];
export const CONTEXT_MAX = 4000;
const HISTORY = 50;

export const DEFAULTS: Record<Part, string> = {
  "base": "You work on a photographic archive.\n\nLanguage: write all generated text in English, concise and precise, without hype, emoji or hashtags. Transcribe legible text in its original language.\n\nFacts: never invent people’s names; use only names supported by the supplied context. Specify places and periods only when supported by the context or visible evidence; otherwise stay generic (for example a square, the 1970s). Never mention photographers, agencies, archives, sources, licenses or web addresses.",
  "real_ideas": "Propose distinct ways to create a plausible generated photograph inspired by this authentic photo. The REAL inspires the SLOP and is never copied.\n\nInherit the gallery theme, object family and era, photographic genre (isolated collector’s edition, ordinary model in use, museum display, sales listing), technique, light and camera type.\n\nAlways change environment (surface, background, nearby objects, keeping their number) and viewpoint. The specimen (edition, color, variant) may change, or stay the same if the scene changes substantially. Never copy composition, specimen marks (scratches, stickers, handwriting, serial numbers) or the REAL’s people.\n\nSide by side, REAL and SLOP must not look like two shots from the same session. Ideas must be plausible for the object and genre. Write all fields in English.",
  "slop_gallery_prompt": "For a themed gallery, develop the approved REAL idea into a concrete fabricated photograph and write its English prompt. Use the full photo, title and source description. Specify any invention and the real anchors to retain, such as geography, a recognizable building or visible event cues. Vary premises when the photos allow. Prioritize photographic credibility, plausible light and technique. Write the premise and any incompatibility reason in English.",
  "slop_evaluation": "Evaluate the entire generated, untreated photograph before it enters the library as a candidate. Judge photographic credibility first: it must be plausible as an authentic photograph of the depicted technique, period and situation. Then assess physical and contextual plausibility, required anchors and exclusions. Literal adherence to secondary prompt details is not required.\n\nCritical defects cannot be offset by strengths: anatomy, physics, geometry, meaningless central text, artificial rendering, contextual contradictions, content violations or missing required anchors. Identify each defect’s region and consequence. Flag uncertainties; do not infer identity, provenance, license or historical truth from pixels. Evaluation is an editorial estimate, not certification.\n\nContent: invented people; no identifiable real people alive or dead less than 50 years; no crimes attributed to historical figures; no celebration of regimes; no nudity outside artworks.\n\nLanguage: all defects, uncertainties, reasoning and revised prompts must be in English. Preserve quoted source lettering in its original language."
};

export interface ContextVersion { id: string; part: Part; body: string; created_at: string; pipeline: number }

function part(value: unknown): Part {
  if (typeof value !== "string" || !PARTS.includes(value as Part)) throw new HttpError(400, "Context part not found");
  return value as Part;
}
/** Plain text: line breaks normalised, control characters out except tab and newline, at most CONTEXT_MAX characters. */
function clean(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Missing context text");
  const text = [...value.normalize("NFC").replace(/\r\n?/g, "\n")]
    .filter(ch => { const c = ch.charCodeAt(0); return c === 9 || c === 10 || (c >= 32 && c !== 127); }).join("").trim();
  if (!text) throw new HttpError(400, "Context cannot be empty");
  if (text.length > CONTEXT_MAX) throw new HttpError(400, `Context exceeds ${CONTEXT_MAX} characters`);
  return text;
}

/** Current version of a part; the first read writes the approved default. */
export async function currentContext(env: Env, which: Part): Promise<ContextVersion> {
  const latest = () => env.DB.prepare("SELECT id,part,body,created_at,pipeline FROM model_contexts WHERE part=? ORDER BY created_at DESC,rowid DESC LIMIT 1")
    .bind(which).first<ContextVersion>();
  const found = await latest();
  if (found) return found;
  await env.DB.prepare("INSERT INTO model_contexts(id,part,body,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM model_contexts WHERE part=?)")
    .bind(id(), which, DEFAULTS[which], new Date().toISOString(), which).run();
  return (await latest())!;
}

async function state(env: Env) {
  const parts = [];
  // A proposal from the code is shown when it differs from the current text; it is never saved by itself.
  for (const which of PARTS) {
    const current = await currentContext(env, which);
    const history = (await env.DB.prepare(`SELECT c.id,c.body,c.created_at,c.pipeline
      FROM model_contexts c WHERE c.part=? ORDER BY c.created_at DESC,c.rowid DESC LIMIT ?`).bind(which, HISTORY)
      .all<{ id: string; body: string; created_at: string; pipeline: number }>()).results;
    parts.push({part: which, current, history, proposed: current.body === DEFAULTS[which] ? null : DEFAULTS[which]});
  }
  return { max: CONTEXT_MAX, parts };
}

/** A new version, unless it repeats the current one. Saving a text marks it for the current pipeline; a restored version keeps its own. */
async function save(env: Env, which: Part, body: string) {
  const current = await currentContext(env, which);
  if (current.body !== body)
    await env.DB.prepare("INSERT INTO model_contexts(id,part,body,created_at) VALUES(?,?,?,?)")
      .bind(id(), which, body, new Date().toISOString()).run();
  return state(env);
}

/** GET /contexts; POST /contexts {part, body}: new version; POST /contexts/restore {id}: an old version becomes the newest. */
export async function contextRoute(env: Env, method: string, restore: boolean, data: Record<string, unknown>) {
  if (method === "GET" && !restore) return state(env);
  if (method !== "POST") throw new HttpError(405, "Method not allowed");
  if (restore) {
    if (Object.keys(data).some(key => key !== "id") || typeof data.id !== "string") throw new HttpError(400, "Version required");
    const old = await env.DB.prepare("SELECT part,body,pipeline FROM model_contexts WHERE id=?").bind(data.id).first<{ part: Part; body: string; pipeline: number }>();
    if (!old) throw new HttpError(404, "Version not found");
    if (!PARTS.includes(old.part)) throw new HttpError(409, "Context part no longer in use");
    return save(env, old.part, old.body);
  }
  if (Object.keys(data).some(key => key !== "part" && key !== "body")) throw new HttpError(400, "Unexpected fields");
  return save(env, part(data.part), clean(data.body));
}
