/** Private observed attributes, variation controls and coherent scene contracts. */
export const PARAMETERS = {
  model: "Model", colour: "Color", material_finish: "Material and finish", edition_decoration: "Edition and decoration",
  wear: "Wear", damage: "Damage", ageing: "Ageing", cleanliness: "Cleanliness", operating_state: "Operating state",
  screen_content: "Screen content", pose: "Pose", viewpoint: "Camera viewpoint", composition: "Composition", aspect_ratio: "Aspect ratio",
} as const;
export type Parameter = keyof typeof PARAMETERS;
export const PARAMETER_KEYS = Object.keys(PARAMETERS) as Parameter[];
export const AXES = ["subject_type", "subject_appearance", "people", "environment", "viewpoint", "light", "technique", "rendering"] as const;
export type Scene = Record<typeof AXES[number], string>;
export interface Attribute { value: string; category: string; certainty: "observed" | "inferred" | "unknown" }
export interface Peculiarity { description: string; region: string; parameter: Parameter; role: "identity" | "specimen" | "temporary";
  policy: "preserve" | "vary" | "draw"; certainty: "observed" | "inferred" | "unknown" }
export interface Profile { genre: string; parameters: Record<Parameter, Attribute>; peculiarities: Peculiarity[] }
export interface PipelineSettings { rules: string; probabilities: Partial<Record<Parameter, number>>;
  environment: "auto" | "keep" | "same_genre" | "change_genre"; novelty: number }
export interface Variation { selected: Parameter[]; targets: Partial<Record<Parameter, Attribute>>; environment: Exclude<PipelineSettings["environment"], "auto">; novelty: boolean; genre?: string; balance?: string }
export const objectSchema = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const string = { type: "string" };
const certainty = { type: "string", enum: ["observed", "inferred", "unknown"] };
export const PROFILE_SCHEMA = objectSchema({ genre: string, parameters: objectSchema(Object.fromEntries(PARAMETER_KEYS.map(key => [key,
  objectSchema({ value: string, category: string, certainty })]))), peculiarities: { type: "array", items: objectSchema({
  description: string, region: string, parameter: { type: "string", enum: PARAMETER_KEYS }, role: { type: "string", enum: ["identity", "specimen", "temporary"] },
  policy: { type: "string", enum: ["preserve", "vary", "draw"] }, certainty,
}) } });
export const SCENE_SCHEMA = objectSchema(Object.fromEntries(AXES.map(axis => [axis, string])));
export interface Proposal { profile: Profile; scene: Scene; changes: string; dependencies: string; genre: string; aspect_ratio: string }
export const PROPOSAL_SCHEMA = objectSchema({ profile: PROFILE_SCHEMA, scene: SCENE_SCHEMA, changes: string, dependencies: string, genre: string, aspect_ratio: string });
export interface Correction { defect: string; region: { x: number; y: number; width: number; height: number };
  instruction: string; benefit: string; risk: string }
export interface Review { findings: string[]; uncertainties: string[]; assessment: string; corrections: Correction[] }
export const REVIEW_SCHEMA = objectSchema({ findings: { type: "array", items: string }, uncertainties: { type: "array", items: string }, assessment: string,
  corrections: { type: "array", items: objectSchema({ defect: string, region: objectSchema(Object.fromEntries(["x", "y", "width", "height"].map(k => [k, { type: "number" }]))),
    instruction: string, benefit: string, risk: string }) } });
export function validProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const p = value as Profile;
  return typeof p.genre === "string" && !!p.genre.trim() && PARAMETER_KEYS.every(k => p.parameters?.[k]
    && typeof p.parameters[k].value === "string" && typeof p.parameters[k].category === "string"
    && ["observed", "inferred", "unknown"].includes(p.parameters[k].certainty)) && Array.isArray(p.peculiarities)
    && p.peculiarities.every(x => typeof x.description === "string" && typeof x.region === "string" && PARAMETER_KEYS.includes(x.parameter)
      && ["identity", "specimen", "temporary"].includes(x.role) && ["preserve", "vary", "draw"].includes(x.policy)
      && ["observed", "inferred", "unknown"].includes(x.certainty));
}
/** Canonical balancing key: case, accents, spaces, hyphens and underscores never split one category into several. */
export function normalizeCategory(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "unspecified";
}
/** Copy with canonical genre and categories; free-text values and peculiarities are untouched. */
export function normalizeProfile(profile: Profile): Profile {
  return { ...profile, genre: normalizeCategory(profile.genre), parameters: Object.fromEntries(PARAMETER_KEYS.map(key =>
    [key, { ...profile.parameters[key], category: normalizeCategory(profile.parameters[key].category) }])) as Profile["parameters"] };
}
export type Vocabulary = Partial<Record<Parameter | "genre", string[]>>;
/** Dictionary of the categories already used in a gallery, most frequent first, so independent model calls reuse the same names.
 * The cap only bounds pathological galleries: ordinary ones send every existing keyword. */
