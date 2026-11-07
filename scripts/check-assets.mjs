import { readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "jsonc-parser";

const project = fileURLToPath(new URL("../", import.meta.url));
const errors = [];
const config = parse(readFileSync(resolve(project, "wrangler.jsonc"), "utf8"), errors, {
  allowTrailingComma: true,
});
if (errors.length || !config.assets?.directory) {
  throw new Error("Configurazione assets.directory non valida in wrangler.jsonc");
}
const directory = resolve(project, config.assets.directory);
const index = resolve(directory, "index.html");
const html = readFileSync(index, "utf8");
const references = Array.from(
  html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi),
  (match) => match[1],
).filter((reference) => !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference));
if (!references.length) throw new Error("Nessuna risorsa compilata in dist/index.html");
if (!references.some(reference => new URL(reference, "https://build.invalid/").pathname.endsWith(".css"))) {
  throw new Error("Foglio di stile compilato assente da dist/index.html");
}
for (const reference of references) {
  const pathname = decodeURIComponent(new URL(reference, "https://build.invalid/").pathname);
  if (pathname.startsWith("/src/") || /\.tsx?$/.test(pathname)) {
    throw new Error(`Risorsa TypeScript non compilata: ${reference}`);
  }
  const file = resolve(directory, "." + pathname);
  if (!file.startsWith(directory + sep) || !statSync(file).isFile()) {
    throw new Error(`Risorsa pubblicata mancante: ${reference}`);
  }
}
console.log(`Asset verificati: ${config.assets.directory}/index.html e ${references.length} risorse locali.`);
