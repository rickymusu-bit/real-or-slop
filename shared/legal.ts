/** Privacy and legal constants (spec `privacy-note-legali`): controller, retention of games, minimum age, dates of the
 * privacy notice and of the terms of use. The texts of the pages are verified by a lawyer: changing them needs a new check. */
export const CONTROLLER = { name: "Riccardo Musumarra", email: "rickymusu@proton.me" } as const;
export const CONTROLLER_READY = true;
export const GAME_RETENTION_MONTHS = 12;
export const GAME_RETENTION_MS = GAME_RETENTION_MONTHS * 30.44 * 86_400_000;
export const MIN_AGE = 14;
export const LEGAL_UPDATED = "12 novembre 2026";
export const TERMS_UPDATED = "13 novembre 2026";
