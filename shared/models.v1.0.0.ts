/** OpenAI models offered in the dashboard Settings (docs/wizard-slop.v1.4.0.md, section 12). v1.0.0, 2026-11-10T22:11:48Z.
 * Owner decision of 2026-11-10: only the selectors, no prices; for now only OpenAI. Ids as listed on the official pricing
 * page (developers.openai.com/api/docs/pricing, standard tier) on 2026-11-10. 2026-11-11T05:36:59Z: default image model gpt-image-2.5-flare,
 * since OpenAI shuts gpt-image-2 down on 2027-02-10 (deprecation notice to the owner, 2026-11-11). */
export const TEXT_MODELS = ["gpt-6-astra", "gpt-6.1-sol", "gpt-6.1-terra", "gpt-6-luna", "gpt-6-sol", "gpt-5.6-sol", "gpt-5.6-terra",
  "gpt-5.6-luna", "gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-pro", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.2", "gpt-5.2-pro", "gpt-5.1",
  "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5-pro", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o3-pro", "o3"] as const;
/** Image models and the qualities each accepts. */
export const IMAGE_MODELS: Record<string, readonly string[]> = {
  "gpt-image-2.6-flare": ["low", "medium", "high", "xhigh", "max"],
  "gpt-image-2.6-sunburst": ["low", "medium", "high", "xhigh", "max"],
  "gpt-image-2.5-flare": ["low", "medium", "high", "xhigh", "max"],
  "gpt-image-2.5-sunburst": ["low", "medium", "high", "xhigh", "max"],
  "gpt-image-2": ["low", "medium", "high"],
  "gpt-image-1.5": ["low", "medium", "high"],
  "gpt-image-1-mini": ["low", "medium", "high"],
  "chatgpt-image-latest": ["low", "medium", "high"],
};
export const DEFAULT_TEXT_MODEL = "gpt-6.1-terra", DEFAULT_IMAGE_MODEL = "gpt-image-2.5-flare";
/** Shutdown dates announced by OpenAI, shown beside the model in the menu. */
export const SHUTDOWN: Record<string, string> = { "gpt-image-2": "2027-02-10" };
export type ModelKind = "text_model" | "image_model";
export const isTextModel = (value: unknown): value is string => typeof value === "string" && (TEXT_MODELS as readonly string[]).includes(value);
export const isImageModel = (value: unknown): value is string => typeof value === "string" && value in IMAGE_MODELS;
