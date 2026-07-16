export const BOARD_PX = 800;
export const CORNER_PX = 100;
export const CELL_PX = (BOARD_PX - 2 * CORNER_PX) / 9;

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Which board edge this tile sits on, for label orientation. */
  side: "top" | "right" | "bottom" | "left" | "corner";
}

export function getTileRect(tileId: number): TileRect {
  if (tileId === 0) return { x: BOARD_PX - CORNER_PX, y: 0, w: CORNER_PX, h: CORNER_PX, side: "corner" };
  if (tileId === 10) {
    return { x: BOARD_PX - CORNER_PX, y: BOARD_PX - CORNER_PX, w: CORNER_PX, h: CORNER_PX, side: "corner" };
  }
  if (tileId === 20) return { x: 0, y: BOARD_PX - CORNER_PX, w: CORNER_PX, h: CORNER_PX, side: "corner" };
  if (tileId === 30) return { x: 0, y: 0, w: CORNER_PX, h: CORNER_PX, side: "corner" };

  if (tileId >= 1 && tileId <= 9) {
    const i = tileId - 1;
    return { x: BOARD_PX - CORNER_PX, y: CORNER_PX + i * CELL_PX, w: CORNER_PX, h: CELL_PX, side: "right" };
  }
  if (tileId >= 11 && tileId <= 19) {
    const i = tileId - 11;
    return { x: BOARD_PX - CORNER_PX - (i + 1) * CELL_PX, y: BOARD_PX - CORNER_PX, w: CELL_PX, h: CORNER_PX, side: "bottom" };
  }
  if (tileId >= 21 && tileId <= 29) {
    const i = tileId - 21;
    return { x: 0, y: BOARD_PX - CORNER_PX - (i + 1) * CELL_PX, w: CORNER_PX, h: CELL_PX, side: "left" };
  }
  if (tileId >= 31 && tileId <= 39) {
    const i = tileId - 31;
    return { x: CORNER_PX + i * CELL_PX, y: 0, w: CELL_PX, h: CORNER_PX, side: "top" };
  }
  throw new Error(`Unknown tile id ${tileId}`);
}

export function tileCenter(tileId: number): { x: number; y: number } {
  const r = getTileRect(tileId);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
