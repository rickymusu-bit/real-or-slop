import { balanced } from "../worker/game.ts";
import { curatedSample, dimensions, distributionDistance } from "../worker/sampling.ts";
import { diverseCatalog, image, seeded, skewedCatalog } from "../tests/sampling-fixtures.ts";

const seeds = 64;
const scenarios = {
  comparable: diverseCatalog(),
  opposing_distributions: skewedCatalog(),
  missing_metadata: diverseCatalog().map((row) => ({ ...row, curation: null, perceptual_hash: null })),
  disjoint: Array.from({ length: 40 }, (_, i) => image("disjoint" + i, i % 2 ? "REAL" : "AI", i % 2)),
  duplicates: (() => {
    const rows = diverseCatalog();
    return rows.flatMap((row) => [row, { ...row, id: row.id + "-duplicate", r2_key: row.r2_key }]);
  })(),
};
const results = {};
for (const [name, rows] of Object.entries(scenarios)) {
  const methods = {};
  for (const method of ["balanced", "curatedSample"]) {
    const distances = Object.fromEntries(dimensions.map((dimension) => [dimension, 0]));
    const observed = Object.fromEntries(dimensions.map((dimension) => [dimension, 0]));
    let duplicateSessions = 0, classDifference = 0, categories = 0, warnings = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const result = method === "balanced"
        ? { images: balanced(rows, 20, seeded(seed)), warnings: [] }
        : curatedSample(rows, 20, seeded(seed));
      const sample = result.images;
      for (const [dimension, value] of Object.entries(distributionDistance(sample))) {
        if (value !== null) { distances[dimension] += value; observed[dimension]++; }
      }
      duplicateSessions += new Set(sample.map((row) => row.sha256)).size !== sample.length ? 1 : 0;
      classDifference += Math.abs(sample.filter((row) => row.type === "REAL").length - sample.filter((row) => row.type === "AI").length);
      categories += new Set(sample.flatMap((row) => row.categories || [])).size;
      warnings += result.warnings.length ? 1 : 0;
    }
    methods[method] = {
      meanTotalVariation: Object.fromEntries(Object.entries(distances).map(([dimension, value]) => [dimension, observed[dimension] ? Number((value / observed[dimension]).toFixed(4)) : null])),
      meanDistinctCategoryTags: Number((categories / seeds).toFixed(4)),
      meanClassDifference: classDifference / seeds,
      sessionsWithExactDuplicates: duplicateSessions,
      sessionsWithWarnings: warnings,
    };
  }
  results[name] = methods;
}
console.log(JSON.stringify({ seeds: "1.." + seeds, count: 20, scenarios: results }, null, 2));