export function vocabulary(profiles: Profile[], limit = 200): Vocabulary {
  const out: Vocabulary = {};
  for (const key of ["genre", ...PARAMETER_KEYS] as const) {
    const counts = new Map<string, number>();
    for (const p of profiles) {
      if (key !== "genre" && p.parameters[key].certainty === "unknown") continue;
      const category = normalizeCategory(key === "genre" ? p.genre : p.parameters[key].category);
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    if (counts.size) out[key] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([category]) => category);
  }
  return out;
}
/** Groups share a donor for selected controls; unselected known controls constrain compatibility. */
const DRAW_GROUPS: readonly (readonly Parameter[])[] = [
  ["model", "colour", "material_finish", "edition_decoration", "operating_state", "screen_content"],
  ["pose", "viewpoint", "composition", "aspect_ratio"],
  ["wear"], ["damage"], ["ageing"], ["cleanliness"],
];
const knownAttribute = (attribute: Attribute) => attribute.certainty !== "unknown"
  && !["unknown", "unspecified"].includes(attribute.category);
/** Anonymous provisional intent, used only while drawing a confirmed group of scenes. */
export function projectedProfile(source: Profile, draw: Variation): Profile {
  return normalizeProfile({ ...source, genre: draw.genre ?? source.genre, parameters: { ...source.parameters, ...draw.targets } });
}
const CONTEXT_KEYS: readonly Parameter[] = ["pose", "viewpoint", "composition", "aspect_ratio"];
/** Prefer a destination only when it reduces the next-photo distribution gap compared with keeping the source.
 * Equal improvements preserve empirical REAL frequencies. No observed SLOP means no evidence for a forced transition. */
