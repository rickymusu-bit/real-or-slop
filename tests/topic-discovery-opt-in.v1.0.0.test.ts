import assert from "node:assert/strict";
import test from "node:test";
import type { Env } from "../worker/core";
import { topicDiscoveryEnabled, setTopicDiscoveryEnabled } from "../worker/topic-discovery-opt-in.v1.0.0";

function fixture(initial=0) {
  let enabled=initial,updates=0;
  const env={DB:{
    prepare(sql:string) {
      if(sql.startsWith("SELECT enabled"))return {first:async()=>({enabled})};
      if(sql.startsWith("UPDATE editorial_topic_discovery_settings"))return {
        bind(value:number){return {run:async()=>{enabled=value;updates++;return {meta:{changes:1}};}};}
      };
      throw Error("Unexpected database statement: "+sql);
    }
  }} as unknown as Env;
  return {env,getUpdates:()=>updates};
}

test("Topic Discovery defaults to OFF and does not call external services", async()=>{
  const {env,getUpdates}=fixture();
  const original=globalThis.fetch;
  let fetched=false;
  globalThis.fetch=async()=>{fetched=true;throw Error("No network permitted");};
  try{
    assert.equal(await topicDiscoveryEnabled(env),false);
    await setTopicDiscoveryEnabled(env,true);
    assert.equal(await topicDiscoveryEnabled(env),true);
    await setTopicDiscoveryEnabled(env,false);
    assert.equal(await topicDiscoveryEnabled(env),false);
    assert.equal(getUpdates(),2);
    assert.equal(fetched,false);
  }finally{globalThis.fetch=original;}
});

test("Absent database settings do not silently activate discovery", async()=>{
  const env={DB:{prepare(){return {first:async()=>null};}}} as unknown as Env;
  await assert.rejects(()=>topicDiscoveryEnabled(env),/migrazione 0021/);
});
