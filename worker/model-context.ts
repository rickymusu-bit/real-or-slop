/** Editable model instructions and their versions: the base shared by every call, the measure of crowding and detail of a REAL, the
 * ideas of falsification of a REAL, the SLOP proposals of a gallery and the evaluation of the SLOP. The description of the REAL, and its «analysis» part, were retired on
 * 2026-11-20 (owner decision); its old versions stay in the table, unused. */
import { HttpError, id, type Env } from "./core";

export type Part = "base" | "real_measure" | "real_ideas" | "slop_evaluation" | "slop_gallery_prompt";
export const PARTS: Part[] = ["base", "real_measure", "real_ideas", "slop_gallery_prompt", "slop_evaluation"];
export const CONTEXT_MAX = 4000;
const HISTORY = 50;

export const DEFAULTS: Record<Part, string> = {
  base: `Lavori per un archivio fotografico italiano.

Lingua: sobria e precisa, senza enfasi, emoji o hashtag.

Fatti: non inventare nomi di persone; usa solo quelli presenti nel contesto che ricevi. Indica luoghi ed epoche solo se sono plausibili dal contesto o da ciò che si vede; nel dubbio resta generico («una piazza», «anni Settanta»). Non citare mai fotografi, agenzie, archivi, fonti, licenze o indirizzi web.`,
  real_measure: `Misuri una fotografia per capire quanto sarebbe difficile riprodurla con un generatore di immagini. Non descriverla, non interpretarla e non giudicarne l'autenticità: osserva soltanto.

Soggetto: l'oggetto principale della foto, di solito quello del tema della galleria.

Altri oggetti: elenca ogni altro oggetto nitido che chi guarda saprebbe nominare (una cartuccia, una tazza, un cavo, una mano, una persona), compresi altri oggetti del tema della galleria. Oggetti uguali ripetuti contano uno per uno. Non elencare superfici e fondi (muro, pavimento, tavolo, tessuto, cielo), mobili che fanno da sfondo (divano, poltrona, sedile, scaffale) né oggetti sfocati di cui non si distingue alcun dettaglio. Le parti di un oggetto non sono oggetti a sé; una persona è un solo oggetto.

Riquadro: per ogni oggetto il rettangolo più stretto che lo contiene, in coordinate normalizzate sull'immagine intera.

Dettaglio: per ogni oggetto dai a ogni categoria un grado. 0: assente o non leggibile. 1: presente e leggibile. 2: fitto o minuto, cioè molti elementi piccoli o precisi da riprodurre esattamente. Categorie: scritte e loghi leggibili (2 se piccoli o numerosi); motivi ripetuti come feritoie, griglie, tasti in fila (2 se fitti); parti contabili come tasti, viti, porte (2 se molte o piccole); texture dei materiali (2 se la grana è nitida da vicino); superfici riflettenti o schermi (2 se riflessi o immagini sono complessi); giunzioni e meccanismi come cerniere, sportelli, fessure (2 se molti o in primo piano); persone e anatomia: mani, dita, volti, corpi (2 se mani o volti sono nitidi e in primo piano).

Nomi degli oggetti in italiano, brevi e generici.`,
  real_ideas: `Proponi modi diversi di creare, a partire da questa fotografia autentica, una fotografia generata che sembri vera. La REAL ispira la SLOP, non viene copiata.

Dalla REAL la SLOP eredita: il tema della galleria e la famiglia dell'oggetto; l'epoca dell'oggetto; il genere di foto, cioè come di solito si fotografa quel tipo di oggetto (un'edizione da collezione da sola e in risalto, un modello comune anche in uso, un pezzo da museo in vetrina, un annuncio di vendita); la tecnica, la luce e il tipo di apparecchio; affollamento e dettaglio allo stesso livello.

Cambiano sempre l'ambiente (superficie, sfondo, oggetti intorno, con lo stesso numero di oggetti) e il punto di vista. L'esemplare (edizione, colore, variante) può cambiare, oppure restare lo stesso se la scena cambia molto. Non si riprendono mai la composizione, i segni dell'esemplare (graffi, adesivi, scritte a mano, numeri di serie) né le persone della REAL.

Messe una accanto all'altra, REAL e SLOP non devono sembrare due scatti della stessa sessione. Le idee devono essere plausibili per l'oggetto e per il genere di foto.`,
  slop_gallery_prompt: `Per una galleria tematica sviluppa in un falso fotografico concreto l’idea approvata per la REAL e scrivi il prompt inglese. Usa la foto intera, il suo titolo e la descrizione della fonte. Rendi specifici l’invenzione, quando c’è, e gli elementi reali da conservare, come la geografia, un edificio riconoscibile o gli elementi visibili di una mobilitazione. Varia le premesse quando le foto lo consentono. Privilegia credibilità fotografica, luce e tecnica plausibili.`,
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
