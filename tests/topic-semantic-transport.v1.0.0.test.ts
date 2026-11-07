import assert from "node:assert/strict";
import test from "node:test";
import type { Env } from "../worker/core";
import { createTopicSemantics,embedTopicOnSubmission,TOPIC_EMBEDDING_DIMENSIONS } from "../worker/topic-semantic-memory.v1.0.0";

function fixture() {
  const stored:{input_text:string;status:string;model:string;hash:string;vector:number[]|null}={
    input_text:"",status:"pending",model:"text-embedding-3-small",hash:"",vector:null
  };
  let reservations=0;
  const env={
    OPENAI_API_KEY:"fixture-key",TOPIC_EMBEDDING_CALL_USD:"0.00001",
    TOPIC_EMBEDDING_DAILY_USD:"0.01",TOPIC_EMBEDDING_TOTAL_USD:"0.10",
    DB:{prepare(sql:string){
      return {bind(...args:unknown[]){
        return {
          async first() {
            if(sql.startsWith("SELECT embedding_status,model,input_sha256"))return {
              embedding_status:stored.status,model:stored.model,input_sha256:stored.hash
            };
            if(sql.startsWith("SELECT input_text"))return {input_text:stored.input_text};
            if(sql.startsWith("SELECT id FROM editorial_usage"))return null;
            throw Error("Unexpected SELECT: "+sql);
          },
          async run() {
            if(sql.startsWith("INSERT OR IGNORE INTO editorial_topic_semantics")){
              stored.input_text=String(args[2]);stored.hash=String(args[3]);stored.model=String(args[5]);
              stored.status="pending";return {meta:{changes:1}};
            }
            if(sql.startsWith("INSERT OR IGNORE INTO editorial_usage")){reservations++;return {meta:{changes:1}};}
            if(sql.includes("SET embedding_status='submitting'")){stored.status="submitting";return {meta:{changes:1}};}
            if(sql.includes("SET embedding_status='ready'")){
              stored.status="ready";stored.vector=JSON.parse(String(args[0])) as number[];
              return {meta:{changes:1}};
            }
            if(sql.includes("SET embedding_status=?")){
              stored.status=String(args[0]);return {meta:{changes:1}};
            }
            throw Error("Unexpected WRITE: "+sql);
          }
        };
      }};
    }}
  } as unknown as Env;
  return {env,stored,getReservations:()=>reservations};
}
test("each owner topic submission generates a real vector with a mocked API and saves it",async()=>{
  const {env,stored,getReservations}=fixture();
  const original=globalThis.fetch;let requests=0;
  globalThis.fetch=async(uri,options)=>{
    requests++;
    assert.equal(String(uri),"https://api.openai.com/v1/embeddings");
    const data=JSON.parse(String(options?.body)) as {model:string;input:string;dimensions:number};
    assert.equal(data.model,"text-embedding-3-small");
    assert.equal(data.dimensions,TOPIC_EMBEDDING_DIMENSIONS);
    assert.ok(data.input.includes("Farmers' protests"));
    assert.ok(data.input.includes("Several European countries"));
    return Response.json({object:"list",model:"text-embedding-3-small",
      data:[{object:"embedding",index:0,embedding:Array(TOPIC_EMBEDDING_DIMENSIONS).fill(0.023)}],
      usage:{prompt_tokens:24,total_tokens:24}});
  };
  try{
    const status=await createTopicSemantics(env,"topic-1","Farmers' protests",
      "Several European countries experienced demonstrations.");
    assert.equal(status,"ready");
    assert.equal(stored.status,"ready");
    assert.equal(stored.vector?.length,TOPIC_EMBEDDING_DIMENSIONS);
    assert.equal(getReservations(),1);
    assert.equal(await embedTopicOnSubmission(env,"topic-1"),"ready");
    assert.equal(requests,1);
  }finally{globalThis.fetch=original;}
});
test("unreliable provider response never invents vectors or retries automatically",async()=>{
  const {env,stored,getReservations}=fixture();
  const original=globalThis.fetch;let requests=0;
  globalThis.fetch=async()=>{requests++;return Response.json({error:"temporary"},{status:503});};
  try{
    const status=await createTopicSemantics(env,"topic-2","Imaginary street photography",
      "Everyday scenes in a fictional city.");
    assert.equal(status,"uncertain");
    assert.equal(stored.status,"uncertain");
    assert.equal(stored.vector,null);
    assert.equal(getReservations(),1);
    assert.equal(await embedTopicOnSubmission(env,"topic-2"),"uncertain");
    assert.equal(requests,1);
  }finally{globalThis.fetch=original;}
});
