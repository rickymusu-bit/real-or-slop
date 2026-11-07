import assert from "node:assert/strict";
import test from "node:test";
import taxonomy from "../shared/real-discovery-taxonomy.v1.0.0.json";
import { proposedTaxonomy, validTaxonomyProposal } from "../shared/editorial-taxonomy-classification.v1.0.0";
import { fields } from "../worker/workspace-ai.v1.0.0";
test("visual schema uses the established twelve-topic/twelve-emotion matrix only for classification",()=>{
  const format=fields.profile as {schema:{properties:Record<string,{enum?:string[]}>}};
  assert.deepEqual(format.schema.properties.taxonomy_topic.enum,taxonomy.topics.map(t=>t.id));
  assert.deepEqual(format.schema.properties.taxonomy_emotion.enum,taxonomy.emotions.map(t=>t.id));
  assert.deepEqual(format.schema.properties.taxonomy_intensity.enum,["low","medium","high"]);
  assert.equal(taxonomy.topics.length,12);
  assert.equal(taxonomy.emotions.length,12);
});
test("pixel-only proposals are suggestions, never authenticity claims",()=>{
  const proposal=proposedTaxonomy({taxonomy_topic:"news_current_affairs",taxonomy_emotion:"curiosity",
    taxonomy_intensity:"medium",taxonomy_uncertain:true});
  assert.deepEqual(proposal,{topic:"news_current_affairs",emotion:"curiosity",intensity:"medium",
    uncertain:true,status:"suggested",version:taxonomy.version});
  assert.equal(validTaxonomyProposal(proposal),true);
});
test("neutrality can only be low intensity; unknown classifications are rejected",()=>{
  const neutral=proposedTaxonomy({taxonomy_topic:"people_everyday_life",taxonomy_emotion:"neutrality",
    taxonomy_intensity:"high",taxonomy_uncertain:false});
  assert.equal(neutral.intensity,"low");
  assert.equal(validTaxonomyProposal(neutral),true);
  assert.throws(()=>proposedTaxonomy({taxonomy_topic:"fabricated_topic",taxonomy_emotion:"curiosity",
    taxonomy_intensity:"high",taxonomy_uncertain:false}),/tassonomia/);
  assert.throws(()=>proposedTaxonomy({taxonomy_topic:"animals",taxonomy_emotion:"not_an_emotion",
    taxonomy_intensity:"low",taxonomy_uncertain:true}),/tassonomia/);
  assert.equal(validTaxonomyProposal({topic:"animals",emotion:"neutrality",intensity:"high",
    uncertain:false,status:"suggested",version:taxonomy.version}),false);
});
