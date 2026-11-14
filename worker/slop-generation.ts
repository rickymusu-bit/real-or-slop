/** SLOP batches and paid generation (spec `generazione-slop`, sections 3–5): a batch is a list of REAL, each with the SLOP twin to
 * write; one call writes the prompts (or rewrites one) from the tags and the description of each REAL; the image generator receives
 * only the prompt text and the size of its format; the image enters the library as a new SLOP with prompt, model, batch, source
 * and quality. Refusals (4xx) are not charged, uncertain outcomes are recorded and never resent. */
import { HttpError, id, type Env } from "./core";
import { create, viewOf } from "./library";
import { chosenModel } from "./models";
import { currentContext } from "./model-context";
import { IMAGE_MODELS } from "../shared/models";
import { formatsFor, generationSize, isFormat, type Format } from "../shared/game-copy";
import { MAX_BATCH, type TwinItem } from "../shared/twins";
import { byCategory, twinItems } from "./twins";

const TIMEOUT_MS = 120_000, STALE_MS = 10 * 60_000, PROMPT_MAX = 4000, MAX_OUTPUT_TOKENS = 16_000, RELATED = 3;
/** Lines fixed in the code (spec `generazione-slop`, section 4): language and schema, length, what a twin is. */
const OUTPUT = "Write every prompt in English, between 600 and 1000 characters. Return JSON only, matching the schema: «prompts», one per " +
  "item in the same order, each with «prompt», the text for the image generator, «used_tags», the tags of its item that the prompt uses, " +
  "and «format», the photographic format (width:height) a photographer would choose for that subject, among those allowed by the schema.";
const TWIN_RULE = "Each item is a real photograph, given as its tags and its description. Write the prompt of ANOTHER photograph that could " +
  "sit beside it in the same archive: the same event or kind of scene, the same place, decade, genre, colour and medium, but a different " +
  "moment, a different viewpoint and different people. Never describe the photograph of the item itself, and never use the names of people " +
  "found in the descriptions. «related» holds descriptions of other photographs of the same event or place: context, never scenes to copy.";
/** Format of prompts written before formats existed: the closest to the 4:5 they were meant for. */
const LEGACY_FORMAT: Format = "3:4";
const OPENAI = "https://api.openai.com/v1/";

interface Batch { id: string; slots: string; prompts: string; prompts_status: string; prompts_error: string; created_at: string; updated_at: string }
export interface PromptEntry { prompt: string; used: string[]; format?: Format }

const parse = <T>(value: string, fallback: T): T => { try { return JSON.parse(value) as T; } catch { return fallback; } };
/** The items of a batch. A batch drawn before the twins (slots of tags) has none: it can only be reviewed. */
export const itemsOf = (row: { slots: string }): TwinItem[] =>
  parse<unknown[]>(row.slots, []).filter((i): i is TwinItem => !!i && typeof (i as TwinItem).source === "string" && Array.isArray((i as TwinItem).tags));
const confirmOnly = (data: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(data).some(key => !["confirm", ...allowed].includes(key))) throw new HttpError(400, "Campi non previsti");
  if (data.confirm !== true) throw new HttpError(400, "Conferma la chiamata a pagamento");
};

async function load(env: Env, batchId: string): Promise<Batch> {
  const row = await env.DB.prepare("SELECT * FROM slop_batches WHERE id=?").bind(batchId).first<Batch>();
  if (!row) throw new HttpError(404, "Batch inesistente");
  return row;
}
async function show(env: Env, batchId: string) {
  const row = await load(env, batchId);
  const ids = (await env.DB.prepare("SELECT id FROM images WHERE generation_batch=? ORDER BY created_at,rowid").bind(batchId).all<{ id: string }>()).results;
  return { id: row.id, items: itemsOf(row), prompts: parse<PromptEntry[]>(row.prompts, []),
    prompts_status: row.prompts_status, prompts_error: row.prompts_error, created_at: row.created_at, updated_at: row.updated_at,
    images: await Promise.all(ids.map(r => viewOf(env, r.id))) };
}

