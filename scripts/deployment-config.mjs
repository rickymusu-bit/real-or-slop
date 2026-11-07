// Owner-confirmed destinations. The release command never provisions resources
// or changes DATA_MODE: catalog imports remain separate from the demo games.
export function validateDemoConfig(config, runtimeAccount) {
  if (
    !config || config.name !== "real-or-slop" ||
    config.account_id !== "89bb1f60467dcfd2147871748f0f9645" ||
    config.vars?.DATA_MODE !== "demo"
  ) throw new Error("Il comando di rilascio è riservato alla demo real-or-slop.");
  const db = config.d1_databases?.find((binding) => binding.binding === "DB");
  if (
    config.d1_databases?.length !== 1 ||
    db?.database_id !== "98a3e712-d9f9-4510-91ab-2b80329be753" ||
    db.database_name !== "real-or-slop-local"
  ) throw new Error("Database demo diverso dalla destinazione confermata dal proprietario.");
  const expected = {
    QUARANTINE: "real-or-slop-quarantine",
    IMAGES: "real-or-slop-approved",
  };
  if (
    config.r2_buckets?.length !== 2 ||
    Object.entries(expected).some(([binding, bucket]) =>
      config.r2_buckets.filter((entry) => entry.binding === binding && entry.bucket_name === bucket).length !== 1)
  ) throw new Error("Binding R2 diversi dai due bucket confermati dal proprietario.");
  if (runtimeAccount && runtimeAccount !== config.account_id)
    throw new Error("Account runtime diverso dalla destinazione demo confermata.");
  return { db, buckets: expected };
}

// Read-only discovery must complete before any migration/seed/deployment. Never
// deploy older code over a database whose migration history is ahead of it.
export function pendingDemoMigrations(files, applied) {
  const valid = (value) => typeof value === "string" && /^\d{4}_[a-z0-9_-]+(?:\.v\d+\.\d+\.\d+)?\.sql$/.test(value);
  if (!Array.isArray(files) || !files.length || files.some((name) => !valid(name)) ||
      !Array.isArray(applied) || applied.some((name) => !valid(name))) {
    throw new Error("Elenco delle migrazioni non valido: rilascio interrotto.");
  }
  const ordered = [...files].sort();
  if (new Set(ordered).size !== ordered.length || new Set(applied).size !== applied.length ||
      applied.some((name, index) => name !== ordered[index])) {
    throw new Error("Schema remoto non compatibile con questo checkout: rilascio interrotto.");
  }
  return ordered.slice(applied.length);
}

export function parseAppliedMigrations(output) {
  try {
    const result = JSON.parse(output);
    if (!Array.isArray(result) || !result.length || result.some((part) => part.success !== true || !Array.isArray(part.results))) throw Error();
    const rows = result.flatMap((part) => part.results);
    if (rows.some((row) => !row || typeof row.name !== "string")) throw Error();
    return rows.map((row) => row.name);
  } catch {
    throw new Error("Impossibile verificare le migrazioni remote: nessuna pubblicazione eseguita.");
  }
}

export function releaseDemo({ files, readApplied, run, approved }) {
  const pending = pendingDemoMigrations(files, readApplied());
  if (pending.length) {
    if (approved !== true) {
      throw new Error(`Migrazioni da approvare: ${pending.join(", ")}. Eseguire preflight e backup, poi impostare EDITORIAL_SCHEMA_RELEASE_APPROVED=true soltanto per quel rilascio.`);
    }
    run(["d1", "migrations", "apply", "DB", "--remote"]);
    if (pendingDemoMigrations(files, readApplied()).length) {
      throw new Error("Migrazioni remote non completate: seed e deploy interrotti.");
    }
    run(["d1", "execute", "DB", "--remote", "--file", "scripts/seed.sql"]);
  }
  // Existing schema: no migrations or seed, and no permanent approval bypass.
  // Keep dashboard/server budget switches as well as the inherited secrets.
  run(["deploy", "--no-experimental-provision", "--keep-vars"]);
  return { migrationsApplied: pending };
}
