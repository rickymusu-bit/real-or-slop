/** v1.0.0. Independent owner-editorial learners; never classify authenticity by model score. */
export const editorialIntelligenceVersion = "1.0.0";
export type Origin = "REAL" | "AI";
export type Profile = { subject: string; action: string; setting: string; composition: string; visibility: string; interest: string; tags: string[] };
export type PreferenceRow = { feature: string; approved: number; rejected: number };
const forbidden = new Set(["", "a", "di", "del", "della", "dei", "delle", "in", "il", "le", "la", "per", "da", "con", "nel", "sul", "the", "and", "of", "at", "on", "for"]);
const synonym = new Map([["manifestazioni","proteste"],["manifestazione","proteste"],["protesta","proteste"],["riot","rivolte"],["riots","rivolte"],["protests","proteste"],["protest","proteste"],["demonstration","proteste"],
  ["demonstrations","proteste"],["paris","parigi"],["france","francia"],["october","ottobre"],["september","settembre"],
  ["november","novembre"],["farmers","agricoltori"],["farmer","agricoltori"]]);
export function topicTerms(value: string): string[] {
  return [...new Set((value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])
    .filter(token => token.length > 2 && !forbidden.has(token)).map(token => synonym.get(token) || token))];
}
export function similarTopic(a: string, b: string): boolean {
  const left = topicTerms(a), right = topicTerms(b);
  const intersection = left.filter(w => right.includes(w)).length;
  const union = new Set([...left, ...right]).size;
  return a.toLowerCase().trim() === b.toLowerCase().trim() ||
    (union > 0 && intersection / union >= 0.72 && intersection >= 2);
}
export function suggestedTopicTitle(value: unknown): string {
  if (typeof value !== "string") throw Error("Argomento non valido");
  const v = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (v.length < 12 || v.length > 200 || !/[\p{L}]/u.test(v)) throw Error("Argomento troppo generico o lungo");
  return v;
}
export function profileTags(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const tags = (input as { tags?: unknown }).tags;
  return Array.isArray(tags)
    ? [...new Set(tags.filter((tag): tag is string => typeof tag === "string" && /^[a-z][a-z0-9_]{2,39}$/.test(tag)))].slice(0, 12)
    : [];
}
export function preferenceScore(features: string[], counts: PreferenceRow[]): number {
  const byFeature = new Map(counts.map(r => [r.feature, r]));
  const scores = features.map(tag => {
    const row = byFeature.get(tag);
    return row ? (row.approved + 2) / (row.approved + row.rejected + 4) : 0.5;
  });
  return scores.length ? scores.reduce((a,b) => a+b,0) / scores.length : 0.5;
}
export function rankEditorial<T extends { id: string; tags: string[] }>(
  items: T[], counts: PreferenceRow[], exploratoryEvery = 5
): Array<T & { score: number; reason: string }> {
  if (!Number.isSafeInteger(exploratoryEvery) || exploratoryEvery < 2) throw Error("Intervallo di esplorazione non valido");
  const ranked = items.map(item => ({ ...item, score: preferenceScore(item.tags, counts),
    reason: item.tags.length ? "Caratteristiche: " + item.tags.join(", ") : "Preferenze ancora insufficienti" }))
    .sort((a,b) => b.score-a.score || a.id.localeCompare(b.id));
  // Deterministic exploration; never suppress low-score candidates.
  for (let i=exploratoryEvery-1; i<ranked.length; i+=exploratoryEvery) {
    const index = ranked.length-1-(Math.floor(i/exploratoryEvery));
    if (index > i) ranked.splice(i,0,ranked.splice(index,1)[0]);
  }
  return ranked;
}
export function reliableFeedback(reason: unknown, decision: unknown): boolean {
  return ["approved","rejected"].includes(String(decision)) && (reason == null || reason === "editorial");
}
export function imageFormatChoice(slot: number): { size: "1536x1024" | "1024x1536" | "1024x1024"; variant: "landscape" | "portrait" | "square" } {
  if (!Number.isSafeInteger(slot) || slot < 0 || slot > 31) throw Error("Slot non valido");
  const variants = [
    {size:"1536x1024",variant:"landscape"},
    {size:"1024x1536",variant:"portrait"},
    {size:"1024x1024",variant:"square"}
  ] as const;
  return variants[slot % variants.length];
}
