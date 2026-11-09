/** Générateur de nombres aléatoires injectable (permet des tests déterministes). */
export interface Rng {
  /** Flottant dans `[0, 1[`. */
  next(): number;
  /** Entier dans `[0, maxExclusive[`. */
  int(maxExclusive: number): number;
  /** Retourne une copie mélangée (Fisher-Yates) du tableau. */
  shuffle<T>(items: readonly T[]): T[];
}

/**
 * Crée un générateur pseudo-aléatoire (mulberry32) à partir d'une graine.
 * @param seed Graine ; tirée aléatoirement si omise.
 */
export function createRng(seed: number = Math.floor(Math.random() * 2 ** 32)): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive);

  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy;
  };

  return { next, int, shuffle };
}
