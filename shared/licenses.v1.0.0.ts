/** Licences that forbid derivative works (docs/copie-di-gioco.v3.0.0.md, section 3). v1.0.0, 2026-11-12T08:00:00Z.
 * Owner decision of 2026-11-11: photos under a «no derivatives» licence are excluded from the game, since the 4:5 game copy
 * crops the photo. Recognised from the licence name or address given by Commons: CC BY-ND, CC BY-NC-ND (any version) and
 * the long forms «NoDerivs», «NoDerivatives». */
const NO_DERIVATIVES = /(^|[^a-z])nd([^a-z]|$)|no ?derivs?|no ?derivatives|\/by(-nc)?-nd\//i;

export function isNoDerivatives(name: string, url = ""): boolean {
  return NO_DERIVATIVES.test(name) || NO_DERIVATIVES.test(url);
}
