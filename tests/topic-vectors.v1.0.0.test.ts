import assert from "node:assert/strict";
import test from "node:test";
import {cosine,semanticNeighbors,type SemanticVector} from "../shared/topic-vectors.v1.0.0";
import {topicImageFormatChoice} from "../shared/editorial-intelligence.v1.0.0";

test("semantic comparison rejects invalid and incompatible vectors and never equates distance with identity",()=>{
 assert.equal(cosine([0,0],[1,2]),null);
 assert.equal(cosine([1],[1,2]),null);
 assert.equal(cosine([NaN,1],[1,1]),null);
 assert.equal(cosine([1,0],[0,1]),0);
 const item:SemanticVector={id:"new",title:"Brussels protests 2026",description:"A new episode",model:"small",template_version:"1",vector:[1,0]};
 const history=[
  {...item,id:"old",title:"Brussels protests 2024",vector:[1,0]},
  {...item,id:"different-model",model:"large"},
  {...item,id:"different-template",template_version:"2"},
  {...item,id:"remote",vector:[0,1]},
  item
 ];
 const neighbors=semanticNeighbors(item,history);
 assert.deepEqual(neighbors.map(x=>x.id),["old","remote"]);
 assert.equal(neighbors[0].similarity,1);
 assert.equal(neighbors[0].title,"Brussels protests 2024");
 assert.equal("duplicate" in neighbors[0],false);
});
test("SLOP rotates frozen formats independently of REAL and varies the first format between topics",()=>{
 const topics=["00000000-0000-0000-0000-000000000000","00000001-0000-0000-0000-000000000000","00000002-0000-0000-0000-000000000000"];
 assert.equal(new Set(topics.map(t=>topicImageFormatChoice(t,0).variant)).size,3);
 for(const topic of topics){
  const formats=[0,1,2].map(slot=>topicImageFormatChoice(topic,slot).variant);
  assert.equal(new Set(formats).size,3);
  assert.equal(topicImageFormatChoice(topic,0).variant,topicImageFormatChoice(topic,3).variant);
 }
});
