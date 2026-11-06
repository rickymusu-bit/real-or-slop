import policy from "./editorial-photography.v1.0.0.json";
export {policy as photographyPolicy};
export type PhotographyProfile = typeof policy.profiles[number];
export function photographyDirective(profile:PhotographyProfile) {
  const fields=profile as unknown as Record<string,string|number>;
  return "\nPhotographic capture brief:\n"+policy.general_directive+"\n"+policy.template.replace(/\{(\w+)\}/g,(_,key:string)=>String(fields[key]));
}
