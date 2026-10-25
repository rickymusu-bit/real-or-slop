export type Random = () => number;
export const secureRandom: Random = () =>
  crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
export function shuffled<T>(rows: readonly T[], random: Random = secureRandom): T[] {
  const out = [...rows];
  for (let i = out.length - 1; i > 0; i--) {
    const n = Math.floor(random() * (i + 1));
    [out[i], out[n]] = [out[n], out[i]];
  }
  return out;
}
