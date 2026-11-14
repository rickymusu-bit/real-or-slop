/** SLOP studio, paid part (docs/wizard-slop.v1.4.0.md, sections 5–9). v1.11.0, 2026-11-14T01:20:00Z: same behaviour, library v1.20.0 and model context v1.4.0. v1.10.0, 2026-11-13T22:00:00Z: same behaviour, library v1.19.0 and model context v1.3.0 (no captions). v1.9.0, 2026-11-13T19:00:00Z: same behaviour, library v1.18.0. v1.8.0, 2026-11-13T16:30:00Z: same behaviour, library v1.17.0. v1.7.0, 2026-11-13T12:00:00Z: same behaviour, library v1.16.0. v1.6.0, 2026-11-13T10:00:00Z: each prompt carries the
 * photographic format suited to its subject (docs/copie-di-gioco.v4.0.0.md, section 4): the text model chooses it among those the
 * image model in Settings can produce, the owner may change it, and the image is asked in that format (shared/game-copy.v3.0.0.ts).
 * Prompts written before have no format: they are generated in 3:4, the format closest to the 4:5 they were written for. v1.5.0, 2026-11-12T21:00:00Z: same behaviour, library v1.14.0;
 * automatic batches are guarded by worker/slop-auto.v1.0.0.ts before these routes. v1.4.0, 2026-11-12T11:00:00Z: same behaviour, library v1.13.0, models v1.1.0. v1.3.0, 2026-11-12T09:00:00Z: same behaviour, library v1.12.0. v1.2.0, 2026-11-12T08:00:00Z: every image in the 4:5 portrait
 * format of the game copies (docs/copie-di-gioco.v3.0.0.md): 1024×1280 where the model accepts it, otherwise 1024×1536 to be cut;
 * the rotation of square, portrait and landscape is gone. v1.1.0, 2026-11-11T09:30:00Z: the image call is shared with the
 * regeneration of the Database section (requestImage, docs/database-immagini.v1.0.0.md). v1.0.0, 2026-11-11T05:40:53Z.
 * Groups («slop_batches», migration 0040) keep theme, slots and prompts. Prompts: one call to the text model chosen in
 * Settings, with the base and «Prompt per le SLOP» parts of the model context, in English. Images: one call per image
 * to the image model chosen in Settings; the generator receives only the text of the prompt; the image enters the
 * library as a new SLOP with its group, slot and quality, and then goes through the same analysis as the REAL.
 * Every call needs { confirm: true }, is recorded in «paid_calls» and an uncertain outcome is never resent. */
import { HttpError, id, type Env } from "./core";
import { create, viewOf } from "./library.v1.20.0";
import { chosenModel } from "./models.v1.1.0";
import { currentContext } from "./model-context.v1.4.0";
import { IMAGE_MODELS } from "../shared/models.v1.0.0";
import { formatsFor, generationSize, isFormat, type Format } from "../shared/game-copy.v3.0.0";
import { isCategory } from "../shared/tag-categories.v1.0.0";
import { MAX_SLOTS, SLOT_ORDER, type Slot } from "../shared/slot-extraction.v1.0.0";

const TIMEOUT_MS = 120_000, STALE_MS = 10 * 60_000, PROMPT_MAX = 4000, MAX_OUTPUT_TOKENS = 4000;
const OUTPUT = "Write every prompt in English. Return JSON only, matching the schema: «prompts», one per slot in the same order, " +
  "each with «prompt», the text for the image generator, «used_tags», the tags of its slot that the prompt uses, and «format», " +
  "the photographic format (width:height) a photographer would choose for that subject, among those allowed by the schema.";
/** Format of prompts written before formats existed (v1.5.0): the closest to the 4:5 they were meant for. */
const LEGACY_FORMAT: Format = "3:4";
const OPENAI = "https://api.openai.com/v1/";

interface Batch { id: string; theme: string; slots: string; prompts: string; prompts_status: string; prompts_error: string; created_at: string; updated_at: string }
export interface PromptEntry { prompt: string; used: string[]; format?: Format }

