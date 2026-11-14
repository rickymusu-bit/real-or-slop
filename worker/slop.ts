/** SLOP studio routes (spec `generazione-slop`): groups of genre and decade with their counts, spread per tag, thresholds,
 * slot extraction inside a group, batches and the automatic batches. */
import { HttpError, type Env } from "./core";
import { batchRoute } from "./slop-generation";
import { autoBatchIds, autoRoute, guardBatch } from "./slop-auto";
import { isCategory, type Category } from "../shared/tag-categories";
import { extractSlots, MAX_SLOTS, SLOT_ORDER, type Slot, type TaggedImage } from "../shared/slot-extraction";
import { parseGroup } from "../shared/slop-groups";
import { groups } from "./slop-groups";
import { numberSettings } from "./app-settings";

async function thresholds(env: Env) {
  const v = await numberSettings(env);
  return { section: v.slop_section_min_real, group: v.slop_group_min_real };
}

const DONE = "status IN ('approved','published')";

async function spread(env: Env) {
  const totals = await env.DB.prepare(`SELECT coalesce(sum(origin='REAL'),0) AS real,coalesce(sum(origin='SLOP'),0) AS slop FROM images WHERE ${DONE}`)
    .first<{ real: number; slop: number }>();
  const tags = (await env.DB.prepare(`SELECT t.label,t.category,sum(i.origin='REAL') AS real,sum(i.origin='SLOP') AS slop
    FROM tags t JOIN image_tags it ON it.tag_id=t.id JOIN images i ON i.id=it.image_id WHERE i.${DONE}
    GROUP BY t.id ORDER BY (sum(i.origin='REAL')-sum(i.origin='SLOP')) DESC,t.label`).all<{ label: string; category: Category; real: number; slop: number }>()).results;
  const limits = await thresholds(env);
  return { thresholds: { ...limits, max_slots: MAX_SLOTS },
    real_total: totals?.real || 0, slop_total: totals?.slop || 0,
    groups: (await groups(env)).map(g => ({ ...g, spread: g.real - g.slop, missing_real: Math.max(0, limits.group - g.real),
      room: Math.max(0, g.real - g.slop - g.fresh) }))
      .sort((a, b) => (b.real ? (b.real - b.slop) / b.real : -1) - (a.real ? (a.real - a.slop) / a.real : -1) || a.key.localeCompare(b.key)),
    tags: tags.map(t => ({ ...t, spread: t.real - t.slop })) };
}

/** The approved and published REAL with their tags, of one group when given. */
export async function realImages(env: Env, group?: string): Promise<(TaggedImage & { id: string })[]> {
  const rows = (await env.DB.prepare(`SELECT it.image_id,t.label,t.category FROM image_tags it JOIN tags t ON t.id=it.tag_id
    JOIN images i ON i.id=it.image_id WHERE i.origin='REAL' AND i.${DONE}`).all<{ image_id: string; label: string; category: Category }>()).results;
  const out = new Map<string, TaggedImage & { id: string }>();
  for (const r of rows) { const image = out.get(r.image_id) || { id: r.image_id, tags: new Map() }; image.tags.set(r.label, r.category); out.set(r.image_id, image); }
  const wanted = group ? parseGroup(group) : null;
  return [...out.values()].filter(image => !wanted || (image.tags.get(wanted.genre) === "genre" && image.tags.get(wanted.time) === "time"));
}

export function slotsOf(value: unknown): Slot[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SLOTS) throw new HttpError(400, "Slot esistenti non validi");
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new HttpError(400, "Slot non valido");
    const slot: Slot = {};
    for (const [category, label] of Object.entries(item as Record<string, unknown>))
      if (isCategory(category) && SLOT_ORDER.includes(category) && typeof label === "string" && label) slot[category] = label.slice(0, 40);
    const sample = (item as Record<string, unknown>).sample;
    if (typeof sample === "string" && /^[\w-]{1,64}$/.test(sample)) slot.sample = sample;
    return slot;
  });
}

function themeOf(value: unknown): string[] {
  if (value === undefined) return [];
  const theme = Array.isArray(value) ? [...new Set(value.filter((t): t is string => typeof t === "string" && !!t))] : null;
  if (!theme || theme.length > 10) throw new HttpError(400, "Il tema ha al massimo 10 tag");
  return theme;
}
function groupOfData(value: unknown) {
  const group = parseGroup(value);
  if (!group) throw new HttpError(400, "Scegli un gruppo (genere e decennio)");
  return group;
}
/** POST /reference {group, theme}: how many REAL of the group have the whole theme, and the threshold. */
async function reference(env: Env, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => key !== "theme" && key !== "group")) throw new HttpError(400, "Campi non previsti");
  const group = groupOfData(data.group), theme = themeOf(data.theme);
  const images = (await realImages(env, group.key)).filter(image => theme.every(t => image.tags.has(t)));
  const count = (await groups(env)).find(g => g.key === group.key);
  return { group: group.key, theme, reference: images.length, needed: (await thresholds(env)).group,
    room: count ? Math.max(0, count.real - count.slop - count.fresh) : 0 };
}
async function slots(env: Env, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => !["group", "theme", "count", "existing"].includes(key))) throw new HttpError(400, "Campi non previsti");
  const group = groupOfData(data.group), theme = themeOf(data.theme);
  const count = data.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_SLOTS) throw new HttpError(400, `Da 1 a ${MAX_SLOTS} immagini`);
  const state = await spread(env);
  const { section, group: perGroup } = state.thresholds;
  if (state.real_total < section) throw new HttpError(409, `Servono almeno ${section} REAL approvate o pubblicate: ora ${state.real_total}`);
  const images = await realImages(env, group.key);
  const known = new Set(images.flatMap(image => [...image.tags.keys()])), missing = theme.filter(t => !known.has(t));
  if (missing.length) throw new HttpError(400, "Tag non presenti tra le REAL del gruppo: " + missing.join(", "));
  const result = extractSlots({ images, spread: new Map(state.tags.map(t => [t.label, t.spread])), theme, count, existing: slotsOf(data.existing) });
  if (result.reference < perGroup)
    throw new HttpError(409, `Il gruppo ${group.key}${theme.length ? " con il tema" : ""} ha ${result.reference} REAL approvate o pubblicate: ne servono ${perGroup}`);
  return { group: group.key, theme, reference: result.reference, slots: result.slots };
}

export async function slopRoute(env: Env, method: string, path: string, data: Record<string, unknown>) {
  if (path === "spread" && method === "GET") return spread(env);
  if (path === "reference" && method === "POST") return reference(env, data);
  if (path === "slots" && method === "POST") return slots(env, data);
  if (path === "auto" || path.startsWith("auto/")) return autoRoute(env, method, path.slice("auto".length).replace(/^\//, ""), data,
    { realImages, groups, spreadMap: async e => new Map((await spread(e)).tags.map(t => [t.label, t.spread])) });
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
