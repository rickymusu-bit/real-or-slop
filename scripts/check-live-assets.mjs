import { pathToFileURL, URL } from "node:url";

const agent = "RealOrSlop/1.0 (https://github.com/rickymusu-bit/real-or-slop)";
export async function checkLiveAssets(base, fetcher = fetch) {
  const site = new URL(base);
  if (site.protocol !== "https:" && !(site.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname)))
    throw new Error("HTTPS richiesto per verificare il sito pubblicato");
  if (site.username || site.password) throw new Error("Non inserire credenziali nell’URL");
  async function get(url, types) {
    const response = await fetcher(url, { headers: { "User-Agent": agent }, signal: globalThis.AbortSignal.timeout(30000), redirect: "error" });
    if (response.status !== 200) throw new Error(`Asset HTTP ${response.status}: ${url.pathname}`);
    const type = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (!types.includes(type)) throw new Error(`Content-Type errato per ${url.pathname}: ${type || "assente"}`);
    const text = await response.text();
    if (!text.trim()) throw new Error(`Asset vuoto: ${url.pathname}`);
    if (!types.includes("text/html") && /^\s*(?:<!doctype html|<html)/i.test(text)) throw new Error(`HTML al posto dell’asset: ${url.pathname}`);
    return text;
  }
  const html = await get(site, ["text/html"]);
  const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi), m => m[1]);
  const styles = Array.from(html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["']/gi), m => m[1]);
  if (!scripts.length || !styles.length) throw new Error("JavaScript o foglio di stile assente dalla pagina");
  const entries = [...scripts.map(path => [path, ["text/javascript", "application/javascript"]]), ...styles.map(path => [path, ["text/css"]])];
  for (const [path, types] of entries) {
    const url = new URL(path, site);
    if (url.origin !== site.origin) throw new Error("Risorsa esterna inattesa nella build");
    await get(url, types);
  }
  return { scripts: scripts.length, stylesheets: styles.length };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkLiveAssets(process.argv[2] || "https://real-or-slop.rickymusu.workers.dev");
  console.log(`Asset online verificati: ${result.scripts} JavaScript, ${result.stylesheets} CSS con MIME corretto.`);
}
