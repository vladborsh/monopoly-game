/** Pure, seedable PRNG (mulberry32). Same seed -> same sequence, everywhere. */
export function nextSeed(seed: number): number {
  return (seed + 0x6d2b79f5) >>> 0;
}

/** Returns a float in [0, 1) derived from seed, and does not mutate anything. */
export function seedToFloat(seed: number): number {
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Rolls a single die (1-6) from a seed, returning the value and the next seed. */
export function rollDie(seed: number): { value: number; nextSeed: number } {
  const advanced = nextSeed(seed);
  const value = Math.floor(seedToFloat(advanced) * 6) + 1;
  return { value, nextSeed: advanced };
}

/** Rolls two dice in sequence from a seed. */
export function rollDice(seed: number): { dice: [number, number]; nextSeed: number } {
  const first = rollDie(seed);
  const second = rollDie(first.nextSeed);
  return { dice: [first.value, second.value], nextSeed: second.nextSeed };
}
