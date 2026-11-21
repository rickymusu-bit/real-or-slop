/** Editable model instructions and their versions: the base shared by every call, the SLOP proposals of a gallery and the
 * evaluation of the SLOP. The description of the REAL, and its «analysis» part, were retired on 2026-11-20 (owner decision); its old
 * versions stay in the table, unused. */
import { HttpError, id, type Env } from "./core";

export type Part = "base" | "slop_evaluation" | "slop_gallery_prompt";
export const PARTS: Part[] = ["base", "slop_gallery_prompt", "slop_evaluation"];
export const CONTEXT_MAX = 4000;
const HISTORY = 50;

export const DEFAULTS: Record<Part, string> = {
  base: `Lavori per un archivio fotografico italiano.

Lingua: sobria e precisa, senza enfasi, emoji o hashtag.

Fatti: non inventare nomi di persone; usa solo quelli presenti nel contesto che ricevi. Indica luoghi ed epoche solo se sono plausibili dal contesto o da ciò che si vede; nel dubbio resta generico («una piazza», «anni Settanta»). Non citare mai fotografi, agenzie, archivi, fonti, licenze o indirizzi web.`,
  slop_gallery_prompt: `Per una galleria tematica proponi un falso fotografico concreto e scrivi il prompt inglese. Usa la foto intera, il suo titolo e la descrizione della fonte per scegliere una possibilità compatibile con le indicazioni della galleria. Rendi specifici l’invenzione e gli elementi reali da conservare, come la geografia, un edificio riconoscibile o gli elementi visibili di una mobilitazione. Varia le premesse quando le foto lo consentono. Privilegia credibilità fotografica, luce e tecnica plausibili.`,
  slop_evaluation: `Valuti una fotografia generata, intera e non trattata, prima che entri nella libreria come candidata. Giudica prima la credibilità fotografica: deve poter essere scambiata per una fotografia autentica della tecnica, dell'epoca e della situazione rappresentata. Poi la plausibilità fisica e contestuale e il rispetto degli ancoraggi obbligatori e delle esclusioni del contesto editoriale. L'aderenza letterale ai dettagli secondari del prompt non è richiesta.

Difetti critici, che nessun punto forte compensa: anatomia, fisica, geometria, scritte centrali senza senso, resa artificiale, contraddizioni di contesto, violazioni delle regole sui contenuti, ancoraggi obbligatori mancanti. Per ogni difetto indica la zona dell'immagine e la conseguenza. Segnala le incertezze; non dedurre identità, provenienza, licenza o verità storica dai pixel. La valutazione è una stima editoriale, non una certificazione.

Contenuti: persone inventate; nessuna persona viva o morta da meno di 50 anni riconoscibile; nessun crimine attribuito a personaggi storici; regimi mai celebrati; niente nudità fuori dalle opere d'arte.

Lingua: difetti, incertezze e motivazione in italiano; il prompt rivisto in inglese.`,
};

export interface ContextVersion { id: string; part: Part; body: string; created_at: string; pipeline: number }

function part(value: unknown): Part {
  if (typeof value !== "string" || !PARTS.includes(value as Part)) throw new HttpError(400, "Parte del contesto inesistente");
  return value as Part;
}
/** Plain text: line breaks normalised, control characters out except tab and newline, at most CONTEXT_MAX characters. */
function clean(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Testo del contesto mancante");
  const text = [...value.normalize("NFC").replace(/\r\n?/g, "\n")]
    .filter(ch => { const c = ch.charCodeAt(0); return c === 9 || c === 10 || (c >= 32 && c !== 127); }).join("").trim();
  if (!text) throw new HttpError(400, "Il contesto non può essere vuoto");
  if (text.length > CONTEXT_MAX) throw new HttpError(400, `Contesto oltre ${CONTEXT_MAX} caratteri`);
  return text;
}

/** Current version of a part; the first read writes the approved default. */
export async function currentContext(env: Env, which: Part): Promise<ContextVersion> {
  const latest = () => env.DB.prepare("SELECT id,part,body,created_at,pipeline FROM model_contexts WHERE part=? ORDER BY created_at DESC,rowid DESC LIMIT 1")
    .bind(which).first<ContextVersion>();
  const found = await latest();
  if (found) return found;
  await env.DB.prepare("INSERT INTO model_contexts(id,part,body,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM model_contexts WHERE part=?)")
    .bind(id(), which, DEFAULTS[which], new Date().toISOString(), which).run();
  return (await latest())!;
}

async function state(env: Env) {
  const parts = [];
  // A proposal from the code is shown when it differs from the current text; it is never saved by itself.
  for (const which of PARTS) {
    const current = await currentContext(env, which);
    const history = (await env.DB.prepare(`SELECT c.id,c.body,c.created_at,c.pipeline
      FROM model_contexts c WHERE c.part=? ORDER BY c.created_at DESC,c.rowid DESC LIMIT ?`).bind(which, HISTORY)
      .all<{ id: string; body: string; created_at: string; pipeline: number }>()).results;
    parts.push({part: which, current, history, proposed: current.body === DEFAULTS[which] ? null : DEFAULTS[which]});
  }
  return { max: CONTEXT_MAX, parts };
}

/** A new version, unless it repeats the current one. Saving a text marks it for the current pipeline; a restored version keeps its own. */
async function save(env: Env, which: Part, body: string) {
  const current = await currentContext(env, which);
  if (current.body !== body)
    await env.DB.prepare("INSERT INTO model_contexts(id,part,body,created_at) VALUES(?,?,?,?)")
      .bind(id(), which, body, new Date().toISOString()).run();
  return state(env);
}

/** GET /contexts; POST /contexts {part, body}: new version; POST /contexts/restore {id}: an old version becomes the newest. */
export async function contextRoute(env: Env, method: string, restore: boolean, data: Record<string, unknown>) {
  if (method === "GET" && !restore) return state(env);
  if (method !== "POST") throw new HttpError(405, "Metodo non consentito");
  if (restore) {
    if (Object.keys(data).some(key => key !== "id") || typeof data.id !== "string") throw new HttpError(400, "Versione richiesta");
    const old = await env.DB.prepare("SELECT part,body,pipeline FROM model_contexts WHERE id=?").bind(data.id).first<{ part: Part; body: string; pipeline: number }>();
    if (!old) throw new HttpError(404, "Versione inesistente");
    if (!PARTS.includes(old.part)) throw new HttpError(409, "Parte del contesto non più in uso");
    return save(env, old.part, old.body);
  }
  if (Object.keys(data).some(key => key !== "part" && key !== "body")) throw new HttpError(400, "Campi non previsti");
  return save(env, part(data.part), clean(data.body));
}