function destination(source: Profile, population: Profile[], generated: Profile[], signature: (p: Profile) => string | null, random: () => number): Profile | undefined {
  const real = population.filter(p => signature(p) !== null), slop = generated.filter(p => signature(p) !== null);
  const initial = signature(source);
  if (!real.length || !slop.length || initial === null) return;
  const counts = (items: Profile[]) => { const out = new Map<string, number>(); for (const p of items) { const key = signature(p)!; out.set(key, (out.get(key) ?? 0) + 1); } return out; };
  const r = counts(real), s = counts(slop);
  // Adding a photo changes only its category term; the other absolute-distance terms cancel between destinations.
  const delta = (key: string) => { const count = (s.get(key) ?? 0) / (slop.length + 1), target = (r.get(key) ?? 0) / real.length;
    return Math.abs(count + 1 / (slop.length + 1) - target) - Math.abs(count - target); };
  const baseline = delta(initial), scores = new Map([...r.keys()].map(key => [key, delta(key)])), best = Math.min(...scores.values());
  if (best >= baseline - 1e-9) return;
  const choices = real.filter(p => scores.get(signature(p)!)! <= best + 1e-9);
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
/** Genre first, then the jointly observed photographic context within that genre. Hardware identity stays independent. */
function automaticContext(source: Profile, population: Profile[], generated: Profile[], random: () => number) {
  const genreKey = (p: Profile) => ["unknown", "unspecified"].includes(p.genre) ? null : p.genre;
  const genre = destination(source, population, generated, genreKey, random);
  const targetGenre = genre?.genre ?? source.genre;
  const real = population.filter(p => p.genre === targetGenre), slop = generated.filter(p => p.genre === targetGenre);
  const signature = (p: Profile) => CONTEXT_KEYS.every(k => knownAttribute(p.parameters[k])) ? JSON.stringify(CONTEXT_KEYS.map(k => p.parameters[k].category)) : null;
  // On a genre transition the selected REAL supplies a coherent context; otherwise only a measured context deficit changes it.
  const context = genre ? (signature(genre) ? genre : undefined) : destination(source, real, slop, signature, random);
  return { genre: targetGenre, context, environment: genre ? "change_genre" as const : context ? "same_genre" as const : "keep" as const,
    balance: genre ? "Change genre to reduce its observed REAL–SLOP distribution gap." : context ? "Change environment and photographic context within the genre to reduce the observed context gap." : "Keep environment and genre: no supported transition improves the observed distribution gap." };
}
/** Empirical sampling preserves observed combinations, without forcing additional controls to change. */
export function variation(source: Profile, population: Profile[], settings: PipelineSettings, random: () => number = Math.random, generated: Profile[] = []): Variation {
  source = normalizeProfile(source); population = population.map(normalizeProfile); generated = generated.map(normalizeProfile);
  const automatic = settings.environment === "auto" ? automaticContext(source, population, generated, random) : undefined;
  const environment = automatic?.environment ?? (settings.environment === "auto" ? "keep" : settings.environment);
  const targetGenre = automatic?.genre ?? source.genre;
  const selected: Parameter[] = [], targets: Variation["targets"] = {};
  if (automatic?.context) for (const key of CONTEXT_KEYS) { selected.push(key); targets[key] = automatic.context.parameters[key]; }
  // Selection probabilities remain per parameter; compatible target values are drawn together afterwards.
  const requested = new Set(PARAMETER_KEYS.filter(key => {
    if (automatic?.context && CONTEXT_KEYS.includes(key)) return false;
    let donors = population.filter(p => knownAttribute(p.parameters[key]));
    if (["edition_decoration", "material_finish", "operating_state", "screen_content"].includes(key)) {
      const matching = donors.filter(p => p.parameters.model.category === source.parameters.model.category);
      if (matching.length) donors = matching;
    }
    if (["viewpoint", "composition", "aspect_ratio"].includes(key) && environment !== "change_genre") {
      const matching = donors.filter(p => p.genre === targetGenre);
      if (matching.length) donors = matching;
    }
    if (!donors.length) return false;
    const counts = new Map<string, number>();
    for (const p of donors) counts.set(p.parameters[key].category, (counts.get(p.parameters[key].category) || 0) + 1);
    const automaticProbability = Math.min(.4, Math.max(.05, 1 - Math.max(...counts.values()) / donors.length));
    return random() < (settings.probabilities[key] ?? automaticProbability);
  }));
  for (const group of DRAW_GROUPS) {
    const keys = group.filter(key => requested.has(key));
    if (!keys.length) continue;
    const fixed = group.filter(key => !requested.has(key) && knownAttribute(source.parameters[key]));
    const model = targets.model ?? source.parameters.model;
    const compatible = (p: Profile) => keys.every(key => knownAttribute(p.parameters[key]))
      && fixed.every(key => knownAttribute(p.parameters[key]) && p.parameters[key].category === source.parameters[key].category)
      // A screen belongs to a known fixed model, or to the model drawn from this same donor.
      && (!keys.some(key => key === "operating_state" || key === "screen_content") || requested.has("model")
        || knownAttribute(model) && knownAttribute(p.parameters.model) && p.parameters.model.category === model.category)
      && (group[0] !== "pose" || (environment === "change_genre" && !automatic) || p.genre === targetGenre)
      // Varying content alone must not reveal a concealed screen or turn on an inactive one.
      && (!keys.includes("screen_content") || requested.has("operating_state") || source.parameters.screen_content.category !== "not_applicable"
        || p.parameters.screen_content.category === "not_applicable");
    const donors = population.filter(compatible), comparable = generated.filter(compatible);
    if (!donors.length) continue; // Keep this group's initial values; no incompatible fallback or hidden extra change.
    const signature = (p: Profile) => JSON.stringify(keys.map(key => p.parameters[key].category));
    const counts = (profiles: Profile[]) => {
      const out = new Map<string, number>();
      for (const p of profiles) { const key = signature(p); out.set(key, (out.get(key) || 0) + 1); }
      return out;
    };
    const realCounts = counts(donors), slopCounts = counts(comparable);
    const weights = donors.map(p => {
      const category = signature(p), realShare = realCounts.get(category)! / donors.length;
      const slopShare = ((slopCounts.get(category) || 0) + 5 * realShare) / (comparable.length + 5);
      return Math.min(4, Math.max(.25, realShare / slopShare));
    });
    let at = random() * weights.reduce((n, w) => n + w, 0), index = 0;
    while (index < weights.length - 1 && at >= weights[index]) at -= weights[index++];
    for (const key of keys) { selected.push(key); targets[key] = donors[index].parameters[key]; }
  }
  return { selected: PARAMETER_KEYS.filter(key => selected.includes(key)), targets, environment, novelty: random() < settings.novelty, ...(automatic ? { genre: targetGenre, balance: automatic.balance } : {}) };
}
/** The API dimensions follow the target ratio; record approximation, never silently force landscape. */
export function imageSize(ratio: string): string {
  const match = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(ratio);
  if (!match || +match[1] <= 0 || +match[2] <= 0) throw Error("Invalid aspect ratio");
  const r = +match[1] / +match[2];
  if (r < .25 || r > 4) throw Error("Aspect ratio out of range");
  return r >= 1 ? `1536x${Math.max(384, Math.round(1536 / r / 16) * 16)}` : `${Math.max(384, Math.round(1536 * r / 16) * 16)}x1536`;
}
