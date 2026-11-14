/** SLOP studio routes (spec `generazione-slop`): spread per tag, thresholds, slot extraction, groups and the automatic
 * batches. */
import { HttpError, type Env } from "./core";
import { batchRoute } from "./slop-generation";
import { autoBatchIds, autoRoute, guardBatch } from "./slop-auto";
import { isCategory, type Category } from "../shared/tag-categories";
import { extractSlots, MAX_SLOTS, SLOT_ORDER, type Slot, type TaggedImage } from "../shared/slot-extraction";
import { numberSettings } from "./app-settings";

async function thresholds(env: Env) {
  const v = await numberSettings(env);
  return { section: v.slop_section_min_real, theme: v.slop_theme_min_real };
}

const DONE = "status IN ('approved','published')";

async function spread(env: Env) {
  const totals = await env.DB.prepare(`SELECT coalesce(sum(origin='REAL'),0) AS real,coalesce(sum(origin='SLOP'),0) AS slop FROM images WHERE ${DONE}`)
    .first<{ real: number; slop: number }>();
  const tags = (await env.DB.prepare(`SELECT t.label,t.category,sum(i.origin='REAL') AS real,sum(i.origin='SLOP') AS slop
    FROM tags t JOIN image_tags it ON it.tag_id=t.id JOIN images i ON i.id=it.image_id WHERE i.${DONE}
    GROUP BY t.id ORDER BY (sum(i.origin='REAL')-sum(i.origin='SLOP')) DESC,t.label`).all<{ label: string; category: Category; real: number; slop: number }>()).results;
  return { thresholds: { ...(await thresholds(env)), max_slots: MAX_SLOTS },
    real_total: totals?.real || 0, slop_total: totals?.slop || 0,
    tags: tags.map(t => ({ ...t, spread: t.real - t.slop })) };
}

export async function realImages(env: Env): Promise<TaggedImage[]> {
  const rows = (await env.DB.prepare(`SELECT it.image_id,t.label,t.category FROM image_tags it JOIN tags t ON t.id=it.tag_id
    JOIN images i ON i.id=it.image_id WHERE i.origin='REAL' AND i.${DONE}`).all<{ image_id: string; label: string; category: Category }>()).results;
  const out = new Map<string, TaggedImage>();
  for (const r of rows) { const image = out.get(r.image_id) || { tags: new Map() }; image.tags.set(r.label, r.category); out.set(r.image_id, image); }
  return [...out.values()];
}

function slotsOf(value: unknown): Slot[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SLOTS) throw new HttpError(400, "Slot esistenti non validi");
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new HttpError(400, "Slot non valido");
    const slot: Slot = {};
    for (const [category, label] of Object.entries(item as Record<string, unknown>))
      if (isCategory(category) && SLOT_ORDER.includes(category) && typeof label === "string") slot[category] = label;
    return slot;
  });
}

function themeOf(value: unknown): string[] {
  const theme = Array.isArray(value) ? [...new Set(value.filter((t): t is string => typeof t === "string"))] : [];
  if (!theme.length || theme.length > 10) throw new HttpError(400, "Indica da 1 a 10 tag per il tema");
  return theme;
}
async function themeCount(env: Env, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => key !== "theme")) throw new HttpError(400, "Campi non previsti");
  const theme = themeOf(data.theme);
  const row = await env.DB.prepare(`SELECT count(*) AS n FROM (SELECT it.image_id FROM image_tags it JOIN tags t ON t.id=it.tag_id
    JOIN images i ON i.id=it.image_id WHERE i.origin='REAL' AND i.${DONE} AND t.label IN (SELECT value FROM json_each(?))
    GROUP BY it.image_id HAVING count(DISTINCT t.label)=?)`).bind(JSON.stringify(theme), theme.length).first<{ n: number }>();
  return { theme, reference: row?.n || 0, needed: (await thresholds(env)).theme };
}
async function slots(env: Env, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => !["theme", "count", "existing"].includes(key))) throw new HttpError(400, "Campi non previsti");
  const theme = themeOf(data.theme);
  const count = data.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_SLOTS) throw new HttpError(400, `Da 1 a ${MAX_SLOTS} immagini`);
  const state = await spread(env);
  const { section, theme: perTheme } = state.thresholds;
  if (state.real_total < section) throw new HttpError(409, `Servono almeno ${section} REAL approvate o pubblicate: ora ${state.real_total}`);
  const known = new Set(state.tags.map(t => t.label)), missing = theme.filter(t => !known.has(t));
  if (missing.length) throw new HttpError(400, "Tag non presenti tra le immagini approvate o pubblicate: " + missing.join(", "));
  const images = await realImages(env);
  const result = extractSlots({ images, spread: new Map(state.tags.map(t => [t.label, t.spread])), theme, count, existing: slotsOf(data.existing) });
  if (result.reference < perTheme)
    throw new HttpError(409, `Il tema compare in ${result.reference} REAL approvate o pubblicate: ne servono ${perTheme}`);
  return { theme, reference: result.reference, slots: result.slots };
}

export async function slopRoute(env: Env, method: string, path: string, data: Record<string, unknown>) {
  if (path === "spread" && method === "GET") return spread(env);
  if (path === "theme" && method === "POST") return themeCount(env, data);
  if (path === "slots" && method === "POST") return slots(env, data);
  if (path === "auto" || path.startsWith("auto/")) return autoRoute(env, method, path.slice("auto".length).replace(/^\//, ""), data,
    { realImages, spreadMap: async e => new Map((await spread(e)).tags.map(t => [t.label, t.spread])) });
  if (path === "batches" || path.startsWith("batches/")) {
    const rest = path.slice("batches".length).replace(/^\//, "");
    await guardBatch(env, method, rest, data);
    const result = await batchRoute(env, method, rest, data);
    if (rest === "" && method === "GET") {
      const auto = await autoBatchIds(env), list = result as { batches: { id: string }[] };
      return { ...list, batches: list.batches.filter(b => !auto.has(b.id)) };
    }
    return result;
  }
  throw new HttpError(404, "API dello studio SLOP inesistente");
}
