import { secureRandom, shuffled, type Random } from "./random";

export const dimensions = [
  "category", "category_medium", "subject_kind", "image_medium",
  "composition", "period_bucket", "country_or_region", "perceived_plausibility",
] as const;
type Dimension = typeof dimensions[number];
type Tags = Partial<Record<Exclude<Dimension, "category" | "category_medium">, string | null>>;
export interface SamplingImage {
  id: string;
  type: "REAL" | "AI";
  status: string;
  sha256?: string | null;
  perceptual_hash?: string | null;
  r2_key?: string;
  categories?: string[];
  scene_group?: string | null;
  scene_preferred?: boolean;
  perceptual_distinct?: string[];
  curation?: Tags | null;
}
const weights: Record<Dimension, number> = {
  category: 2, category_medium: 2, image_medium: 2, subject_kind: 1,
  composition: 1, period_bucket: 1, country_or_region: 1, perceived_plausibility: 1,
};
const missing = "?";
function values(row: SamplingImage, dimension: Dimension): string[] {
  if (dimension !== "category" && dimension !== "category_medium")
    return [row.curation?.[dimension] || missing];
  const categories = [...new Set(row.categories || [])].sort();
  if (dimension === "category") return categories.length ? categories : [missing];
  return (categories.length ? categories : [missing]).map((category) =>
    JSON.stringify([category, row.curation?.image_medium || missing]));
}
type Vector = Map<string, number>;
function vector(row: SamplingImage): Vector {
  const result: Vector = new Map();
  for (const dimension of dimensions) {
    const bins = values(row, dimension);
    for (const bin of bins) result.set(JSON.stringify([dimension, bin]), 1 / bins.length);
  }
  return result;
}
function validHash(value: string | null | undefined) {
  return typeof value === "string" && /^[0-9a-f]{16}$/i.test(value);
}
function near(a: bigint, b: bigint) {
  let different = a ^ b, count = 0;
  while (different && count <= 5) {
    different &= different - 1n;
    count++;
  }
  return count <= 5;
}

// Connected duplicate families are conservative: one representative per family.
// Conflicting REAL/AI labels invalidate the whole family; never reassign a label.
function unique<T extends SamplingImage>(input: readonly T[]) {
  const rows = input.filter((row) => row.status === "approved" && ["REAL", "AI"].includes(row.type));
  const parent = rows.map((_, i) => i);
  const memberHashes = rows.map(row => new Set(row.sha256 ? [row.sha256] : []));
  const forbidden = new Map(rows.map(row => [row.sha256, new Set(row.perceptual_distinct || [])]));
  const root = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const join = (a: number, b: number) => {
    const ra = root(a), rb = root(b);
    if (ra === rb) return;
    parent[ra] = rb;
    for (const sha of memberHashes[ra]) memberHashes[rb].add(sha);
  };
  const allowPerceptualJoin = (a: number, b: number) => {
    for (const sha of memberHashes[root(a)]) for (const other of memberHashes[root(b)])
      if (forbidden.get(sha)?.has(other) || forbidden.get(other)?.has(sha)) return false;
    return true;
  };
  const exact = new Map<string, number>();
  // Six disjoint bit ranges: with <=5 changed bits at least one range is equal.
  // This avoids comparing unrelated perceptual hashes in the usual case.
  const chunks = new Map<string, number[]>();
  const hashes = new Map<number, bigint>();
  rows.forEach((row, i) => {
    const keys = ["id:" + row.id];
    if (row.scene_group) keys.push("scene:" + row.type + ":" + row.scene_group);
    if (row.r2_key) keys.push("storage:" + row.r2_key);
    if (row.sha256 && row.sha256 !== "pending") keys.push("sha:" + row.sha256.toLowerCase());
    for (const key of keys) {
      const found = exact.get(key);
      if (found !== undefined) join(i, found);
      else exact.set(key, i);
    }
    if (!validHash(row.perceptual_hash)) return;
    const hash = BigInt("0x" + row.perceptual_hash);
    const bits = hash.toString(2).padStart(64, "0");
    const keysForHash = Array.from({ length: 6 }, (_, part) =>
      row.type + ":" + part + ":" + bits.slice(Math.floor(part * 64 / 6), Math.floor((part + 1) * 64 / 6)));
    const possible = new Set(keysForHash.flatMap((key) => chunks.get(key) || []));
    for (const other of possible) {
      if (root(i) !== root(other) && near(hash, hashes.get(other)!) && allowPerceptualJoin(i, other)) join(i, other);
    }
    hashes.set(i, hash);
    for (const key of keysForHash) {
      const bucket = chunks.get(key) || [];
      bucket.push(i);
      chunks.set(key, bucket);
    }
  });
  const groups = new Map<number, T[]>();
  rows.forEach((row, i) => {
    const key = root(i), group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });
  const eligible = [...groups.values()]
    .filter((group) => group.every((row) => row.type === group[0].type))
    .map((group) => group.reduce((first, row) =>
      row.scene_preferred && !first.scene_preferred ? row : first.scene_preferred && !row.scene_preferred ? first : row.id < first.id ? row : first));
  return { eligible, removed: rows.length - eligible.length };
}

