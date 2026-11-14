/** Twin SLOP (spec `generazione-slop`): every REAL gets at most one SLOP written from its own tags and description, so the tags of
 * a prompt are a combination that existed; the look of the copy comes from another REAL of the same colour, medium and decade (the
 * «REAL campione»). Proposal of an automatic batch, choice of the sample, and the rule that keeps a SLOP and its REAL out of the
 * same game. Pure: the random source is injected. */
import type { Category } from "./tag-categories";

export const SECTION_MIN_REAL = 50, MAX_BATCH = 10, IGNORE_MARGIN = 10, AUTO_DEFAULT_THRESHOLD = 33, IGNORE_KEY = "twins";
export interface Tag { label: string; category: Category }
/** One image of a batch: the REAL it is the twin of, the REAL whose look its copy takes, and the tags of the source when drawn. */
export interface TwinItem { source: string; sample: string | null; title: string; tags: Tag[] }

const LOOK: readonly Category[] = ["color", "medium", "time"];
const lookOf = (tags: readonly Tag[]) => LOOK.map(c => tags.find(t => t.category === c)?.label || "").join("|");

/** The «REAL campione» of a source: another measured REAL with the same Color, Medium and decade, at random; the source itself when
 * it is measured and no other fits; null when nothing is measured. Samples already taken in the batch are avoided while others fit. */
export function pickSample(source: { id: string; tags: readonly Tag[] }, candidates: readonly { id: string; tags: readonly Tag[]; measured: boolean }[],
  taken: ReadonlySet<string> = new Set(), random: () => number = Math.random): string | null {
  const look = lookOf(source.tags);
  const fitting = candidates.filter(c => c.measured && c.id !== source.id && lookOf(c.tags) === look);
  const fresh = fitting.filter(c => !taken.has(c.id)), pool = fresh.length ? fresh : fitting;
  if (pool.length) return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))].id;
  return candidates.find(c => c.id === source.id)?.measured ? source.id : null;
}

export interface AutoInput {
  /** Approved or published REAL. */ real: number;
  /** REAL among them whose twin is approved or published. */ twinned: number;
  /** REAL among them with no live twin (new, approved or published): what a batch can still generate. */ waiting: number;
  sectionMin: number; thresholdPercent: number; enabled: boolean; openBatch: boolean; ignoredAt: number | null;
}
export interface Proposal { n_real: number; n_slop: number; n_new: number; spread: number; spread_percent: number; missing: number; size: number }
export type NoProposal = "disabled" | "batch_open" | "studio_closed" | "none";

/** spread_percent: 100 without twins, 0 when every REAL has one; null without REAL. */
export const spreadPercent = (real: number, twinned: number): number | null => real > 0 ? 100 * (real - twinned) / real : null;

/** One proposal: when 100 × (REAL − twins approved or published) / REAL reaches the threshold (exact comparison, no rounding) and at
 * least one REAL waits for a twin. An ignored proposal comes back after IGNORE_MARGIN more points. */
export function proposal(input: AutoInput): { proposal: Proposal | null; reason: NoProposal | null } {
  if (!input.enabled) return { proposal: null, reason: "disabled" };
  if (input.openBatch) return { proposal: null, reason: "batch_open" };
  if (input.real < input.sectionMin) return { proposal: null, reason: "studio_closed" };
  const spread = input.real - input.twinned, percent = spreadPercent(input.real, input.twinned);
  if (percent === null || 100 * spread < input.thresholdPercent * input.real || input.waiting < 1
    || (input.ignoredAt !== null && percent < input.ignoredAt + IGNORE_MARGIN)) return { proposal: null, reason: "none" };
  return { proposal: { n_real: input.real, n_slop: input.twinned, n_new: spread - input.waiting, spread, spread_percent: percent,
    missing: input.waiting, size: Math.min(input.waiting, MAX_BATCH) }, reason: null };
}

/** A game never shows a SLOP and the REAL it was written from: seeing both would give the answer away. For every pair inside the
 * sample one member, chosen by a fair coin, leaves for another image of the same origin that is not in the game and whose own twin
 * is not either. The sequence of origins never changes, so the fair coins of the sampler stay untouched. Without a replacement the
 * pair stays (a small catalogue). `pairs` maps a SLOP id to its source REAL id. */
export function separateTwins<T extends { id: string; type: string }>(sample: readonly T[], catalogue: readonly T[],
  pairs: ReadonlyMap<string, string>, random: () => number = Math.random): T[] {
  const partner = new Map<string, string>();
  for (const [slop, real] of pairs) { partner.set(slop, real); partner.set(real, slop); }
  const out = [...sample], inGame = new Set(out.map(i => i.id));
  for (let position = 0; position < out.length; position++) {
    const image = out[position], other = partner.get(image.id);
    // Each pair is handled once, from its first member in the sequence.
    if (!other || !inGame.has(other) || out.findIndex(i => i.id === other) < position) continue;
    const leaving = random() < 0.5 ? position : out.findIndex(i => i.id === other), gone = out[leaving];
    const free = catalogue.filter(c => c.type === gone.type && !inGame.has(c.id) && !(partner.has(c.id) && inGame.has(partner.get(c.id)!)));
    if (!free.length) continue;
    const next = free[Math.min(free.length - 1, Math.floor(random() * free.length))];
    inGame.delete(gone.id); inGame.add(next.id); out[leaving] = next;
  }
  return out;
}