/** Errors of an OpenAI call: 4xx refused without charge, 5xx uncertain. «OpenAI:» marks account problems. */
async function failure(response: Response) {
  const detail = await response.json().catch(() => ({})) as { error?: { code?: string; type?: string; message?: string } };
  const code = String(detail.error?.code || detail.error?.type || "");
  const failed = response.status >= 400 && response.status < 500;
  const message = response.status === 401 || response.status === 403 ? "OpenAI: chiave rifiutata, nessun addebito"
    : response.status === 429 && /quota|spend_limit|billing/.test(code)
      ? "OpenAI: limite di spesa o credito esaurito sull'account OpenAI, nessun addebito. Controlla platform.openai.com"
      : response.status === 429 ? "OpenAI: troppe richieste, nessun addebito. Riprova fra qualche minuto"
        : /moderation|safety|content_policy/.test(code) ? "Il generatore ha rifiutato il prompt per le sue regole d'uso: nessun addebito previsto. Modifica il prompt"
          : failed ? `Il modello ha risposto ${response.status}${code ? " (" + code + ")" : ""}: nessun addebito previsto`
            : `Il modello ha risposto ${response.status}: esito incerto, la chiamata potrebbe essere stata addebitata. Non è stata ripetuta`;
  return { failed, message };
}
async function record(env: Env, kind: "prompts" | "images", model: string) {
  const callId = id(), stamp = new Date().toISOString();
  await env.DB.prepare("INSERT INTO paid_calls(id,kind,model,status,created_at,updated_at) VALUES(?,?,?,'pending',?,?)").bind(callId, kind, model, stamp, stamp).run();
  return async (status: "completed" | "uncertain" | "failed", usage?: { input_tokens?: number; output_tokens?: number }) =>
    env.DB.prepare("UPDATE paid_calls SET status=?,input_tokens=?,output_tokens=?,updated_at=? WHERE id=?")
      .bind(status, usage?.input_tokens ?? null, usage?.output_tokens ?? null, new Date().toISOString(), callId).run();
}

/** POST /slop/batches {sources}: a new batch for 1 to 10 REAL without a twin, free. */
async function createBatch(env: Env, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => key !== "sources")) throw new HttpError(400, "Campi non previsti");
  const sources = Array.isArray(data.sources) ? [...new Set(data.sources)] : [];
  if (!sources.length || sources.length > MAX_BATCH || sources.some(s => typeof s !== "string" || !/^[\w-]{1,64}$/.test(s)))
    throw new HttpError(400, `Scegli da 1 a ${MAX_BATCH} REAL`);
  const items = await twinItems(env, sources as string[]), batchId = id(), stamp = new Date().toISOString();
  await env.DB.prepare("INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES(?,'[]',?,?,?)")
    .bind(batchId, JSON.stringify(items), stamp, stamp).run();
  return show(env, batchId);
}
/** PUT /slop/batches/:id {prompts?, formats?}: the owner's edits, free. Prompts are plain texts, one per item; formats one per prompt. */
async function editBatch(env: Env, batchId: string, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => !["prompts", "formats"].includes(key)) || !Object.keys(data).length) throw new HttpError(400, "Campi non previsti");
  const row = await load(env, batchId), items = itemsOf(row);
  let prompts = parse<PromptEntry[]>(row.prompts, []);
  if (data.prompts !== undefined) {
    if (!Array.isArray(data.prompts) || data.prompts.length !== items.length || data.prompts.some(p => typeof p !== "string" || p.length > PROMPT_MAX))
      throw new HttpError(400, `Un prompt per immagine, al massimo ${PROMPT_MAX} caratteri`);
    prompts = (data.prompts as string[]).map((prompt, i) => ({ prompt: prompt.trim(), used: prompts[i]?.used || [], format: prompts[i]?.format }));
  }
  if (data.formats !== undefined) {
    if (!Array.isArray(data.formats) || data.formats.length !== prompts.length || !data.formats.every(isFormat)) throw new HttpError(400, "Formati non validi");
    prompts = prompts.map((entry, i) => ({ ...entry, format: (data.formats as Format[])[i] }));
  }
  await env.DB.prepare("UPDATE slop_batches SET prompts=?,updated_at=? WHERE id=?").bind(JSON.stringify(prompts), new Date().toISOString(), batchId).run();
  return show(env, batchId);
}

/** What the text model reads of one item: the tags and the description of its REAL as they are now, and the descriptions of up to
 * RELATED other approved or published REAL of the same decade that share its event or its place. */
async function briefOf(env: Env, item: TwinItem) {
  const source = await env.DB.prepare("SELECT description FROM images WHERE id=? AND origin='REAL'").bind(item.source).first<{ description: string }>();
  const decade = item.tags.find(t => t.category === "time")?.label || "";
  const shared = item.tags.filter(t => t.category === "event" || t.category === "place").map(t => t.label);
  const related = shared.length ? (await env.DB.prepare(`SELECT i.description FROM images i WHERE i.origin='REAL' AND i.status IN ('approved','published')
    AND i.id<>?1 AND i.description<>'' AND EXISTS(SELECT 1 FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=i.id
      AND t.label IN (SELECT value FROM json_each(?2)))
    AND (?3='' OR EXISTS(SELECT 1 FROM image_tags it JOIN tags t ON t.id=it.tag_id WHERE it.image_id=i.id AND t.label=?3))
    ORDER BY random() LIMIT ?4`).bind(item.source, JSON.stringify(shared), decade, RELATED).all<{ description: string }>()).results : [];
  return { tags: byCategory(item.tags), description: (source?.description || "").slice(0, 500), related: related.map(r => r.description.slice(0, 300)) };
}

