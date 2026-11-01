import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse } from "jsonc-parser";
import { validateDemoConfig } from "./deployment-config.mjs";

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
function wrangler(args) {
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
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
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
    if (process.env.EDITORIAL_SCHEMA_RELEASE_APPROVED !== "true") {
      throw new Error("La migrazione editoriale 0007/0008 richiede preflight, backup e rilascio coordinato approvato: impostare EDITORIAL_SCHEMA_RELEASE_APPROVED=true soltanto per quel rilascio.");
    }
    // Separate from the build: approved coordinated migrations + synthetic demo data.
    // No billing, bucket creation, or resource provisioning is performed here.
    wrangler(["d1", "migrations", "apply", "DB", "--remote"]);
    wrangler(["d1", "execute", "DB", "--remote", "--file", "scripts/seed.sql"]);
    wrangler(["deploy", "--no-experimental-provision"]);
  }
}
