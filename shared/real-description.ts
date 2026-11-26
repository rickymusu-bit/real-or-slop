export const VISUAL_SECTIONS = {
  summary: "Overall description",
  subject_type: "Subject identity",
  subject_appearance: "Subject appearance",
  people: "People",
  environment: "Environment",
  viewpoint: "Viewpoint and framing",
  light: "Light and shadows",
  technique: "Medium and photographic technique",
  rendering: "Photographic rendering",
  uncertainties: "Uncertainties",
} as const;

export type VisualSection = keyof typeof VISUAL_SECTIONS;
export const VISUAL_KEYS = Object.keys(VISUAL_SECTIONS) as VisualSection[];
export const VISUAL_INDICATIONS = {
  museum_or_catalog: "Museum or catalog photo",
  unique_or_famous: "Unique or famous specimen",
  recognizable_background: "Recognizable background",
} as const;
export type VisualIndication = keyof typeof VISUAL_INDICATIONS;
export const INDICATION_KEYS = Object.keys(VISUAL_INDICATIONS) as VisualIndication[];
export interface VisualDescription {
  sections: Record<VisualSection, string>;
  indications: Record<VisualIndication, { applies: boolean; reason: string }>;
  model: string;
  created_at: string;
  base_context: string;
}
