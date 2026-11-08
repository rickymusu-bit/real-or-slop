/** Only Wikimedia Commons URLs. Never fetch an arbitrary submitted host. */
import { imageMime } from "../shared/editorial-workspace.v1.0.0";
import { imageDimensions } from "../shared/image-dimensions.v1.0.0";
import { HttpError } from "./core";
export const MAX_IMAGE_BYTES = 12_000_000;
export const MAX_IMAGE_PIXELS = 32_000_000;
export interface CommonsFile {
  title: string; source_url: string; download_url: string; author: string;
  license_url: string; description: string; width: number; height: number;
  bytes: ArrayBuffer; mime: string; original_is_preview: boolean;
  /** Selected context for the future lot planner (spec lotti 1.3.1, section 5.2); unverified claims. */
  categories: string[]; date: string;
}
/** Wikimedia rejects automated requests without an identifying User-Agent; Workers send none by default.
 * v1.2.0 (2026-11-08T21:00:00Z). Contact is the public site, never a personal address. */
export const COMMONS_HEADERS = {
  "User-Agent": "RealOrSlop/0.24 (https://real-or-slop.rickymusu.workers.dev; owner curation tool) Cloudflare-Worker",
  "Api-User-Agent": "RealOrSlop/0.24 (https://real-or-slop.rickymusu.workers.dev; owner curation tool)",
};
function commonsUnavailable(what: string, status: number): HttpError {
  return new HttpError(502, what + " (HTTP " + status + "): riprova più tardi");
}
const allowedHosts = new Set(["commons.wikimedia.org","upload.wikimedia.org","thumb.wikimedia.org"]);
const imageExt = /\.(?:jpe?g|png|webp)$/i;
function decodeName(value: string) {
  let name: string;
  try { name = decodeURIComponent(value).replace(/_/g, " "); }
  catch { throw new HttpError(400, "Nome Commons non decodificabile"); }
  if (!name || name.length > 255 || !imageExt.test(name) || /[/\\]/.test(name) ||
    [...name].some(ch => ch.charCodeAt(0)<32) || name === "." || name === "..")
    throw new HttpError(400, "Usare una fotografia JPEG/PNG/WebP di Commons");
  return name;
}
export function commonsFileTitle(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(400,"URL non valido"); }
  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname) || url.port || url.username || url.password)
    throw new HttpError(400,"Acquisizione automatica limitata ai file Wikimedia Commons");
  if (url.hostname === "commons.wikimedia.org") {
    const path = decodeURIComponent(url.pathname);
    const wiki = path.match(/^\/wiki\/(?:File|Image):(.+)$/i);
    const special = path.match(/^\/wiki\/Special:FilePath\/(.+)$/i);
    const indexed = path === "/w/index.php" ? url.searchParams.get("title")?.match(/^(?:File|Image):(.+)$/i) : null;
    const name = wiki?.[1] || special?.[1] || indexed?.[1];
    if (!name) throw new HttpError(400,"Pagina File: di Commons richiesta");
    return "File:" + decodeName(name);
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "wikipedia" || parts[1] !== "commons" || parts.length < 5)
    throw new HttpError(400,"URL Wikimedia non riconosciuto");
  const thumbIndex = parts.indexOf("thumb");
  const filename = thumbIndex === 2 ? parts[5] : parts[4];
  return "File:" + decodeName(filename);
}
export function commonsApiUrl(title: string): string {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [key,value] of Object.entries({
    action:"query", format:"json", formatversion:"2", prop:"imageinfo",
    iiprop:"url|size|timestamp|extmetadata", iiextmetadatalanguage:"en", iiurlwidth:"2048", titles:title
  })) api.searchParams.set(key,value);
  return api.href;
}
function simpleHtml(value: unknown): string {
  return typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|amp|lt|gt|quot);/g, " ").replace(/\s+/g," ").trim().slice(0,500) : "";
}
async function bounded(url: string, max = MAX_IMAGE_BYTES): Promise<{bytes:ArrayBuffer;mime:string}> {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== "upload.wikimedia.org" ||
      !u.pathname.startsWith("/wikipedia/commons/") || u.username || u.password || u.port)
    throw new HttpError(400,"Download non consentito dal provider");
  const response = await fetch(u.href,{redirect:"manual",headers:{...COMMONS_HEADERS,"Accept":"image/jpeg,image/png,image/webp"}});
  if (response.status !== 200 || !response.body) throw commonsUnavailable("Immagine Commons non raggiungibile", response.status);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > max) throw new HttpError(413,"File Commons troppo grande");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > max) { await reader.cancel(); throw new HttpError(413,"File Commons troppo grande"); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk,offset); offset += chunk.length; }
  const mime = imageMime(all);
  if (!mime) throw new HttpError(415,"Il file Commons non è una fotografia JPEG/PNG/WebP");
  try { imageDimensions(all); } catch { throw new HttpError(415,"Intestazione o dimensioni del file Commons non valide"); }
  return {bytes:all.buffer,mime};
}
export async function commonsFile(value: string): Promise<CommonsFile> {
  const title = value.startsWith("File:") ? "File:" + decodeName(value.slice(5)) : commonsFileTitle(value);
  const response = await fetch(commonsApiUrl(title),{redirect:"manual",headers:{...COMMONS_HEADERS,"Accept":"application/json"}});
  if (response.status !== 200) throw commonsUnavailable("API Commons non disponibile", response.status);
  const info = await response.json() as { query?: { pages?: Array<{title?:string;imageinfo?:Array<{
    url?:string;thumburl?:string;width?:number;height?:number;size?:number;
    extmetadata?:Record<string,{value?:string}>
  }>}>} };
  const page = info.query?.pages?.[0], image = page?.imageinfo?.[0];
  if (!image || !image.url) throw new HttpError(404,"File Commons non trovato");
  if (!Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) ||
      (image.width || 0)<1 || (image.height || 0)<1 ||
      (image.width || 0)*(image.height || 0)>MAX_IMAGE_PIXELS)
    throw new HttpError(413,"Dimensioni dell'originale fuori limite");
  const chooseThumb = (image.size || 0)>MAX_IMAGE_BYTES;
  const download = chooseThumb ? image.thumburl : image.url;
  if (!download) throw new HttpError(413,"Nessuna copia proporzionale disponibile");
  const file = await bounded(download);
  const ext = image.extmetadata || {};
  const meta = (key:string) => simpleHtml(ext[key]?.value);
  const license = meta("LicenseUrl");
  const categories = typeof ext.Categories?.value === "string" ? ext.Categories.value.split("|")
    .map(c => c.trim()).filter(c => c && c.length <= 200).slice(0, 40) : [];
  return {title:page?.title || title,source_url:"https://commons.wikimedia.org/wiki/"+encodeURIComponent(page?.title || title).replace(/%3A/ig,":"),
    download_url:download,author:meta("Artist"),license_url:license,description:meta("ImageDescription"),
    width:image.width!,height:image.height!,bytes:file.bytes,mime:file.mime,original_is_preview:chooseThumb,
    categories,date:meta("DateTimeOriginal").slice(0,100) || meta("DateTime").slice(0,100)};
}
export async function searchCommons(query:string,limit=12): Promise<string[]> {
  if (query.length<3 || query.length>250 || limit<1 || limit>25) throw new HttpError(400,"Ricerca Commons non valida");
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k,v] of Object.entries({action:"query",format:"json",formatversion:"2",list:"search",srnamespace:"6",
    srlimit:String(limit),srsearch:query})) url.searchParams.set(k,v);
  const response = await fetch(url.href,{redirect:"manual",headers:{...COMMONS_HEADERS,"Accept":"application/json"}});
  if (response.status!==200) throw commonsUnavailable("Ricerca Commons non disponibile", response.status);
  const data = await response.json() as {query?:{search?:Array<{title?:string}>}};
  return (data.query?.search || []).map(x=>x.title || "").filter(x=>/^File:.+\.(jpe?g|png|webp)$/i.test(x)).slice(0,limit);
}

