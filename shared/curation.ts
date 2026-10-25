// Vocabulary only: no image records or answers are bundled with the client.
export const curationChoices = {
  subject_kind: ["fotografia_storica", "arte_scultura", "architettura", "infrastruttura", "trasporti", "scienza_natura", "personaggi", "cinema_locandine", "altro"],
  country_or_region: ["europa", "africa", "asia", "america_nord", "america_centro_sud", "oceania", "antartide", "multiregionale"],
  period_bucket: ["prima_1800", "1800_1899", "1900_1945", "1946_1999", "2000_oggi", "multiperiodo"],
  image_medium: ["foto_colori", "foto_bn", "dipinto", "scultura", "poster", "stampa", "riproduzione", "altro"],
  composition: ["ritratto", "scena_ampia", "dettaglio", "still_life", "altro"],
  familiarity: ["alta", "media", "bassa"],
  perceived_plausibility: ["ordinaria", "sorprendente", "molto_insolita"],
  cognitive_mechanism: ["osservazione", "inferenza_temporale", "confronto_oggetti", "aspettative_tecnologiche", "aspettative_epoca_paese", "effetto_autorita", "chronology_device", "chronology_person", "engineering_anachronism", "architecture_context", "fictional_artifact", "fictional_event", "fictional_work", "visual_inconsistency", "false_familiarity", "altro"],
  quality_bucket: ["alta", "media", "bassa"],
  authenticity_confidence: ["da_verificare", "documentata", "incerta"],
} as const;
export const curationTextLimits = {
  represented_country: 200,
  represented_place: 300,
  represented_period: 200,
  verified_place: 300,
  verified_date: 200,
  fact_evidence: 4000,
  visual_style: 300,
  surprise_reason: 2000,
  reveal_learning_point: 2000,
  reviewer_notes: 4000,
} as const;
export type CurationField = keyof typeof curationChoices | keyof typeof curationTextLimits;
export type CurationValues = Record<CurationField, string | null>;
export type CurationRecord = CurationValues & {
  image_id: string;
  revision: number;
  reviewer: string;
  updated_at: string;
};
