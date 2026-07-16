import type { Tile } from "../core/board";
import { isOwnable } from "../core/board";
import type { GameState } from "../core/state";
import { getTileRect, BOARD_PX, CORNER_PX } from "./layout";
import { GROUP_COLORS, TILE_TYPE_COLORS } from "./colors";

export interface PlayerColorMap {
  [playerId: string]: string;
}

function formatMoney(amount: number): string {
  return amount.toLocaleString("uk-UA");
}

function tileColor(tile: Tile): string {
  if (tile.type === "property") return GROUP_COLORS[tile.colorGroup] ?? "#999";
  return TILE_TYPE_COLORS[tile.type] ?? "#444";
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  board: Tile[],
  state: GameState,
  playerColors: PlayerColorMap,
): void {
  ctx.save();
  ctx.clearRect(0, 0, BOARD_PX, BOARD_PX);
  ctx.fillStyle = "#101418";
  ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

  for (const tile of board) {
    const rect = getTileRect(tile.id);
    ctx.fillStyle = "#1b2026";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = "#3a4048";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    const bandColor = tileColor(tile);
    const bandThickness = rect.side === "corner" ? 0 : Math.min(rect.w, rect.h) * 0.28;
    ctx.fillStyle = bandColor;
    if (rect.side === "top") ctx.fillRect(rect.x, rect.y + rect.h - bandThickness, rect.w, bandThickness);
    else if (rect.side === "bottom") ctx.fillRect(rect.x, rect.y, rect.w, bandThickness);
    else if (rect.side === "left") ctx.fillRect(rect.x + rect.w - bandThickness, rect.y, bandThickness, rect.h);
    else if (rect.side === "right") ctx.fillRect(rect.x, rect.y, bandThickness, rect.h);
    else {
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    if (isOwnable(tile)) {
      const ownerId = state.ownership[tile.id];
      if (ownerId && playerColors[ownerId]) {
        const markerX = rect.x + rect.w - 10;
        const markerY = rect.y + 2;
        ctx.fillStyle = playerColors[ownerId];
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.fillRect(markerX, markerY, 8, 8);
        ctx.strokeRect(markerX, markerY, 8, 8);
      }
    }

    if (tile.type === "property") {
      const houseCount = state.houses[tile.id] ?? 0;
      for (let i = 0; i < houseCount; i++) {
        drawHouseIcon(ctx, rect.x + 2 + i * 8, rect.y + 2);
      }
    }

    ctx.fillStyle = "#e8e8e8";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = rect.x + rect.w / 2;
    const nameY = rect.side === "top" || rect.side === "corner" ? rect.y + rect.h * 0.35 : rect.y + rect.h * 0.4;
    wrapText(ctx, tile.name, cx, nameY, rect.w - 6, 10);

    if (isOwnable(tile)) {
      ctx.fillStyle = "#a8b0b8";
      ctx.font = "8px sans-serif";
      ctx.fillText(formatMoney(tile.price), cx, rect.y + rect.h * 0.75);
    } else if (tile.type === "tax") {
      ctx.fillStyle = "#a8b0b8";
      ctx.font = "8px sans-serif";
      ctx.fillText(formatMoney(tile.amount), cx, rect.y + rect.h * 0.75);
    }
  }

  ctx.fillStyle = "#e8e8e8";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("МОНОПОЛІЯ", BOARD_PX / 2, CORNER_PX + 45);

  ctx.restore();
}

function drawHouseIcon(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // small house: triangular roof over a square body, ~7x7px
  ctx.fillStyle = "#3fbf5f";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(x, y + 3);
  ctx.lineTo(x + 3, y);
  ctx.lineTo(x + 6, y + 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillRect(x + 1, y + 3, 4, 4);
  ctx.strokeRect(x + 1, y + 3, 4, 4);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
}
