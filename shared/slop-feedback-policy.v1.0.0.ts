/** Independent SLOP prompt learning feedback policy, v1.0.0.
 * A generation failure is a negative prompt example but not evidence of taste.
 * Rights/provenance/technical issues are never scored as aesthetic preference.
 */
export type SlopFeedbackReason = "editorial" | "generation" | "technical" | "rights" | "provenance";
export function validSlopPromptFeedback(decision: unknown, reason: unknown): boolean {
  if (decision !== "approved" && decision !== "rejected") return false;
  if (reason === "editorial") return true;
  return decision === "rejected" && reason === "generation";
}
export function slopPromptFeedbackSignal(
  decision: "approved" | "rejected", reason: SlopFeedbackReason,
): "liked" | "disliked" | "generation_defect" | null {
  if (!validSlopPromptFeedback(decision, reason)) return null;
  if (reason === "generation") return "generation_defect";
  return decision === "approved" ? "liked" : "disliked";
}
