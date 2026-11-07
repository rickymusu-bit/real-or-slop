/** Only Wikimedia Commons URLs. Never fetch an arbitrary submitted host. */
import { imageMime } from "../shared/editorial-workspace.v1.0.0";
import { HttpError } from "./core";
export const MAX_IMAGE_BYTES = 12_000_000;
export const MAX_IMAGE_PIXELS = 32_000_000;
export interface CommonsFile {
  title: string; source_url: string; download_url: string; author: string;
  license_url: string; description: string; width: number; height: number;
  bytes: ArrayBuffer; mime: string; original_is_preview: boolean;
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
  const response = await fetch(u.href,{redirect:"manual",headers:{"Accept":"image/jpeg,image/png,image/webp"}});
  if (response.status !== 200 || !response.body) throw new HttpError(502,"Immagine Commons non raggiungibile");
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
  return {bytes:all.buffer,mime};
}
export async function commonsFile(value: string): Promise<CommonsFile> {
  const title = value.startsWith("File:") ? "File:" + decodeName(value.slice(5)) : commonsFileTitle(value);
  const response = await fetch(commonsApiUrl(title),{redirect:"manual",headers:{"Accept":"application/json"}});
  if (response.status !== 200) throw new HttpError(502,"API Commons non disponibile");
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
  return {title:page?.title || title,source_url:"https://commons.wikimedia.org/wiki/"+encodeURIComponent(page?.title || title).replace(/%3A/ig,":"),
    download_url:download,author:meta("Artist"),license_url:license,description:meta("ImageDescription"),
    width:image.width!,height:image.height!,bytes:file.bytes,mime:file.mime,original_is_preview:chooseThumb};
}
export async function searchCommons(query:string,limit=12): Promise<string[]> {
  if (query.length<3 || query.length>250 || limit<1 || limit>25) throw new HttpError(400,"Ricerca Commons non valida");
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [k,v] of Object.entries({action:"query",format:"json",formatversion:"2",list:"search",srnamespace:"6",
    srlimit:String(limit),srsearch:query})) url.searchParams.set(k,v);
  const response = await fetch(url.href,{redirect:"manual",headers:{"Accept":"application/json"}});
  if (response.status!==200) throw new HttpError(502,"Ricerca Commons non disponibile");
  const data = await response.json() as {query?:{search?:Array<{title?:string}>}};
  return (data.query?.search || []).map(x=>x.title || "").filter(x=>/^File:.+\.(jpe?g|png|webp)$/i.test(x)).slice(0,limit);
}
