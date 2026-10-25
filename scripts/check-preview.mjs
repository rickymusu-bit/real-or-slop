import fs from "node:fs";
import { parse } from "jsonc-parser";
const errors = [];
const config = parse(
  fs.readFileSync(process.argv[2] || "wrangler.jsonc", "utf8"),
  errors,
  { allowTrailingComma: true },
);
if (errors.length) throw Error("Configurazione JSONC non valida");
const p = config.previews;
if (!p) throw Error("Blocco previews mancante");
for (const kind of ["d1_databases", "r2_buckets"]) {
  const key = kind === "d1_databases" ? "database_id" : "bucket_name";
  if (!p[kind]?.length)
    throw Error(`Binding test ${kind} mancanti: preview bloccata`);
  for (const r of p[kind]) {
    if (!r[key] || /REPLACE|local|placeholder/i.test(r[key]))
      throw Error(`Destinazione test ${r.binding} non verificata`);
    if (config[kind]?.some((prod) => prod[key] === r[key]))
      throw Error(
        `La preview condivide ${key} con produzione: operazione bloccata`,
      );
  }
}
for (const name of ["DB", "IMAGES", "QUARANTINE"])
  if (![...p.d1_databases, ...p.r2_buckets].some((r) => r.binding === name))
    throw Error("Binding preview mancante: " + name);
if (
  p.r2_buckets.find((r) => r.binding === "IMAGES").bucket_name ===
  p.r2_buckets.find((r) => r.binding === "QUARANTINE").bucket_name
)
  throw Error("Quarantena deve usare un bucket distinto");
console.log(
  "Binding test distinti da produzione; verificare anche permessi, account, migrazioni e isolamento DO.",
);
