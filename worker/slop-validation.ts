import { buildSlopPrompt, fictionalMechanisms, proposeSlopReveal, slopChoices, slopTextLimits, validGenerationDate, type SlopPlan } from "../shared/slop";
import { HttpError } from "./core";
import { httpsUrl } from "./import";

export function validateSlopPlan(value: unknown): SlopPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Scheda SLOP richiesta");
  const input = value as Record<string, unknown>;
  const fields = [...Object.keys(slopTextLimits), ...Object.keys(slopChoices), "schema_version", "iteration", "documented_facts", "owner_declaration"];
  if (Object.keys(input).some((key) => !fields.includes(key))) throw new HttpError(400, "Campo SLOP sconosciuto");
  const plan: Record<string, unknown> = {};
  for (const [key, max] of Object.entries(slopTextLimits)) {
    const field = input[key] ?? "";
    if (typeof field !== "string" || field.length > max) throw new HttpError(400, `Campo SLOP non valido: ${key}`);
    plan[key] = key === "prompt" ? field : field.trim();
  }
  for (const [key, choices] of Object.entries(slopChoices)) {
    const field = input[key] ?? (key === "profile" ? "facile" : "");
    if (typeof field !== "string" || (field !== "" && !(choices as readonly string[]).includes(field)) || (key === "profile" && !field))
      throw new HttpError(400, `Classificazione SLOP non valida: ${key}`);
    plan[key] = field;
  }
  if (!plan.title) throw new HttpError(400, "Titolo richiesto");
  if (input.schema_version !== undefined && input.schema_version !== 1) throw new HttpError(400, "Versione scheda non supportata");
  const iteration = input.iteration ?? 1;
  if (!Number.isInteger(iteration) || Number(iteration) < 1 || Number(iteration) > 1000) throw new HttpError(400, "Iterazione da 1 a 1000");
  if (input.owner_declaration !== undefined && typeof input.owner_declaration !== "boolean") throw new HttpError(400, "Dichiarazione non valida");
  const facts = input.documented_facts ?? [];
  if (!Array.isArray(facts) || facts.length > 6) throw new HttpError(400, "Massimo sei fatti documentati");
  plan.documented_facts = facts.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).some((key) => !["fact", "source_title", "reference_url"].includes(key)))
      throw new HttpError(400, "Fatto documentato non valido");
    const fact = item as Record<string, unknown>;
    for (const [key, max] of [["fact", 500], ["source_title", 200], ["reference_url", 1000]] as const)
      if (typeof fact[key] !== "string" || !fact[key].trim() || fact[key].length > max) throw new HttpError(400, "Fatto, fonte e URL richiesti");
    return { fact: String(fact.fact).trim(), source_title: String(fact.source_title).trim(), reference_url: httpsUrl(String(fact.reference_url).trim()) };
  });
  if (plan.generation_source_url) httpsUrl(String(plan.generation_source_url));
  if (plan.license_url) httpsUrl(String(plan.license_url));
  if (plan.generation_date && !validGenerationDate(String(plan.generation_date))) throw new HttpError(400, "Data di generazione non valida");
  if (["difficile", "esperto"].includes(String(plan.profile)) && plan.cognitive_mechanism && !fictionalMechanisms.includes(String(plan.cognitive_mechanism)))
    throw new HttpError(400, "Difficile/Esperto: scegliere un'invenzione plausibile, senza errori tecnici o anacronismi intenzionali");
  return { ...plan, schema_version: 1, iteration: Number(iteration), owner_declaration: input.owner_declaration === true } as SlopPlan;
}
export function slopProposals(plan: SlopPlan) {
  const prompt = buildSlopPrompt(plan), reveal = proposeSlopReveal(plan);
  if (prompt.length > 8000 || reveal.length > 4000) throw new HttpError(400, "Proposta troppo lunga: sintetizzare scena o fatti documentati senza perdere le fonti");
  return { prompt, reveal };
}
export function validateSlopImport(plan: SlopPlan, checks: Record<string, unknown>) {
  if (plan.profile === "esperto") throw new HttpError(409, "Esperto è soltanto un template editoriale: importazione non abilitata");
  const required = ["category_id", "subcategory_id", "country", "place", "period", "subject", "subject_kind", "country_or_region", "period_bucket", "image_medium", "composition", "cognitive_mechanism", "scene_description", "fictional_claim", "single_clue", "period_accurate_details", "technical_treatment", "ai_model", "generation_owner", "generation_source_url", "generation_version", "generation_date", "prompt", "reveal_explanation"] as const;
  if (required.some((key) => !plan[key].trim()) || !plan.documented_facts.length) throw new HttpError(400, "Completare concept, fatti con fonti e dati della generazione esterna prima dell'importazione");
  if (plan.prompt.includes("[Da compilare e verificare dal revisore]") || plan.prompt.includes("[Nessun fatto documentato fornito") || plan.reveal_explanation.includes("Contesto non ancora documentato"))
    throw new HttpError(400, "Completare o ricostruire prompt e spiegazione: la proposta contiene ancora segnaposto");
  if (!plan.owner_declaration || ["facts_confirmed", "rights_confirmed", "safety_confirmed", "comparability_confirmed"].some((key) => checks[key] !== true))
    throw new HttpError(400, "Confermare dichiarazione di generazione, fatti, diritti, scena innocua e comparabilità con REAL");
  if (!validGenerationDate(plan.generation_date) || plan.generation_date > new Date().toISOString().slice(0, 10)) throw new HttpError(400, "La data deve riferirsi a una generazione già avvenuta");
}
