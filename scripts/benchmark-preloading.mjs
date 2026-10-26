// Real Chromium fetch + image.decode(), synthetic LOCAL delivery delays.
// This is an asset benchmark, not a measurement of a mobile carrier or a full game.
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { demoSvg } from '../worker/core.ts';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'artifacts/preloading'); mkdirSync(output, { recursive: true });
const profile = mkdtempSync(resolve(tmpdir(), 'ros-preload-bench-'));
const log = openSync(resolve(output, 'chromium.log'), 'w');
const browser = spawn(process.env.CHROMIUM_PATH || 'chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--remote-debugging-port=9225', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', log, log], detached: true });
let ws, spawnError;
browser.on('error', error => { spawnError = error; });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let info;
  for (let n = 0; n < 100 && !info; n++) { if (spawnError) throw spawnError; try { info = await (await fetch('http://127.0.0.1:9225/json/new?about:blank', { method: 'PUT' })).json(); } catch { await pause(100); } }
  if (!info) throw Error('Existing Chromium not available');
  ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let seq = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  let wireAvailableAt = 0;
  let fixture = { body: '', mime: '', bytes: 0 }, network = { latencyMs: 0, bytesPerSecond: 1 }, served = 0;
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const handler = pending.get(message.id); pending.delete(message.id); if (message.error) handler.reject(Error(message.error.message)); else handler.resolve(message.result); }
    if (message.method === 'Fetch.requestPaused') {
      const current = { ...fixture };
      // One shared payload bandwidth budget, not a fresh bandwidth allowance per request.
      const now = Date.now();
      wireAvailableAt = Math.max(wireAvailableAt, now + network.latencyMs) + 1000 * current.bytes / network.bytesPerSecond;
      const delay = Math.max(0, wireAvailableAt - now);
      served++;
      void pause(delay).then(() => send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: current.mime }, { name: 'Content-Length', value: String(current.bytes) }, { name: 'Cache-Control', value: 'no-store' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: current.body }));
    }
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:8789/preload-benchmark/*', requestStage: 'Request' }] });
  const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const module = compile(readFileSync(resolve(root, 'shared/preloading.ts'), 'utf8')) + compile(readFileSync(resolve(root, 'src/preload.ts'), 'utf8')).replace(/^import .*?;\n/m, '');
  await evaluate(`(async()=>{globalThis.preloadModule = await import(${JSON.stringify('data:text/javascript;base64,' + Buffer.from(module).toString('base64'))});})()`);
  const jpeg = await evaluate(`(()=>{const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;const ctx=canvas.getContext('2d');const data=ctx.createImageData(1200,800);let seed=12345;for(let i=0;i<data.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data.data[i]=seed&255;data.data[i+1]=(seed>>>8)&255;data.data[i+2]=(seed>>>16)&255;data.data[i+3]=255;}ctx.putImageData(data,0,0);return canvas.toDataURL('image/jpeg',0.2).split(',')[1];})()`);
  const svg = Buffer.from(demoSvg('fixture-12')).toString('base64');
  const records = [];
  for (const net of [{ name: '4g-model', latencyMs: 100, bytesPerSecond: 1_500_000 }, { name: 'slow-3g-model', latencyMs: 400, bytesPerSecond: 50_000 }]) {
    network = net;
    for (const dataset of [{ name: '24-demo-svg', count: 24, body: svg, mime: 'image/svg+xml' }, { name: '50-synthetic-jpeg', count: 50, body: jpeg, mime: 'image/jpeg' }]) {
      fixture = { ...dataset, bytes: Buffer.byteLength(dataset.body, 'base64') }; served = 0; wireAvailableAt = 0;
      console.log(`Benchmark ${net.name}, ${dataset.name}: ${fixture.bytes} bytes per asset.`);
      const before = await evaluate(`(async()=>{const {decodeImage}=preloadModule;const begin=performance.now();let first=0,waiting=0,decodedBytes=0;for(let i=0;i<${dataset.count};i++){const start=performance.now();const response=await fetch('http://127.0.0.1:8789/preload-benchmark/before/'+i,{cache:'no-store'});const image=await decodeImage(await response.blob(),new AbortController().signal);const elapsed=performance.now()-start;if(!i)first=elapsed;waiting+=elapsed;decodedBytes=Math.max(decodedBytes,image.width*image.height*4);image.release();}return {totalMs:performance.now()-begin,firstImageWaitMs:first,roundWaitTotalMs:waiting,retainedDecodedPeakBytes:decodedBytes};})()`);
      const after = await evaluate(`(async()=>{const {ImagePreloader}=preloadModule;const urls=Array.from({length:${dataset.count}},(_,i)=>'http://127.0.0.1:8789/preload-benchmark/after/'+i);const manager=new ImagePreloader();manager.retain(urls.slice(0,3));let peak=0;const sample=()=>{peak=Math.max(peak,manager.metrics.decodedBytes);};const begin=performance.now();await manager.prepareAll(urls,sample);const prepareMs=performance.now()-begin;const start=performance.now();await manager.activate(urls[0]);const firstImageWaitMs=performance.now()-start;let waits=0;for(let i=0;i<urls.length;i++){manager.retain(urls.slice(i,i+3));const t=performance.now();await manager.activate(urls[i]);waits+=performance.now()-t;await Promise.all(urls.slice(i+1,i+3).map(url=>manager.prefetch(url)));sample();}const metrics=manager.metrics;manager.dispose();return {prepareMs,firstImageWaitMs,roundWaitTotalMs:waits,retainedDecodedPeakBytes:peak,encodedBytes:metrics.encodedBytes,verified:metrics.verified};})()`);
      const record = { profile: net, dataset: dataset.name, count: dataset.count, assetBytes: fixture.bytes, deliveredRequests: served, before, after };
      if (served !== 2 * dataset.count || after.verified !== dataset.count || after.retainedDecodedPeakBytes > 24 * 1024 * 1024) throw Error('Benchmark invariant failed');
      records.push(record); writeFileSync(resolve(output, 'benchmark.json'), JSON.stringify({ note: 'Synthetic local delivery delays with a SHARED payload bandwidth budget; real Chromium fetch/decode; retained bitmap estimate, not process RSS. Before: sequential on-demand. After: all bytes verified then decoded window.', records }, null, 2) + '\n');
      console.log(JSON.stringify(record));
    }
  }
} finally {
  ws?.close(); try { process.kill(-browser.pid, 'SIGTERM'); } catch { /* Already stopped. */ }
  closeSync(log); await pause(300); rmSync(profile, { recursive: true, force: true });
}
