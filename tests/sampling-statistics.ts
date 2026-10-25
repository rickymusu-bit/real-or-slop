import { curatedSample, distributionDistance, type SamplingImage } from "../worker/sampling.ts";
import type { Random } from "../worker/random.ts";
import { seeded } from "./sampling-fixtures.ts";

export const histories = ["R", "A", "RR", "AA", "RRRR", "AAAA", "RRRRRR", "AAAAAA", "RA", "AR", "RARA", "ARRA", "RRAA", "RRRA", "RAAA", "ARRRR"];
export function simulations(rows: readonly SamplingImage[], games: number, count: number,
  sampler: (rows: readonly SamplingImage[], count: number, random: Random) => { images: SamplingImage[]; warnings: string[] } = curatedSample) {
  const contexts = Object.fromEntries(histories.map((history) => [history, { trials: 0, real: 0 }]));
  const histogram = Array<number>(count + 1).fill(0);
  const positions = Array.from({ length: count }, () => ({ trials: 0, real: 0 }));
  const samples: SamplingImage[] = [];
  let real = 0, total = 0, duplicateGames = 0, warnings = 0, longestRun = 0;
  let minimum = count, maximum = 0, sumReal = 0, sumSquaredReal = 0;
  for (let seed = 1; seed <= games; seed++) {
    const result = sampler(rows, count, seeded(seed));
    const labels = result.images.map((row) => row.type === "REAL" ? "R" : "A");
    const successes = labels.filter((label) => label === "R").length;
    total += labels.length; real += successes;
    histogram[successes]++;
    sumReal += successes; sumSquaredReal += successes * successes;
    minimum = Math.min(minimum, labels.length); maximum = Math.max(maximum, labels.length);
    duplicateGames += new Set(result.images.map((row) => row.sha256 && row.sha256 !== "pending" ? row.sha256 : row.id)).size < labels.length ? 1 : 0;
    warnings += result.warnings.length ? 1 : 0;
    let run = 0;
    labels.forEach((label, index) => {
      run = index && label === labels[index - 1] ? run + 1 : 1;
      longestRun = Math.max(longestRun, run);
      positions[index].trials++; positions[index].real += label === "R" ? 1 : 0;
      for (const history of histories) {
        if (index >= history.length && labels.slice(index - history.length, index).join("") === history) {
          contexts[history].trials++;
          contexts[history].real += label === "R" ? 1 : 0;
        }
      }
    });
    samples.push(...result.images);
  }
  return {
    games, requested: count, minimumLength: minimum, maximumLength: maximum, real, total,
    realFrequency: total ? real / total : null,
    realCountVariance: sumSquaredReal / games - (sumReal / games) ** 2,
    histogram, contexts, positions, longestRun, duplicateGames, gamesWithWarnings: warnings,
    aggregateDistances: distributionDistance(samples),
  };
}
