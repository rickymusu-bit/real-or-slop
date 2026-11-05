/** Pure, deterministic diagnostics for the private English brief space. */
import { hash, validateVector } from "./index-briefs.v1.0.0.mjs";

export const VERSION = "1.0.0";
const EPS = 1e-12;
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function check(condition, message) { if (!condition) throw Error(message); }
export function rng(seed) {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let x = state; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}
export function sample(values, count, seed) {
  const result = [...values], random = rng(seed);
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result.slice(0, count);
}
export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * p, i = Math.floor(position), fraction = position - i;
  return sorted[i] * (1 - fraction) + sorted[Math.min(i + 1, sorted.length - 1)] * fraction;
}
export function summarize(values) {
  check(values.every(Number.isFinite), "Non-finite metric");
  const sorted = [...values].sort((a, b) => a - b);
  return { n: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    min: sorted[0] ?? null, p10: quantile(sorted, 0.1), p25: quantile(sorted, 0.25), median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75), p90: quantile(sorted, 0.9), max: sorted.at(-1) ?? null };
}
export function cosineDistance(a, b) { return Math.max(0, Math.min(2, 1 - a.reduce((sum, x, i) => sum + x * b[i], 0))); }
export function distanceMatrix(rows, maxSamples = 1500) {
  check(rows.length <= maxSamples, `Exact kNN limited to ${maxSamples} rows; split the study or explicitly revise the configuration`);
  const dimension = rows[0]?.vector.length;
  check(new Set(rows.map(r => r.id)).size === rows.length && rows.every(r => typeof r.id === "string" && r.id), "Unique row IDs required");
  for (const row of rows) validateVector(row.vector, dimension);
  const matrix = rows.map(() => new Float64Array(rows.length));
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) matrix[i][j] = matrix[j][i] = cosineDistance(rows[i].vector, rows[j].vector);
  return matrix;
}
export function pairDistances(rows, matrix, maxPairs, seed) {
  const pairs = [], random = rng(seed); let seen = 0;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const pair = { a: rows[i].id, b: rows[j].id, distance: matrix[i][j] }; seen++;
    if (pairs.length < maxPairs) pairs.push(pair);
    else { const slot = Math.floor(random() * seen); if (slot < maxPairs) pairs[slot] = pair; }
  }
  pairs.sort((a, b) => cmp(a.a, b.a) || cmp(a.b, b.b));
  const histogram = Array.from({ length: 20 }, (_, i) => ({ lower: i / 10, upper: (i + 1) / 10, count: 0 }));
  for (const p of pairs) histogram[Math.min(19, Math.floor(p.distance * 10))].count++;
  return { total_pairs: seen, sampled_pairs: pairs.length, method: seen > pairs.length ? "seeded_reservoir" : "complete", summary: summarize(pairs.map(p => p.distance)), histogram, pairs };
}
export function neighbors(rows, matrix, ks = [1, 5, 10], radius = 0.3) {
  return rows.map((row, i) => {
    const nearest = rows.flatMap((r, j) => i === j ? [] : [{ id: r.id, distance: matrix[i][j] }]).sort((a, b) => a.distance - b.distance || cmp(a.id, b.id));
    const count = nearest.filter(n => n.distance <= radius + EPS).length;
    return { id: row.id, nearest: nearest.slice(0, Math.max(...ks)), knn: Object.fromEntries(ks.map(k => [k, { requested_k: k, available: nearest.length,
      state: nearest.length >= k ? "computed" : "insufficient_samples", mean_distance: nearest.length >= k ? summarize(nearest.slice(0, k).map(n => n.distance)).mean : null,
      kth_distance: nearest.length >= k ? nearest[k - 1].distance : null }])),
      density: { radius, neighbor_count: count, neighbor_fraction: nearest.length ? count / nearest.length : null } };
  });
}
export function outliers(nearest, preferredK = 5) {
  const k = nearest.length > preferredK ? preferredK : 1;
  const usable = nearest.filter(r => r.knn[k]?.state === "computed");
  if (usable.length < 3) return { state: "insufficient_samples", k, threshold: null, ids: [] };
  const values = usable.map(r => r.knn[k].mean_distance), median = summarize(values).median;
  const mad = summarize(values.map(x => Math.abs(x - median))).median;
  const threshold = median + 3 * 1.4826 * mad;
  return { state: "computed", method: "median_plus_3_scaled_MAD", k, median, mad, threshold,
    ids: usable.filter(r => r.knn[k].mean_distance > threshold + EPS).map(r => r.id), diagnostic_only: true };
}
export function pca(rows, { maxSamples = 500, sweeps = 40, tolerance = 1e-10, seed = 45 } = {}) {
  if (rows.length < 2) return { state: "insufficient_samples", n: rows.length, spectrum: [], projection: [], effective_dimension: null };
  const selected = (rows.length > maxSamples ? sample(rows, maxSamples, seed) : [...rows]).sort((a, b) => cmp(a.id, b.id));
  const n = selected.length, d = selected[0].vector.length, mean = Array(d).fill(0);
  for (const row of selected) for (let k = 0; k < d; k++) mean[k] += row.vector[k] / n;
  const centered = selected.map(r => r.vector.map((v, k) => v - mean[k]));
  const a = centered.map(() => new Float64Array(n)), eigenvectors = centered.map((_, i) => Float64Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) a[i][j] = a[j][i] = centered[i].reduce((sum, v, k) => sum + v * centered[j][k], 0) / (n - 1);
  let residual = Infinity, completed = 0;
  for (; completed < sweeps; completed++) {
    residual = 0;
    for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
      const off = a[p][q]; residual = Math.max(residual, Math.abs(off)); if (Math.abs(off) < tolerance) continue;
      const tau = (a[q][q] - a[p][p]) / (2 * off), t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t), s = t * c;
      a[p][p] -= t * off; a[q][q] += t * off; a[p][q] = a[q][p] = 0;
      for (let k = 0; k < n; k++) {
        if (k !== p && k !== q) { const kp = a[k][p], kq = a[k][q]; a[k][p] = a[p][k] = c * kp - s * kq; a[k][q] = a[q][k] = s * kp + c * kq; }
        const vp = eigenvectors[k][p], vq = eigenvectors[k][q]; eigenvectors[k][p] = c * vp - s * vq; eigenvectors[k][q] = s * vp + c * vq;
      }
    }
    if (residual < tolerance) break;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[j][j] - a[i][i] || i - j);
  const eigenvalues = order.map(i => Math.max(0, a[i][i])), total = eigenvalues.reduce((sum, v) => sum + v, 0);
  const positive = eigenvalues.filter(v => v > tolerance), proportions = positive.map(v => v / total);
  // Fix signs for repeatability. Degenerate eigenvalues can still rotate axes.
  const signs = order.slice(0, 2).map(index => { const pivot = eigenvectors.reduce((best, v, i) => Math.abs(v[index]) > Math.abs(eigenvectors[best][index]) ? i : best, 0); return eigenvectors[pivot][index] < 0 ? -1 : 1; });
  return { state: total <= tolerance ? "zero_variance" : residual < tolerance ? "computed" : "approximate_not_converged", n, total_n: rows.length,
    sampled: n < rows.length, selected_ids: selected.map(r => r.id), solver: "symmetric_gram_cyclic_jacobi.v1.0.0", sweeps: Math.min(completed + 1, sweeps), residual,
    total_variance: total, numerical_rank: positive.length, effective_dimension: total <= tolerance ? 0 : total * total / eigenvalues.reduce((sum, v) => sum + v * v, 0),
    entropy_dimension: total <= tolerance ? 0 : Math.exp(-proportions.reduce((sum, p) => sum + p * Math.log(p), 0)),
    spectrum: eigenvalues.slice(0, Math.min(n - 1, d)).map((value, i) => ({ component: i + 1, eigenvalue: value, explained_fraction: total ? value / total : 0 })),
    projection: selected.map((row, i) => ({ id: row.id, x: signs[0] * eigenvectors[i][order[0]] * Math.sqrt(eigenvalues[0] * (n - 1)),
      y: signs[1] * eigenvectors[i][order[1]] * Math.sqrt(eigenvalues[1] * (n - 1)) })),
    caveat: "2D proximity is not original distance; equal eigenvalues allow rotated axes. No map gaps imply objective missing topics." };
}
export function dbscan(rows, matrix, epsilon, minSamples) {
  check(Number.isFinite(epsilon) && epsilon >= 0 && epsilon <= 2 && Number.isSafeInteger(minSamples) && minSamples >= 2, "Invalid DBSCAN parameters");
  const labels = Array(rows.length).fill(undefined); let clusters = 0;
  const nearby = i => rows.flatMap((_, j) => matrix[i][j] <= epsilon + EPS ? [j] : []);
  for (let i = 0; i < rows.length; i++) {
    if (labels[i] !== undefined) continue;
    const near = nearby(i);
    if (near.length < minSamples) { labels[i] = -1; continue; }
    labels[i] = clusters; const queue = [...near], queued = new Set(queue);
    for (let head = 0; head < queue.length; head++) {
      const j = queue[head];
      if (labels[j] === -1) labels[j] = clusters;
      if (labels[j] !== undefined) continue;
      labels[j] = clusters;
      const next = nearby(j);
      if (next.length >= minSamples) for (const k of next) if (!queued.has(k)) { queue.push(k); queued.add(k); }
    }
    clusters++;
  }
  return { epsilon, min_samples: minSamples, min_samples_includes_self: true, cluster_count: clusters, noise_count: labels.filter(x => x === -1).length,
    clusters: Array.from({ length: clusters }, (_, c) => ({ label: c, size: labels.filter(x => x === c).length, ids: rows.filter((_, i) => labels[i] === c).map(r => r.id) })),
    assignments: rows.map((r, i) => ({ id: r.id, cluster: labels[i] === -1 ? null : labels[i], state: labels[i] === -1 ? "noise" : "clustered" })) };
}
export function clusterStability(a, b) {
  check(a.assignments.length === b.assignments.length && a.assignments.every((r, i) => r.id === b.assignments[i].id), "Cluster IDs/order differ");
  let intersection = 0, union = 0;
  for (let i = 0; i < a.assignments.length; i++) for (let j = i + 1; j < a.assignments.length; j++) {
    const sameA = a.assignments[i].cluster !== null && a.assignments[i].cluster === a.assignments[j].cluster;
    const sameB = b.assignments[i].cluster !== null && b.assignments[i].cluster === b.assignments[j].cluster;
    if (sameA && sameB) intersection++; if (sameA || sameB) union++;
  }
  return { state: union ? "computed" : "no_coclustered_pairs", pair_jaccard_excluding_noise: union ? intersection / union : null,
    intersection_pairs: intersection, union_pairs: union, noise_disagreements: a.assignments.filter((r, i) => (r.cluster === null) !== (b.assignments[i].cluster === null)).length };
}
export function coverage(rows, reference, radii = [0.2, 0.3, 0.4, 0.5]) {
  const candidates = reference.map(r => {
    const nearest = rows.map(row => ({ id: row.id, distance: cosineDistance(r.vector, row.vector) })).sort((a, b) => a.distance - b.distance || cmp(a.id, b.id));
    return { id: r.id, provenance: r.provenance, description: r.description, nearest_id: nearest[0]?.id ?? null, min_distance: nearest[0]?.distance ?? null };
  });
  const summarizeCandidates = values => ({ ...summarize(values.flatMap(r => r.min_distance === null ? [] : [r.min_distance])), candidates: values.length,
    within_radius: radii.map(radius => ({ radius, fraction: rows.length && values.length ? values.filter(r => r.min_distance <= radius + EPS).length / values.length : null })) });
  return { state: !reference.length ? "empty_reference" : !rows.length ? "empty_catalog" : "computed", catalog_n: rows.length, summary: summarizeCandidates(candidates),
    by_provenance: Object.fromEntries([...new Set(candidates.map(r => r.provenance))].sort().map(p => [p, summarizeCandidates(candidates.filter(r => r.provenance === p))])),
    candidates, diagnostic_only: true, caveat: "Distances and radii describe this reference corpus only; they do not authorize or reject image acquisition." };
}
export function randomCoverage(rows, reference, count, repetitions, seed, tagIds = []) {
  const active = rows.filter(r => r.status !== "retired"), budget = Math.min(count, active.length);
  if (!active.length || !reference.length) return { state: "insufficient_samples", budget, repetitions: 0 };
  const runs = [], candidates = new Map(reference.map(r => [r.id, []]));
  for (let i = 0; i < repetitions; i++) {
    const selected = sample(active, budget, seed + i), result = coverage(selected, reference);
    runs.push({ seed: seed + i, selected_ids: selected.map(r => r.id), median: result.summary.median, p90: result.summary.p90 });
    for (const r of result.candidates) candidates.get(r.id).push(r.min_distance);
  }
  const tagRows = rows.filter(r => tagIds.includes(r.id));
  check(!tagIds.length || tagRows.length === budget && tagRows.every(r => r.status !== "retired") && new Set(tagIds).size === budget, "Tag baseline must use the same active population and budget");
  return { state: "computed", budget, active_population: active.length, repetitions, seed, sampling: "mulberry32_fisher_yates.v1.0.0", median_distribution: summarize(runs.map(r => r.median)), p90_distribution: summarize(runs.map(r => r.p90)),
    candidate_distances: [...candidates].map(([id, distances]) => ({ id, ...summarize(distances) })), runs,
    tag_only_same_budget: tagIds.length ? { selected_ids: tagIds, coverage: coverage(tagRows, reference) } : null,
    caveat: "Compare tag-only and random at the same budget. Full-catalog distances can only improve as rows are added; that comparison does not establish selection quality." };
}
const ranks = values => {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v), result = Array(values.length); let start = 0;
  while (start < order.length) { let end = start + 1; while (end < order.length && order[end].v === order[start].v) end++; for (let i = start; i < end; i++) result[order[i].i] = (start + end - 1) / 2; start = end; }
  return result;
};
export function spearman(a, b) {
  if (a.length < 3) return null;
  const x = ranks(a), y = ranks(b), mean = (a.length - 1) / 2;
  const numerator = x.reduce((sum, v, i) => sum + (v - mean) * (y[i] - mean), 0);
  const denominator = Math.sqrt(x.reduce((sum, v) => sum + (v - mean) ** 2, 0) * y.reduce((sum, v) => sum + (v - mean) ** 2, 0));
  return denominator > EPS ? numerator / denominator : null;
}
export function confounders(rows, pairs) {
  const lookup = new Map(rows.map(r => [r.id, r])), words = text => text.toLowerCase().match(/[a-z]+/g) || [];
  const lengths = new Map(rows.map(r => [r.id, words(r.description || "").length]));
  const grams = new Map();
  for (const r of rows) {
    const w = words(r.description || ""), present = new Set();
    for (let i = 0; i + 2 < w.length; i++) present.add(w.slice(i, i + 3).join(" "));
    for (const gram of present) grams.set(gram, (grams.get(gram) || 0) + 1);
  }
  const primaryTopic = r => r.tags?.[0] ?? null;
  const within = pairs.filter(p => primaryTopic(lookup.get(p.a)) !== null && primaryTopic(lookup.get(p.a)) === primaryTopic(lookup.get(p.b)));
  const between = pairs.filter(p => primaryTopic(lookup.get(p.a)) !== null && primaryTopic(lookup.get(p.b)) !== null && primaryTopic(lookup.get(p.a)) !== primaryTopic(lookup.get(p.b)));
  return { canonical_language: "en", description_words: summarize([...lengths.values()]),
    distance_vs_length_difference_spearman: spearman(pairs.map(p => p.distance), pairs.map(p => Math.abs(lengths.get(p.a) - lengths.get(p.b)))),
    same_primary_tag: summarize(within.map(p => p.distance)), different_primary_tag: summarize(between.map(p => p.distance)),
    same_medium: summarize(pairs.filter(p => lookup.get(p.a).medium === lookup.get(p.b).medium).map(p => p.distance)),
    different_medium: summarize(pairs.filter(p => lookup.get(p.a).medium !== lookup.get(p.b).medium).map(p => p.distance)),
    shared_description_trigrams: [...grams].filter(([, count]) => count >= Math.max(2, rows.length * 0.2)).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).map(([text, count]) => ({ text, count })),
    caveat: "Length, repeated context phrases, medium and seed topics may drive neighbors. Correlation is descriptive; tags are not ground truth or quotas." };
}
export function analyzeSpace(input, reference, config) {
  const rows = [...input].sort((a, b) => cmp(a.id, b.id)), matrix = distanceMatrix(rows, config.max_samples);
  for (const row of reference) validateVector(row.vector, rows[0]?.vector.length ?? row.vector.length);
  check(new Set(reference.map(r => r.id)).size === reference.length, "Duplicate reference IDs");
  const pairs = pairDistances(rows, matrix, config.max_pairs, config.seed), nearest = neighbors(rows, matrix, config.ks, config.density_radius);
  const clusterRuns = config.cluster_epsilons.flatMap(e => config.cluster_min_samples.map(m => dbscan(rows, matrix, e, m)));
  const base = clusterRuns.find(r => r.epsilon === config.cluster_default_epsilon && r.min_samples === config.cluster_default_min_samples);
  check(base, "Default clustering must occur in sensitivity grid");
  const groups = { draft: rows.filter(r => r.status === "draft"), approved: rows.filter(r => r.status === "approved"), retired: rows.filter(r => r.status === "retired"),
    used: rows.filter(r => r.used === true), unused: rows.filter(r => r.used === false), usage_unknown: rows.filter(r => r.used === null),
    REAL_approved: rows.filter(r => r.real_approved === true), SLOP_approved: rows.filter(r => r.slop_approved === true),
    neither_origin_approved: rows.filter(r => r.real_approved === false && r.slop_approved === false),
    REAL_approval_unknown: rows.filter(r => r.real_approved === null), SLOP_approval_unknown: rows.filter(r => r.slop_approved === null) };
  const centroid = rows[0]?.vector.map((_, k) => rows.reduce((sum, r) => sum + r.vector[k], 0) / rows.length) ?? [];
  const radii = rows.map(r => r.vector.reduce((sum, v, k) => sum + (v - centroid[k]) ** 2, 0));
  return { version: VERSION, state: rows.length ? "computed" : "empty_catalog", n: rows.length,
    distances: pairs, knn_summary: Object.fromEntries(config.ks.map(k => [k, summarize(nearest.flatMap(r => r.knn[k].mean_distance === null ? [] : [r.knn[k].mean_distance]))])),
    neighbors: nearest, dispersion: { mean_squared_euclidean_to_centroid: summarize(radii).mean, centroid_norm: rows.length ? Math.hypot(...centroid) : null },
    outliers: outliers(nearest), pca: pca(rows, { maxSamples: config.pca_max_samples, sweeps: config.pca_sweeps, tolerance: config.pca_tolerance, seed: config.seed }),
    clustering: { algorithm: "DBSCAN_cosine.v1.0.0", default: base, sensitivity: clusterRuns.map(r => ({ ...r, stability_vs_default: clusterStability(base, r) })),
      caveat: "Exploratory parameter grid; noise is valid and no cluster is mandatory. Pair Jaccard excludes noise and is null when no positive co-cluster pairs exist." },
    coverage: coverage(rows, reference, config.coverage_radii),
    groups: Object.fromEntries(Object.entries(groups).map(([name, subset]) => { const m = distanceMatrix(subset, config.max_samples), nn = neighbors(subset, m, config.ks, config.density_radius);
      return [name, { n: subset.length, within_group_knn: Object.fromEntries(config.ks.map(k => [k, summarize(nn.flatMap(r => r.knn[k].mean_distance === null ? [] : [r.knn[k].mean_distance]))])), coverage: coverage(subset, reference, config.coverage_radii) }]; })),
    confounders: confounders(rows, pairs.pairs), input_ids_sha256: hash(rows.map(r => r.id)) };
}
