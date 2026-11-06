import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {cells,emotions,topics,taxonomy,replay,marginals,scheduler,selectCells,canonical,type MatrixEvent} from "../shared/editorial-matrix.v4.0.0.ts";
import {validateBrief} from "../shared/editorial-brief.v4.0.0.ts";
import {validateCaption,captionDiagnostics} from "../shared/game-caption.v1.0.0.ts";
import {benchmark} from "../scripts/editorial-matrix.v4.0.0.mjs";
const stamp="2026-11-05T20:15:00Z";
const proposal=(uid:string,cell=cells[0],origin:"REAL"|"AI"="REAL"):MatrixEvent=>({id:"p-"+uid,kind:"proposal",origin,intent_cell:cell,observed_cell:cell,candidate_id:uid,image_sha256:"a".repeat(64),brief_id:"brief-"+uid,revision:0,decision:null,provider:"fixture",batch:"local",created_at:stamp,data:{}});
const review=(p:MatrixEvent,decision:MatrixEvent["decision"],revision=1):MatrixEvent=>({...p,id:"r-"+p.candidate_id+"-"+revision,kind:"review",decision,revision});
test("stable 12×12 taxonomy includes ordinary neutrality and contextual English drafts",()=>{
 assert.equal(emotions.length,12);assert.equal(topics.length,12);assert.equal(new Set(cells).size,144);assert.ok(emotions.includes("neutrality"));assert.equal(taxonomy.policy.uniform_intersections,false);
 for(const entry of [...taxonomy.emotions,...taxonomy.topics]){assert.match(entry.id,/^[a-z_]+$/);assert.ok(entry.description&&entry.example);}
 const catalog=JSON.parse(readFileSync(new URL("../data/editorial/briefs.v4.0.0.json",import.meta.url),"utf8"));
 for(const cell of cells)assert.ok(catalog.briefs.filter((b:{intent_emotion:string;intent_topic:string})=>b.intent_emotion+":"+b.intent_topic===cell).length>=2);
 assert.ok(catalog.briefs.every((b:{status:string})=>b.status==="draft"));
});
test("only final explicit human decisions enter denominators; replay, retry and revocation do not double-count",()=>{
 const p=proposal("one"),r=review(p,"approved"),pending=proposal("pending"),failed:MatrixEvent={...proposal("attempt"),id:"attempt",kind:"attempt",candidate_id:null,image_sha256:null,data:{source_hits:0,documentary_eligible:0,duplicates:0,cost:.2}};
 const events=[p,r,pending,failed];const c=replay([...events,r])[cells[0]].REAL;
 assert.equal(c.approved,1);assert.equal(c.rejected,0);assert.equal(c.pending,1);assert.equal(c.proposed_to_owner,2);assert.equal(c.observed_rate,1);assert.equal(c.search_attempts,1);assert.equal(c.cost,.2);
 assert.equal(c.estimated_rate,.6);assert.equal(c.insufficient_data,true);assert.ok(c.interval&&c.interval[0]<.3);
 const revoked=replay([...events,review(p,"rejected",2),review(p,"pending",3)])[cells[0]].REAL;assert.equal(revoked.approved,0);assert.equal(revoked.rejected,0);assert.equal(revoked.pending,2);assert.equal(revoked.observed_rate,null);
 assert.throws(()=>replay([...events,{...r,decision:"rejected"}]),/Conflicting/);
});
test("off-target approval counts for observed coverage without inflating intended on-target yield",()=>{
 const p=proposal("corrected"),classification:MatrixEvent={...p,id:"classify",kind:"classification",revision:1,observed_cell:cells[13],data:{secondary_emotions:["curiosity"]}};
 const c=replay([p,review(p,"approved"),classification]);assert.equal(c[cells[0]].REAL.approved,1);assert.equal(c[cells[0]].REAL.off_target,1);assert.equal(c[cells[0]].REAL.on_target_approved,0);assert.equal(c[cells[0]].REAL.coverage,0);assert.equal(c[cells[13]].REAL.coverage,1);assert.equal(marginals(c).REAL.total,1);
 assert.throws(()=>replay([{...review(p,"approved"),image_sha256:"b".repeat(64)},p]),/mismatched/);
});
test("REAL retrieval and SLOP judgments are separate signals; filters cannot invent pending refusals",()=>{
 const p=proposal("real"),a=proposal("ai",cells[0],"AI"),events=[p,review(p,"approved"),a,review(a,"rejected")];
 const c=replay(events);assert.equal(c[cells[0]].REAL.approved,1);assert.equal(c[cells[0]].AI.rejected,1);
 assert.equal(replay(events,{origin:"REAL"})[cells[0]].AI.rejected,0);assert.equal(replay(events,{provider:"missing"})[cells[0]].REAL.proposed_to_owner,0);
 const w=scheduler(c,stamp),realOnly=scheduler(replay([p,review(p,"approved")]),stamp);assert.deepEqual(w,realOnly);
});
test("seeded scheduler preserves positive exploration and approximate marginal exposure without uniform intersections",()=>{
 const events:MatrixEvent[]=[];
 for(let i=0;i<144;i++)for(let n=0;n<20;n++){const p=proposal(`${i}-${n}`,cells[i]);events.push(p,review(p,i%13===0?"rejected":"approved"));}
 const counts=replay(events),weights=scheduler(counts,stamp);
 assert.ok(Math.abs(weights.reduce((n,w)=>n+w.weight,0)-1)<1e-9);assert.ok(weights.every(w=>w.weight>=.25/144));assert.ok(weights[0].weight<weights[1].weight);
 for(const axis of [0,1])for(const label of axis?topics:emotions){const sum=weights.filter(w=>w.cell.split(":")[axis]===label).reduce((n,w)=>n+w.weight,0);assert.ok(Math.abs(sum-1/12)<.001);}
 assert.deepEqual(selectCells(weights,25,53),selectCells(weights,25,53));assert.equal(new Set(selectCells(weights,25,53).map(w=>w.cell)).size,25);assert.throws(()=>selectCells(weights,26,53));
 assert.ok(scheduler(counts,stamp,.25,false).every(w=>Math.abs(w.weight-1/144)<1e-12));
});
test("adaptive fixture benchmark has fixed budget, uncertainty and reevaluable low-yield cells",()=>{
 const result=benchmark(53);assert.equal(result.uniform.cost,result.adaptive.cost);assert.ok(result.adaptive.approved>result.uniform.approved);assert.ok(result.minimum_probability>0);assert.equal(result.small_samples[0].observed_rate,null);assert.equal(result.small_samples[1].insufficient_data,true);assert.deepEqual(benchmark(53),result);
});
test("frozen brief contract excludes any added REAL inputs and records model, taxonomy and selection",()=>{
 const b={brief_id:"one",revision:1,taxonomy_version:"4.0.0",intent_emotion:emotions[0],intent_topic:topics[0],medium:"photograph",description:"A shared room with a table and nearby chairs.",tags:["shared_room"],search_queries:["shared room","room table"],slop_prompt:"Create a shared room with a table and the surrounding environment.",seed:53,model:"authored-catalog",instructions_version:"4.0.0",catalog:{id:"catalog",version:"4.0.0",sha256:"a".repeat(64)},selection:{run_id:"cycle",method:"uniform",events_sha256:"b".repeat(64),config_sha256:"c".repeat(64),weight:1/144},parameters:{size:"1024x1024",quality:"medium",image_model:"fixture-image",evaluator_model:"fixture-vision"}};
 assert.equal(validateBrief(b),b);assert.throws(()=>validateBrief({...b,real_title:"Source title"}));assert.throws(()=>validateBrief({...b,slop_prompt:"Create an image of https://example.com/source"}));assert.equal(canonical({b:2,a:1}),'{"a":1,"b":2}');
 const auto={...b,parameters:{...b.parameters,size:"auto",presentation_mode:"whole_frame"}};
 assert.equal(validateBrief(auto),auto);
 assert.throws(()=>validateBrief({...auto,parameters:{...auto.parameters,presentation_mode:"square_crop"}}));
 assert.throws(()=>validateBrief({...auto,parameters:{...auto.parameters,real_image:"source"}}));
});
test("caption validation keeps final neutral text separate from fictional and documentary metadata",()=>{
 const draft={game_caption:"Una cucina domestica con un tavolo accanto alla finestra e oggetti d’uso quotidiano.",caption_version:"1.0.0",caption_generator_version:"manual-v1",caption_provenance_refs:[],caption_context_fictional:false,context_mode:"visible"};
 assert.equal(validateCaption(draft,"REAL"),draft);
 for(const text of ["x".repeat(121),"Una cucina!","Una cucina. Un tavolo.","<b>Una cucina</b>","Una cucina 😀","Immagine generata con AI."])assert.throws(()=>validateCaption({...draft,game_caption:text},"REAL"));
 assert.throws(()=>validateCaption({...draft,context_mode:"documented"},"REAL"));assert.throws(()=>validateCaption(draft,"AI"));
 assert.equal(validateCaption({...draft,caption_context_fictional:true,context_mode:"fictional"},"AI").caption_context_fictional,true);
 const rows=emotions.flatMap(emotion=>(["REAL","AI"]as const).map(origin=>({origin,emotion,text:draft.game_caption,geographic:false,temporal:false})));
 const report=captionDiagnostics(rows);assert.equal(report.n,24);assert.equal(report.caption_only_accuracy,.5);assert.equal(report.by_origin[0].mean_length,report.by_origin[1].mean_length);
 const leaking=rows.map(r=>({...r,text:r.origin==="AI"?"Interno a Palermo nel 2020.":"Una stanza con sedie."}));assert.ok(captionDiagnostics(leaking).caption_only_accuracy!>.9);
});

