import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/**
 * Il brand viene attivato solo quando tutti gli asset approvati sono presenti
 * *e* identici agli originali. Un checkout senza immagini usa la home demo,
 * senza request 404 e senza link a file inesistenti.
 */
const brandDirectory = join(dirname(fileURLToPath(import.meta.url)), "public", "brand");
const brandAssets = [
  ["hero-real-slop-v1.0.0.png", "6beafa77b26979c34551f41a3d2b61b97de4ac87329853ee4bd8c31e612841ca"],
  ["mascot-real-slop-v1.0.0.png", "a19d5bf150f220d1afee2c2802d450c118d0b786d905cd29f22f74d643cf5ba4"],
  ["logo-real-slop-v1.0.0.png", "8d92cdca9afd251e64f330e7a307025fe0c51e5fa748ad63c41cd261cdef7a8b"],
] as const;
const ready = brandAssets.every(([filename, expectedHash]) => {
  const path = join(brandDirectory, filename);
  return existsSync(path) &&
    createHash("sha256").update(readFileSync(path)).digest("hex") === expectedHash;
});

export default defineConfig({
  define: {
    __ROS_BRAND_READY__: JSON.stringify(ready),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
