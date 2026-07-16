import type { GameState } from "../core/state";
import { getTileRect } from "./layout";
import type { PlayerColorMap } from "./boardRenderer";

const TOKEN_RADIUS = 8;

/** Slot offsets (as a fraction of tile size) so up to 4 tokens fit on one tile without overlapping. */
const SLOT_OFFSETS = [
  { dx: -0.2, dy: -0.15 },
  { dx: 0.2, dy: -0.15 },
  { dx: -0.2, dy: 0.2 },
  { dx: 0.2, dy: 0.2 },
];

export interface TokenPosition {
  playerId: string;
  /** Board tile id, or a free-floating pixel override used mid-animation. */
  tileId: number;
  pixelOverride?: { x: number; y: number };
}

export function drawTokens(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  playerColors: PlayerColorMap,
  overrides: Record<string, { x: number; y: number }> = {},
): void {
  const byTile = new Map<number, string[]>();
  for (const player of state.players) {
    if (player.bankrupt) continue;
    const list = byTile.get(player.position) ?? [];
    list.push(player.id);
    byTile.set(player.position, list);
  }

  for (const [tileId, playerIds] of byTile) {
    const rect = getTileRect(tileId);
    playerIds.forEach((playerId, slot) => {
      const override = overrides[playerId];
      const offset = SLOT_OFFSETS[slot % SLOT_OFFSETS.length] ?? { dx: 0, dy: 0 };
      const x = override?.x ?? rect.x + rect.w / 2 + offset.dx * rect.w;
      const y = override?.y ?? rect.y + rect.h / 2 + offset.dy * rect.h;

      ctx.beginPath();
      ctx.arc(x, y, TOKEN_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = playerColors[playerId] ?? "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#101418";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}
