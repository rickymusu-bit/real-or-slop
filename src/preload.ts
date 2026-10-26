import { preloadLimits } from "../shared/preloading";
export interface DecodedImage {
  url: string; width: number; height: number; release(): void;
}
export interface PreloadOptions {
  concurrency?: number; timeoutMs?: number; encodedBytes?: number;
  decodedBytes?: number; assetBytes?: number; pixels?: number;
  headers?: HeadersInit;
  fetcher?: (url: string, signal: AbortSignal) => Promise<Blob>;
  decoder?: (blob: Blob, signal: AbortSignal) => Promise<DecodedImage>;
}
interface Entry {
  key: string; blob?: Blob; asset?: DecodedImage; verified: boolean;
  used: number; task?: Promise<void>; controller?: AbortController;
}
interface Job { entry: Entry; priority: number; resolve(): void; reject(error: unknown): void }
const cancelled = () => new Error("Caricamento annullato");
export async function decodeImage(blob: Blob, signal: AbortSignal): Promise<DecodedImage> {
  const url = URL.createObjectURL(blob), image = new Image();
  image.decoding = "async"; image.loading = "eager"; image.fetchPriority = "high";
  let released = false;
  const release = () => { if (!released) { released = true; image.src = ""; URL.revokeObjectURL(url); } };
  if (signal.aborted) { release(); throw cancelled(); }
  const onAbort = () => release();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    image.src = url;
    await image.decode();
    if (signal.aborted || !image.naturalWidth || !image.naturalHeight) throw Error("Immagine non decodificabile");
    return { url, width: image.naturalWidth, height: image.naturalHeight, release };
  } catch { release(); throw Error(signal.aborted ? "Caricamento annullato" : "Il file immagine non può essere visualizzato. Riprova."); }
  finally { signal.removeEventListener("abort", onAbort); }
}
export class ImagePreloader {
  private entries = new Map<string, Entry>();
  private queue: Job[] = [];
  private running = 0;
  private disposed = false;
  private active = "";
  private window = new Set<string>();
  private stamp = 0;
  private keepEncoded = true;
  private encoded = 0;
  private decoded = 0;
  private limits;
  private fetcher: NonNullable<PreloadOptions["fetcher"]>;
  private decoder: NonNullable<PreloadOptions["decoder"]>;
  constructor(options: PreloadOptions = {}) {
    this.limits = { ...preloadLimits, ...options };
    for (const key of ["concurrency", "timeoutMs", "encodedBytes", "decodedBytes", "assetBytes", "pixels"] as const)
      if (!Number.isFinite(this.limits[key]) || this.limits[key] < 1) throw Error("Limite di caricamento non valido");
    this.limits.concurrency = Math.min(4, Math.floor(this.limits.concurrency));
    this.decoder = options.decoder || decodeImage;
    this.fetcher = options.fetcher || (async (url, signal) => {
      const response = await fetch(url, { signal, credentials: "same-origin", headers: options.headers, cache: "force-cache" });
      if (!response.ok) throw Error("Immagine non disponibile. Riprova la connessione.");
      if (Number(response.headers.get("Content-Length") || 0) > this.limits.assetBytes) throw Error("Immagine oltre il limite di caricamento");
      const reader = response.body?.getReader();
      if (!reader) throw Error("File immagine vuoto");
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let bytes = 0;
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > this.limits.assetBytes) { await reader.cancel(); throw Error("Immagine oltre il limite di caricamento"); }
          chunks.push(part.value as Uint8Array<ArrayBuffer>);
        }
      } finally { reader.releaseLock(); }
      if (!bytes) throw Error("File immagine vuoto");
      return new Blob(chunks, { type: response.headers.get("Content-Type") || "application/octet-stream" });
    });
  }
  get metrics() { return { encodedBytes: this.encoded, decodedBytes: this.decoded, inFlight: this.running, queued: this.queue.length, verified: [...this.entries.values()].filter(e => e.verified).length }; }
  retain(urls: readonly string[], keepEncoded = true) {
    this.keepEncoded = keepEncoded;
    this.window = new Set(urls.slice(0, preloadLimits.window));
    this.trim();
  }
  private entry(key: string) {
    let entry = this.entries.get(key);
    if (!entry) { entry = { key, verified: false, used: ++this.stamp }; this.entries.set(key, entry); }
    return entry;
  }
  private release(entry: Entry) {
    if (entry.asset) { this.decoded -= entry.asset.width * entry.asset.height * 4; entry.asset.release(); entry.asset = undefined; }
  }
  private trim() {
    const candidates = [...this.entries.values()].filter(e => e.asset && e.key !== this.active).sort((a, b) => a.used - b.used);
    for (const entry of candidates) if (!this.window.has(entry.key) || this.decoded > this.limits.decodedBytes) this.release(entry);
    if (!this.keepEncoded) for (const entry of this.entries.values()) {
      if (entry.key !== this.active && !this.window.has(entry.key) && !entry.task && entry.blob) {
        this.encoded -= entry.blob.size; entry.blob = undefined; entry.verified = false;
      }
    }
  }
  private schedule(entry: Entry, priority: number) {
    if (this.disposed) return Promise.reject(cancelled());
    entry.used = ++this.stamp;
    if (entry.task) {
      const queued = this.queue.find(job => job.entry === entry);
      if (queued) { queued.priority = Math.min(priority, queued.priority); this.queue.sort((a, b) => a.priority - b.priority); }
      return entry.task;
    }
    if (entry.asset) return Promise.resolve();
    entry.task = new Promise<void>((resolve, reject) => { this.queue.push({ entry, priority, resolve, reject }); });
    this.queue.sort((a, b) => a.priority - b.priority);
    this.drain();
    return entry.task;
  }
  private drain() {
    while (!this.disposed && this.running < this.limits.concurrency && this.queue.length) {
      const job = this.queue.shift()!;
      this.running++;
      void this.run(job).finally(() => { this.running--; this.drain(); });
    }
  }
  private async run(job: Job) {
    const entry = job.entry, controller = new AbortController();
    entry.controller = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(Error(this.disposed ? "Caricamento annullato" : "Caricamento troppo lento. Riprova.")), { once: true });
      timer = setTimeout(() => controller.abort(), this.limits.timeoutMs);
    });
    const operation = async () => {
      if (!entry.blob) {
        const blob = await this.fetcher(entry.key, controller.signal);
        if (controller.signal.aborted) throw cancelled();
        if (!blob.size || blob.size > this.limits.assetBytes || this.encoded + blob.size > this.limits.encodedBytes)
          throw Error("Limite dati raggiunto. Riprova o annulla la partita.");
        entry.blob = blob; this.encoded += blob.size;
      }
      const asset = await this.decoder(entry.blob, controller.signal);
      if (controller.signal.aborted) { asset.release(); throw cancelled(); }
      const bytes = asset.width * asset.height * 4;
      if (!asset.width || !asset.height || asset.width * asset.height > this.limits.pixels || bytes > this.limits.decodedBytes) {
        asset.release(); throw Error("Dimensioni immagine non supportate dal budget di memoria");
      }
      entry.asset = asset; this.decoded += bytes; entry.verified = true;
      this.trim();
    };
    try { await Promise.race([operation(), abort]); job.resolve(); }
    catch (error) {
      controller.abort(); this.release(entry);
      if (entry.blob) { this.encoded -= entry.blob.size; entry.blob = undefined; }
      entry.verified = false; job.reject(error);
    } finally {
      if (timer) clearTimeout(timer);
      entry.task = undefined; entry.controller = undefined; this.trim();
    }
  }
  async activate(url: string) {
    if (this.disposed) throw cancelled();
    this.active = url; this.window.add(url); this.trim();
    const entry = this.entry(url);
    await this.schedule(entry, 0);
    if (this.disposed || this.active !== url || !entry.asset) throw cancelled();
    return entry.asset;
  }
  async prefetch(url: string, priority = 1) {
    if (this.disposed) throw cancelled();
    const entry = this.entry(url);
    if (!entry.verified || (this.window.has(url) && !entry.asset)) await this.schedule(entry, priority);
  }
  async prepareAll(urls: readonly string[], onProgress: (state: { verified: number; total: number; bytes: number }) => void) {
    const unique = [...new Set(urls)]; let verified = 0;
    try {
      await Promise.all(unique.map((url, index) => this.prefetch(url, index + 1).then(() => {
        if (!this.disposed) onProgress({ verified: ++verified, total: unique.length, bytes: this.encoded });
      })));
    } catch (error) { this.dispose(); throw error; }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const job of this.queue.splice(0)) { job.entry.task = undefined; job.reject(cancelled()); }
    for (const entry of this.entries.values()) {
      entry.controller?.abort(); this.release(entry);
      if (entry.blob) { this.encoded -= entry.blob.size; entry.blob = undefined; }
    }
    this.entries.clear(); this.active = ""; this.window.clear();
  }
}