const parse = <T>(value: string, fallback: T): T => { try { return JSON.parse(value) as T; } catch { return fallback; } };
function slotsOf(value: unknown): Slot[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_SLOTS) throw new HttpError(400, `Da 1 a ${MAX_SLOTS} slot`);
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new HttpError(400, "Slot non valido");
    const slot: Slot = {};
    for (const [category, label] of Object.entries(item as Record<string, unknown>))
      if (isCategory(category) && SLOT_ORDER.includes(category) && typeof label === "string" && label) slot[category] = label.slice(0, 40);
    return slot;
  });
}
function themeOf(value: unknown): string[] {
  const theme = Array.isArray(value) ? [...new Set(value.filter((t): t is string => typeof t === "string" && !!t))] : [];
  if (!theme.length || theme.length > 10) throw new HttpError(400, "Indica da 1 a 10 tag per il tema");
  return theme;
}
const confirmOnly = (data: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(data).some(key => !["confirm", ...allowed].includes(key))) throw new HttpError(400, "Campi non previsti");
  if (data.confirm !== true) throw new HttpError(400, "Conferma la chiamata a pagamento");
};

async function load(env: Env, batchId: string): Promise<Batch> {
  const row = await env.DB.prepare("SELECT * FROM slop_batches WHERE id=?").bind(batchId).first<Batch>();
  if (!row) throw new HttpError(404, "Gruppo inesistente");
  return row;
}
async function show(env: Env, batchId: string) {
  const row = await load(env, batchId);
  const ids = (await env.DB.prepare("SELECT id FROM images WHERE generation_batch=? ORDER BY created_at,rowid").bind(batchId).all<{ id: string }>()).results;
  return { id: row.id, theme: parse<string[]>(row.theme, []), slots: parse<Slot[]>(row.slots, []), prompts: parse<PromptEntry[]>(row.prompts, []),
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

/** POST /slop/batches {theme, slots}: a new group, free. */
async function createBatch(env: Env, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => key !== "theme" && key !== "slots")) throw new HttpError(400, "Campi non previsti");
  const theme = themeOf(data.theme), slots = slotsOf(data.slots), batchId = id(), stamp = new Date().toISOString();
  await env.DB.prepare("INSERT INTO slop_batches(id,theme,slots,created_at,updated_at) VALUES(?,?,?,?,?)")
    .bind(batchId, JSON.stringify(theme), JSON.stringify(slots), stamp, stamp).run();
  return show(env, batchId);
}
/** PUT /slop/batches/:id {slots?, prompts?, formats?}: the owner's edits, free. Prompts are plain texts, one per slot; formats one per
 * prompt. */
async function editBatch(env: Env, batchId: string, data: Record<string, unknown>) {
  if (Object.keys(data).some(key => !["slots", "prompts", "formats"].includes(key)) || !Object.keys(data).length) throw new HttpError(400, "Campi non previsti");
  const row = await load(env, batchId);
  const slots = data.slots === undefined ? parse<Slot[]>(row.slots, []) : slotsOf(data.slots);
  let prompts = parse<PromptEntry[]>(row.prompts, []);
  if (data.prompts !== undefined) {
    if (!Array.isArray(data.prompts) || data.prompts.length !== slots.length || data.prompts.some(p => typeof p !== "string" || p.length > PROMPT_MAX))
      throw new HttpError(400, `Un prompt per slot, al massimo ${PROMPT_MAX} caratteri`);
    prompts = (data.prompts as string[]).map((prompt, i) => ({ prompt: prompt.trim(), used: prompts[i]?.used || [], format: prompts[i]?.format }));
  } else if (prompts.length && prompts.length !== slots.length) prompts = [];
  if (data.formats !== undefined) {
    if (!Array.isArray(data.formats) || data.formats.length !== prompts.length || !data.formats.every(isFormat)) throw new HttpError(400, "Formati non validi");
    prompts = prompts.map((entry, i) => ({ ...entry, format: (data.formats as Format[])[i] }));
  }
  await env.DB.prepare("UPDATE slop_batches SET slots=?,prompts=?,updated_at=? WHERE id=?")
    .bind(JSON.stringify(slots), JSON.stringify(prompts), new Date().toISOString(), batchId).run();
  return show(env, batchId);
}

