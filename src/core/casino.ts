import { seedToFloat, nextSeed } from "./rng";

/** Weighted jackpot multipliers matching the reel art on the board (mostly a loss). */
const CASINO_TABLE: { multiplier: number; weight: number }[] = [
  { multiplier: 0, weight: 55 },
  { multiplier: 2, weight: 20 },
  { multiplier: 3, weight: 12 },
  { multiplier: 5, weight: 7 },
  { multiplier: 10, weight: 3 },
  { multiplier: 20, weight: 1.5 },
  { multiplier: 30, weight: 0.9 },
  { multiplier: 50, weight: 0.6 },
];

const TOTAL_WEIGHT = CASINO_TABLE.reduce((sum, entry) => sum + entry.weight, 0);

export const MIN_CASINO_STAKE = 10_000;

export function spinCasino(seed: number): { multiplier: number; nextSeed: number } {
  const advanced = nextSeed(seed);
  const roll = seedToFloat(advanced) * TOTAL_WEIGHT;
  let cursor = 0;
  for (const entry of CASINO_TABLE) {
    cursor += entry.weight;
    if (roll < cursor) {
      return { multiplier: entry.multiplier, nextSeed: advanced };
    }
  }
  return { multiplier: 0, nextSeed: advanced };
}
