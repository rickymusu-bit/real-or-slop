/** Post-acquisition, pixel-only editorial taxonomy suggestion, v1.0.0. */
import taxonomy from "./real-discovery-taxonomy.v1.0.0.json";
export const allowedTopics=taxonomy.topics.map(x=>x.id);
export const allowedEmotions=taxonomy.emotions.map(x=>x.id);
export const allowedIntensities=["low","medium","high"] as const;
export interface SuggestedTaxonomy {
  topic:string; emotion:string; intensity:"low"|"medium"|"high";
  uncertain:boolean; status:"suggested"; version:string;
}
export function proposedTaxonomy(input:unknown):SuggestedTaxonomy {
  if(!input || typeof input!=="object" || Array.isArray(input))
    throw Error("Classificazione non valida");
  const value=input as Record<string,unknown>;
  const topic=value.taxonomy_topic, emotion=value.taxonomy_emotion,
    intensity=value.taxonomy_intensity, uncertain=value.taxonomy_uncertain;
  if(typeof topic!=="string"||!allowedTopics.includes(topic)||
    typeof emotion!=="string"||!allowedEmotions.includes(emotion)||
    !allowedIntensities.includes(intensity as "low"|"medium"|"high")||
    typeof uncertain!=="boolean")
    throw Error("Classificazione al di fuori della tassonomia");
  return {topic,emotion,
    intensity:emotion==="neutrality"?"low":intensity as "low"|"medium"|"high",
    uncertain,status:"suggested",version:taxonomy.version};
}
export function validTaxonomyProposal(input:unknown):input is SuggestedTaxonomy {
  if(!input || typeof input!=="object" || Array.isArray(input))return false;
  const x=input as Record<string,unknown>;
  return x.status==="suggested" && x.version===taxonomy.version &&
    typeof x.topic==="string" && allowedTopics.includes(x.topic) &&
    typeof x.emotion==="string" && allowedEmotions.includes(x.emotion) &&
    allowedIntensities.includes(x.intensity as "low"|"medium"|"high") &&
    typeof x.uncertain==="boolean" &&
    (x.emotion!=="neutrality"||x.intensity==="low");
}
