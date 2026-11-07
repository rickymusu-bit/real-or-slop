import { hash, HttpError, type Env } from "./core";
import { profileTags, preferenceScore, rankEditorial, reliableFeedback,
  type PreferenceRow, type Origin, type Profile } from "../shared/editorial-intelligence.v1.0.0";
import { isolatedSlopPlanningInput } from "../shared/editorial-workspace.v1.0.0";
import { validTaxonomyProposal } from "../shared/editorial-taxonomy-classification.v1.0.0";
import { slopPromptFeedbackSignal } from "../shared/slop-feedback-policy.v1.0.0";

interface Feedback {
  inbox_id: string; sha256:string; origin: Origin; profile_json:string;
  decision:string; note:string;
}
function editorialReason(raw:string):string {
  try { const obj = JSON.parse(raw) as {reason?: unknown}; return typeof obj.reason==="string" ? obj.reason : "editorial"; }
  catch { return "editorial"; }
}
export interface Learned {
  observations:number; counts:PreferenceRow[]; approved:number; rejected:number;
  updated_at:string; version:string;
}
export async function learnedPreferences(env:Env,origin:Origin):Promise<Learned> {
  const sql = "SELECT p.inbox_id,p.sha256,p.origin,p.profile_json,e.decision,e.note " +
    "FROM editorial_image_profiles p JOIN editorial_review_effective_images q ON q.id=p.inbox_id " +
    "JOIN editorial_review_inbox_events e ON e.image_id=q.id AND e.revision=q.revision AND e.image_sha256=q.sha256 " +
    "WHERE p.origin=? AND q.origin=? AND q.sha256=p.sha256 AND q.status IN ('approved','rejected') " +
    "ORDER BY e.created_at DESC LIMIT 3000";
  const result = await env.DB.prepare(sql).bind(origin,origin).all<Feedback>();
  const counts = new Map<string,PreferenceRow>(); let approved=0,rejected=0;
  for (const row of result.results) {
    if (!reliableFeedback(editorialReason(row.note),row.decision)) continue;
    if (row.decision==="approved") approved++; else rejected++;
    let tags:string[]=[];
    try { tags=profileTags(JSON.parse(row.profile_json)); } catch { /* invalid historical descriptor skipped */ }
    for (const feature of tags) {
      const entry = counts.get(feature) || {feature,approved:0,rejected:0};
      if (row.decision==="approved") entry.approved++; else entry.rejected++;
      counts.set(feature,entry);
    }
  }
  return {observations:approved+rejected,approved,rejected,counts:[...counts.values()].sort((a,b)=>a.feature.localeCompare(b.feature)),
    updated_at:new Date().toISOString(),version:"1.0.0"};
}
export async function rankPending(env:Env,origin:Origin) {
  const preference=await learnedPreferences(env,origin);
  const rows=(await env.DB.prepare("SELECT q.id,q.sha256,q.origin,p.profile_json " +
    "FROM editorial_review_effective_images q LEFT JOIN editorial_image_profiles p " +
    "ON p.inbox_id=q.id AND p.sha256=q.sha256 WHERE q.origin=? AND q.status='pending' " +
    "ORDER BY q.created_at DESC LIMIT 200").bind(origin).all<{
      id:string;sha256:string;origin:Origin;profile_json:string|null
    }>()).results.map(row=>{
      let tags:string[]=[],classification:unknown=null;
      try {
        const profile=row.profile_json ? JSON.parse(row.profile_json) as {taxonomy_classification?:unknown} : null;
        tags=profileTags(profile);
        if(validTaxonomyProposal(profile?.taxonomy_classification))classification=profile?.taxonomy_classification;
      } catch { /* malformed profile ignored */ }
      return {id:row.id,tags,sha256:row.sha256,taxonomy_classification:classification};
    });
  const ranked=rankEditorial(rows,preference.counts);
  return {preference,ranked};
}
export async function historicalSlopFeedback(env:Env):Promise<string[]> {
  const rows = (await env.DB.prepare("SELECT e.decision,e.note,q.metadata_json " +
    "FROM editorial_review_inbox_events e JOIN editorial_review_effective_images q ON q.id=e.image_id " +
    "WHERE q.origin='AI' AND q.revision=e.revision AND q.sha256=e.image_sha256 AND e.decision IN ('approved','rejected') " +
    "ORDER BY e.created_at DESC LIMIT 60").all<{decision:string;note:string;metadata_json:string}>()).results;
  const feedback:string[]=[];
  for (const row of rows) {
    const reason=editorialReason(row.note);
    const signal=slopPromptFeedbackSignal(row.decision as "approved"|"rejected",reason as "editorial"|"generation"|"technical"|"rights"|"provenance");
    if (!signal) continue;
    let prompt="";
    try {
      const meta=JSON.parse(row.metadata_json) as Record<string,unknown>;
      prompt=String((meta.provenance as Record<string,unknown>|undefined)?.prompt || meta.prompt || "").slice(0,240);
    } catch { /* legacy metadata */ }
    const note=(()=>{try{const parsed=JSON.parse(row.note) as {note?:string};return parsed.note || "";}catch{return row.note;}})();
    feedback.push((signal+" — "+(prompt?"prompt: "+prompt+"; ":"")+note.slice(0,240)).slice(0,580));
    if(feedback.length>=30)break;
  }
  return feedback;
}
export async function ensureSlopSeed(env:Env,topic:{id:string;title:string}) {
  const current=await env.DB.prepare("SELECT seed_json,sha256 FROM editorial_topic_slop_seed WHERE topic_id=?")
    .bind(topic.id).first<{seed_json:string;sha256:string}>();
  if(current) return {seed:isolatedSlopPlanningInput(JSON.parse(current.seed_json)),sha256:current.sha256};
  const seed=isolatedSlopPlanningInput({topic:topic.title,taxonomy_version:"1.0.0",
    slop_feedback:await historicalSlopFeedback(env)});
  const canonical=JSON.stringify(seed),sha256=await hash(canonical);
  await env.DB.prepare("INSERT OR IGNORE INTO editorial_topic_slop_seed(topic_id,seed_json,sha256,created_at) VALUES(?,?,?,?)")
    .bind(topic.id,canonical,sha256,new Date().toISOString()).run();
  const actual=await env.DB.prepare("SELECT seed_json,sha256 FROM editorial_topic_slop_seed WHERE topic_id=?")
    .bind(topic.id).first<{seed_json:string;sha256:string}>();
  if(!actual)throw new HttpError(500,"Snapshot SLOP non disponibile");
  return {seed:isolatedSlopPlanningInput(JSON.parse(actual.seed_json)),sha256:actual.sha256};
}
export async function headlineStats(env:Env) {
  const [real,ai]=await Promise.all([learnedPreferences(env,"REAL"),learnedPreferences(env,"AI")]);
  return {real,slop:ai};
}
export function scoreForProfile(profile:Profile,learned:Learned):number {
  return preferenceScore(profileTags(profile),learned.counts);
}
