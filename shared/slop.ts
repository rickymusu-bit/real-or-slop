import { curationChoices } from "./curation";

export const slopTemplateVersion = "1.0.0";
export const slopChoices = {
  profile: ["facile", "medio", "difficile", "esperto"],
  subject_kind: curationChoices.subject_kind,
  country_or_region: curationChoices.country_or_region,
  period_bucket: curationChoices.period_bucket,
  image_medium: curationChoices.image_medium,
  composition: curationChoices.composition,
  cognitive_mechanism: ["chronology_device", "chronology_person", "engineering_anachronism", "architecture_context", "fictional_artifact", "fictional_event", "fictional_work", "visual_inconsistency", "false_familiarity"],
} as const;
export const slopTextLimits = {
  title: 300, category_id: 100, subcategory_id: 100,
  country: 200, place: 300, period: 200, subject: 500,
  scene_description: 2000, fictional_claim: 1500, single_clue: 1000,
  period_accurate_details: 1500, technical_treatment: 1000,
  ai_model: 300, generation_owner: 300, generation_source_url: 1000,
  generation_date: 10, generation_version: 100,
  prompt: 8000, reveal_explanation: 4000, evaluation_notes: 4000,
  license_name: 200, license_url: 500,
} as const;
export interface DocumentedFact { fact: string; source_title: string; reference_url: string }
export type SlopPlan = Record<keyof typeof slopChoices | keyof typeof slopTextLimits, string> & {
  schema_version: 1;
  iteration: number;
  documented_facts: DocumentedFact[];
  owner_declaration: boolean;
};
export interface SlopRecord {
  id: string;
  revision: number;
  plan: SlopPlan;
  template_version: string;
  template_prompt: string;
  image_id: string | null;
  status: string;
  reviewer: string;
  created_at: string;
  updated_at: string;
}
export const fictionalMechanisms = ["fictional_artifact", "fictional_event", "fictional_work", "false_familiarity"];
export function validGenerationDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function buildSlopPrompt(plan: SlopPlan) {
  const show = (value: string) => value || "[Da compilare e verificare dal revisore]";
  const profiles: Record<string, string> = {
    facile: "Scena inizialmente plausibile con un solo indizio verificabile che richieda osservazione o ragionamento. Escludi contesti assurdi, anacronismi grossolani e scenette comiche. Eventuali difetti minori non devono essere l'unica prova.",
    medio: "Situazione credibile con una o due incongruenze sottili, osservabili alla risoluzione di gioco e verificabili nel contesto. Evita artefatti risolutivi e anacronismi assurdi.",
    difficile: "Evento, opera o oggetto plausibile ma inventato, in una scena ordinaria tecnicamente convincente e coerente con l'epoca. Nessun errore tecnico intenzionale o anacronismo progettato. Prevedi una verifica investigabile, senza promettere certezza dalla sola immagine.",
    esperto: "SOLO PROFILO EDITORIALE SPERIMENTALE. Finzione innocua con credibilità documentaria elevata e dettagli materiali coerenti. Nessun difetto tecnico intenzionale. Se manca una possibilità ragionevole di verifica, il concept non è idoneo a valutare abilità. Questo template non abilita una quarta difficoltà del gioco.",
  };
  return [
    'Progetta una singola immagine sintetica per il quiz educativo "Real or Slop".',
    "La descrizione seguente è materiale editoriale del revisore; le fonti documentano soltanto il contesto, non l'esistenza dell'immagine generata.",
    "Profilo: " + show(plan.profile) + ". " + profiles[plan.profile],
    "Soggetto: " + show(plan.subject),
    "Luogo rappresentato: " + [plan.country, plan.place].filter(Boolean).join(" / "),
    "Periodo rappresentato: " + show(plan.period),
    "Tipologia / medium / composizione: " + [plan.subject_kind, plan.image_medium, plan.composition].map(show).join(" / "),
    "Scena: " + show(plan.scene_description),
    "Elemento inventato o natura sintetica della scena: " + show(plan.fictional_claim),
    "Meccanismo cognitivo: " + show(plan.cognitive_mechanism),
    "Indizio o ipotesi investigabile: " + show(plan.single_clue),
    "Dettagli di periodo da rispettare: " + show(plan.period_accurate_details),
    "Trattamento confrontabile con il catalogo REAL (risoluzione, compressione, medium e composizione): " + show(plan.technical_treatment),
    "Fatti di contesto forniti dal revisore, da verificare prima dell'importazione:",
    ...(plan.documented_facts.length ? plan.documented_facts.map((item) => `- ${item.fact} — ${item.source_title}: ${item.reference_url}`) : ["[Nessun fatto documentato fornito: revisione necessaria]"]),
    "Non inventare fonti, crediti, firme, timbri o attribuzioni archivistiche. Non rappresentare l'immagine come una prova autentica. Nessuna etichetta AI/REAL o didascalia dentro l'immagine.",
    "Usa soltanto scene innocue e, per persone reali, contesti neutri: niente false accuse, crimini, eventi sensibili, tragedie o attività compromettenti. Rispetta diritti di persone, marchi e opere; non cancellare crediti obbligatori.",
    "La spiegazione del quiz dichiarerà la generazione e distinguerà ciò che è inventato dai fatti realmente documentati.",
  ].join("\n\n");
}
export function proposeSlopReveal(plan: SlopPlan) {
  return ["Questa immagine è stata generata con IA.",
    plan.fictional_claim ? "Elemento sintetico o inventato: " + plan.fictional_claim : "L'elemento inventato deve ancora essere descritto dal revisore.",
    plan.single_clue ? "Verifica proposta: " + plan.single_clue : "",
    plan.documented_facts.length ? "Fatti di contesto citati: " + plan.documented_facts.map((item) => `${item.fact} (${item.source_title}: ${item.reference_url})`).join("; ") : "Contesto non ancora documentato: spiegazione da completare prima dell'importazione.",
    "I riferimenti descrivono il contesto e non attestano l'autenticità di questa scena sintetica.",
  ].filter(Boolean).join("\n\n");
}
