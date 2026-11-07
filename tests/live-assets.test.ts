import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLiveAssets } from "../scripts/check-live-assets.mjs";

const html = '<html><script type="module" src="/assets/app.js"></script><link rel="stylesheet" crossorigin href="/assets/app.css"></html>';
function site(cssType = "text/css; charset=utf-8", cssBody = ":root{color-scheme:dark}") {
  return async (url: URL) => {
    if (url.pathname === "/") return new Response(html, { headers: { "Content-Type": "text/html" } });
    const css = url.pathname.endsWith(".css");
    return new Response(css ? cssBody : "document.body.dataset.ready = 'true'", { headers: { "Content-Type": css ? cssType : "text/javascript" } });
  };
}
test("live release verifies both JavaScript and usable CSS, including charset", async () => {
  assert.deepEqual(await checkLiveAssets("https://site.invalid", site()), { scripts: 1, stylesheets: 1 });
});
test("successful HTTP with CSS bytes and octet-stream MIME reproduces the unstyled-site failure", async () => {
  await assert.rejects(checkLiveAssets("https://site.invalid", site("application/octet-stream")), /Content-Type errato.*app.css/);
});
test("HTML fallback or an absent stylesheet cannot pass release verification", async () => {
  await assert.rejects(checkLiveAssets("https://site.invalid", site("text/css", "<!doctype html><html>Fallback</html>")), /HTML al posto/);
  await assert.rejects(checkLiveAssets("https://site.invalid", async () => new Response('<html><script src="/app.js"></script></html>', { headers: { "Content-Type": "text/html" } })), /foglio di stile assente/);
});
test("failed assets and unexpected origins fail without fetching the external resource", async () => {
  await assert.rejects(checkLiveAssets("https://site.invalid", async (url: URL) => url.pathname === "/" ? new Response(html, { headers: { "Content-Type": "text/html" } }) : new Response("Not found", { status: 404 })), /HTTP 404/);
  const requested: string[] = [];
  await assert.rejects(checkLiveAssets("https://site.invalid", async (url: URL) => {
    requested.push(url.origin);
    return new Response(html.replace('/assets/app.js','https://external.invalid/app.js'), { headers: { "Content-Type": "text/html" } });
  }), /Risorsa esterna/);
  assert.deepEqual(requested,["https://site.invalid"]);
});
