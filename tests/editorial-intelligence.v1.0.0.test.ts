import assert from "node:assert/strict";
import test from "node:test";
import { editorialIntelligenceVersion,topicTerms,similarTopic,suggestedTopicTitle,
  profileTags,preferenceScore,rankEditorial,reliableFeedback,imageFormatChoice
} from "../shared/editorial-intelligence.v1.0.0";
test("SemVer, topic novelty, overlap and meaningful specificity",()=>{
  assert.equal(editorialIntelligenceVersion,"1.0.0");
  assert.deepEqual(topicTerms("Proteste a Bruxelles nell'ottobre del 2026"),["proteste","bruxelles","nell","ottobre","2026"]);
  assert.ok(similarTopic("Proteste a Bruxelles nell'ottobre 2026","Proteste a Bruxelles, ottobre 2026"));
  assert.equal(similarTopic("Proteste a Bruxelles ottobre 2026","Aurora boreale a Roma maggio 2024"),false);
  assert.equal(suggestedTopicTitle("Proteste   a Bruxelles, ottobre 2026"),"Proteste a Bruxelles, ottobre 2026");
  assert.throws(()=>suggestedTopicTitle("sport"),/generico/);
});
test("only valid visual tags, Bayesian smoothing and transparent ranking",()=>{
  assert.deepEqual(profileTags({tags:["crowded_scene","crowded_scene","people_2026","!!!",2,"smoke"]}),["crowded_scene","people_2026","smoke"]);
  const counts=[{feature:"crowded_scene",approved:8,rejected:0},{feature:"routine_scene",approved:0,rejected:8}];
  assert.ok(preferenceScore(["crowded_scene"],counts)>0.5);
  assert.ok(preferenceScore(["routine_scene"],counts)<0.5);
  assert.equal(preferenceScore([],counts),0.5);
  const ranked=rankEditorial([{id:"a",tags:["routine_scene"]},{id:"b",tags:["crowded_scene"]}],counts);
  assert.deepEqual(ranked.map(x=>x.id),["b","a"]);
  assert.ok(ranked[0].reason.includes("crowded_scene"));
  assert.throws(()=>rankEditorial([],counts,0),/esplorazione/);
});
test("rights, generation and technical rejections do not train taste",()=>{
  assert.equal(reliableFeedback("editorial","approved"),true);
  assert.equal(reliableFeedback("editorial","rejected"),true);
  assert.equal(reliableFeedback("technical","rejected"),false);
  assert.equal(reliableFeedback("rights","rejected"),false);
  assert.equal(reliableFeedback("provenance","rejected"),false);
  assert.equal(reliableFeedback("generation","rejected"),false);
  assert.equal(reliableFeedback("editorial","pending"),false);
});
test("REAL and SLOP may both have portrait, landscape and square sizes",()=>{
  const found=[imageFormatChoice(0),imageFormatChoice(1),imageFormatChoice(2)];
  assert.deepEqual(found.map(x=>x.variant),["landscape","portrait","square"]);
  assert.deepEqual(found.map(x=>x.size),["1536x1024","1024x1536","1024x1024"]);
  assert.throws(()=>imageFormatChoice(33),/Slot/);
});
