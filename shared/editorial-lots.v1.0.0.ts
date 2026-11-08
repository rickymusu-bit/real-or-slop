/** Editorial lots, phase 1 (docs/lotti-editoriali.v1.3.1.md). v1.0.0, 2026-11-08T20:00:26Z. */
/** Title proposal: the Commons category shared by most selected files, else the browsing context.
 * Returns "" when no proposal reaches the 6-character minimum of a lot title. */
export function proposeLotTitle(files: ReadonlyArray<{ categories: readonly string[] }>, fallback: string): string {
  const counts = new Map<string, number>();
  for (const file of files) for (const category of new Set(file.categories)) counts.set(category, (counts.get(category) || 0) + 1);
  let best = "", top = 0;
  for (const [category, count] of counts) if (count > top) { best = category; top = count; }
  const title = (best || fallback.replace(/^Category:/, "")).replace(/_/g, " ").trim().slice(0, 200);
  return title.length >= 6 ? title : "";
}
