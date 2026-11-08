import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index";
import type { Env } from "../worker/core";

test("budget reset requires admin, same origin, POST and explicit server amount",async()=>{
  const url='https://test/api/admin/editorial/intelligence/budget/reset';
  const env={ADMIN_TOKEN:'x'.repeat(40)} as Env;
  const auth={Authorization:'Bearer '+env.ADMIN_TOKEN,'Content-Type':'application/json'};
  assert.equal((await worker.fetch(new Request(url,{method:'POST',body:'{}'}),env)).status,401);
  assert.equal((await worker.fetch(new Request(url,{method:'POST',headers:{...auth,Origin:'https://foreign.invalid'},body:'{}'}),env)).status,403);
  assert.equal((await worker.fetch(new Request(url,{headers:auth}),env)).status,405);
  assert.equal((await worker.fetch(new Request(url,{method:'POST',headers:auth,body:'{}'}),env)).status,503);
  for(const value of [{},{operation_id:'x'}, {operation_id:crypto.randomUUID(),expected_period_id:null,amount_usd:50},
    {operation_id:crypto.randomUUID(),expected_period_id:-1,amount_usd:5},
    {operation_id:crypto.randomUUID(),expected_period_id:null,amount_usd:5,clear_history:true}]){
    assert.equal((await worker.fetch(new Request(url,{method:'POST',headers:auth,body:JSON.stringify(value)}),{...env,EDITORIAL_BUDGET_RESET_USD:'5'})).status,400);
  }
});