/** POST /slop/batches/:id/prompts {confirm, index?}: one paid call writes all the prompts, or rewrites one. */
async function writePrompts(env: Env, batchId: string, data: Record<string, unknown>) {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  confirmOnly(data, ["index"]);
  const row = await load(env, batchId);
  const theme = parse<string[]>(row.theme, []), slots = parse<Slot[]>(row.slots, []), current = parse<PromptEntry[]>(row.prompts, []);
  const index = data.index;
  if (index !== undefined && (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= slots.length)) throw new HttpError(400, "Slot inesistente");
  const wanted = index === undefined ? slots.map((slot, i) => ({ slot, i })) : [{ slot: slots[index as number], i: index as number }];
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
  const input = { theme, count: wanted.length,
    note: "The theme tags must appear in every prompt. Make the prompts different from one another; keep each faithful to its slot." +
      (index === undefined ? "" : " Other prompts of the group, to stay different from: " + current.filter((_, i) => i !== index).map(p => p.prompt).join(" | ")),
    slots: wanted.map(({ slot }) => slot) };
  let response: Response;
  try {
    response = await fetch((env.OPENAI_BASE_URL || OPENAI) + "responses", { method: "POST", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model, instructions: baseContext.body + "\n\n" + taskContext.body + "\n\n" + OUTPUT, text: { format },
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
  const prompts = index === undefined ? written : slots.map((_, i) => i === index ? written[0] : current[i] || { prompt: "", used: [] });
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

/** POST /slop/batches/:id/images {confirm, index, quality}: one paid call generates the image of one prompt. */
async function generateImage(env: Env, batchId: string, data: Record<string, unknown>) {
  if (!env.OPENAI_API_KEY) throw new HttpError(503, "Chiave OpenAI mancante");
  confirmOnly(data, ["index", "quality"]);
  const row = await load(env, batchId);
  const theme = parse<string[]>(row.theme, []), slots = parse<Slot[]>(row.slots, []), prompts = parse<PromptEntry[]>(row.prompts, []);
  const index = data.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= slots.length) throw new HttpError(400, "Slot inesistente");
  const prompt = prompts[index]?.prompt;
  if (!prompt) throw new HttpError(409, "Scrivi prima il prompt di questo slot");
  const model = await chosenModel(env, "image_model"), qualities = IMAGE_MODELS[model] || [];
  if (typeof data.quality !== "string" || !qualities.includes(data.quality)) throw new HttpError(400, `Qualità non ammessa da ${model}: ${qualities.join(", ")}`);
  const quality = data.quality, size = generationSize(model, prompts[index]?.format || LEGACY_FORMAT);
  const bytes = await requestImage(env, model, prompt, size, quality);
  const view = await create(env, { origin: "SLOP", title: (theme.join(", ") + " " + (index + 1)).slice(0, 200), bytes: bytes.buffer as ArrayBuffer,
    prompt, model, generation: { batch: batchId, slot: { index, theme, tags: slots[index] }, quality } });
  return view;
}

/** GET /slop/batches: the last groups, to pick one up again. */
async function recent(env: Env) {
  const rows = (await env.DB.prepare(`SELECT b.id,b.theme,b.slots,b.prompts_status,b.updated_at,(SELECT count(*) FROM images i WHERE i.generation_batch=b.id) AS images
    FROM slop_batches b ORDER BY b.updated_at DESC LIMIT 10`).all<{ id: string; theme: string; slots: string; prompts_status: string; updated_at: string; images: number }>()).results;
  return { batches: rows.map(r => ({ id: r.id, theme: parse<string[]>(r.theme, []), count: parse<Slot[]>(r.slots, []).length,
    prompts_status: r.prompts_status, images: r.images, updated_at: r.updated_at })) };
}

export async function batchRoute(env: Env, method: string, rest: string, data: Record<string, unknown>) {
  if (rest === "" && method === "GET") return recent(env);
  if (rest === "" && method === "POST") return createBatch(env, data);
  const [batchId, action] = rest.split("/");
  if (!/^[\w-]{1,64}$/.test(batchId)) throw new HttpError(404, "Gruppo inesistente");
  if (!action && method === "GET") return show(env, batchId);
  if (!action && method === "PUT") return editBatch(env, batchId, data);
  if (action === "prompts" && method === "POST") return writePrompts(env, batchId, data);
  if (action === "images" && method === "POST") return generateImage(env, batchId, data);
  throw new HttpError(404, "API dei gruppi SLOP inesistente");
}
