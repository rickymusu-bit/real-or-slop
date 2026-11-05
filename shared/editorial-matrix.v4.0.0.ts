/** Editorial intent and explicit owner feedback; independent of player answers. */
import taxonomy from "./editorial-taxonomy.v4.0.0.json";
export { taxonomy };
export const matrixVersion = "4.0.0";
export const emotions = taxonomy.emotions.map(e => e.id);
export const topics = taxonomy.topics.map(t => t.id);
export const cells = emotions.flatMap(emotion => topics.map(topic => `${emotion}:${topic}`));
export const isCell = (value: unknown): value is string => typeof value === "string" && cells.includes(value);
export class MatrixValidationError extends Error {}
export function check(ok: unknown, message: string): asserts ok { if (!ok) throw new MatrixValidationError(message); }
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => JSON.stringify(k) + ":" + canonical(v)).join(",") + "}";
  return JSON.stringify(value);
}
export interface MatrixEvent {
  id: string; kind: "proposal" | "review" | "classification" | "attempt";
  origin: "REAL" | "AI"; intent_cell: string; observed_cell: string;
  candidate_id: string | null; image_sha256: string | null; brief_id: string;
  revision: number; decision: "approved" | "rejected" | "pending" | null;
  provider: string; batch: string; created_at: string;
  data: Record<string, unknown>;
}
export function validateEvent(e: MatrixEvent) {
  check(e && typeof e.id === "string" && /^[\w:-]{1,220}$/.test(e.id) && ["proposal","review","classification","attempt"].includes(e.kind), "Invalid matrix event identity");
  check(["REAL","AI"].includes(e.origin) && isCell(e.intent_cell) && isCell(e.observed_cell), "Invalid origin or taxonomy cell");
  check(typeof e.brief_id === "string" && /^[\w-]{1,160}$/.test(e.brief_id) && typeof e.provider === "string" && e.provider.length <= 100 && typeof e.batch === "string" && e.batch.length <= 160, "Invalid event context");
  check(Number.isSafeInteger(e.revision) && e.revision >= 0 && Number.isFinite(Date.parse(e.created_at)) && e.data && typeof e.data === "object" && !Array.isArray(e.data), "Invalid event revision or data");
  if (e.kind !== "attempt") check(typeof e.candidate_id === "string" && /^[\w-]{1,160}$/.test(e.candidate_id) && typeof e.image_sha256 === "string" && /^[a-f0-9]{64}$/.test(e.image_sha256), "Event must bind final pixels");
  if (e.kind === "review") check(["approved","rejected","pending"].includes(String(e.decision)) && e.revision > 0, "Explicit review required");
  if (e.kind === "attempt") for (const key of ["source_hits","documentary_eligible","duplicates","cost"]) check(typeof e.data[key] === "number" && Number.isFinite(e.data[key]) && Number(e.data[key]) >= 0 && (key === "cost" || Number.isSafeInteger(e.data[key])), "Invalid acquisition counters");
  return e;
}
export function wilson(yes: number, n: number): [number,number] | null {
  if (!n) return null;
  const z2=3.841458820694124, p=yes/n, denominator=1+z2/n;
  const center=(p+z2/(2*n))/denominator, half=Math.sqrt(z2*(p*(1-p)/n+z2/(4*n*n)))/denominator;
  return [Math.max(0,center-half),Math.min(1,center+half)];
}
export interface CellCounts {
  search_attempts: number; source_hits: number; documentary_eligible: number; duplicates: number;
  proposed_to_owner: number; approved: number; rejected: number; pending: number; off_target: number;
  on_target_approved: number; on_target_observations: number; unclassified_approved: number; classified_approved: number; coverage: number; cost: number; last_attempt_at: string | null; last_review_at: string | null;
  observed_rate: number | null; estimated_rate: number; on_target_estimate: number; interval: [number,number] | null;
  insufficient_data: boolean; trend: number | null; recent_briefs: string[];
}
const empty = (): CellCounts => ({search_attempts:0,source_hits:0,documentary_eligible:0,duplicates:0,proposed_to_owner:0,approved:0,rejected:0,pending:0,off_target:0,on_target_approved:0,on_target_observations:0,unclassified_approved:0,classified_approved:0,coverage:0,cost:0,last_attempt_at:null,last_review_at:null,observed_rate:null,estimated_rate:.5,on_target_estimate:.5,interval:null,insufficient_data:true,trend:null,recent_briefs:[]});
export interface MatrixFilter { emotion?: string; topic?: string; origin?: string; provider?: string; batch?: string; status?: string }
export function replay(events: MatrixEvent[], filter: MatrixFilter = {}) {
  check(Array.isArray(events) && events.length <= 100000, "Matrix snapshot exceeds 100000 events; use an offline snapshot");
  const unique = new Map<string,MatrixEvent>();
  for (const e of events) {validateEvent(e); const prior=unique.get(e.id);check(!prior || canonical(prior)===canonical(e),"Conflicting event replay");unique.set(e.id,e);}
  const candidates = new Map<string,{proposal:MatrixEvent;review?:MatrixEvent;classification?:MatrixEvent}>();
  const ordered = [...unique.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  for (const e of ordered.filter(e => e.kind === "proposal")) {
    const prior=candidates.get(e.candidate_id!);check(!prior || canonical(prior.proposal)===canonical(e),"Candidate proposal cannot change");candidates.set(e.candidate_id!,{proposal:e});
  }
  for (const e of ordered.filter(e => e.kind === "review" || e.kind === "classification")) {
    const row=candidates.get(e.candidate_id!);check(row && row.proposal.image_sha256===e.image_sha256 && row.proposal.origin===e.origin && row.proposal.intent_cell===e.intent_cell && row.proposal.brief_id===e.brief_id,"Orphan or mismatched candidate event");
    const key=e.kind === "review" ? "review" : "classification", old=row[key];
    check(!old || old.revision!==e.revision || canonical(old)===canonical(e),"Conflicting decision revision");
    if (!old || e.revision>old.revision) row[key]=e;
  }
  const result=Object.fromEntries(cells.map(cell => [cell,{REAL:empty(),AI:empty()}])) as Record<string,Record<"REAL"|"AI",CellCounts>>;
  const matches=(e:MatrixEvent) => (!filter.origin || filter.origin===e.origin) && (!filter.provider || filter.provider===e.provider) && (!filter.batch || filter.batch===e.batch);
  const reviews = new Map<string,{approved:boolean;at:string}[]>();
  for (const e of ordered.filter(e => e.kind === "attempt" && matches(e))) {
    const c=result[e.intent_cell][e.origin],stage=e.data.stage||"search";
    if(stage==="search" || e.origin==="AI"&&stage==="generation"){c.search_attempts++;c.last_attempt_at=e.created_at;}
    for (const k of ["source_hits","documentary_eligible","duplicates","cost"] as const)c[k]+=Number(e.data[k]);
    c.recent_briefs=[e.brief_id,...c.recent_briefs.filter(id=>id!==e.brief_id)].slice(0,5);
  }
  for (const row of candidates.values()) {
    const e=row.proposal, decision=row.review?.decision || "pending", observed=row.classification?.observed_cell || e.observed_cell, classified=!!row.classification;
    if (!matches(e) || filter.status && filter.status!==decision)continue;
    const c=result[e.intent_cell][e.origin];c.proposed_to_owner++;c[decision]++;
    c.recent_briefs=[e.brief_id,...c.recent_briefs.filter(id=>id!==e.brief_id)].slice(0,5);
    if(classified&&observed!==e.intent_cell)c.off_target++;
    if(decision === "approved") { if(classified){c.classified_approved++;result[observed][e.origin].coverage++;if(observed===e.intent_cell)c.on_target_approved++;}else c.unclassified_approved++; }
    if(decision!=="pending" && row.review) {
      c.last_review_at=!c.last_review_at || c.last_review_at<row.review.created_at ? row.review.created_at:c.last_review_at;
      const key=e.intent_cell+"/"+e.origin;reviews.set(key,[...reviews.get(key)||[],{approved:decision==="approved",at:row.review.created_at}]);
    }
  }
  for(const cell of cells)for(const origin of ["REAL","AI"] as const){
    const c=result[cell][origin], n=c.approved+c.rejected;
    c.observed_rate=n?c.approved/n:null;c.estimated_rate=(c.approved+taxonomy.policy.alpha)/(n+taxonomy.policy.alpha+taxonomy.policy.beta);
    c.on_target_observations=c.classified_approved+c.rejected;
    c.on_target_estimate=(c.on_target_approved+taxonomy.policy.alpha)/(c.on_target_observations+taxonomy.policy.alpha+taxonomy.policy.beta);
    c.interval=wilson(c.approved,n);c.insufficient_data=n<10;
    const r=(reviews.get(cell+"/"+origin)||[]).sort((a,b)=>a.at.localeCompare(b.at));
    if(r.length>=20)c.trend=r.slice(-10).filter(x=>x.approved).length/10-r.slice(-20,-10).filter(x=>x.approved).length/10;
    c.cost=Math.round(c.cost*1e6)/1e6;
  }
  return result;
}
export function marginals(counts: ReturnType<typeof replay>) {
  return Object.fromEntries((["REAL","AI"] as const).map(origin=>{
    const emotion=Object.fromEntries(emotions.map(id=>[id,0])),topic=Object.fromEntries(topics.map(id=>[id,0]));
    for(const cell of cells){const [e,t]=cell.split(":");emotion[e]+=counts[cell][origin].coverage;topic[t]+=counts[cell][origin].coverage;}
    const total=Object.values(emotion).reduce((a,b)=>a+b,0), target=total/12;
    return [origin,{total,target,emotion,topic,emotion_deviation:Object.fromEntries(emotions.map(e=>[e,emotion[e]-target])),topic_deviation:Object.fromEntries(topics.map(t=>[t,topic[t]-target]))}];
  })) as Record<"REAL"|"AI",{total:number;target:number;emotion:Record<string,number>;topic:Record<string,number>;emotion_deviation:Record<string,number>;topic_deviation:Record<string,number>}>;
}
export function scheduler(counts:ReturnType<typeof replay>,now:string,exploration=taxonomy.policy.exploration,adaptive=true){
  check(Number.isFinite(Date.parse(now)) && exploration>=.05 && exploration<=1,"Invalid scheduler clock/exploration");
  const margins=marginals(counts),weights=cells.map(cell=>{
    const c=counts[cell].REAL,[e,t]=cell.split(":"),m=margins.REAL;
    const a=margins.AI;
    const deficit=1+.7*(Math.max(0,m.target-m.emotion[e])+Math.max(0,m.target-m.topic[t]))/Math.max(1,m.target)+.3*(Math.max(0,a.target-a.emotion[e])+Math.max(0,a.target-a.topic[t]))/Math.max(1,a.target);
    const novelty=1/Math.sqrt(1+c.proposed_to_owner/10), availability=c.search_attempts ? Math.min(1,(c.documentary_eligible+1)/(c.search_attempts+2))*(c.documentary_eligible+1)/(c.source_hits+2):1;
    const cost=1/(1+c.cost/Math.max(1,c.on_target_approved));
    const cooling=c.approved+c.rejected>=10 && c.on_target_estimate<.2 && c.last_attempt_at && Date.parse(now)-Date.parse(c.last_attempt_at)<taxonomy.policy.cooldown_days*86400000 ? .35:1;
    const score=adaptive?Math.max(taxonomy.policy.minimum_weight,c.on_target_estimate*novelty*availability*cost*cooling):1;
    return {cell,weight:score,score,deficit,novelty,availability,cost,cooling,reasons:[`REAL on-target posterior ${c.on_target_estimate.toFixed(3)} (${c.on_target_approved}/${c.on_target_observations})`,`coverage deficit ${deficit.toFixed(2)}`,`novelty ${novelty.toFixed(2)}, documentary availability ${availability.toFixed(2)}, cost factor ${cost.toFixed(2)}`,cooling<1?"Temporary cooldown; exploration remains positive":"Periodic reassessment; no cell excluded"]};
  });
  // Balance marginal search exposure, not all 144 intersections. IPF retains
  // different yields within each row/column; approved deficits adjust targets.
  if(adaptive)for(let iteration=0;iteration<40;iteration++)for(const axis of [0,1]){
    const labels=axis?topics:emotions, m=margins.REAL, coverage=axis?m.topic:m.emotion;
    const a=margins.AI, other=axis?a.topic:a.emotion;
    const targets=labels.map(id=>1+.7*Math.max(0,m.target-coverage[id])/Math.max(1,m.target)+.3*Math.max(0,a.target-other[id])/Math.max(1,a.target)), total=targets.reduce((a,b)=>a+b,0);
    for(const [i,id]of labels.entries()){
      const group=weights.filter(w=>w.cell.split(":")[axis]===id),sum=group.reduce((a,w)=>a+w.weight,0);
      for(const w of group)w.weight*=targets[i]/total/sum;
    }
  }
  const sum=weights.reduce((a,w)=>a+w.weight,0);
  return weights.map(w=>({...w,weight:(adaptive?exploration:1)/144+(adaptive?1-exploration:0)*w.weight/sum}));
}
export function selectCells(weights:ReturnType<typeof scheduler>,count=5,seed=53){
  check(Number.isSafeInteger(count)&&count>=1&&count<=25&&Number.isSafeInteger(seed)&&seed>=0&&seed<=4294967295,"Cycle requires 1–25 briefs and a uint32 seed");
  let state=seed>>>0;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
  const pool=[...weights],selected=[];
  for(let n=0;n<count;n++){let target=random()*pool.reduce((a,w)=>a+w.weight,0),i=0;while(i<pool.length-1&&target>=pool[i].weight)target-=pool[i++].weight;selected.push(pool.splice(i,1)[0]);}
  return selected;
}
