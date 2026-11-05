/** Offline matrix snapshots, seeded selection and fixed-budget fixture benchmark. */
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {pathToFileURL,URL} from "node:url";
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {captionDiagnostics} from "../shared/game-caption.v1.0.0.ts";
import {parseArgs} from "node:util";
import {canonical,cells,replay,marginals,scheduler,selectCells,matrixVersion,taxonomy,check} from "../shared/editorial-matrix.v4.0.0.ts";
export const digest=value=>createHash("sha256").update(canonical(value)).digest("hex");
const NOW="2026-11-05T20:15:00Z";
export function snapshot(events=[],{seed=53,count=5,adaptive=false,now=NOW,exploration=.25}={}){
  const counts=replay(events),weights=scheduler(counts,now,exploration,adaptive);
  return {version:matrixVersion,kind:"private_editorial_matrix",created_at:now,taxonomy_version:matrixVersion,events_sha256:digest(events),counts,marginals:marginals(counts),weights,selection:selectCells(weights,count,seed),config:{seed,count,adaptive,exploration,taxonomy_sha256:digest(taxonomy),scheduler_version:matrixVersion,policy:taxonomy.policy},network:false,paid:false,publication:false};
}
function proposal(uid,cell,origin="REAL"){return {id:"p:"+uid,kind:"proposal",origin,intent_cell:cell,observed_cell:cell,candidate_id:uid,image_sha256:digest(uid),brief_id:"brief-"+cell.replace(":","-"),revision:0,decision:null,provider:"fixture",batch:"benchmark",created_at:NOW,data:{}};}
export function benchmark(seed=53){
  let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const population=cells.map((cell,i)=>({cell,p:i%13===0?.05:i%13===6?.85:.55}));
  const histories={};
  for(const n of [0,1,10,100]){
    const events=[];
    for(const [index,row]of population.entries())for(let j=0;j<n;j++){
      const uid=`history-${n}-${index}-${j}`,p=proposal(uid,row.cell),approved=j<Math.round(n*row.p);
      events.push(p,{...p,id:"r:"+uid,kind:"review",revision:1,decision:approved?"approved":"rejected"},{...p,id:"c:"+uid,kind:"classification",revision:1});
    }
    histories[n]=events;
  }
  const baseline=replay(histories[100]),weights=scheduler(baseline,NOW),uniform=scheduler(baseline,NOW,.25,false);
  const run=(name,policy)=>{
    const counts=Object.fromEntries(cells.map(c=>[c,0]));let approved=0,cost=0;
    state=seed>>>0;
    while(cost+.02<=20+1e-9){let target=random(),i=0;while(i<policy.length-1&&target>=policy[i].weight)target-=policy[i++].weight;counts[policy[i].cell]++;approved+=random()<population[i].p?1:0;cost=Math.round((cost+.02)*1e6)/1e6;}
    const emotion=taxonomy.emotions.map(e=>Object.entries(counts).filter(([c])=>c.startsWith(e.id+":")).reduce((n,[,v])=>n+v,0));
    const topic=taxonomy.topics.map(t=>Object.entries(counts).filter(([c])=>c.endsWith(":"+t.id)).reduce((n,[,v])=>n+v,0));
    return {strategy:name,attempts:Object.values(counts).reduce((a,b)=>a+b,0),cost,approved,counts,emotion_attempts:emotion,topic_attempts:topic,cost_per_approval:cost/Math.max(1,approved)};
  };
  return {version:matrixVersion,kind:"synthetic_fixed_budget_benchmark",seed,budget:20,currency:"fixture_units_not_real_spend",uniform:run("uniform",uniform),adaptive:run("adaptive",weights),small_samples:Object.fromEntries([0,1,10,100].map(n=>{const c=replay(histories[n])[cells[0]].REAL;return [n,{approved:c.approved,rejected:c.rejected,observed_rate:c.observed_rate,posterior:c.estimated_rate,interval:c.interval,insufficient_data:c.insufficient_data}];})),minimum_probability:Math.min(...weights.map(w=>w.weight)),theoretical_exploration_floor:.25/144,limitations:["Synthetic owner judgments and known yields; no real approvals or acquisition evidence.","Prior alpha=beta=2 is provisional; calibrate on an explicitly authorized owner-reviewed pilot.","Uniform marginal exposure is a long-run objective, not guaranteed coverage in a short game.","REAL and SLOP are reviewed independently; no game outcomes train this model."],network:false,paid:false};
}
export function performanceStudy(){
  return [100,500,1500,5000].map(n=>{
    const events=[];for(let i=0;i<n;i++){const p=proposal("perf-"+i,cells[i%144],i%2?"AI":"REAL");events.push(p,{...p,id:"r-perf-"+i,kind:"review",revision:1,decision:i%3?"approved":"rejected"},{...p,id:"c-perf-"+i,kind:"classification",revision:1});}
    const times=[],heap=[];for(let repeat=0;repeat<3;repeat++){const before=process.memoryUsage().heapUsed,start=performance.now();const counts=replay(events);scheduler(counts,NOW);times.push(performance.now()-start);heap.push((process.memoryUsage().heapUsed-before)/1048576);}
    return {candidates:n,events:events.length,runs:3,median_ms:[...times].sort((a,b)=>a-b)[1],heap_delta_mib:heap,peak_memory_measured:false};
  });
}
async function immutable(path,value){const text=JSON.stringify(value,null,2)+"\n";await mkdir(dirname(path),{recursive:true});try{const old=await readFile(path,"utf8");check(old===text,"Snapshot already exists with different contents");}catch(e){if(e.code!=="ENOENT")throw e;await writeFile(path,text,{flag:"wx",mode:0o600});}}
export async function main(args=process.argv.slice(2)){
  const {values}=parseArgs({args,options:{events:{type:"string"},stdin:{type:"boolean"},seed:{type:"string",default:"53"},count:{type:"string",default:"5"},adaptive:{type:"boolean"},exploration:{type:"string",default:"0.25"},"dry-run":{type:"boolean"},benchmark:{type:"boolean"},out:{type:"string"},now:{type:"string",default:NOW}}});
  let input={};if(values.stdin){let raw="";for await(const chunk of process.stdin)raw+=chunk;input=JSON.parse(raw);}else if(values.events)input=JSON.parse(await readFile(resolve(values.events),"utf8"));
  const events=Array.isArray(input)?input:input.events||[];
  check(!values["dry-run"]||!values.out,"Dry-run does not write files");
  const result=values.benchmark?benchmark(Number(values.seed)):snapshot(events,{seed:Number(values.seed),count:Number(values.count),adaptive:!!values.adaptive,now:values.now,exploration:Number(values.exploration)});
  if(values.benchmark){
    const captions=JSON.parse(await readFile(new URL("../data/editorial/caption-fixtures.v1.0.0.json",import.meta.url),"utf8")).captions;
    result.runtime={node:process.version,measurements:performanceStudy(),limitations:"Three runs on this executor; heap delta is noisy and is not peak memory or a browser/network benchmark."};
    result.caption_diagnostics=captionDiagnostics(captions);
    result.caption_positive_control=captionDiagnostics(captions.map(r=>({...r,text:r.origin==="AI"?"Interno a Palermo nel 2020.":"Una stanza con sedie."}))).caption_only_accuracy;
  }
  if(values.out)await immutable(resolve(values.out),result);
  process.stdout.write(JSON.stringify(result)+"\n");return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
