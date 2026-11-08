import { sourcePageUrl } from "./editorial-workspace.v1.0.0";

export const MAX_LINKS_PER_BATCH = 20;

const COMMONS_IMAGE = /\.(?:jpe?g|png|webp)$/i;
function commonsName(raw: string): string | null {
  let name: string;
  try { name = decodeURIComponent(raw); } catch { return null; }
  name = name.replace(/_/g, " ").trim();
  if (!name || name.length > 255 || /[/\\#?]/.test(name) || !COMMONS_IMAGE.test(name)) return null;
  return name;
}
/** Canonical Commons `File:` page for any recognised Commons photo URL (v1.1.0, 2026-11-08T20:00:26Z).
 * Accepts File:/Image: pages, Special:FilePath, index.php?title=File:, media-viewer fragments
 * (`#/media/File:…`) and upload/thumb.wikimedia.org file URLs. Returns null otherwise. */
export function commonsPageUrl(value: string): string | null {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
  let name: string | null = null;
  if (url.hostname === "commons.wikimedia.org") {
    const media = url.hash.match(/^#\/media\/(?:File|Image):(.+)$/i);
    let path: string;
    try { path = decodeURIComponent(url.pathname); } catch { return null; }
    const raw = media?.[1] || path.match(/^\/wiki\/(?:File|Image):(.+)$/i)?.[1] ||
      path.match(/^\/wiki\/Special:FilePath\/(.+)$/i)?.[1] ||
      (path === "/w/index.php" ? url.searchParams.get("title")?.match(/^(?:File|Image):(.+)$/i)?.[1] : undefined);
    name = raw ? commonsName(media ? raw : encodeURIComponent(raw)) : null;
  } else if (url.hostname === "upload.wikimedia.org" || url.hostname === "thumb.wikimedia.org") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "wikipedia" || parts[1] !== "commons") return null;
    const file = parts[2] === "thumb" ? parts[5] : parts[4];
    name = file ? commonsName(file) : null;
  }
  return name ? "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(name.replace(/ /g, "_")) : null;
}
/** Commons photo URLs become their canonical File: page; other links keep the HTTPS page rules. */
export function proposalLinkUrl(value: unknown): string {
  if (typeof value === "string") {
    const commons = commonsPageUrl(value);
    if (commons) return commons;
  }
  return sourcePageUrl(typeof value === "string" ? value.trim() : value);
}
export function normalizeLinkBatch(values: unknown): string[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_LINKS_PER_BATCH)
    throw new Error("Inserisci da 1 a 20 link, uno per riga.");
  const unique = new Set<string>();
  values.forEach((item, i) => {
    if (typeof item !== "string") throw new Error("Link " + (i + 1) + ": indirizzo non valido.");
    try { unique.add(proposalLinkUrl(item)); }
    catch { throw new Error("Link " + (i + 1) + ": serve un URL HTTPS valido, senza credenziali o frammenti."); }
  });
  return [...unique];
}
export function parseLinkLines(text: string): string[] {
  return normalizeLinkBatch(text.split(/\r?\n/).map(s => s.trim()).filter(Boolean));
}
export function canAcquireCommons(value: string): boolean {
  if (commonsPageUrl(value)) return true;
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
