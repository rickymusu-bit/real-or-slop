import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse } from "jsonc-parser";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const config = parse(
  readFileSync(resolve(root, "wrangler.jsonc"), "utf8"),
  errors,
  {
    allowTrailingComma: true,
  },
);
const expectedDatabase = "98a3e712-d9f9-4510-91ab-2b80329be753";
const db = config.d1_databases?.find((binding) => binding.binding === "DB");
if (
  errors.length ||
  config.name !== "real-or-slop" ||
  config.account_id !== "89bb1f60467dcfd2147871748f0f9645" ||
  config.vars?.DATA_MODE !== "demo"
) {
  throw new Error("Il comando di rilascio è riservato alla demo real-or-slop.");
}
if (
  db?.database_id !== expectedDatabase ||
  db.database_name !== "real-or-slop-local"
) {
  throw new Error(
    "Database demo diverso dalla destinazione confermata dal proprietario.",
  );
}
if (config.r2_buckets?.length || (config.d1_databases?.length ?? 0) !== 1) {
  throw new Error(
    "Binding remoti inattesi: la demo richiede solo il D1 confermato, ASSETS e ROOMS.",
  );
}
if (
  process.env.CLOUDFLARE_ACCOUNT_ID &&
  process.env.CLOUDFLARE_ACCOUNT_ID !== config.account_id
) {
  throw new Error(
    "Account runtime diverso dalla destinazione demo confermata.",
  );
}
const flags = new Set(process.argv.slice(2));
if ([...flags].some((flag) => !["--check", "--dry-run"].includes(flag))) {
  throw new Error("Opzioni ammesse: --check, --dry-run.");
}
console.log(
  `Demo: ${config.name}; D1 esistente: ${db.database_name} (${db.database_id}); nessun bucket R2.`,
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
    // Separate from the build: additive migrations + idempotent synthetic demo data.
    // No billing, bucket creation, or resource provisioning is performed here.
    wrangler(["d1", "migrations", "apply", "DB", "--remote"]);
    wrangler(["d1", "execute", "DB", "--remote", "--file", "scripts/seed.sql"]);
    wrangler(["deploy", "--no-experimental-provision"]);
  }
}
