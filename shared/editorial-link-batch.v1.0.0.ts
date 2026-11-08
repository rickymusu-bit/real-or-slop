import { sourcePageUrl } from "./editorial-workspace.v1.0.0";

export const MAX_LINKS_PER_BATCH = 20;

export function normalizeLinkBatch(values: unknown): string[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_LINKS_PER_BATCH)
    throw new Error("Inserisci da 1 a 20 link, uno per riga.");
  const unique = new Set<string>();
  values.forEach((item, i) => {
    if (typeof item !== "string") throw new Error("Link " + (i + 1) + ": indirizzo non valido.");
    try { unique.add(sourcePageUrl(item.trim())); }
    catch { throw new Error("Link " + (i + 1) + ": serve un URL HTTPS valido, senza credenziali o frammenti."); }
  });
  return [...unique];
}
export function parseLinkLines(text: string): string[] {
  return normalizeLinkBatch(text.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
}
export function canAcquireCommons(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
    if (url.hostname === "commons.wikimedia.org") {
      const path = decodeURIComponent(url.pathname);
      return /^\/wiki\/(?:File|Image):.+/i.test(path) || /^\/wiki\/Special:FilePath\/.+/i.test(path) ||
        (path === "/w/index.php" && /^(?:File|Image):.+/i.test(url.searchParams.get("title") || ""));
    }
    return url.hostname === "upload.wikimedia.org" && url.pathname.startsWith("/wikipedia/commons/");
  } catch { return false; }
}
