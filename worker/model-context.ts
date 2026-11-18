/** Fixed context of the language model (spec `libreria-immagini`, section 7), edited from Settings and kept as versions in
 * D1. «base» goes with every call; «analysis» with tags; «slop_prompt» with the SLOP brief and prompt; «slop_evaluation» with the
 * evaluation of a SLOP candidate. The base must not mention generated images: the analysis model never learns that some are.
 * DEFAULTS are the code's proposal: a proposal becomes a version only when the owner saves it; a part with no version starts from
 * it. The JSON format, the decisions of the evaluator and the tag filters stay in the code, whatever these texts say. */
import { HttpError, id, type Env } from "./core";

export type Part = "base" | "analysis" | "slop_prompt" | "slop_evaluation" | "slop_gallery_prompt";
export const PARTS: Part[] = ["base", "analysis", "slop_prompt", "slop_gallery_prompt", "slop_evaluation"];
export const CONTEXT_MAX = 4000;
/** SLOP pipeline of the texts saved from now on (migration 0051). A «slop_prompt» of pipeline 1 was written for the twin prompts
 * of app 1.26 and contradicts the editorial brief: no brief call is sent with it. */
export const PIPELINE = 2;
const HISTORY = 50;

/** Proposals of the code (context 1.9.0, app 1.28.0): base and analysis as in 1.7.0; «slop_prompt» for the brief and prompt of
 * the editorial pipeline (spec `generazione-slop` 5.x); «slop_evaluation», the editable part of the evaluator. */
export const DEFAULTS: Record<Part, string> = {
  base: `Lavori per un archivio fotografico italiano che cataloga le immagini con etichette brevi.

Lingua: sobria e precisa, senza enfasi, emoji o hashtag.

Fatti: non inventare nomi di persone; usa solo quelli presenti nel contesto che ricevi. Indica luoghi ed epoche solo se sono plausibili dal contesto o da ciò che si vede; nel dubbio resta generico («una piazza», «anni Settanta»). Non citare mai fotografi, agenzie, archivi, fonti, licenze o indirizzi web.

Tag: brevi etichette in lettere minuscole senza accenti, cifre e trattini singoli tra le parole, senza spazi. Nomi comuni in inglese («riot», «police-car»); nomi propri nella lingua originale, traslitterati («place-de-la-republique», «munchen»). Ogni tag ha una categoria:
- tempo: solo decenni come «1970s», al massimo uno;
- genere: il tipo di fotografia, riconoscibile da inquadratura, posa e scopo, come «mugshot», «studio-portrait», «group-portrait», «snapshot», «street-scene», «crowd-scene», «press-photo», «aerial-view», «landscape»; uno;
- colore: color, black-and-white, sepia o hand-colored; uno;
- supporto: che cosa è materialmente l'immagine, come «photo-print», «newspaper-print», «magazine-print», «postcard», «slide», «film-still», «instant-photo», «digital-photo», «phone-photo», «screen-capture», «poster», «painting»; uno;
- luogo (nomi propri), ambiente (tipi di luogo, ora, meteo), evento, persone (ruoli e gruppi, mai nomi), oggetti e strutture, altro.
Scegli parole con un solo significato («house-fire» per l'evento, «flames» per l'oggetto). Mai tag sull'origine dell'immagine o sulla sua autenticità.`,
  analysis: `Ricevi un'immagine e il suo contesto: titolo e descrizione, oppure la descrizione della scena. Descrivi ciò che si vede.

Tag: da 5 a 15, divisi per categoria. Se l'epoca è ricavabile, indica il decennio. Indica sempre genere, colore e supporto, giudicandoli dall'aspetto dell'immagine: retino di stampa, bordi e grana di una pellicola, carta di una stampa, nitidezza di un sensore digitale. Preferisci i tag del vocabolario esistente, che ricevi diviso per categoria, quando sono adatti; creane di nuovi solo se nessuno lo è.`,
  slop_prompt: `Scrivi insieme un brief editoriale minimo e un prompt in inglese per una fotografia sintetica credibile. Ricevi i tag e la descrizione editoriale salvata di una REAL, senza i suoi pixel. La REAL è un riferimento tematico e fotografico: nessuna somiglianza obbligatoria, nessun numero di elementi da cambiare. Distingui ancoraggi obbligatori, preferenze, elementi flessibili ed esclusioni. Il brief resterà immutabile nel ciclo di valutazione, mentre prompt e scena possono cambiare. Credibilità, varietà, luce e tecnica concrete; evita enfasi cinematografica e schemi ripetitivi. Persone inventate: nessun nome o descrizione di persone vive o morte da meno di 50 anni. Nessun crimine attribuito a personaggi storici, regimi mai celebrati, niente nudità fuori dalle opere d'arte. Non scegliere formati né comporre per il ritaglio del gioco.`,
  slop_gallery_prompt: `Per una galleria tematica proponi un falso fotografico concreto e scrivi il prompt inglese. Usa la foto intera, il profilo editoriale e il contesto documentato per scegliere una possibilità compatibile con le indicazioni della galleria. Rendi specifici l’invenzione e gli elementi reali da conservare, come la geografia, un edificio riconoscibile o gli elementi visibili di una mobilitazione. Varia le premesse quando le foto lo consentono. Privilegia credibilità fotografica, luce e tecnica plausibili.`,
  slop_evaluation: `Valuti una fotografia generata, intera e non trattata, prima che entri nella libreria come candidata. Giudica prima la credibilità fotografica: deve poter essere scambiata per una fotografia autentica della tecnica, dell'epoca e della situazione rappresentata. Poi la plausibilità fisica e contestuale e il rispetto degli ancoraggi obbligatori e delle esclusioni del brief. L'aderenza letterale ai dettagli secondari del prompt non è richiesta.

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
    const history = (await env.DB.prepare(`SELECT c.id,c.body,c.created_at,c.pipeline,
      (SELECT count(*) FROM images i WHERE i.analysis_base_context=c.id OR i.analysis_task_context=c.id) AS used
      FROM model_contexts c WHERE c.part=? ORDER BY c.created_at DESC,c.rowid DESC LIMIT ?`).bind(which, HISTORY)
      .all<{ id: string; body: string; created_at: string; pipeline: number; used: number }>()).results;
    // A «slop_prompt» saved for the twin pipeline blocks the brief calls until a new version is saved.
    const outdated = which === "slop_prompt" && current.pipeline < PIPELINE;
    parts.push({ part: which, current, history, outdated, proposed: current.body === DEFAULTS[which] && !outdated ? null : DEFAULTS[which] });
  }
  return { max: CONTEXT_MAX, parts };
}

/** A new version, unless it repeats the current one. Saving a text marks it for the current pipeline; a restored version keeps its own. */
async function save(env: Env, which: Part, body: string, pipeline = PIPELINE) {
  const current = await currentContext(env, which);
  if (current.body !== body || current.pipeline !== pipeline)
    await env.DB.prepare("INSERT INTO model_contexts(id,part,body,created_at,pipeline) VALUES(?,?,?,?,?)")
      .bind(id(), which, body, new Date().toISOString(), pipeline).run();
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
    return save(env, old.part, old.body, old.pipeline);
  }
  if (Object.keys(data).some(key => key !== "part" && key !== "body")) throw new HttpError(400, "Campi non previsti");
  return save(env, part(data.part), clean(data.body));
}
