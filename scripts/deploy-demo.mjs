import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse } from "jsonc-parser";
import { parseAppliedMigrations, releaseDemo, validateDemoConfig } from "./deployment-config.mjs";
import { checkLiveAssets } from "./check-live-assets.mjs";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const config = parse(
  readFileSync(resolve(root, "wrangler.jsonc"), "utf8"),
  errors,
  {
    allowTrailingComma: true,
  },
);
if (errors.length) throw new Error("Configurazione JSONC non valida.");
const { db, buckets } = validateDemoConfig(config, process.env.CLOUDFLARE_ACCOUNT_ID);
const flags = new Set(process.argv.slice(2));
if ([...flags].some((flag) => !["--check", "--dry-run"].includes(flag))) {
  throw new Error("Opzioni ammesse: --check, --dry-run.");
}
console.log(
  `Demo: ${config.name}; D1 esistente: ${db.database_name} (${db.database_id}); QUARANTINE: ${buckets.QUARANTINE}; IMAGES: ${buckets.IMAGES}.`,
);
function wrangler(args, capture = false) {
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, "node_modules/wrangler/bin/wrangler.js"),
      ...args,
      "--config",
      "wrangler.jsonc",
      "--env",
      "",
    ],
    {
      cwd: root,
      env: process.env,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
      encoding: "utf8",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) throw new Error("Verifica delle migrazioni D1 non riuscita: controllare accesso e configurazione; rilascio interrotto.");
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}
if (!flags.has("--check")) {
  if (flags.has("--dry-run")) {
    console.log("Dry-run: migrazioni e seed remoti NON eseguiti.");
    wrangler([
      "deploy",
      "--dry-run",
      "--outdir",
      ".wrangler/dry-run",
      "--no-experimental-provision",
    ]);
  } else {
    const result = releaseDemo({
      files: readdirSync(resolve(root, "migrations")).filter((name) => name.endsWith(".sql")),
      readApplied: () => parseAppliedMigrations(wrangler([
        "d1", "execute", "DB", "--remote", "--command",
        "SELECT name FROM d1_migrations ORDER BY id", "--json",
      ], true)),
      run: wrangler,
      approved: process.env.EDITORIAL_SCHEMA_RELEASE_APPROVED === "true",
    });
    if (!result.migrationsApplied.length) console.log("Schema già aggiornato: nessuna migrazione o seed remoto eseguito.");
    for (let attempt = 0; ; attempt++) {
      try {
        const assets = await checkLiveAssets("https://real-or-slop.rickymusu.workers.dev");
        console.log(`Asset online verificati: ${assets.scripts} JavaScript e ${assets.stylesheets} CSS con MIME corretto.`);
        break;
      } catch (error) {
        if (attempt === 2) throw error;
        await delay(2000);
      }
    }
  }
}
