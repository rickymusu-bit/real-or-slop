import { validGenerationDate } from "../shared/slop";
import { HttpError, id, type Env } from "./core";
import { recognizedLicense } from "../shared/licenses";

export function importText(data: Record<string, unknown>, key: string, max = 4000, preserve = false) {
  const value = data[key];
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new HttpError(400, `Campo richiesto o non valido: ${key}`);
  return preserve ? value : value.trim();
}
export function httpsUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw Error();
  } catch { throw new HttpError(400, "URL HTTPS valido richiesto"); }
  return value;
}
// Reused by manual import and studio import. A server-built SQL guard lets the
// studio's revision/audit transition and all candidate inserts share ONE batch.
export function prepareImport(env: Env, data: Record<string, unknown>, guard = { sql: "1", values: [] as unknown[] }) {
  const uid = id(), source = id(), licenseId = id();
  if (!["REAL", "AI"].includes(String(data.type))) throw new HttpError(400, "Tipo immagine non valido");
  const type = String(data.type);
  const title = importText(data, "title", 300), author = importText(data, "author", 300);
  const explanation = importText(data, "explanation"), evidence = importText(data, "evidence");
  const licenseInput = data.license_url ? importText(data, "license_url", 500) : "";
  const license = recognizedLicense(licenseInput);
  const licenseUrl = license?.url || (licenseInput ? httpsUrl(licenseInput) : "");
  const sourceUrl = httpsUrl(importText(data, "source_url", 1000));
  const provider = importText(data, "provider", 100), sourceId = importText(data, "source_id", 300);
  if (type === "AI" && data.owner_declaration !== true) throw new HttpError(400, "Dichiarazione del proprietario richiesta");
  const date = type === "AI" ? importText(data, "generation_date", 10) : null;
  if (date && !validGenerationDate(date)) throw new HttpError(400, "Data di generazione YYYY-MM-DD valida richiesta");
  const model = type === "AI" ? importText(data, "ai_model", 300) : null;
  const prompt = type === "AI" ? importText(data, "ai_prompt", 8000, true) : null;
  const categories = Array.isArray(data.categories) ? data.categories.map(String).slice(0, 12) : [];
  if (!categories.length) throw new HttpError(400, "Categoria richiesta");
  const insert = (table: string, values: unknown[], columns = "") =>
    env.DB.prepare(`INSERT INTO ${table}${columns ? `(${columns})` : ""} SELECT ${values.map(() => "?").join(",")} WHERE ${guard.sql}`)
      .bind(...values, ...guard.values);
  return { id: uid, statements: [
    insert("sources", [source, provider, sourceId, sourceUrl, evidence]),
    insert("licenses", [licenseId, license?.name || String(data.license_name || "Da verificare").slice(0, 200), licenseUrl, "Obblighi da verificare editorialmente"]),
    insert("images", [uid, type, title, String(data.description || ""), author, source, licenseId, evidence, id(), model, prompt, "in-review", "pending", explanation, 0, date, type === "AI" ? 1 : 0],
      "id,type,title,description,author,source_id,license_id,authenticity_evidence,r2_key,ai_model,ai_prompt,status,sha256,explanation,demo,generation_date,owner_declaration"),
    ...categories.map((category) => insert("image_categories", [uid, category])),
  ] };
}
