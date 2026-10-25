import { test } from "node:test";
import assert from "node:assert/strict";
import { broadenedCatalog, diverseCatalog, image, quotaBaseline, smallComparableCatalog, skewedCatalog } from "./sampling-fixtures.ts";
import { simulations } from "./sampling-statistics.ts";

// Six standard errors (plus one count for discreteness). This catches quota
// feedback without confusing normal Bernoulli fluctuations with regressions.
function fair({ real, trials }: { real: number; trials: number }) {
  assert.ok(trials >= 500, `insufficient trials: ${trials}`);
  assert.ok(Math.abs(real - trials / 2) <= 6 * Math.sqrt(trials / 4) + 1,
    `REAL=${real}, trials=${trials}`);
}
const run = simulations(smallComparableCatalog(), 10000, 12);
test("A: global and position frequencies converge to 1/2 over 120000 draws", () => {
  assert.equal(run.total, 120000);
  fair({ real: run.real, trials: run.total });
  run.positions.forEach(fair);
});
test("B: REAL remains a fair coin after repeated and mixed histories", () => {
  for (const context of Object.values(run.contexts)) fair(context);
});
test("C: game totals follow Binomial(12,1/2), with natural imbalance and long runs", () => {
  let combinations = 1;
  for (let k = 0; k <= 12; k++) {
    if (k) combinations *= (13 - k) / k;
    const p = combinations / 4096;
    assert.ok(Math.abs(run.histogram[k] - run.games * p) <= 6 * Math.sqrt(run.games * p * (1 - p)) + 2,
      `bin ${k}: ${run.histogram[k]}`);
  }
  assert.ok(Math.abs(run.realCountVariance - 3) <= 6 * Math.sqrt(16.5 / run.games) + 0.001);
  assert.ok(run.histogram[10] > 0 && run.histogram[2] > 0 && run.longestRun >= 10);
  const flawed = simulations(smallComparableCatalog(), 1000, 12, quotaBaseline);
  assert.equal(flawed.realCountVariance, 0); // Negative control: quotas fail C.
  assert.ok(flawed.contexts.RRRR.real / flawed.contexts.RRRR.trials < 0.4);
});
test("D: editorial characteristics are comparable across games, not forced inside each game", () => {
  for (const rows of [skewedCatalog(), diverseCatalog()]) {
    const population = simulations(rows, 2048, 12);
    fair({ real: population.real, trials: population.total });
    for (const [dimension, distance] of Object.entries(population.aggregateDistances)) {
      assert.ok(distance !== null && distance < 0.05, `${dimension}: ${distance}`);
    }
    assert.equal(population.duplicateGames, 0);
  }
});
test("E: pre-reduction preserves fair coins even when every sequence can exhaust a class", () => {
  const rows = [...Array.from({ length: 3 }, (_, i) => image("few" + i, "REAL")),
    ...Array.from({ length: 20 }, (_, i) => image("many" + i, "AI"))];
  const reduced = simulations(rows, 5000, 12);
  assert.equal(reduced.minimumLength, 3);
  assert.equal(reduced.maximumLength, 3);
  fair({ real: reduced.real, trials: reduced.total });
  fair(reduced.contexts.RR);
  fair(reduced.contexts.AA);
  assert.ok(reduced.histogram[0] > 0 && reduced.histogram[3] > 0);
  assert.equal(reduced.duplicateGames, 0);
});
test("weighted secondary matching remains active after broadening primary strata", () => {
  const population = simulations(broadenedCatalog(), 512, 12);
  fair({ real: population.real, trials: population.total });
  assert.equal(population.gamesWithWarnings, 512);
  assert.ok(population.aggregateDistances.composition! < 0.08);
  assert.ok(population.aggregateDistances.country_or_region! < 0.08);
});
