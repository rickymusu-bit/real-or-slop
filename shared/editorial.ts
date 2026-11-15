/** Private editorial descriptions and immutable briefs. Never sent to players. */
export interface RealDescription { visible: string; documented_context: string; uncertainties: string }
export interface Brief { required: string[]; preferred: string[]; flexible: string[]; exclusions: string[] }
export const DESCRIPTION_KEYS = ["visible", "documented_context", "uncertainties"] as const;
export const BRIEF_KEYS = ["required", "preferred", "flexible", "exclusions"] as const;
export const descriptionSchema = { type: "object", additionalProperties: false, required: [...DESCRIPTION_KEYS],
  properties: Object.fromEntries(DESCRIPTION_KEYS.map(k => [k, { type: "string", maxLength: 3000 }])) };
export const briefSchema = { type: "object", additionalProperties: false, required: [...BRIEF_KEYS],
  properties: Object.fromEntries(BRIEF_KEYS.map(k => [k, { type: "array", minItems: k === "required" ? 1 : 0, maxItems: 12, items: { type: "string", maxLength: 500 } }])) };
export function realDescription(value: unknown): RealDescription | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !(DESCRIPTION_KEYS as readonly string[]).includes(k)) ||
    DESCRIPTION_KEYS.some(k => typeof v[k] !== "string" || (v[k] as string).length > 3000) || !(v.visible as string).trim()) return null;
  return Object.fromEntries(DESCRIPTION_KEYS.map(k => [k, (v[k] as string).trim()])) as unknown as RealDescription;
}
export function validBrief(value: unknown): Brief | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !(BRIEF_KEYS as readonly string[]).includes(k)) || BRIEF_KEYS.some(k =>
    !Array.isArray(v[k]) || v[k].length > 12 || v[k].some((s: unknown) => typeof s !== "string" || !s.trim() || s.length > 500)) || !(v.required as unknown[]).length) return null;
  return Object.fromEntries(BRIEF_KEYS.map(k => [k, (v[k] as string[]).map(s => s.trim())])) as unknown as Brief;
}
export const DECISIONS = ["accept", "retry_same_prompt", "revise_prompt", "replan_scene", "review_needed"] as const;
export interface Evaluation {
  attempt_id: string; decision: typeof DECISIONS[number]; critical_findings: string[]; minor_findings: string[];
  editorial_constraints_met: boolean; uncertainty_notes: string[]; action_reason: string; revised_prompt: string;
  preserved_required: string[]; preserved_exclusions: string[];
}
export function validEvaluation(value: unknown, attemptId: string, brief: Brief): Evaluation | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Evaluation;
  if (v.attempt_id !== attemptId || !DECISIONS.includes(v.decision) || typeof v.editorial_constraints_met !== "boolean" ||
    typeof v.action_reason !== "string" || !v.action_reason.trim() || v.action_reason.length > 3000 ||
    typeof v.revised_prompt !== "string" || v.revised_prompt.length > 4000 ||
    [v.critical_findings, v.minor_findings, v.uncertainty_notes, v.preserved_required, v.preserved_exclusions].some(a =>
      !Array.isArray(a) || a.length > 30 || a.some(s => typeof s !== "string" || !s.trim() || s.length > 3000))) return null;
  if (v.decision === "accept" && (v.critical_findings.length || !v.editorial_constraints_met || v.uncertainty_notes.length))
    return { ...v, decision: "review_needed" };
  if (["revise_prompt", "replan_scene"].includes(v.decision) && (!v.revised_prompt.trim() ||
    JSON.stringify(v.preserved_required) !== JSON.stringify(brief.required) || JSON.stringify(v.preserved_exclusions) !== JSON.stringify(brief.exclusions)))
    return { ...v, decision: "review_needed" };
  return v;
}
