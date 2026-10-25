import {test} from 'node:test';
import assert from 'node:assert/strict';
import {balanced,settings} from '../worker/game.ts';
test('balanced sampler has no repeats and approximately equal types',()=>{const rows=Array.from({length:40},(_,i)=>({id:i,type:i%2?'AI':'REAL'}));for(const n of [1,2,7,10,31]){const s=balanced(rows,n);assert.equal(s.length,n);assert.equal(new Set(s.map(i=>i.id)).size,n);assert.ok(Math.abs(s.filter(i=>i.type==='REAL').length-s.filter(i=>i.type==='AI').length)<=1);}});
test('catalog shortage returns available unique images',()=>{const rows=[{type:'AI',id:1},{type:'AI',id:2}];assert.equal(balanced(rows,20).length,2);});
test('reject invalid settings',()=>{for(const input of [{mode:'bad'},{mode:'timed',duration:-1},{mode:'training',count:1.5},{mode:'training',difficulty:'impossible'}])assert.throws(()=>settings(input));});
