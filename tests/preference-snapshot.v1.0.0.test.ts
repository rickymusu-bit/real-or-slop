import test from "node:test";
import assert from "node:assert/strict";
import { snapshotJsonChunks } from "../shared/preference-snapshot.v1.0.0";
test('large and multibyte preference traces reconstruct exactly from bounded SQLite rows',()=>{
 const items=Array.from({length:2000},(_,i)=>({id:i,text:'日本語'.repeat(100),tags:['visible_subject','composition']}));
 const chunks=snapshotJsonChunks(items);
 assert.ok(chunks.length>1);
 assert.ok(chunks.every(c=>new TextEncoder().encode(c).length<=500000));
 assert.deepEqual(chunks.flatMap(c=>JSON.parse(c)),items);
 assert.deepEqual(snapshotJsonChunks([]),[]);
 assert.throws(()=>snapshotJsonChunks(['x'.repeat(500000)]),/limite/);
});
