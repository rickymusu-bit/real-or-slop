/** Server-side contracts: critical defects and missing anchors cannot be averaged into acceptance; notes on what pixels cannot
 * verify do not stop it (owner decision of 2026-11-16). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { realDescription, validBrief, validEvaluation, type Brief, type Evaluation } from "../shared/editorial";
const brief: Brief = {required:["documentary street scene"], preferred:[], flexible:["viewpoint"],exclusions:["real identities"]};
const result: Evaluation = {attempt_id:"a",decision:"accept",critical_findings:[],minor_findings:[],editorial_constraints_met:true,
  uncertainty_notes:[],action_reason:"Plausible geometry throughout the frame",revised_prompt:"",preserved_required:brief.required,preserved_exclusions:brief.exclusions};
test("descriptions and briefs reject incomplete or fabricated structure",()=>{
  assert.equal(realDescription({visible:"street"}),null);
  assert.equal(realDescription({visible:" ",documented_context:"",uncertainties:""}),null);
  assert.ok(realDescription({visible:"street",documented_context:"",uncertainties:"unknown date"}));
  assert.equal(validBrief({...brief,required:[]}),null); assert.ok(validBrief(brief));
});
test("critical defects and missing anchors stop acceptance, uncertainty notes do not",()=>{
  assert.equal(validEvaluation(result,"a",brief)?.decision,"accept");
  for(const change of [{critical_findings:["Upper right: floating vehicle"]},{editorial_constraints_met:false}])
    assert.equal(validEvaluation({...result,...change},"a",brief)?.decision,"review_needed");
  assert.equal(validEvaluation({...result,uncertainty_notes:["Exact place and date cannot be verified from pixels"]},"a",brief)?.decision,"accept");
  assert.equal(validEvaluation(result,"wrong-attempt",brief),null);
});
test("prompt revisions must declare preservation of immutable anchors and exclusions",()=>{
  const revised = {...result,decision:"replan_scene",revised_prompt:"A different street photograph."};
  assert.equal(validEvaluation(revised,"a",brief)?.decision,"replan_scene");
  assert.equal(validEvaluation({...revised,preserved_required:[]},"a",brief)?.decision,"review_needed");
  assert.equal(validEvaluation({...revised,preserved_exclusions:[]},"a",brief)?.decision,"review_needed");
  assert.equal(validEvaluation({...revised,revised_prompt:""},"a",brief)?.decision,"review_needed");
});
