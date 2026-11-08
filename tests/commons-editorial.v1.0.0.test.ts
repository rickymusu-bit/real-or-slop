import assert from "node:assert/strict";
import test from "node:test";
import { commonsApiUrl, commonsFileTitle } from "../worker/commons-editorial.v1.0.0";

test("Commons File pages and user-supplied thumbnail URLs normalize to one file identity",()=>{
  assert.equal(commonsFileTitle("https://commons.wikimedia.org/wiki/File:March%C3%A9_de_printemps_2025_%C3%A0_Lyon.jpg"),
    "File:Marché de printemps 2025 à Lyon.jpg");
  assert.equal(commonsFileTitle("https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e1/March%C3%A9_de_printemps_2025_%C3%A0_Lyon.jpg/1920px-March%C3%A9_de_printemps_2025_%C3%A0_Lyon.jpg?utm_source=commons.wikimedia.org"),
    "File:Marché de printemps 2025 à Lyon.jpg");
  assert.equal(commonsFileTitle("https://upload.wikimedia.org/wikipedia/commons/2/2a/Photo_2026.webp"),
    "File:Photo 2026.webp");
});
test("Commons-only resolver blocks redirects through foreign hosts and local URIs",()=>{
  for(const url of [
    "https://example.com/image.jpg",
    "http://commons.wikimedia.org/wiki/File:Image.jpg",
    "https://127.0.0.1/wiki/File:Image.jpg",
    "https://commons.wikimedia.org/wiki/Category:File.jpg",
    "https://upload.wikimedia.org/evil/images/picture.png",
    "https://user:pass@commons.wikimedia.org/wiki/File:Image.jpg",
    "file:///etc/passwd",
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e1/vector.svg/1920px-vector.svg",
  ]) assert.throws(()=>commonsFileTitle(url));
});
test("Commons API query is fixed-host and only passes file title",()=>{
  const url=new URL(commonsApiUrl("File:Photo 2026.webp"));
  assert.equal(url.host,"commons.wikimedia.org");
  assert.equal(url.pathname,"/w/api.php");
  assert.equal(url.searchParams.get("titles"),"File:Photo 2026.webp");
  assert.equal(url.searchParams.get("prop"),"imageinfo");
});