/** POST /slop/batches/:id/prompts {confirm, index?}: one paid call writes all the prompts, or rewrites one. */
async function writePrompts(env: Env, batchId: string, data: Record<string, unknown>) {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  confirmOnly(data, ["index"]);
  const row = await load(env, batchId);
  const items = itemsOf(row), current = parse<PromptEntry[]>(row.prompts, []);
  if (!items.length) throw new HttpError(409, "Batch estratto prima delle gemelle: si può solo rivedere");
  const index = data.index;
  if (index !== undefined && (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= items.length)) throw new HttpError(400, "Immagine inesistente");
  const wanted = index === undefined ? items.map((item, i) => ({ item, i })) : [{ item: items[index as number], i: index as number }];
  const model = await chosenModel(env, "text_model"), allowed = formatsFor(await chosenModel(env, "image_model"));
  const [baseContext, taskContext] = [await currentContext(env, "base"), await currentContext(env, "slop_prompt")];
  const stamp = new Date().toISOString(), staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const marked = await env.DB.prepare(`UPDATE slop_batches SET prompts_status='running',prompts_error='',updated_at=? WHERE id=?
    AND (prompts_status<>'running' OR updated_at<=?)`).bind(stamp, batchId, staleBefore).run();
  if (!marked.meta.changes) throw new HttpError(409, "Prompt già in scrittura: nessuna chiamata inviata");
  const settle = await record(env, "prompts", model);
  const finish = (status: string, error = "", prompts = current) => env.DB.prepare("UPDATE slop_batches SET prompts_status=?,prompts_error=?,prompts=?,updated_at=? WHERE id=?")
    .bind(status, error.slice(0, 300), JSON.stringify(prompts), new Date().toISOString(), batchId).run();
  const format = { type: "json_schema", name: "slop_prompts", strict: true, schema: { type: "object", additionalProperties: false, required: ["prompts"], properties: {
    prompts: { type: "array", minItems: wanted.length, maxItems: wanted.length, items: { type: "object", additionalProperties: false, required: ["prompt", "used_tags", "format"],
      properties: { prompt: { type: "string" }, used_tags: { type: "array", items: { type: "string" } }, format: { type: "string", enum: allowed } } } } } } };
  const input = { count: wanted.length,
    note: "Make the prompts different from one another in framing, distance, light and action." +
      (index === undefined ? "" : " Other prompts of the batch, to stay different from: " + current.filter((_, i) => i !== index).map(p => p.prompt).join(" | ")),
    items: await Promise.all(wanted.map(({ item }) => briefOf(env, item))) };
  let response: Response;
  try {
    response = await fetch((env.OPENAI_BASE_URL || OPENAI) + "responses", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model, instructions: baseContext.body + "\n\n" + taskContext.body + "\n\n" + OUTPUT + " " + TWIN_RULE, text: { format },
        max_output_tokens: MAX_OUTPUT_TOKENS, input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(input) }] }] }) });
  } catch {
    await settle("uncertain"); await finish("uncertain", "Esito incerto: la chiamata potrebbe essere stata addebitata. Non è stata ripetuta.");
    throw new HttpError(502, "Esito incerto della scrittura dei prompt: non ripetuta automaticamente");
  }
  if (!response.ok) {
    const { failed, message } = await failure(response);
    await settle(failed ? "failed" : "uncertain"); await finish(failed ? "failed" : "uncertain", message);
    throw new HttpError(502, message);
  }
  let written: PromptEntry[] = [], usage: { input_tokens?: number; output_tokens?: number } = {};
  try {
    const payload = await response.json() as { usage?: typeof usage; output?: { content?: { type?: string; text?: string }[] }[] };
    usage = payload.usage || {};
    const text = (payload.output || []).flatMap(o => o.content || []).filter(c => c.type === "output_text").map(c => c.text || "").join("");
    const result = JSON.parse(text) as { prompts?: { prompt?: unknown; used_tags?: unknown; format?: unknown }[] };
    written = (result.prompts || []).map(p => ({ prompt: typeof p.prompt === "string" ? p.prompt.trim().slice(0, PROMPT_MAX) : "",
      used: Array.isArray(p.used_tags) ? p.used_tags.filter((t): t is string => typeof t === "string").slice(0, 20) : [],
      format: isFormat(p.format) && allowed.includes(p.format) ? p.format : undefined }));
    // A format outside the set is an error of the text model, like invalid JSON.
    if (written.length !== wanted.length || written.some(p => !p.prompt || !p.format)) throw new Error("count");
  } catch {
    await settle("completed", usage); await finish("failed", "Risposta del modello non leggibile");
    throw new HttpError(502, "Risposta del modello non leggibile");
  }
  const prompts = index === undefined ? written : items.map((_, i) => i === index ? written[0] : current[i] || { prompt: "", used: [] });
  await settle("completed", usage); await finish("done", "", prompts);
  return show(env, batchId);
}