function frequencies(rows: readonly SamplingImage[], dimension: Dimension) {
  const bins = new Map<string, number>();
  for (const row of rows) {
    const entries = values(row, dimension);
    for (const entry of entries) bins.set(entry, (bins.get(entry) || 0) + 1 / entries.length / rows.length);
  }
  return bins;
}
// Private diagnostics: the HTTP handlers return ONLY generic warnings, never
// these distributions, candidate IDs, counts per class, or curation fields.
export function distributionDistance(rows: readonly SamplingImage[]) {
  const real = rows.filter((row) => row.type === "REAL");
  const ai = rows.filter((row) => row.type === "AI");
  return Object.fromEntries(dimensions.map((dimension) => {
    const r = frequencies(real, dimension), a = frequencies(ai, dimension);
    const bins = new Set([...r.keys(), ...a.keys()]);
    const observed = rows.some((row) => dimension === "category" ? row.categories?.length :
      dimension === "category_medium" ? row.categories?.length && row.curation?.image_medium : row.curation?.[dimension]);
    return [dimension, !real.length || !ai.length || !observed ? null :
      [...bins].reduce((sum, key) => sum + Math.abs((r.get(key) || 0) - (a.get(key) || 0)), 0) / 2];
  })) as Record<Dimension, number | null>;
}

