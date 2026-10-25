import { createHash } from "node:crypto";
import type { SamplingImage } from "../worker/sampling.ts";
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
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
