/** OpenAI models offered in Settings (spec `libreria-immagini`, section 6): text models and image models with their
 * qualities and known shutdown dates. Only the selectors, no prices. */
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
