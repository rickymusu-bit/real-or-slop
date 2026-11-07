import assert from "node:assert/strict";
import test from "node:test";
import { previewDimensions } from "../src/editorial-profile-preview.v1.0.0";

test("portrait, landscape and extreme panoramic frames remain proportional",()=>{
  for(const [w,h] of [[3840,2160],[2160,3840],[2048,2048],[3900,500],[500,3900],[900,450]]){
    const p=previewDimensions(w,h);
    assert.ok(p.width<=1152 && p.height<=1152);
    assert.ok(p.width<=w && p.height<=h);
    assert.ok(Math.abs(p.width*h-p.height*w)<=Math.max(w,h));
  }
});
test("browser resize rule rejects malformed dimensions",()=>{
  for(const [w,h,m] of [[0,100,1152],[100,NaN,1152],[100,100,0],[100,100,10000]]){
    assert.throws(()=>previewDimensions(w,h,m),/Dimensioni/);
  }
});
