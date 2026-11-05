import { env, pipeline, RawImage, type ImageFeatureExtractionPipeline } from "@huggingface/transformers";
import { embeddingDimensions, normalizedEmbedding, similarityModel, similarityModelRevision, type SimilarityFeature } from "./similarity";

env.allowLocalModels = false;
// A single thread works without cross-origin isolation and keeps memory bounded.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
let extractor: Promise<ImageFeatureExtractionPipeline> | undefined;
let browserRuntime: Promise<void> | undefined;
async function prepareBrowserRuntime() {
  const wasm = env.backends.onnx.wasm;
  if (!wasm) throw Error("Runtime WASM non supportato");
  const response = await fetch(new URL("../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm", import.meta.url));
  if (!response.ok || !response.body) throw Error("Runtime di analisi non disponibile");
  // Vite publishes a gzip asset to keep direct uploads small. ONNX's supported
  // binary override consumes the original bytes without fetching its fallback URL.
  const binary = await new Response(response.body.pipeThrough(new globalThis.DecompressionStream("gzip"))).arrayBuffer();
  wasm.wasmBinary = new Uint8Array(binary);
}
// Narrow the loader signature: the library's union of every supported pipeline
// otherwise exceeds TypeScript's instantiation limit for this one task.
const loadExtractor = pipeline as unknown as (task: "image-feature-extraction", model: string,
  options: { dtype: "q8"; device: "wasm" | "cpu"; revision: string }) => Promise<ImageFeatureExtractionPipeline>;

export async function extractSimilarity(blob: Blob, device: "wasm" | "cpu" = "wasm"): Promise<SimilarityFeature> {
  if (device === "wasm" && typeof window !== "undefined") {
    browserRuntime ||= prepareBrowserRuntime();
    await browserRuntime.catch(error => { browserRuntime = undefined; throw error; });
  }
  if (blob.size > 12_000_000) throw Error("Immagine oltre 12 MB");
  const bytes = await blob.arrayBuffer();
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2, "0")).join("");
  const image = await RawImage.fromBlob(blob);
  if (image.width * image.height > 30_000_000) throw Error("Immagine oltre 30 megapixel");
  // Fixed area-average grayscale reduction, independent of Canvas/Sharp's
  // interpolation defaults. Bit order matches the existing offline dHash.
  const sums = new Float64Array(72), counts = new Uint32Array(72);
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const index = (y * image.width + x) * image.channels;
    const gray = image.channels < 3 ? image.data[index] : 0.299 * image.data[index] + 0.587 * image.data[index + 1] + 0.114 * image.data[index + 2];
    const bin = Math.min(7, Math.floor(y * 8 / image.height)) * 9 + Math.min(8, Math.floor(x * 9 / image.width));
    sums[bin] += gray; counts[bin]++;
  }
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const i = y * 9 + x;
    if (sums[i] / (counts[i] || 1) > sums[i + 1] / (counts[i + 1] || 1)) bits |= 1n << BigInt(y * 8 + x);
  }
  extractor ||= loadExtractor("image-feature-extraction", similarityModel, { dtype: "q8", device, revision: similarityModelRevision });
  const model = await extractor.catch(error => { extractor = undefined; throw error; });
  const output = await model(image, { pool: false });
  // DINOv2 last_hidden_state is [1,tokens,384]; token zero is CLS.
  if (output.dims.at(-1) !== embeddingDimensions) throw Error("Output DINOv2 incompatibile");
  const embedding = normalizedEmbedding(Array.from(output.data.slice(0, embeddingDimensions)));
  return { sha256, dhash: bits.toString(16).padStart(16, "0"), embedding };
}
