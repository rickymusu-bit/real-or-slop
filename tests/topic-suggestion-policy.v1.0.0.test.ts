import assert from "node:assert/strict";
import test from "node:test";
import {eligibleTopic,topicAssessment,topicProposalInstructions,topicReviewInstructions} from "../shared/topic-suggestion-policy.v1.0.0";
test("coherence, specificity and photographic plausibility are all required before semantic comparison",()=>{
 const good={coherent:true,specific:true,photographically_plausible:true,reason:"A comprehensible photographic subject."};
 assert.equal(eligibleTopic(topicAssessment(good)),true);
 for(const key of ["coherent","specific","photographically_plausible"])
  assert.equal(eligibleTopic(topicAssessment({...good,[key]:false})),false);
 for(const bad of [null,{}, {...good,coherent:"true"},{...good,reason:""},{...good,reason:"x".repeat(601)},
  {...good,quality_validated:true}])assert.throws(()=>topicAssessment(bad));
});
test("distance and empty regions cannot qualify an otherwise ineligible proposal",()=>{
 assert.match(topicProposalInstructions,/never arbitrary vectors or empty regions/);
 assert.match(topicProposalInstructions,/Coverage is only secondary/);
 assert.match(topicReviewInstructions,/Set eligible=false/);
 assert.match(topicReviewInstructions,/even if far from every neighbor/);
 assert.match(topicReviewInstructions,/distinct even with high cosine/);
});
