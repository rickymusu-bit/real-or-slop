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
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Page.bringToFront');
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
  await command(['wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--file', 'scripts/seed-publication.sql']);
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
    assert.equal(await t.evaluate(`document.querySelectorAll('a[href="/pvp"]').length`), 0);
    await t.screenshot('home-' + width);
    for (const [path, selector] of [['/allenamento', '#categories input'], ['/tempo', '#round-seconds'], ['/pvp', 'h1'], ['/informazioni', 'h1'], ['/crediti', 'h1']]) {
      await t.go(path, selector); await layout(t, path + ' ' + width);
      assert.equal(await t.evaluate('Boolean(document.querySelector("#difficulty,#room-difficulty"))'), false);
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
  await t.go('/tempo', '#round-seconds');
  await t.evaluate('document.querySelector("#count").value="2";document.querySelector("#round-seconds").value="30";document.querySelector("#settings").requestSubmit()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#preload-progress"))'), 'preparation screen');
  const beforeStart = await t.evaluate('fetch("/api/sessions/"+sessionStorage.getItem("ros_timed")).then(r=>r.json())');
  assert.equal(beforeStart.phase, 'preparing'); assert.equal(beforeStart.expiresAt, null); assert.equal(beforeStart.answered, 0);
  assert.equal(await t.evaluate('Boolean(document.querySelector("[data-choice]"))'), false);
  await t.screenshot('preparing-timed-360');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#start-prepared"))'), 'all timed images prepared');
  await t.evaluate('document.querySelector("#start-prepared").click()');
  await imageReady(t); await waitFor(() => t.evaluate('document.querySelector("#clock").textContent.includes("s")'), 'server clock display');
  await layout(t, 'timed 360', true); await t.screenshot('timed-360');
  const deadline = await t.evaluate('fetch("/api/sessions/"+sessionStorage.getItem("ros_timed")).then(r=>r.json()).then(s=>s.expiresAt)');
  assert.equal(await t.evaluate('document.querySelector(".play-image").draggable'), false);
  assert.equal(await t.evaluate('document.querySelector(".play-image").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}))'), false);
  await t.evaluate('document.querySelector(".play-image").click()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("dialog[open]"))'), 'zoom before tab switch');
  const friend = await tab();
  await friend.send('Page.bringToFront');
  await waitFor(() => t.evaluate('document.visibilityState==="hidden" && document.documentElement.classList.contains("media-obscured")'), 'real tab switch covers image');
  assert.equal(await t.evaluate('Boolean(document.querySelector("dialog[open]"))'), false);
  assert.equal(await t.evaluate('getComputedStyle(document.querySelector(".play-image")).visibility'), 'hidden');
  assert.equal(await t.evaluate('fetch("/api/sessions/"+sessionStorage.getItem("ros_timed")).then(r=>r.json()).then(s=>s.expiresAt)'), deadline);
  await t.send('Page.bringToFront');
  await waitFor(() => t.evaluate('document.visibilityState==="visible"'), 'return to game tab');
  assert.equal(await t.evaluate('getComputedStyle(document.querySelector(".play-image")).visibility'), 'hidden');
  await t.screenshot('covered-after-tab-switch-360');
  await waitFor(() => t.evaluate('document.querySelector("[data-reveal-media]")?.click(); Boolean(document.querySelector(".play-image")) && getComputedStyle(document.querySelector(".play-image")).visibility === "visible"'), 'explicit reopen after server resynchronization');
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
  await t.go('/tempo', '#round-seconds'); await t.evaluate('document.querySelector("#count").value="2";document.querySelector("#settings").requestSubmit()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#retry-media"))'), 'decode failure before start');
  assert.equal(await t.evaluate('fetch("/api/sessions/"+sessionStorage.getItem("ros_timed")).then(r=>r.json()).then(s=>s.expiresAt)'), null);
  mediaMode = 'pass'; await t.evaluate('document.querySelector("#retry-media").click()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#start-prepared"))'), 'preparation retry succeeds');
  await t.send('Fetch.disable'); await t.send('Network.setCacheDisabled', { cacheDisabled: false });
  await t.evaluate('document.querySelector("#start-prepared").click()');
  await imageReady(t);
  const sid = await t.evaluate('sessionStorage.getItem("ros_timed")');
  assert.match(sid, /^[a-f0-9-]+$/);
  await command(['wrangler','d1','execute','DB','--local','--env','local','--persist-to',state,'--command',`UPDATE game_rounds SET expires_at=CAST(unixepoch('subsec')*1000 AS INTEGER)+3000 WHERE session_id='${sid}' AND presented_at IS NOT NULL`]);
  await t.go('/tempo','#resume'); await t.evaluate('document.querySelector("#resume").click()'); await imageReady(t);
  await friend.send('Page.bringToFront');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#next-after-timeout"))'), 'hidden tab countdown expires without a pause');
  const expiredState = await t.evaluate('fetch("/api/sessions/"+sessionStorage.getItem("ros_timed")).then(r=>r.json())');
  assert.equal(expiredState.timedOut, 1); assert.equal(expiredState.expiresAt, null);
  assert.equal(await t.evaluate('Boolean(document.querySelector(".play-image"))'), false);
  await t.send('Page.bringToFront');
  await t.evaluate('document.querySelector("#next-after-timeout").click()'); await imageReady(t);
  await t.evaluate('document.querySelector("[data-reveal-media]")?.click()');
  await t.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await t.evaluate('document.querySelector("[data-choice=REAL]").click()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#next"))'), 'reduced motion feedback');
  assert.equal(await t.evaluate('getComputedStyle(document.querySelector(".feedback")).animationName'), 'none');
  assert.equal(await t.evaluate('document.querySelector("#clock").textContent'), '');
  await t.evaluate('window.dispatchEvent(new Event("blur"))');
  assert.equal(await t.evaluate('getComputedStyle(document.querySelector(".play-image")).visibility'), 'hidden');
  await t.evaluate('document.querySelector("[data-reveal-media]").click()');
  assert.equal(await t.evaluate('getComputedStyle(document.querySelector(".play-image")).visibility'), 'visible');
  await t.evaluate('document.querySelector("#next").click()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector(".score"))'), 'timed results include timeout');
  assert.equal(await t.evaluate('document.querySelector(".page").textContent.includes("1 scadute")'), true);
  await t.send('Emulation.setEmulatedMedia', { features: [] });
  // UI-only fixtures exercise the two-button flow without remote credentials.
  // Real preparation/auth/approval/feedback are tested against local D1/R2 separately.
  const decisions = [];
  let brokenPreview = false;
  const reviewCards = ["one", "two"].map((id, n) => ({ id, token: "prepared-" + id, image: "/api/admin/assets/" + id, details: { title: "Synthetic browser fixture", type: n ? "AI" : "REAL", author: "Fixture", source_url: "https://example.invalid/", license_url: "https://creativecommons.org/licenses/by/4.0/", explanation: "Prepared automatically for this browser test." } }));
  t.intercept(async (request, send) => {
    const url = new URL(request.request.url);
    let body, mime = "application/json", status = 200;
    if (url.pathname === "/api/admin/review-queue") {
      const images = brokenPreview ? [{ ...reviewCards[0], id: "broken", image: "/api/admin/assets/broken" }] : reviewCards.filter(card => !decisions.some(row => row.id === card.id));
      body = JSON.stringify({ images, ready: images.length, preparing: 0 });
    } else if (url.pathname.startsWith("/api/admin/assets/")) {
      await pause(350);
      mime = "image/svg+xml";
      body = brokenPreview ? "corrupt preview" : '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#344652"/><circle cx="300" cy="200" r="100" fill="#52d9bf"/></svg>';
    } else if (url.pathname.startsWith("/api/admin/visual-review/")) {
      const payload = JSON.parse(request.request.postData);
      assert.deepEqual(Object.keys(payload).sort(), ["decision", "token"]);
      decisions.push({ id: url.pathname.split("/").at(-1), ...payload });
      body = JSON.stringify({ status: payload.decision });
    } else { status = 404; body = '{}'; }
    await send('Fetch.fulfillRequest', { requestId: request.requestId, responseCode: status, responseHeaders: [{ name: 'Content-Type', value: mime }], body: Buffer.from(body).toString('base64') });
  });
  await t.send('Fetch.enable', { patterns: [{ urlPattern: base + '/api/admin/*', requestStage: 'Request' }] });
  await t.evaluate('history.pushState({},"","/admin");window.dispatchEvent(new PopStateEvent("popstate"))');
  await waitFor(() => t.evaluate('Boolean(document.querySelector(".visual-review-card"))'), 'visual review card');
  assert.equal(await t.evaluate('document.querySelectorAll("#visual-queue input,#visual-queue select,#visual-queue textarea").length'), 0);
  await waitFor(() => t.evaluate('document.querySelector("[data-visual-decision=approved]")?.disabled===false'), 'preview ready before approval');
  assert.deepEqual(await t.evaluate('Array.from(document.querySelectorAll("[data-visual-decision]"),b=>b.textContent)'), ['Approva','Rifiuta']);
  await t.screenshot('visual-review-360');
  await t.evaluate('document.querySelector("[data-visual-decision=approved]").click();document.querySelector("[data-visual-decision=rejected]").click()');
  await waitFor(() => t.evaluate('document.querySelector("#review-message").textContent==="Approvata." && document.querySelector("[data-visual-decision=rejected]")?.disabled===false'), 'next prepared candidate');
  assert.equal(decisions.length, 1);
  await t.evaluate('document.querySelector("[data-visual-decision=rejected]").click()');
  await waitFor(() => t.evaluate('Boolean(document.querySelector("#refresh-review"))'), 'queue completed without notes');
  assert.deepEqual(decisions.map(row => row.decision), ['approved','rejected']);
  brokenPreview = true;
  await t.evaluate('document.querySelector("#refresh-review").click()');
  await waitFor(() => t.evaluate('document.querySelector("#review-message").textContent.includes("Anteprima non disponibile")'), 'bad preview does not produce editorial feedback');
  assert.equal(await t.evaluate('Array.from(document.querySelectorAll("[data-visual-decision]")).every(button=>button.disabled)'), true);
  assert.equal(decisions.length, 2);
  await t.send('Fetch.disable');
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
  console.log('Digital Gallery passed: visual editorial approval/rejection without forms, broken-preview protection, real solo/per-image timed, suspended PvP, tab masking without timer pause, copy deterrents, timeouts, 360/390/768/1440 layouts, intact images, symmetric named actions, AX tree, keyboard zoom/answer/focus, reduced motion, local fonts, delayed preparation, corrupt-image retry, active-timer preservation, invalidation and no external requests. Screenshots: artifacts/gallery/.');
} finally {
  for (const ws of clients) ws.close();
  for (const child of children) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already stopped. */ } }
  closeSync(log);
  // Chromium may still release its profile briefly after SIGTERM.
  await pause(300);
  rmSync(profile, { recursive: true, force: true });
}
