import { tileCenter } from "./layout";
import { randomReelSymbols } from "./casinoRenderer";

const HOP_DURATION_MS = 180;
const DICE_ROLL_DURATION_MS = 700;
const DICE_TICK_MS = 70;
const CASINO_SPIN_DURATION_MS = 700;
const CASINO_TICK_MS = 70;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Animates a token hopping tile-by-tile from `from` to `to` (wrapping through
 * tile 0 as needed), invoking `onUpdate` every frame with the token's current
 * pixel position, and `null` once the hop sequence completes. Resolves when done.
 */
export function animateTokenMove(
  from: number,
  to: number,
  boardSize: number,
  onUpdate: (pos: { x: number; y: number } | null) => void,
): Promise<void> {
  const path: number[] = [];
  let cursor = from;
  while (cursor !== to) {
    cursor = (cursor + 1) % boardSize;
    path.push(cursor);
  }
  if (path.length === 0) path.push(to);

  return new Promise((resolve) => {
    let hopIndex = 0;
    let hopStart = performance.now();
    let previousTile = from;

    function step(now: number): void {
      const targetTile = path[hopIndex];
      if (targetTile === undefined) {
        onUpdate(null);
        resolve();
        return;
      }
      const elapsed = now - hopStart;
      const t = Math.min(1, elapsed / HOP_DURATION_MS);
      const start = tileCenter(previousTile);
      const end = tileCenter(targetTile);
      onUpdate({ x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) });

      if (t >= 1) {
        previousTile = targetTile;
        hopIndex += 1;
        hopStart = now;
      }
      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
}

/**
 * Spins the dice with random face values while rotating them, then settles on
 * `finalValues` at zero rotation. Invokes `onUpdate` every frame; resolves
 * once the spin completes.
 */
export function animateDiceRoll(
  finalValues: [number, number],
  onUpdate: (values: [number, number], rotations: [number, number]) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    let lastTick = start;
    let current: [number, number] = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];

    function step(now: number): void {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / DICE_ROLL_DURATION_MS);

      if (t >= 1) {
        onUpdate(finalValues, [0, 0]);
        resolve();
        return;
      }

      if (now - lastTick >= DICE_TICK_MS) {
        current = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
        lastTick = now;
      }

      const spin = (1 - t) * Math.PI * 6;
      onUpdate(current, [spin, -spin]);
      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
}

/**
 * Spins the casino reels with random symbols, then settles on `finalSymbols`.
 * Invokes `onUpdate` every frame; resolves once the spin completes.
 */
export function animateCasinoSpin(
  finalSymbols: [string, string, string],
  onUpdate: (symbols: [string, string, string]) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    let lastTick = start;
    let current = randomReelSymbols();

    function step(now: number): void {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / CASINO_SPIN_DURATION_MS);

      if (t >= 1) {
        onUpdate(finalSymbols);
        resolve();
        return;
      }

      if (now - lastTick >= CASINO_TICK_MS) {
        current = randomReelSymbols();
        lastTick = now;
      }

      onUpdate(current);
      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
}
