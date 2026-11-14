/** Fixed context of the language model (spec `libreria-immagini`, section 7), edited from Settings and kept as versions in
 * D1. «base» goes with every call; «analysis» with tags; «slop_prompt» with SLOP prompts. The base must not mention generated images:
 * the analysis model never learns that some are. DEFAULTS are the code's proposal: a proposal becomes a version only when the owner
 * saves it; a fresh database starts from it. The JSON format and the tag filters stay in the code, whatever these texts say. */
import { HttpError, id, type Env } from "./core";

export type Part = "base" | "analysis" | "slop_prompt";
export const PARTS: Part[] = ["base", "analysis", "slop_prompt"];
export const CONTEXT_MAX = 4000;
const HISTORY = 50;

/** Proposals of the code (context 1.7.0, owner decisions of 2026-11-14): categories Genre, Color and Medium in the base and the
 * analysis; SLOP prompts built on the group's examples, with the medium described concretely, signs and inscriptions consistent with
 * the scene, varied people, the period's wear, rules written as what to describe. */
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
  slop_prompt: `Scrivi prompt per un generatore di immagini fotorealistiche. Ogni prompt descrive una fotografia plausibile del genere e del decennio del gruppo, con i tag del suo slot: inquadratura, luce, ambiente, persone, azioni, dettagli d'epoca. Gli esempi sono fotografie vere dello stesso genere ed epoca: prendine il modo di fotografare, mai la scena. Descrivi ciò che si vede, mai ciò che manca: niente elenchi di cose da evitare.

Supporto: descrivilo in concreto secondo il supporto e il colore dello slot. Pagina di giornale: stampa a retino ad alto contrasto, alte luci bruciate, neri chiusi. Fotogramma o diapositiva: colori sbiaditi con una dominante, poca nitidezza, alone sulle luci. Stampa o cartolina: carta ingiallita, toni morbidi. Foto digitale o di telefono: la resa dei sensori di quel decennio. Indica obiettivo e distanza, senza nominare fotografi, agenzie o archivi.

Formato: scegli il formato più adatto al soggetto, come farebbe un fotografo: orizzontale per paesaggi e scene larghe, verticale per persone in piedi, edifici alti e ritratti; quadrato solo se il soggetto lo chiede. Componi la scena per quel formato, come un fotografo dell'epoca, non per forza al centro. Nelle scene affollate poche figure in primo piano, le altre più lontane.

Persone: gente comune dell'epoca e del luogo, diversa per età, corporatura, espressione, capelli, abiti e gesti; ognuna fa qualcosa di suo e tiene oggetti diversi. I volti si vedono quando l'inquadratura lo consente.

Scritte: poche e brevi, fatte a mano quando lo sono nella realtà. Un cartello è rivolto dove guarda chi lo tiene: chi è ripreso di spalle ne mostra il retro. Il luogo si riconosce da edifici, strade e paesaggio, non da insegne che lo nominano.

Epoca: abiti, acconciature, veicoli, segnaletica, luci e oggetti del decennio, con l'usura e il disordine della realtà.

Regole sui contenuti:
- Persone vive o morte da meno di 50 anni: mai; non nominarle e non descriverne l'aspetto. Nel prompt non scrivere mai che i volti sono indistinti, anonimi, generici o non riconoscibili.
- Personaggi storici morti da almeno 50 anni: ammessi, anche in eventi mai accaduti; mai crimini o atrocità attribuiti a loro, mai scene degradanti. Foto segnaletiche, arresti e processi solo con persone inventate.
- Marchi reali: ammessi.
- Regimi e ideologie: possono comparire come contesto storico (manifesti, bandiere, simboli presenti nella scena); mai immagini che li esaltano, mai manifesti di propaganda creati ex novo.
- Nudità: nessuna nudità umana, tranne nelle opere d'arte presenti nella scena (statue, dipinti, affreschi); mai contenuti sessuali; mai nudità che riguardi minori.`,
};

export interface ContextVersion { id: string; part: Part; body: string; created_at: string }

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
  const latest = () => env.DB.prepare("SELECT id,part,body,created_at FROM model_contexts WHERE part=? ORDER BY created_at DESC,rowid DESC LIMIT 1")
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
    const history = (await env.DB.prepare(`SELECT c.id,c.body,c.created_at,
      (SELECT count(*) FROM images i WHERE i.analysis_base_context=c.id OR i.analysis_task_context=c.id) AS used
      FROM model_contexts c WHERE c.part=? ORDER BY c.created_at DESC,c.rowid DESC LIMIT ?`).bind(which, HISTORY)
      .all<{ id: string; body: string; created_at: string; used: number }>()).results;
    parts.push({ part: which, current, history, proposed: current.body === DEFAULTS[which] ? null : DEFAULTS[which] });
  }
  return { max: CONTEXT_MAX, parts };
}

async function save(env: Env, which: Part, body: string) {
  const current = await currentContext(env, which);
  if (current.body !== body)
    await env.DB.prepare("INSERT INTO model_contexts(id,part,body,created_at) VALUES(?,?,?,?)").bind(id(), which, body, new Date().toISOString()).run();
  return state(env);
}

/** GET /contexts; POST /contexts {part, body}: new version; POST /contexts/restore {id}: an old version becomes the newest. */
export async function contextRoute(env: Env, method: string, restore: boolean, data: Record<string, unknown>) {
  if (method === "GET" && !restore) return state(env);
  if (method !== "POST") throw new HttpError(405, "Metodo non consentito");
  if (restore) {
    if (Object.keys(data).some(key => key !== "id") || typeof data.id !== "string") throw new HttpError(400, "Versione richiesta");
    const old = await env.DB.prepare("SELECT part,body FROM model_contexts WHERE id=?").bind(data.id).first<{ part: Part; body: string }>();
    if (!old) throw new HttpError(404, "Versione inesistente");
    return save(env, old.part, old.body);
  }
  if (Object.keys(data).some(key => key !== "part" && key !== "body")) throw new HttpError(400, "Campi non previsti");
  return save(env, part(data.part), clean(data.body));
}
