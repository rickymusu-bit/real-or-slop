export const VISUAL_SECTIONS = {
  summary: "Descrizione complessiva",
  subject_type: "Tipo del soggetto",
  subject_appearance: "Aspetto del soggetto",
  people: "Persone",
  environment: "Ambiente",
  viewpoint: "Punto di vista e inquadratura",
  light: "Luci e ombre",
  technique: "Medium e tecnica fotografica",
  rendering: "Resa fotografica",
  uncertainties: "Incertezze",
} as const;

export type VisualSection = keyof typeof VISUAL_SECTIONS;
export const VISUAL_KEYS = Object.keys(VISUAL_SECTIONS) as VisualSection[];
export const VISUAL_INDICATIONS = {
  museum_or_catalog: "Foto da museo o da catalogo",
  unique_or_famous: "Esemplare unico o famoso",
  recognizable_background: "Sfondo riconoscibile",
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
