// Incremental scan for importers/cron. No image leaves the local process.
// Admin token is inherited from the environment and never printed.
import { extractSimilarity } from "../shared/similarity-extraction.ts";
import { similarityVersion } from "../shared/similarity.ts";
import { env } from "@huggingface/transformers";
import { URL } from "node:url";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--help") {
  console.log("Uso: npm run scan:similarity -- --base https://IL-SITO\nSegreto richiesto: REAL_OR_SLOP_ADMIN_TOKEN. Scansione incrementale privata, senza approvazioni automatiche.");
  process.exit(0);
}
if (args.length !== 2 || args[0] !== "--base") throw Error("Uso: npm run scan:similarity -- --base https://IL-SITO");
const base = new URL(args[1]);
if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) throw Error("HTTPS richiesto fuori localhost");
if (base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw Error("Specificare solo l’origine del sito");
const token = process.env.REAL_OR_SLOP_ADMIN_TOKEN;
if (!token || token.length < 32) throw Error("Configurare REAL_OR_SLOP_ADMIN_TOKEN");
env.cacheDir = ".pipeline/similarity-model";
async function call(path, options = {}) {
  let response;
  try {
    response = await fetch(new URL("/api/admin/similarity" + path, base), {
      ...options, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...options.headers }, redirect: "error",
    });
  } catch { throw Error("Richiesta non riuscita: controllare rete e configurazione"); }
  if (!response.ok) throw Error(`API somiglianze: HTTP ${response.status}`);
  return response;
}
let after = "", done = 0, failed = 0;
do {
  const batch = await (await call("/assets?after=" + encodeURIComponent(after))).json();
  for (const asset of batch.assets) {
    if (asset.indexed) continue;
    try {
      const feature = asset.cached ? {} : await extractSimilarity(await (await call(`/assets/${asset.id}/image`)).blob(), "cpu");
      if (feature.sha256 && feature.sha256 !== asset.sha256) throw Error("File cambiato");
      await call(`/assets/${asset.id}/features`, { method: "POST", body: JSON.stringify({ ...feature, sha256: asset.sha256, model: similarityVersion }) });
      console.log(`Analizzate: ${++done}`);
    } catch (error) { failed++; console.error(`Immagine ${asset.id}: ${error.message}`); }
  }
  after = batch.next || "";
} while (after);
console.log(JSON.stringify({ analyzed: done, failed, summary: await (await call("")).json() }));
if (failed) process.exitCode = 1;
