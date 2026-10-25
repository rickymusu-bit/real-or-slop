import { curatedSample } from "../worker/sampling.ts";
import { simulations } from "../tests/sampling-statistics.ts";
import { diverseCatalog, image, quotaBaseline, smallComparableCatalog, skewedCatalog } from "../tests/sampling-fixtures.ts";

// Compare the rejected quota policy with the correction. Per-game exact counts
// are NOT a correctness metric; conditional probabilities and binomial spread are.
const count = 12, games = 2048;
const scenarios = {
  comparable: diverseCatalog(),
  opposing_distributions: skewedCatalog(),
  missing_metadata: diverseCatalog().map((row) => ({ ...row, curation: null, perceptual_hash: null })),
  disjoint: Array.from({ length: 40 }, (_, i) => image("disjoint" + i, i % 2 ? "REAL" : "AI", i % 2)),
  duplicates: diverseCatalog().flatMap((row) => [row, { ...row, id: row.id + "-duplicate" }]),
  limited: [...Array.from({ length: 3 }, (_, i) => image("few" + i, "REAL")),
    ...Array.from({ length: 20 }, (_, i) => image("many" + i, "AI"))],
};
const results = {};
for (const [name, rows] of Object.entries(scenarios)) {
  results[name] = {
    legacyQuota: simulations(rows, games, count, quotaBaseline),
    independentStratified: simulations(rows, games, count, curatedSample),
  };
}
console.log(JSON.stringify({
  rng: "Mulberry32, per-game seeds 1..games; production uses Web Crypto",
  tolerance: "Unit tests use six binomial standard errors plus discreteness; editorial distances aggregate all games",
  independence: {
    legacyQuota: simulations(smallComparableCatalog(), 10000, count, quotaBaseline),
    independentStratified: simulations(smallComparableCatalog(), 10000, count, curatedSample),
  },
  scenarios: results,
}, null, 2));