/** One paid call to the image model: the generator receives only the text of the prompt. Recorded in «paid_calls»;
 * a refusal (4xx) is not charged, a 5xx, a timeout or an unreadable answer is never resent. */
export async function requestImage(env: Env, model: string, prompt: string, size: string, quality: string): Promise<Uint8Array> {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  const settle = await record(env, "images", model);
  let response: Response;
  try {
    response = await fetch((env.OPENAI_BASE_URL || OPENAI) + "images/generations", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, n: 1, size, quality }) });
  } catch {
    await settle("uncertain");
    throw new HttpError(502, "Esito incerto della generazione: la chiamata potrebbe essere stata addebitata. Non è stata ripetuta");
  }
  if (!response.ok) {
    const { failed, message } = await failure(response);
    await settle(failed ? "failed" : "uncertain");
    throw new HttpError(502, message);
  }
  let bytes: Uint8Array, usage: { input_tokens?: number; output_tokens?: number } = {};
  try {
    const payload = await response.json() as { usage?: typeof usage; data?: { b64_json?: string }[] };
    usage = payload.usage || {};
    const encoded = payload.data?.[0]?.b64_json;
    if (!encoded) throw new Error("empty");
    bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  } catch {
    await settle("completed", usage);
    throw new HttpError(502, "Risposta del generatore non leggibile");
  }
  await settle("completed", usage);
  return bytes;
}

/** POST /slop/batches/:id/images {confirm, index, quality}: one paid call generates the twin of one REAL. */
async function generateImage(env: Env, batchId: string, data: Record<string, unknown>) {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  confirmOnly(data, ["index", "quality"]);
  const row = await load(env, batchId);
  const items = itemsOf(row), prompts = parse<PromptEntry[]>(row.prompts, []);
  const index = data.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= items.length) throw new HttpError(400, "Immagine inesistente");
  const prompt = prompts[index]?.prompt;
  if (!prompt) throw new HttpError(409, "Scrivi prima il prompt di questa immagine");
  const model = await chosenModel(env, "image_model"), qualities = IMAGE_MODELS[model] || [];
  if (typeof data.quality !== "string" || !qualities.includes(data.quality)) throw new HttpError(400, `Qualità non ammessa da ${model}: ${qualities.join(", ")}`);
  const quality = data.quality, size = generationSize(model, prompts[index]?.format || LEGACY_FORMAT), item = items[index];
  const bytes = await requestImage(env, model, prompt, size, quality);
  return create(env, { origin: "SLOP", title: ("Gemella di " + item.title).slice(0, 200), bytes: bytes.buffer as ArrayBuffer, prompt, model,
    generation: { batch: batchId, source: item.source, slot: { index, source: item.source, sample: item.sample, tags: item.tags }, quality } });
}

/** GET /slop/batches: the last batches, to pick one up again. */
async function recent(env: Env) {
  const rows = (await env.DB.prepare(`SELECT b.id,b.slots,b.prompts_status,b.updated_at,(SELECT count(*) FROM images i WHERE i.generation_batch=b.id) AS images
    FROM slop_batches b ORDER BY b.updated_at DESC LIMIT 10`).all<{ id: string; slots: string; prompts_status: string; updated_at: string; images: number }>()).results;
  return { batches: rows.map(r => ({ id: r.id, count: itemsOf(r).length, prompts_status: r.prompts_status, images: r.images, updated_at: r.updated_at })) };
}

export async function batchRoute(env: Env, method: string, rest: string, data: Record<string, unknown>) {
  if (rest === "" && method === "GET") return recent(env);
  if (rest === "" && method === "POST") return createBatch(env, data);
  const [batchId, action] = rest.split("/");
  if (!/^[\w-]{1,64}$/.test(batchId)) throw new HttpError(404, "Batch inesistente");
  if (!action && method === "GET") return show(env, batchId);
  if (!action && method === "PUT") return editBatch(env, batchId, data);
  if (action === "prompts" && method === "POST") return writePrompts(env, batchId, data);
  if (action === "images" && method === "POST") return generateImage(env, batchId, data);
  throw new HttpError(404, "API dei batch SLOP inesistente");
}