test("repeated empty acquisition lowers availability without inventing human refusals",()=>{
 const attempts:MatrixEvent[]=Array.from({length:30},(_,i)=>({...proposal("empty-"+i),id:"a-empty-"+i,kind:"attempt",candidate_id:null,image_sha256:null,data:{source_hits:0,documentary_eligible:0,duplicates:0,cost:0}}));
 const once=replay(attempts.slice(0,1)),many=replay(attempts);
 assert.equal(many[cells[0]].REAL.rejected,0);assert.equal(many[cells[0]].REAL.observed_rate,null);
 assert.ok(scheduler(many,stamp)[0].weight<scheduler(once,stamp)[0].weight);assert.ok(scheduler(many,stamp)[0].weight>=.25/144);
});

test("inference reservations and receipts do not inflate REAL retrieval attempts or cost on retry",()=>{
 const p=proposal("accounting");const common={...p,kind:"attempt" as const,candidate_id:null,image_sha256:null};
 const search={...common,id:"search-accounting",data:{stage:"search",source_hits:0,documentary_eligible:0,duplicates:0,cost:0}};
 const result={...common,id:"result-accounting",data:{stage:"search_result",source_hits:4,documentary_eligible:1,duplicates:1,cost:0}};
 const profile={...common,id:"profile-accounting",data:{stage:"profile",source_hits:0,documentary_eligible:0,duplicates:0,cost:.02}};
 const receipt={...common,id:"receipt-accounting",data:{stage:"receipt",source_hits:0,documentary_eligible:0,duplicates:0,cost:0}};
 const c=replay([search,result,profile,receipt,profile,receipt])[cells[0]].REAL;
 assert.equal(c.search_attempts,1);assert.equal(c.source_hits,4);assert.equal(c.documentary_eligible,1);assert.equal(c.cost,.02);assert.equal(c.rejected,0);
});

test("approval alone never confirms the intended class or fabricates on-target coverage",()=>{
 const p=proposal("unclassified"),events=[p,review(p,"approved")];const pending=replay(events)[cells[0]].REAL;
 assert.equal(pending.approved,1);assert.equal(pending.unclassified_approved,1);assert.equal(pending.coverage,0);assert.equal(pending.on_target_observations,0);assert.equal(pending.on_target_estimate,.5);
 const classified=replay([...events,{...p,id:"classified",kind:"classification",revision:1}])[cells[0]].REAL;
 assert.equal(classified.coverage,1);assert.equal(classified.on_target_approved,1);assert.equal(classified.unclassified_approved,0);
});
