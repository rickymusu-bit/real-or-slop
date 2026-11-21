/** Crowding and detail of a REAL (owner decisions of 2026-11-21, spec `libreria-immagini`, section 10): the model only observes the
 * recognizable objects of the whole original, with a rough box and the kinds of detail legible on each; the two scores, from 0 to 100,
 * are computed here with a fixed formula, so that a measure can be compared with another. */

/** Kinds of detail a generator often gets wrong, in the order shown to the owner. */
export const DETAIL_KINDS = ["text", "repeated", "countable", "texture", "reflective", "joints"] as const;
export type DetailKind = typeof DETAIL_KINDS[number];
export const DETAIL_LABELS: Record<DetailKind, string> = {
  text: "scritte e loghi leggibili", repeated: "motivi ripetuti", countable: "parti contabili",
  texture: "texture dei materiali", reflective: "superfici riflettenti o schermi", joints: "giunzioni e meccanismi",
};
/** At most this many objects besides the subject are listed; the others are only counted. */
export const MAX_OBJECTS = 30;
const MAX_UNLISTED = 500;
/** Objects at which crowding is 50: 100·n/(n+K). The curve flattens on purpose, because a model counts poorly beyond about ten. */
export const CROWDING_HALF = 5;

export interface Box { x: number; y: number; width: number; height: number }
export interface MeasuredObject { name: string; box: Box; detail: Record<DetailKind, boolean> }
export interface Observation { subject: MeasuredObject; others: MeasuredObject[]; unlisted: number }
export interface Scores { crowdedness: number; detail: number }

const unit = (n: number) => Math.min(1, Math.max(0, n));
/** The part of a box inside the image, in normalized coordinates. */
export function clipBox(box: Box): Box {
  const x = unit(box.x), y = unit(box.y);
  return { x, y, width: unit(Math.min(box.x + box.width, 1) - x), height: unit(Math.min(box.y + box.height, 1) - y) };
}
const share = (o: MeasuredObject) => DETAIL_KINDS.filter(k => o.detail[k]).length / DETAIL_KINDS.length;

/** Crowding: 100·n/(n+5) with n the objects besides the subject, listed or not. Detail: the share of detail kinds of every listed
 * object (subject included), weighted by its area over the area of all the objects, not of the image, so that empty background does
 * not dilute it; with no measurable area, the subject's own share. */
export function scores(observation: Observation): Scores {
  const n = observation.others.length + observation.unlisted;
  const objects = [observation.subject, ...observation.others];
  const areas = objects.map(o => { const b = clipBox(o.box); return b.width * b.height; });
  const total = areas.reduce((a, b) => a + b, 0);
  const detail = total > 0 ? objects.reduce((sum, o, i) => sum + share(o) * areas[i], 0) / total : share(observation.subject);
  return { crowdedness: Math.round(100 * n / (n + CROWDING_HALF)), detail: Math.round(100 * detail) };
}

/** JSON schema of the model's answer (strict structured output). */
const objectSchema = {
  type: "object", additionalProperties: false, required: ["name", "box", "detail"], properties: {
    name: { type: "string", maxLength: 80 },
    box: { type: "object", additionalProperties: false, required: ["x", "y", "width", "height"], properties: {
      x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } } },
    detail: { type: "object", additionalProperties: false, required: [...DETAIL_KINDS],
      properties: Object.fromEntries(DETAIL_KINDS.map(k => [k, { type: "boolean" }])) },
  },
};
export const OBSERVATION_SCHEMA = {
  type: "object", additionalProperties: false, required: ["subject", "others", "unlisted"], properties: {
    subject: objectSchema, others: { type: "array", items: objectSchema, maxItems: MAX_OBJECTS }, unlisted: { type: "integer" },
  },
};

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function measuredObject(value: unknown): MeasuredObject | null {
  const o = value as Partial<MeasuredObject> | null;
  if (!o || typeof o !== "object" || typeof o.name !== "string" || !o.box || !o.detail) return null;
  const name = [...o.name.normalize("NFC")].map(ch => { const c = ch.charCodeAt(0); return c < 32 || c === 127 ? " " : ch; }).join("").trim().slice(0, 80);
  const b = o.box as Partial<Box>;
  if (!name || !finite(b.x) || !finite(b.y) || !finite(b.width) || !finite(b.height) || b.width < 0 || b.height < 0) return null;
  if (DETAIL_KINDS.some(k => typeof (o.detail as Record<string, unknown>)[k] !== "boolean")) return null;
  const box = clipBox({ x: b.x, y: b.y, width: b.width, height: b.height });
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  return { name, box: { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) },
    detail: Object.fromEntries(DETAIL_KINDS.map(k => [k, (o.detail as Record<DetailKind, boolean>)[k]])) as Record<DetailKind, boolean> };
}
/** The model's answer, checked and normalized (boxes clipped to the image), or null when it does not match the schema. */
export function validObservation(value: unknown): Observation | null {
  const v = value as Partial<Observation> | null;
  if (!v || typeof v !== "object" || !Array.isArray(v.others) || v.others.length > MAX_OBJECTS || !Number.isInteger(v.unlisted)
    || (v.unlisted as number) < 0) return null;
  const subject = measuredObject(v.subject), others = v.others.map(measuredObject);
  if (!subject || others.some(o => !o)) return null;
  return { subject, others: others as MeasuredObject[], unlisted: Math.min(v.unlisted as number, MAX_UNLISTED) };
}

/** Which scores are above the gallery's thresholds (a score equal to its threshold is within it). */
export function overThresholds(measure: Scores, limits: Scores): (keyof Scores)[] {
  return (["crowdedness", "detail"] as const).filter(k => measure[k] > limits[k]);
}
