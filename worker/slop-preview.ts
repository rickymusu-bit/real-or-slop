/** Short-lived signed selections: extraction is free and reserves nothing; its UUID is the one-use batch ID. */
import {HttpError, type Env} from "./core";
import type {loopSnapshot} from "./slop-generation";
import {MAX_BATCH} from "../shared/slop-proposals";

export const PREVIEW_TTL_MS = 15 * 60_000;
export interface PreviewSelection {
  version: 1; id: string; expires: number;
  gallery?: {id: string; revision: number};
  sources: {id: string; revision: number}[];
  config: Awaited<ReturnType<typeof loopSnapshot>>;
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function key(env: Env) {
  if (!env.ADMIN_TOKEN) throw new HttpError(503, "Amministrazione non configurata");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(env.ADMIN_TOKEN), {name:"HMAC", hash:"SHA-256"}, false, ["sign", "verify"]);
}
export async function signPreview(env: Env, selection: PreviewSelection) {
  const payload = encode(new TextEncoder().encode(JSON.stringify(selection)));
  const signature = await crypto.subtle.sign("HMAC", await key(env), new TextEncoder().encode(payload));
  return payload + "." + encode(new Uint8Array(signature));
}
export async function readPreview(env: Env, token: unknown, at = Date.now()): Promise<PreviewSelection> {
  if (typeof token !== "string" || token.length > 12000 || !/^[\w-]+\.[\w-]+$/.test(token))
    throw new HttpError(400, "Prima estrai e controlla le REAL");
  let selection: PreviewSelection;
  try {
    const [payload, signature] = token.split(".");
    if (!await crypto.subtle.verify("HMAC", await key(env), decode(signature), new TextEncoder().encode(payload))) throw Error();
    selection = JSON.parse(new TextDecoder("utf-8", {fatal:true, ignoreBOM:false}).decode(decode(payload))) as PreviewSelection;
    if (selection.version !== 1 || !/^[\w-]{1,64}$/.test(selection.id) || !Number.isInteger(selection.expires) ||
      (selection.gallery !== undefined && (!selection.gallery || !/^[\w-]{1,64}$/.test(selection.gallery.id) || !Number.isInteger(selection.gallery.revision) || selection.gallery.revision < 0)) ||
      !Array.isArray(selection.sources) || !selection.sources.length || selection.sources.length > MAX_BATCH ||
      selection.sources.some(s => !s || !/^[\w-]{1,64}$/.test(s.id) || !Number.isInteger(s.revision) || s.revision < 0) ||
      new Set(selection.sources.map(s => s.id)).size !== selection.sources.length ||
      !selection.config || typeof selection.config !== "object" || Array.isArray(selection.config)) throw Error();
  } catch { throw new HttpError(400, "Estrazione non valida: estrai di nuovo le REAL"); }
  if (selection.expires <= at) throw new HttpError(409, "Estrazione scaduta: estrai di nuovo le REAL");
  return selection;
}
