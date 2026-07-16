import { BOARD_PX } from "./layout";

/** Reserved space on the board for the dice, per spec: 200x300, centered. */
export const DICE_ZONE = {
  x: BOARD_PX / 2 - 100,
  y: BOARD_PX / 2 - 40,
  w: 200,
  h: 300,
};

const DIE_SIZE = 70;
const DIE_GAP = 20;
const PIP_RADIUS = 6;

const PIP_LAYOUTS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.25, 0.25],
    [0.75, 0.75],
  ],
  3: [
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75],
  ],
  4: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  5: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.5, 0.5],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  6: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.5],
    [0.75, 0.5],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
};

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawDie(ctx: CanvasRenderingContext2D, cx: number, cy: number, value: number, rotation: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  const half = DIE_SIZE / 2;
  roundRectPath(ctx, -half, -half, DIE_SIZE, DIE_SIZE, 10);
  ctx.fillStyle = "#f4f1ea";
  ctx.fill();
  ctx.strokeStyle = "#1b2026";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#1b2026";
  const pips = PIP_LAYOUTS[value] ?? [];
  for (const [px, py] of pips) {
    ctx.beginPath();
    ctx.arc(-half + px * DIE_SIZE, -half + py * DIE_SIZE, PIP_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Draws the two dice inside DICE_ZONE. `values` are the pip counts to show;
 * `rotations` (radians) let the caller drive an in-progress spin animation.
 * When `values` is null nothing is drawn, so the board stays clean before the
 * first roll.
 */
export function drawDice(
  ctx: CanvasRenderingContext2D,
  values: [number, number] | null,
  rotations: [number, number] = [0, 0],
): void {
  if (!values) return;
  const centerX = DICE_ZONE.x + DICE_ZONE.w / 2;
  const centerY = DICE_ZONE.y + DICE_ZONE.h / 2;
  const d1x = centerX - DIE_GAP / 2 - DIE_SIZE / 2;
  const d2x = centerX + DIE_GAP / 2 + DIE_SIZE / 2;
  drawDie(ctx, d1x, centerY, values[0], rotations[0]);
  drawDie(ctx, d2x, centerY, values[1], rotations[1]);
}
