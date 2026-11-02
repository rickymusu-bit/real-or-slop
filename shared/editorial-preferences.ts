import config from "./editorial-preferences.json";
const tags = config.tags;
export const preferenceVersion = config.version;
export const explorationRate = config.exploration;
export interface PreferenceCount { feature: string; approved: number; rejected: number }
export interface PreferenceModel { version: string; observations: number; exploration: number; counts: PreferenceCount[] }
export function visualTags(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((tag): tag is string => typeof tag === "string" && tags.includes(tag)))].slice(0, 12) : [];
}
export function preferenceFeatures(categories: string[], observed: unknown): string[] {
  return [...new Set([...categories.map(category => "category:" + category), ...visualTags(observed).map(tag => "visual:" + tag)])].sort();
}
// Beta(2,2) shrinkage: one rejection is evidence, not a permanent exclusion.
export function preferenceProbability(features: string[], model: PreferenceModel) {
  const counts = new Map(model.counts.map(row => [row.feature, row]));
  const estimates = features.map(feature => {
    const row = counts.get(feature);
    return row ? (row.approved + config.prior) / (row.approved + row.rejected + 2 * config.prior) : 0.5;
  });
  return estimates.length ? estimates.reduce((sum, value) => sum + value, 0) / estimates.length : 0.5;
}
export function preferenceOrder<T extends { features: string[] }>(items: T[], model: PreferenceModel, random = Math.random) {
  const remaining = items.slice(), selected: T[] = [];
  while (remaining.length) {
    const explore = random() < model.exploration;
    const weights = remaining.map(item => explore ? 1 : preferenceProbability(item.features, model));
    let target = random() * weights.reduce((sum, weight) => sum + weight, 0);
    let index = 0;
    while (index < weights.length - 1 && (target -= weights[index]) >= 0) index++;
    selected.push(remaining.splice(index, 1)[0]);
  }
  return selected;
}