// v1.1.0 (2026-11-08T20:00:26Z): owner browsing for lots (spec lotti 1.3.1, section 3). Read-only, no paid calls.
export interface CommonsBrowseFile { title: string; page_url: string; thumb_url: string; width: number; height: number;
  author: string; license: string; categories: string[]; }
export interface CommonsBrowseResult { files: CommonsBrowseFile[]; categories: string[]; next: string | null; }
const BROWSE_IMAGE = /^File:.+\.(?:jpe?g|png|webp)$/i;
function pageUrl(title: string) {
  return "https://commons.wikimedia.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_")).replace(/%3A/ig, ":");
}
function thumbAllowed(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname === "upload.wikimedia.org" && u.pathname.startsWith("/wikipedia/commons/");
  } catch { return false; }
}
type BrowsePage = { title?: string; index?: number; categories?: Array<{ title?: string }>; imageinfo?: Array<{ thumburl?: string; width?: number; height?: number;
  extmetadata?: Record<string, { value?: string }> }> };
async function browse(params: Record<string, string>, continueKey: string): Promise<CommonsBrowseResult> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k, v] of Object.entries({ action: "query", format: "json", formatversion: "2", prop: "imageinfo|categories", clshow: "!hidden", cllimit: "max",
    iiprop: "url|size|extmetadata", iiurlwidth: "320", iiextmetadatafilter: "Artist|LicenseShortName",
    iiextmetadatalanguage: "en", ...params })) url.searchParams.set(k, v);
  const response = await fetch(url.href, { redirect: "manual", headers: { ...COMMONS_HEADERS, "Accept": "application/json" } });
  if (response.status !== 200) throw commonsUnavailable("Commons non disponibile", response.status);
  const data = await response.json() as { query?: { pages?: BrowsePage[]; search?: Array<{ title?: string }>;
    categorymembers?: Array<{ title?: string }> }; continue?: Record<string, string> };
  const pages = [...(data.query?.pages || [])].sort((a, b) => (a.index || 0) - (b.index || 0));
  const files: CommonsBrowseFile[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0], title = page.title || "";
    if (!BROWSE_IMAGE.test(title) || !info || !thumbAllowed(info.thumburl)) continue;
    files.push({ title, page_url: pageUrl(title), thumb_url: info.thumburl, width: info.width || 0, height: info.height || 0,
      author: simpleHtml(info.extmetadata?.Artist?.value).slice(0, 200),
      license: simpleHtml(info.extmetadata?.LicenseShortName?.value).slice(0, 100),
      categories: (page.categories || []).map(c => (c.title || "").replace(/^Category:/, "")).filter(c => c && c.length <= 200).slice(0, 12) });
  }
  const listed = data.query?.search || data.query?.categorymembers || [];
  const categories = listed.map(x => x.title || "").filter(t => /^Category:.+/.test(t)).slice(0, 50);
  const next = data.continue?.[continueKey];
  return { files, categories, next: typeof next === "string" && next.length <= 300 ? next : null };
}
export async function browseCommonsSearch(query: string, offset = ""): Promise<CommonsBrowseResult> {
  const text = query.normalize("NFKC").trim();
  if (text.length < 2 || text.length > 200) throw new HttpError(400, "Ricerca Commons da 2 a 200 caratteri");
  if (offset && !/^\d{1,5}$/.test(offset)) throw new HttpError(400, "Pagina dei risultati non valida");
  return browse({ generator: "search", gsrsearch: text, gsrnamespace: "6", gsrlimit: "30", ...(offset ? { gsroffset: offset } : {}),
    list: "search", srsearch: text, srnamespace: "14", srlimit: "12" }, "gsroffset");
}
export async function browseCommonsCategory(name: string, cont = ""): Promise<CommonsBrowseResult> {
  const raw = name.normalize("NFKC").trim().replace(/^Category:/i, "").replace(/_/g, " ");
  if (!raw || raw.length > 200 || /[#<>[\]{}|]/.test(raw)) throw new HttpError(400, "Categoria Commons non valida");
  if (cont.length > 300 || /[\s<>]/.test(cont)) throw new HttpError(400, "Pagina della categoria non valida");
  const title = "Category:" + raw;
  return browse({ generator: "categorymembers", gcmtitle: title, gcmtype: "file", gcmlimit: "30", ...(cont ? { gcmcontinue: cont } : {}),
    list: "categorymembers", cmtitle: title, cmtype: "subcat", cmlimit: "50" }, "gcmcontinue");
}
