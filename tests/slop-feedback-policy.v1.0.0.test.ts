import assert from "node:assert/strict";
import test from "node:test";
import { slopPromptFeedbackSignal, validSlopPromptFeedback } from "../shared/slop-feedback-policy.v1.0.0";
test("owner taste influences prompt quality only through editorial decisions",()=>{
  assert.equal(slopPromptFeedbackSignal("approved","editorial"),"liked");
  assert.equal(slopPromptFeedbackSignal("rejected","editorial"),"disliked");
  assert.equal(slopPromptFeedbackSignal("rejected","generation"),"generation_defect");
  assert.equal(validSlopPromptFeedback("rejected","generation"),true);
});
test("technical, licensing, uncertain provenance and pending votes are never aesthetic feedback",()=>{
  for(const reason of ["technical","rights","provenance"] as const){
    assert.equal(slopPromptFeedbackSignal("rejected",reason),null);
    assert.equal(slopPromptFeedbackSignal("approved",reason),null);
  }
  assert.equal(slopPromptFeedbackSignal("approved","generation"),null);
  assert.equal(validSlopPromptFeedback("pending","editorial"),false);
});
