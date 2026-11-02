// Optional browser acceptance checks. Uses an existing Chromium, local emulators
// and native CDP/WebSocket; installs no browser or automation dependencies.
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, openSync, closeSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
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
const children = [], clients = [], errors = [], requests = [], responses = [], consoleErrors = [];
const brandExpected = ["hero", "mascot", "logo"].every(name => existsSync(resolve(cwd, `public/brand/${name}-real-slop-v1.0.0.png`)));
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
    if (message.method === 'Network.responseReceived') responses.push({ url: message.params.response.url, status: message.params.response.status, mimeType: message.params.response.mimeType });
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') consoleErrors.push(message.params.args.map(arg => arg.value || arg.description).join(' '));
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
      await send('Page.bringToFront');
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
async function brandHome(t, width, height) {
  const result = await t.evaluate(`(async()=>{
    const images = [...document.querySelectorAll('.ros-logo-icon, .hero-brand-photo img, .ros-mode-mascot')];
    await Promise.all(images.map(image => { image.loading='eager'; return image.decode(); }));
    const rect = element => { const r=element.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}; };
    const photo=document.querySelector('.hero-brand-photo img');
    return {branded:!!document.querySelector('.hero-branded'),fallback:!!document.querySelector('.gallery-preview'),
      images:images.map(image=>({src:image.getAttribute('src'),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight})),
      copy:rect(document.querySelector('.hero-copy')),photo:rect(photo),fit:getComputedStyle(photo).objectFit,
      favicon:document.querySelector('link[data-ros-favicon]')?.getAttribute('href')};
  })()`);
  assert.equal(result.branded, true); assert.equal(result.fallback, false);
  assert.equal(result.images.length, 3); assert.ok(result.images.every(image=>image.naturalWidth>0));
  if (width <= 960) {
    assert.ok(result.copy.bottom <= result.photo.y, 'tablet/mobile image must follow the copy');
    assert.ok(Math.abs(result.photo.width/result.photo.height - 16/9)<0.01, 'full 16:9 artwork');
  }
  assert.ok(result.favicon?.startsWith('/brand/'));
  const metrics=await t.send('Page.getLayoutMetrics');
  const screenshot=await t.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:metrics.cssContentSize.height,scale:1}});
  writeFileSync(resolve(output, 'home-full-'+width+'.png'),Buffer.from(screenshot.data,'base64'));
  return {...result,viewport:[width,height]};
}
async function faviconSamples(t) {
  const result=await t.evaluate(`(async()=>{
    const links=[...document.querySelectorAll('link[data-ros-favicon]')].map(link=>({href:link.href,sizes:link.sizes.value}));
    document.body.innerHTML='<main style="padding:24px;font:16px Arial"><h1>Favicon browser: 16 / 32 px</h1><p>Dimensioni reali, fondo scuro e chiaro; ingrandimento 8× senza interpolazione.</p><div id="samples" style="display:flex;gap:24px"></div></main>';
    const samples=[];
    for(const size of [16,32]) {
      const href=links.find(link=>link.sizes===size+'x'+size)?.href; if(!href) throw Error('missing favicon '+size);
      const response=await fetch(href); if(!response.ok || !response.headers.get('Content-Type')?.includes('image/png')) throw Error('favicon HTTP/MIME '+response.status);
      const image=new Image(); image.src=href; await image.decode();
      if(image.naturalWidth!==size || image.naturalHeight!==size) throw Error('favicon dimensions');
      const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
      canvas.getContext('2d').drawImage(image,0,0,size,size);
      samples.push({size,href,status:response.status,png:canvas.toDataURL('image/png')});
      for(const background of ['#0F1115','#FFFFFF']) {
        const box=document.createElement('div');box.style.cssText='padding:12px;background:'+background+';color:#808080';
        box.append(size+' px ');box.append(canvas.cloneNode());box.lastChild.getContext('2d').drawImage(canvas,0,0);
        const large=document.createElement('img');large.src=canvas.toDataURL();large.style.cssText='display:block;margin-top:16px;width:'+size*8+'px;height:'+size*8+'px;image-rendering:pixelated';box.append(large);document.querySelector('#samples').append(box);
      }
    }
    return {links,samples};
  })()`);
  for(const sample of result.samples) writeFileSync(resolve(output,'favicon-'+sample.size+'.png'),Buffer.from(sample.png.split(',')[1],'base64'));
  await t.send('Emulation.setDeviceMetricsOverride',{width:1100,height:600,deviceScaleFactor:1,mobile:false}); await t.screenshot('favicon-browser');
  return {...result,samples:result.samples.map(({size,href,status})=>({size,href,status}))};
}
try {
  await command(['wrangler', 'd1', 'migrations', 'apply', 'DB', '--local', '--env', 'local', '--persist-to', state]);
  await command(['wrangler', 'd1', 'execute', 'DB', '--local', '--env', 'local', '--persist-to', state, '--file', 'scripts/seed.sql']);
  start('npx', ['wrangler', 'dev', '--local', '--env', 'local', '--port', '8789', '--persist-to', state]);
  start(process.env.CHROMIUM_PATH || 'chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=9224', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank']);
  await waitFor(async () => { try { return (await fetch(base + '/api/health')).ok; } catch { return false; } }, 'local worker');
  await waitFor(async () => { try { return (await fetch('http://127.0.0.1:9224/json/version')).ok; } catch { return false; } }, 'existing Chromium');
  const t = await tab();
  const measurements = [], brandMeasurements = [];
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844], [360, 640]]) {
    await t.viewport(width, height);
    const responseStart=responses.length, consoleStart=consoleErrors.length;
    await t.go('/', '.hero');
    assert.equal(await t.evaluate('document.fonts.check(\'700 27px "Space Grotesk"\') && document.fonts.check(\'400 15px Inter\')'), true);
    await layout(t, 'home ' + width);
    if (brandExpected) brandMeasurements.push(await brandHome(t,width,height));
    await t.screenshot('home-' + width);
    assert.deepEqual(responses.slice(responseStart).filter(response=>response.status>=400),[],'homepage HTTP errors');
    assert.deepEqual(consoleErrors.slice(consoleStart),[],'homepage console errors');
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
  if (brandExpected) {
    const settings = await tab();
    await settings.send('Page.navigate',{url:'chrome://settings/appearance'});
    await waitFor(()=>settings.evaluate('typeof chrome.settingsPrivate?.setDefaultZoom === "function"'),'browser zoom settings');
    await settings.evaluate('chrome.settingsPrivate.setDefaultZoom(2); true');
    await t.send('Emulation.clearDeviceMetricsOverride');
    await t.send('Browser.setWindowBounds',{windowId:(await t.send('Browser.getWindowForTarget')).windowId,bounds:{width:1440,height:1000}});
    await t.go('/', '.hero');
    await waitFor(()=>t.evaluate('devicePixelRatio===2'),'actual browser zoom 200%');
    const zoomViewport=await t.evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
    await brandHome(t,zoomViewport.width,zoomViewport.height); await layout(t,'home 200%'); await t.screenshot('home-zoom-200');
    await t.evaluate('document.querySelector(".brand").focus()');
    await t.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    const focus=await t.evaluate('({name:document.activeElement.textContent,outline:getComputedStyle(document.activeElement).outlineStyle,width:getComputedStyle(document.activeElement).outlineWidth})');
    assert.match(focus.name,/Allenamento/); assert.equal(focus.outline,'solid'); assert.notEqual(focus.width,'0px');
    await t.screenshot('home-keyboard-focus');
    await t.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await waitFor(()=>t.evaluate('location.pathname==="/allenamento" && document.activeElement.id==="content"'),'keyboard navigation');
    await settings.evaluate('chrome.settingsPrivate.setDefaultZoom(1); true');
    await t.go('/', '.hero');
    const favicon=await faviconSamples(t);
    writeFileSync(resolve(output,'brand-measurements.json'),JSON.stringify({brandMeasurements,zoomViewport,favicon,responses:responses.filter(response=>/\/brand\/|\/assets\/|\/fonts\//.test(response.url)),consoleErrors},null,2)+'\n');
  }
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
