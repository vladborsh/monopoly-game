import { BOARD_PX } from "./layout";
import { DICE_ZONE } from "./diceRenderer";

const REEL_SIZE = 60;
const REEL_GAP = 16;
const REEL_COUNT = 3;
const ZONE_W = REEL_COUNT * REEL_SIZE + (REEL_COUNT - 1) * REEL_GAP;
const ZONE_H = 90;

export const CASINO_ZONE = {
  x: BOARD_PX / 2 - ZONE_W / 2,
  y: DICE_ZONE.y + DICE_ZONE.h + 15,
  w: ZONE_W,
  h: ZONE_H,
};

export const CASINO_SYMBOLS = ["🍒", "🍋", "🍊", "🍇", "🔔", "⭐", "7️⃣"];

/** Deterministic reel combo per CASINO_TABLE multiplier: matching triples win, tile 0 is a mismatched loss. */
const RESULT_COMBOS: Record<number, [string, string, string]> = {
  0: ["🍒", "🍋", "🍊"],
  2: ["🍒", "🍒", "🍒"],
  3: ["🍋", "🍋", "🍋"],
  5: ["🍊", "🍊", "🍊"],
  10: ["🍇", "🍇", "🍇"],
  20: ["🔔", "🔔", "🔔"],
  30: ["⭐", "⭐", "⭐"],
  50: ["7️⃣", "7️⃣", "7️⃣"],
};

export function resultSymbolsForMultiplier(multiplier: number): [string, string, string] {
  return RESULT_COMBOS[multiplier] ?? ["🍒", "🍋", "🍊"];
}

export function randomReelSymbols(): [string, string, string] {
  const pick = (): string => CASINO_SYMBOLS[Math.floor(Math.random() * CASINO_SYMBOLS.length)] ?? "🍒";
  return [pick(), pick(), pick()];
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draws the 3 casino reels inside CASINO_ZONE. When `symbols` is null nothing
 * is drawn, so the panel only appears while the casino is relevant.
 */
export function drawCasinoReels(ctx: CanvasRenderingContext2D, symbols: [string, string, string] | null): void {
  if (!symbols) return;

  ctx.save();
  const top = CASINO_ZONE.y;
  for (let i = 0; i < REEL_COUNT; i++) {
    const x = CASINO_ZONE.x + i * (REEL_SIZE + REEL_GAP);
    roundRectPath(ctx, x, top, REEL_SIZE, REEL_SIZE, 8);
    ctx.fillStyle = "#f4f1ea";
    ctx.fill();
    ctx.strokeStyle = "#1b2026";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbols[i] ?? "", x + REEL_SIZE / 2, top + REEL_SIZE / 2);
  }
  ctx.restore();
}
