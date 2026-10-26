// Optional browser acceptance checks. Uses an existing Chromium, local emulators
// and native CDP/WebSocket; installs no browser or automation dependencies.
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdirSync, openSync, closeSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import assert from 'node:assert/strict';
const cwd = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'http://127.0.0.1:8789';
const env = { ...process.env, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || '/tmp/real-or-slop-config', WRANGLER_SEND_METRICS: 'false' };
const state = resolve(cwd, '.wrangler/gallery');
const output = resolve(cwd, 'artifacts/gallery');
mkdirSync(output, { recursive: true });
const log = openSync(resolve(output, 'worker.log'), 'w');
const profile = mkdtempSync(resolve(tmpdir(), 'real-or-slop-gallery-'));
const children = [], clients = [], errors = [], requests = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, label) {
  for (let n = 0; n < 120; n++) {
    if (await fn()) return;
    await pause(100);
  }
  throw Error('Browser check timeout: ' + label);
}
async function command(args) {
  const child = spawn('npx', args, { cwd, env, stdio: ['ignore', log, log] });
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error('Local command failed; see artifacts/gallery/worker.log'))); });
}
function start(exe, args) {
  const child = spawn(exe, args, { cwd, env, stdio: ['ignore', log, log], detached: true });
  children.push(child);
  child.on('error', error => errors.push(error.message));
  return child;
}
async function tab() {
  const response = await fetch('http://127.0.0.1:9224/json/new?about:blank', { method: 'PUT' });
  const info = await response.json();
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  clients.push(ws);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let seq = 0;
  const pending = new Map();
  let intercept = null;
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const handler = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) handler.reject(Error(message.error.message)); else handler.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Fetch.requestPaused' && intercept) void intercept(message.params, send).catch(() => { /* An aborted image may already have released the intercepted request. */ });
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error('Browser evaluation failed: ' + result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  return {
    send, evaluate, intercept(handler) { intercept = handler; },
    viewport: (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 }),
    async go(path, selector) {
      await send('Page.navigate', { url: base + path });
      await waitFor(() => evaluate(`location.pathname===${JSON.stringify(path)} && Boolean(document.querySelector(${JSON.stringify(selector)}))`), path);
      await evaluate('document.fonts.ready');
    },
    async screenshot(name) {
      await pause(220);
      const result = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(resolve(output, name + '.png'), Buffer.from(result.data, 'base64'));
    },
  };
}
async function imageReady(t) {
  await waitFor(() => t.evaluate('Boolean(document.querySelector(".play-image")?.naturalWidth)'), 'loaded image for visual check');
}
async function layout(t, name, isPlay = false) {
  const result = await t.evaluate(`(()=>{
    const img=document.querySelector('.play-image');
    const buttons=Array.from(document.querySelectorAll('.choices button'));
    return {width:document.documentElement.scrollWidth,viewport:innerWidth,height:document.documentElement.scrollHeight,viewHeight:innerHeight,
      image:img?{fit:getComputedStyle(img).objectFit,filter:getComputedStyle(img).filter}:null,
      buttons:buttons.map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,text:b.textContent,name:b.getAttribute('aria-label')}))};
  })()`);
  assert.ok(result.width <= result.viewport + 1, name + ': horizontal overflow ' + JSON.stringify(result));
  if (isPlay) {
    assert.ok(result.height <= result.viewHeight + 1, name + ': question requires scrolling ' + JSON.stringify(result));
    assert.equal(result.image.fit, 'contain'); assert.equal(result.image.filter, 'none');
    assert.equal(result.buttons.length, 2); assert.ok(Math.abs(result.buttons[0].width - result.buttons[1].width) <= 1);
    assert.ok(result.buttons.every(b => b.height >= 44));
    assert.match(result.buttons[0].text, /REAL/); assert.match(result.buttons[1].text, /SLOP/);
    assert.match(result.buttons[1].name, /generata con IA/i);
  }
  return result;
}
try {
  await command(['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--env', 'local', '--persist-to', state]);
  await command(['wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--file', 'scripts/seed.sql']);
  start('npx', ['wrangler', 'dev', '--local', '--env', 'local', '--port', '8789', '--persist-to', state]);
  start(process.env.CHROMIUM_PATH || 'chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=9224', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank']);
  await waitFor(async () => { try { return (await fetch(base + '/api/health')).ok; } catch { return false; } }, 'local worker');
  await waitFor(async () => { try { return (await fetch('http://127.0.0.1:9224/json/version')).ok; } catch { return false; } }, 'existing Chromium');
  const t = await tab();
  const measurements = [];
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844], [360, 640]]) {
    await t.viewport(width, height);
    await t.go('/', '.hero');
    assert.equal(await t.evaluate('document.fonts.check(\'700 27px "Space Grotesk"\') && document.fonts.check(\'400 15px Inter\')'), true);
    await layout(t, 'home ' + width);
    await t.screenshot('home-' + width);
    for (const [path, selector] of [['/allenamento', '#categories input'], ['/tempo', '#duration'], ['/pvp', '#room-categories option'], ['/informazioni', 'h1'], ['/crediti', 'h1']]) {
      await t.go(path, selector); await layout(t, path + ' ' + width);
    }
    await t.go('/allenamento', '#categories input');
    await t.evaluate('document.querySelector("#count").value="1";document.querySelector("#settings").requestSubmit()');
    await imageReady(t);
    measurements.push({ ...await layout(t, 'solo ' + width, true), viewport: [width, height] });
    await t.screenshot('question-' + width);
    const ax = await t.send('Accessibility.getFullAXTree');
    assert.ok(ax.nodes.some(n => n.role?.value === 'button' && n.name?.value.includes('SLOP, generata con IA')));
    assert.ok(ax.nodes.some(n => n.role?.value === 'progressbar' && n.name?.value === 'Immagini completate'));
    await t.evaluate('document.querySelector(".play-image").focus()');
    await t.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await t.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await waitFor(() => t.evaluate('Boolean(document.querySelector("dialog[open]"))'), 'keyboard zoom');
    await t.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await t.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await waitFor(() => t.evaluate('!document.querySelector("dialog") && document.activeElement.classList.contains("play-image")'), 'zoom focus restoration');
    await t.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'i', code: 'KeyI' });
    await waitFor(() => t.evaluate('Boolean(document.querySelector("#next"))'), 'keyboard answer');
    await t.screenshot('feedback-' + width);
    await t.evaluate('document.querySelector("#next").click()');
    await waitFor(() => t.evaluate('Boolean(document.querySelector(".score"))'), 'results');
    await layout(t, 'results ' + width); await t.screenshot('results-' + width);
  }
  let mediaMode = 'delay';
  t.intercept(async (request, send) => {
    if (mediaMode === 'delay') await pause(350);
    if (mediaMode === 'corrupt') await send('Fetch.fulfillRequest', { requestId: request.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }], body: Buffer.from('corrupt fixture').toString('base64') });
    else await send('Fetch.continueRequest', { requestId: request.requestId });
  });
  await t.send('Fetch.enable', { patterns: [{ urlPattern: base + '/api/sessions/*/media/*', requestStage: 'Request' }] });
  await t.go('/tempo', '#duration');
  await t.evaluate('document.querySelector("#settings").requestSubmit()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#preload-progress"))'), 'preparation screen');
  const beforeStart = await t.evaluate('fetch("/api/sessions/"+sessionStorage.getItem("ros_timed")).then(r=>r.json())');
  assert.equal(beforeStart.phase, 'preparing'); assert.equal(beforeStart.expiresAt, null); assert.equal(beforeStart.answered, 0);
  assert.equal(await t.evaluate('Boolean(document.querySelector("[data-choice]"))'), false);
  await t.screenshot('preparing-timed-360');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#start-prepared"))'), 'all timed images prepared');
  await t.evaluate('document.querySelector("#start-prepared").click()');
  await imageReady(t); await waitFor(() => t.evaluate('document.querySelector("#clock").textContent.includes("s")'), 'server clock display');
  await layout(t, 'timed 360', true); await t.screenshot('timed-360');
  await t.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await t.evaluate('document.querySelector("[data-choice=REAL]").click()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#next"))'), 'reduced motion feedback');
  assert.equal(await t.evaluate('getComputedStyle(document.querySelector(".feedback")).animationName'), 'none');
  await t.send('Emulation.setEmulatedMedia', { features: [] });
  const deadline = await t.evaluate('fetch("/api/sessions/"+sessionStorage.getItem("ros_timed")).then(r=>r.json()).then(s=>s.expiresAt)');
  mediaMode = 'corrupt'; await t.send('Network.setCacheDisabled', { cacheDisabled: true });
  await t.go('/tempo', '#resume');
  await t.evaluate('document.querySelector("#resume").click()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#retry-media"))'), 'decode error during active timer');
  assert.equal(await t.evaluate('Boolean(document.querySelector("[data-choice]"))'), false);
  assert.equal(await t.evaluate('fetch("/api/sessions/"+sessionStorage.getItem("ros_timed")).then(r=>r.json()).then(s=>s.expiresAt)'), deadline);
  await t.screenshot('active-load-error-360');
  mediaMode = 'pass'; await t.evaluate('document.querySelector("#retry-media").click()');
  await imageReady(t);
  assert.equal(await t.evaluate('fetch("/api/sessions/"+sessionStorage.getItem("ros_timed")).then(r=>r.json()).then(s=>s.expiresAt)'), deadline);
  mediaMode = 'corrupt'; await t.go('/tempo', '#resume'); await t.evaluate('document.querySelector("#resume").click()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#invalidate-session"))'), 'persistent error cancellation');
  await t.evaluate('document.querySelector("#invalidate-session").click()');
  await waitFor(() => t.evaluate('document.querySelector(".eyebrow")?.textContent.includes("ANNULLATA")'), 'invalidated state');
  assert.equal(await t.evaluate('Boolean(document.querySelector(".score"))'), false);
  await t.go('/tempo', '#duration'); await t.evaluate('document.querySelector("#settings").requestSubmit()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#retry-media"))'), 'decode failure before start');
  assert.equal(await t.evaluate('fetch("/api/sessions/"+sessionStorage.getItem("ros_timed")).then(r=>r.json()).then(s=>s.expiresAt)'), null);
  mediaMode = 'pass'; await t.evaluate('document.querySelector("#retry-media").click()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#start-prepared"))'), 'preparation retry succeeds');
  await t.send('Fetch.disable'); await t.send('Network.setCacheDisabled', { cacheDisabled: false });
  const friend = await tab(); await friend.viewport(360, 640);
  await t.go('/pvp', '#room-categories option');
  await t.evaluate('document.querySelector("#rounds").value="1";document.querySelector("#round-seconds").value="30";document.querySelector("#nickname").value="Osservatore A";document.querySelector("#create-room").requestSubmit()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector(".room-code"))'), 'created lobby');
  const code = await t.evaluate('document.querySelector(".room-code").textContent');
  await t.screenshot('pvp-lobby-360');
  await friend.go('/pvp', '#room-categories option');
  await friend.evaluate(`document.querySelector('#room-code').value=${JSON.stringify(code)};document.querySelector('#nickname').value='Osservatore B';document.querySelector('#join-room').requestSubmit()`);
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#pvp-start"))'), 'both players');
  await t.evaluate('document.querySelector("#pvp-start").click()');
  await imageReady(t); await imageReady(friend);
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844], [360, 640]]) {
    await t.viewport(width, height);
    await layout(t, 'PvP ' + width, true); await t.screenshot('pvp-question-' + width);
  }
  await t.evaluate('document.querySelector("[data-pvp-choice=REAL]").click()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector(".answer-wait"))'), 'waiting for friend');
  assert.equal(await t.evaluate('Boolean(document.querySelector(".feedback"))'), false);
  await friend.evaluate('document.querySelector("[data-pvp-choice=AI]").click()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector(".feedback"))'), 'shared PvP reveal');
  await waitFor(() => friend.evaluate('Boolean(document.querySelector(".feedback"))'), 'friend reveal');
  await t.screenshot('pvp-results-360');
  await t.go('/', '.hero');
  await t.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await t.evaluate('document.activeElement.classList.contains("skip-link")'), true);
  await t.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await waitFor(() => t.evaluate('document.activeElement.id==="content"'), 'skip to main');
  await t.evaluate('document.querySelector(".nav-info").click()');
  await waitFor(() => t.evaluate('location.pathname==="/informazioni" && document.activeElement.id==="content"'), 'SPA focus');
  assert.ok(!requests.some(url => /^https?:/.test(url) && new URL(url).hostname !== '127.0.0.1'), 'unexpected external browser request');
  assert.deepEqual(errors, []);
  writeFileSync(resolve(output, 'measurements.json'), JSON.stringify(measurements, null, 2) + '\n');
  console.log('Digital Gallery passed: real solo/timed/PvP, 360/390/768/1440 layouts, intact images, symmetric named actions, AX tree, keyboard zoom/answer/focus, reduced motion, local fonts, delayed preparation, corrupt-image retry, active-timer preservation, invalidation and no external requests. Screenshots: artifacts/gallery/.');
} finally {
  for (const ws of clients) ws.close();
  for (const child of children) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ } }
  closeSync(log);
  // Chromium may still release its profile briefly after SIGTERM.
  await pause(300);
  rmSync(profile, { recursive: true, force: true });
}
