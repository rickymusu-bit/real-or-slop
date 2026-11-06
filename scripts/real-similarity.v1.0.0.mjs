import { compareSameOrigin, normalizedEmbedding, similarityVersion } from "../shared/similarity.ts";
let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk;
  if (raw.length > 5_000_000) throw Error("Similarity input too large");
}
const rows = JSON.parse(raw);
if (!Array.isArray(rows) || rows.length > 200) throw Error("Invalid feature list");
for (const row of rows) {
  if (row.version !== similarityVersion || row.origin !== "REAL" || !/^[a-f0-9]{64}$/.test(row.sha256) || !/^[a-f0-9]{16}$/.test(row.dhash)) throw Error("Feature contract mismatch");
  row.embedding = normalizedEmbedding(row.embedding);
}
const suggestions = [];
for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
  const compared = compareSameOrigin(rows[i], rows[j]);
  if (compared?.reason) suggestions.push({ a: rows[i].id, b: rows[j].id, ...compared, automatic_rejection: false });
}
process.stdout.write(JSON.stringify(suggestions));
