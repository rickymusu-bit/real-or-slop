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
