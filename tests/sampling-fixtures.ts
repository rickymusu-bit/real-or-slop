import { createHash } from "node:crypto";
import type { SamplingImage } from "../worker/sampling.ts";
import { shuffled, type Random } from "../worker/random.ts";
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}
export function scriptedCoins(sequence: string, seed = 19) {
  const rest = seeded(seed);
  let at = 0;
  return () => at < sequence.length ? (sequence[at++] === "R" ? 0.25 : 0.75) : rest();
}
// Deliberately flawed historical comparison, NEVER imported by production.
export function quotaBaseline(rows: readonly SamplingImage[], count: number, random: Random) {
  const a = shuffled(rows.filter((row) => row.type === "REAL"), random);
  const b = shuffled(rows.filter((row) => row.type === "AI"), random);
  const half = Math.floor(count / 2);
  const chosen = [...a.slice(0, half), ...b.slice(0, half)];
  return { images: shuffled([...chosen,
    ...shuffled([...a.slice(half), ...b.slice(half)], random).slice(0, Math.max(0, count - chosen.length))], random), warnings: [] };
}
export function smallComparableCatalog() {
  return (["REAL", "AI"] as const).flatMap((type) =>
    Array.from({ length: 12 }, (_, i) => image(type + "-small-" + i, type, i % 2)));
}
export function broadenedCatalog() {
  return (["REAL", "AI"] as const).flatMap((type) => Array.from({ length: 20 }, (_, i) => ({
    ...image(type + "-broad-" + i, type),
    curation: { ...image(type + "-broad-" + i, type).curation,
      composition: i % 2 ? "ritratto" : "scena_ampia",
      country_or_region: (i % 2 === (type === "REAL" ? 1 : 0)) ? "europa" : "asia",
    },
  })));
}
export function image(id: string, type: "REAL" | "AI", variant = 0): SamplingImage {
  return {
    id, type, status: "approved",
    sha256: createHash("sha256").update(id).digest("hex"),
    perceptual_hash: createHash("sha256").update("visual-" + id).digest("hex").slice(0, 16),
    r2_key: "object-" + id,
    categories: [variant ? "arte" : "trasporti"],
    curation: {
      subject_kind: variant ? "arte_scultura" : "trasporti",
      image_medium: variant ? "foto_colori" : "foto_bn",
      composition: variant ? "dettaglio" : "scena_ampia",
      period_bucket: variant ? "2000_oggi" : "1900_1945",
      country_or_region: variant ? "asia" : "europa",
      perceived_plausibility: variant ? "sorprendente" : "ordinaria",
    },
  };
}
export function skewedCatalog() {
  return (["REAL", "AI"] as const).flatMap((type) => Array.from({ length: 100 }, (_, index) =>
    image(type + index, type, index < (type === "REAL" ? 90 : 10) ? 0 : 1)));
}
export function diverseCatalog() {
  return (["REAL", "AI"] as const).flatMap((type) => Array.from({ length: 60 }, (_, index) => {
    const row = image(type + index, type, index % 2);
    row.categories = ["category-" + index % 4, "subcategory-" + index % 8];
    row.curation = { ...row.curation,
      subject_kind: ["arte_scultura", "trasporti", "architettura"][index % 3],
      image_medium: ["foto_colori", "foto_bn", "poster"][Math.floor(index / 2) % 3],
      composition: ["dettaglio", "scena_ampia", "ritratto"][Math.floor(index / 3) % 3],
      period_bucket: ["1900_1945", "1946_1999", "2000_oggi"][Math.floor(index / 4) % 3],
      country_or_region: ["europa", "asia", "africa"][Math.floor(index / 5) % 3],
    };
    return row;
  }));
}