// Preserve the weighted editorial optimizer for broadened strata. Each reserve
// can support ALL slots assigned to its stratum if every coin has the same result.
// Only the coins choose game labels; unused reserve images are never assigned.
function editorialReserves<T extends SamplingImage>(source: T[][], reserveSize: number, random: Random) {
  const pools = source.map((pool) => shuffled(pool, random));
  const eligible = pools.flat();
  const selected = pools.map((pool) => pool.slice(0, reserveSize));
  const remaining = pools.map((pool) => pool.slice(reserveSize));
  const vectors = new Map(eligible.map((row) => [row, vector(row)]));
  const targets = new Map<string, number>();
  const binWeights = new Map<string, number>();
  for (const dimension of dimensions) {
    const r = frequencies(pools[0], dimension), a = frequencies(pools[1], dimension);
    const bins = [...new Set([...r.keys(), ...a.keys()])];
    const overlap = bins.reduce((sum, key) => sum + Math.min(r.get(key) || 0, a.get(key) || 0), 0);
    for (const bin of bins) {
      const key = JSON.stringify([dimension, bin]);
      targets.set(key, overlap ? Math.min(r.get(bin) || 0, a.get(bin) || 0) / overlap : ((r.get(bin) || 0) + (a.get(bin) || 0)) / (pools[0].length && pools[1].length ? 2 : 1));
      binWeights.set(key, weights[dimension]);
    }
  }
  const sums = selected.map((rows) => {
    const bins = new Map<string, number>();
    for (const row of rows) for (const [key, value] of vectors.get(row)!)
      bins.set(key, (bins.get(key) || 0) + value / reserveSize);
    return bins;
  });
  const comparable = 1;
  // Optimize population distributions, not pairs of REAL/AI images. Each move
  // exchanges two images of the SAME class, aligning private counterfactual reserves, never game label counts.
  // Bound work: three passes, <=128 alternatives per selected image per pass.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const type of shuffled([0, 1], random)) {
      const alternatives = shuffled(remaining[type].map((_, i) => i), random).slice(0, 128);
      for (const index of shuffled(selected[type].map((_, i) => i), random)) {
        let best = -1e-10;
        let move: number | undefined;
        const before = vectors.get(selected[type][index])!;
        for (const other of alternatives) {
          const after = vectors.get(remaining[type][other])!;
          let score = 0;
          for (const [key, fraction] of before) {
            const value = -fraction / reserveSize;
            const own = sums[type].get(key) || 0, opposite = sums[1 - type].get(key) || 0;
            score += binWeights.get(key)! * (2 * (comparable * (own - opposite) + 0.5 * (own - targets.get(key)!)) * value + (comparable + 0.5) * value * value);
          }
          for (const [key, fraction] of after) {
            const value = fraction / reserveSize;
            const own = sums[type].get(key) || 0, opposite = sums[1 - type].get(key) || 0;
            const removed = (before.get(key) || 0) / reserveSize;
            score += binWeights.get(key)! * (2 * (comparable * (own - opposite) + 0.5 * (own - targets.get(key)!)) * value + (comparable + 0.5) * (value * value - 2 * value * removed));
          }
          if (score < best) { best = score; move = other; }
        }
        if (move !== undefined) {
          const other = move, after = vectors.get(remaining[type][other])!;
          for (const [key, value] of before) sums[type].set(key, (sums[type].get(key) || 0) - value / reserveSize);
          for (const [key, value] of after) sums[type].set(key, (sums[type].get(key) || 0) + value / reserveSize);
          [selected[type][index], remaining[type][other]] = [remaining[type][other], selected[type][index]];
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return selected.map((pool) => shuffled(pool, random));
}

const levels = [
  dimensions.filter((dimension) => dimension !== "category_medium"),
  ["category", "image_medium"],
  ["category"],
  [],
] as const;
interface Stratum<T> { pools: [T[], T[]]; available: number; slots: number }
function strata<T extends SamplingImage>(rows: readonly T[], level: readonly Dimension[]) {
  const groups = new Map<string, Stratum<T>>();
  for (const row of rows) {
    const key = JSON.stringify(level.map((dimension) => values(row, dimension)));
    const group = groups.get(key) || { pools: [[], []], available: 0, slots: 0 };
    group.pools[row.type === "REAL" ? 0 : 1].push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) group.available = Math.min(...group.pools.map((pool) => pool.length));
  return [...groups.values()].filter((group) => group.available > 0);
}

export function curatedSample<T extends SamplingImage>(input: readonly T[], count: number, random: Random = secureRandom) {
  if (!Number.isInteger(count) || count < 0 || count > 50) throw new RangeError("Sampling count must be 0–50");
  const { eligible, removed } = unique(input);
  // Determined BEFORE any coins: every possible sequence must be supportable.
  const capacity = Math.min(count, eligible.filter((row) => row.type === "REAL").length,
    eligible.filter((row) => row.type === "AI").length);
  let level = 0, groups: Stratum<T>[] = [];
  for (; level < levels.length; level++) {
    groups = strata(eligible, levels[level]);
    if (groups.reduce((sum, group) => sum + group.available, 0) >= capacity) break;
  }
  // Exactly one independent fair coin per actual position. No feedback from
  // previous labels, realized counts, remaining images, or editorial matching.
  const labels = Array.from({ length: capacity }, () => random() < 0.5 ? 0 : 1);
  // Common editorial tickets have weight min(REAL supply, AI supply). Their
  // order and availability are independent of the coins, so every drawn ticket
  // could be filled with EITHER class, even for an all-REAL/all-AI sequence.
  let tickets = groups.reduce((sum, group) => sum + group.available, 0);
  const slots = labels.map(() => {
    let draw = Math.floor(random() * tickets);
    const group = groups.find((candidate) => {
      if (draw < candidate.available) return true;
      draw -= candidate.available;
      return false;
    })!;
    group.available--;
    group.slots++;
    tickets--;
    return group;
  });
  const reserves = new Map<Stratum<T>, T[][]>();
  for (const group of groups) {
    if (!group.slots) continue;
    reserves.set(group, level === 0
      ? group.pools.map((pool) => shuffled(pool, random).slice(0, group.slots))
      : editorialReserves(group.pools, group.slots, random));
  }
  // Diagnose the common reserve population, NOT chance imbalances in a game.
  // In particular, warnings cannot depend on an unrevealed label sequence.
  const distances = distributionDistance([...reserves.values()].flat(2));
  const images = labels.map((type, index) => reserves.get(slots[index])![type].pop()!);
  const warnings: string[] = [];
  if (capacity < count) warnings.push("Catalogo insufficiente: numero di domande ridotto prima della partita.");
  if (!capacity && count) warnings.push("Catalogo insufficiente per garantire una partita valida.");
  if (removed) warnings.push("Immagini duplicate o con classificazioni contrastanti escluse.");
  if (eligible.some((row) => !row.categories?.length || !validHash(row.perceptual_hash) || dimensions.some((dimension) => !["category", "category_medium"].includes(dimension) && !row.curation?.[dimension as keyof Tags])))
    warnings.push("Metadati incompleti: alcune verifiche di varietà e somiglianza sono limitate.");
  if (level > 0 && capacity) warnings.push("Strati editoriali ampliati per garantire la partita.");
  if (Object.values(distances).some((distance) => distance !== null && distance > 0.35))
    warnings.push("Catalogo limitato: alcune distribuzioni editoriali non sono comparabili.");
  return { images, warnings, diagnostics: { removed, capacity, level, distances } };
}
