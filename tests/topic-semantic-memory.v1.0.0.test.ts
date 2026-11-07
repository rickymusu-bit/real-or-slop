import assert from "node:assert/strict";
import test from "node:test";
import {
  TOPIC_EMBEDDING_DIMENSIONS,semanticTopicDescription,semanticTopicText,
  embeddingConfig,createTopicSemantics
} from "../worker/topic-semantic-memory.v1.0.0";
import type { Env } from "../worker/core";

test("new topics use a stable text template and a shared 500-character description cap",()=>{
  assert.equal(semanticTopicDescription("   Farmers   protest   across Europe   "),"Farmers protest across Europe");
  assert.equal(semanticTopicText("Agricultural protests, 2024","Movements in several countries."),
    "Topic: Agricultural protests, 2024\nDescription: Movements in several countries.");
  assert.equal(semanticTopicText("Wildlife",""),
    "Topic: Wildlife\nDescription: (not yet supplied)");
  assert.throws(()=>semanticTopicDescription("x".repeat(501)),/500/);
  assert.throws(()=>semanticTopicDescription(5),/valida/);
  assert.equal(TOPIC_EMBEDDING_DIMENSIONS,1536);
});

test("the semantic input is preserved with pending status when no provider is configured",async()=>{
  let record:{title?:string;status?:string;model?:string}|null=null;
  const env={
    DB:{prepare(sql:string){
      if(sql.startsWith("INSERT OR IGNORE INTO editorial_topic_semantics"))
        return {bind(...args:unknown[]){return {run:async()=>{
          record={title:String(args[2]),status:"pending",model:String(args[5])};
          return {meta:{changes:1}};
        }}}};
      if(sql.includes("SELECT embedding_status,model,input_sha256"))
        return {bind(){return {first:async()=>({embedding_status:"pending",model:"text-embedding-3-small",input_sha256:"a".repeat(64)})};}};
      throw Error("Unexpected query: "+sql);
    }}
  } as unknown as Env;
  assert.equal(embeddingConfig(env),null);
  const fetchBefore=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error("Unwanted network request");};
  try {
    const status=await createTopicSemantics(env,"topic-id","Wildlife","Wild animals in urban environments.");
    assert.equal(status,"pending");
    assert.ok(record?.title?.includes("Wild animals"));
    assert.equal(record?.model,"text-embedding-3-small");
  }finally{globalThis.fetch=fetchBefore;}
});
