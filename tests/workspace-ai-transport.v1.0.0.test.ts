import assert from "node:assert/strict";
import test from "node:test";
import { fields, modelImage, modelJSON } from "../worker/workspace-ai.v1.0.0";
import type { Env } from "../worker/core";

type Job = { status:string; result_json:string|null };
function fixtureEnv() {
  const jobs=new Map<string,Job>(),usage=new Map<string,number>();
  let reserved=0;
  const db={
    prepare(sql:string){
      return {
        bind(...args:unknown[]){
          const first=async <T>()=>{
            if(sql.includes("SELECT status,result_json FROM editorial_workspace_jobs"))
              return (jobs.get(String(args[0])) || null) as T|null;
            if(sql.includes("SELECT reserved_usd FROM editorial_usage"))
              return (usage.has(String(args[0])) ? {reserved_usd:usage.get(String(args[0]))} : null) as T|null;
            return null as T|null;
          };
          const run=async ()=>{
            if(sql.includes("INSERT INTO editorial_workspace_jobs")){
              const key=String(args[3]);
              if(jobs.has(key))throw Error("duplicate job");
              jobs.set(key,{status:"prepared",result_json:null});
            }else if(sql.includes("INSERT OR IGNORE INTO editorial_usage")){
              const id=String(args[0]),cost=Number(args[4]);
              if(!usage.has(id)){usage.set(id,cost);reserved+=cost;}
              return {meta:{changes:1}};
            }else if(sql.includes("UPDATE editorial_workspace_jobs")){
              const key=[...jobs.keys()].find(key=>{
                const row=jobs.get(key);
                return row?.status=== "prepared" || row?.status === "submitting";
              });
              if(!key)throw Error("no job available");
              const row=jobs.get(key)!;
              if(sql.includes("status='submitting'"))row.status="submitting";
              if(sql.includes("status='completed'")){row.status="completed";row.result_json=String(args[0]);}
              if(sql.includes("status='uncertain'"))row.status="uncertain";
              if(sql.includes("status='failed'"))row.status="failed";
            }
            return {meta:{changes:1}};
          };
          return {first,run};
        }
      };
    }
  };
  const env={
    DB:db,WORKSPACE_AI_ENABLED:"true",ENABLE_REAL_DISCOVERY_PAID:"true",
    ENABLE_EDITORIAL_CYCLE_GENERATION:"true",OPENAI_API_KEY:"fixture-never-sent",
    REAL_DISCOVERY_MODEL:"gpt-6.1-terra",
    REAL_DISCOVERY_CALL_USD:"0.01",REAL_DISCOVERY_RUN_USD:"1",
    REAL_DISCOVERY_DAILY_USD:"1",REAL_DISCOVERY_TOTAL_USD:"1",
    REAL_DISCOVERY_MAX_CALLS:"20",
    EDITORIAL_CYCLE_IMAGE_MODEL:"fixture-image",
    EDITORIAL_CYCLE_GENERATION_USD:"0.05",EDITORIAL_CYCLE_MAX_GENERATIONS:"5",
  } as unknown as Env;
  return {env,jobs,usage,getReserved:()=>reserved};
}
const fakeJson={queries:["Brussels October 2026 protest photography","Brussels demonstration 2026"]};
test("a paid model response is reserved, parsed, audited and cached without double billing",async()=>{
  const {env,jobs,usage,getReserved}=fixtureEnv();
  const old=globalThis.fetch;
  let networkCalls=0;
  globalThis.fetch=async(input,init)=>{
    networkCalls++;
    assert.equal(String(input),"https://api.openai.com/v1/responses");
    assert.equal(init?.method,"POST");
    const request=JSON.parse(String(init?.body)) as {store:boolean;text:{format:unknown};input:unknown};
    assert.equal(request.store,false);
    assert.ok(request.text.format);
    assert.ok(JSON.stringify(request.input).includes("Brussels"));
    return Response.json({output:[{content:[{type:"output_text",text:JSON.stringify(fakeJson)}]}]});
  };
  try {
    const input={topic:"Brussels",limit:3},key="fixture-search-1";
    const args=[env,"search" as const,null,key,input,
      "Return only valid JSON","Brussels 2026",fields.search] as const;
    const first=await modelJSON(...args);
    assert.deepEqual(first,fakeJson);
    const second=await modelJSON(...args);
    assert.deepEqual(second,fakeJson);
    assert.equal(networkCalls,1);
    assert.equal(jobs.get(key)?.status,"completed");
    assert.equal(usage.size,1);
    assert.equal(getReserved(),0.01);
  }finally{globalThis.fetch=old;}
});
test("an uncertain response never automatically repeats or charges a second call",async()=>{
  const {env,jobs,usage}=fixtureEnv();
  const old=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{
    calls++;return Response.json({error:"temporary provider failure"},{status:503});
  };
  try{
    const args=[env,"suggest" as const,null,"fixture-suggest-1",{known_titles:[]},
      "Suggest new topics","Known topics: none",fields.suggestion] as const;
    await assert.rejects(()=>modelJSON(...args),/incerta/);
    await assert.rejects(()=>modelJSON(...args),/già avviata o incerta/);
    assert.equal(calls,1);
    assert.equal(jobs.get("fixture-suggest-1")?.status,"uncertain");
    assert.equal(usage.size,1);
  }finally{globalThis.fetch=old;}
});
test("SLOP image transport reserves before generating and cannot replay the same slot",async()=>{
  const {env,usage,jobs}=fixtureEnv();
  const old=globalThis.fetch;let calls=0;
  globalThis.fetch=async(input,init)=>{
    calls++;
    assert.equal(String(input),"https://api.openai.com/v1/images/generations");
    const request=JSON.parse(String(init?.body)) as {size:string;n:number};
    assert.equal(request.size,"1536x1024");assert.equal(request.n,1);
    return Response.json({data:[{b64_json:btoa("fake-image")}]});
  };
  try{
    const result=await modelImage(env,"topic-1","slop-generate:topic-1:0",
      "An original synthetic cinematic documentary scene.","1536x1024");
    assert.equal(new TextDecoder().decode(result.bytes),"fake-image");
    await result.finish({inbox_id:"fake-reviewed-photo"});
    assert.equal(jobs.get("slop-generate:topic-1:0")?.status,"completed");
    await assert.rejects(
      ()=>modelImage(env,"topic-1","slop-generate:topic-1:0","same prompt","1536x1024"),/già generata/);
    assert.equal(calls,1);assert.equal(usage.size,1);
  }finally{globalThis.fetch=old;}
});
