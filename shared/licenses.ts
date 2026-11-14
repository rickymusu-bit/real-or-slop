/** Licences that forbid derivative works (spec `copie-di-gioco`): photos under a «no derivatives» licence are excluded
 * from the game, since the game copy crops them. Recognised from the licence name or address given by Commons. */
const NO_DERIVATIVES = /(^|[^a-z])nd([^a-z]|$)|no ?derivs?|no ?derivatives|\/by(-nc)?-nd\//i;

export function isNoDerivatives(name: string, url = ""): boolean {
  return NO_DERIVATIVES.test(name) || NO_DERIVATIVES.test(url);
}
