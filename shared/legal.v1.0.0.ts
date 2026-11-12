/** Privacy and legal notes (docs/privacy-note-legali.v1.0.0.md). v1.0.0, 2026-11-12T19:00:00Z.
 * Owner decisions of 2026-11-12: personal, non-commercial project; games kept 12 months; to enter the leaderboard a player declares
 * to be at least 14 or to have a parent's permission. The controller is the owner as a natural person: name and contact address
 * given by the owner on 2026-11-12 (CONTROLLER_READY false would keep a visible notice on the pages). */
export const CONTROLLER = { name: "Riccardo Musumarra", email: "rickymusu@proton.me" } as const;
export const CONTROLLER_READY = true;
export const GAME_RETENTION_MONTHS = 12;
export const GAME_RETENTION_MS = GAME_RETENTION_MONTHS * 30.44 * 86_400_000;
export const MIN_AGE = 14;
export const LEGAL_UPDATED = "12 novembre 2026";
