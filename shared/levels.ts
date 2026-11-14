/** Levels, score, nickname and game code of the level game (spec `gioco-a-livelli`). Four levels written in the code;
 * score = photos × (2 × balanced accuracy − 1); nickname check against indecent words; game code shown once, stored as a hash. */
export const LEVELS = {
  facile: { label: "Facile", photos: 10, seconds: 20 },
  medio: { label: "Medio", photos: 15, seconds: 15 },
  difficile: { label: "Difficile", photos: 20, seconds: 10 },
  esperto: { label: "Esperto", photos: 25, seconds: 5 },
} as const;
export type Level = keyof typeof LEVELS;
export const LEVEL_IDS = Object.keys(LEVELS) as Level[];
export const isLevel = (value: unknown): value is Level => typeof value === "string" && value in LEVELS;

export interface Outcome { answer: "REAL" | "AI"; choice: "REAL" | "AI" | null }
export interface Score {
  photos: number; balanced_accuracy: number; score: number;
  real: { right: number; total: number }; slop: { right: number; total: number }; timed_out: number;
}
/** Score of a finished game. A photo whose time ran out counts as not recognised. Balanced accuracy is the mean of the share of
 * REAL recognised and the share of SLOP recognised; with one origin only (rare: each position is drawn with a coin) it is the
 * plain accuracy. 2 × BA − 1 is 0 for random or constant answers and 1 for no mistakes; times the photos, speed of the level and
 * length of the game count only beyond chance. Rounded to one decimal. */
export function scoreOf(outcomes: readonly Outcome[]): Score {
  const real = outcomes.filter(o => o.answer === "REAL"), slop = outcomes.filter(o => o.answer === "AI");
  const right = (list: readonly Outcome[]) => list.filter(o => o.choice === o.answer).length;
  const rates = [real, slop].filter(list => list.length).map(list => right(list) / list.length);
  const ba = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  const photos = outcomes.length;
  return { photos, balanced_accuracy: Math.round(ba * 1000) / 1000, score: Math.round(photos * (2 * ba - 1) * 10) / 10 + 0,
    real: { right: right(real), total: real.length }, slop: { right: right(slop), total: slop.length },
    timed_out: outcomes.filter(o => o.choice === null).length };
}

/** Nickname: 3–20 letters, digits, spaces, hyphens, underscores, points; no indecent word, also written with digits for letters
 * (m3rda) or with separators (m.e.r.d.a). Distinctive roots are refused anywhere in the name; short or ambiguous words only as a
 * whole word, so that «Annalisa», «Figaro» or «Nazionale» pass. No filter is complete: the owner can hide an entry. */
const ROOTS = ["merd", "cazz", "minchi", "stronz", "puttan", "vaffancul", "fancul", "coglion", "pompin", "froci", "ricchion", "porcodio",
  "porcamadonn", "diocan", "dioporc", "culatton", "bocchin", "segaiol", "mignott", "bagasc", "fuck", "shit", "cunt", "bitch",
  "whore", "nigger", "nigga", "faggot", "asshol", "hitler", "porn", "realorslop"];
const WORDS = ["troia", "troie", "figa", "fica", "negro", "negra", "negri", "negre", "terrone", "terroni", "zingaro", "zingara", "zingari",
  "mongoloide", "ritardato", "ritardata", "finocchio", "zoccola", "slut", "retard", "dick", "pussy", "bastard", "rape", "nazi", "nazista",
  "duce", "heil", "kkk", "sborra", "sborrata", "sex", "anal", "penis", "pene", "vagina", "cock", "tits", "boobs", "admin", "moderatore", "moderator"];
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "!": "i", "|": "i", "€": "e" };
const squeeze = (text: string) => text.replace(/(.)\1+/g, "$1");
export function nicknameError(value: unknown): string {
  if (typeof value !== "string") return "Soprannome mancante";
  const name = cleanNickname(value);
  if (name.length < 3 || name.length > 20) return "Il soprannome va da 3 a 20 caratteri";
  if (!/^[\p{L}\p{N} ._-]+$/u.test(name)) return "Usa solo lettere, cifre, spazi, trattini e punti";
  const plain = [...name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")].map(ch => LEET[ch] ?? ch).join("");
  const joined = squeeze(plain.replace(/[^a-z]/g, ""));
  const tokens = plain.split(/[^a-z]+/).filter(Boolean).map(squeeze);
  if (ROOTS.some(root => joined.includes(squeeze(root))) || WORDS.some(word => tokens.includes(squeeze(word))))
    return "Soprannome non ammesso: scegline un altro";
  return "";
}
export const cleanNickname = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ");

/** Game code: 10 characters from an alphabet without look-alikes (no 0/O, 1/I/L), shown as XXXX-XXXX-XX. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function formatCode(raw: string) { return raw.slice(0, 4) + "-" + raw.slice(4, 8) + "-" + raw.slice(8, 10); }
/** The code as typed by a person: case, spaces and hyphens ignored. */
export function normaliseCode(value: string) { return value.toUpperCase().replace(/[\s-]/g, ""); }
export const isCode = (value: string) => new RegExp(`^[${CODE_ALPHABET}]{10}$`).test(normaliseCode(value));
