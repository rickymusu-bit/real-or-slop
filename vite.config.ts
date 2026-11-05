import { defineConfig } from "vite";
import { gzipSync } from "node:zlib";

export default defineConfig({
  experimental: {
    renderBuiltUrl(filename, { type }) {
      if (type === "asset" && filename.endsWith(".wasm")) return "/" + filename + ".gz";
    },
  },
  plugins: [{
    name: "compressed-inference-runtime",
    generateBundle(_options, bundle) {
      for (const [name, asset] of Object.entries(bundle)) {
        if (asset.type !== "asset" || !name.endsWith(".wasm")) continue;
        this.emitFile({ type: "asset", fileName: name + ".gz", source: gzipSync(asset.source, { level: 9 }) });
        delete bundle[name];
      }
    },
  }],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
