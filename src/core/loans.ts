import type { Tile } from "./board";
import { isOwnable } from "./board";
import { houseCostForGroup } from "./houses";

export const LOAN_TO_VALUE_RATIO = 0.8;
export const LOAN_INTEREST_RATE = 0.1;
export const LOAN_DUE_ROUNDS = 3;

export interface Loan {
  tileId: number;
  playerId: string;
  kind: "house" | "property";
  principal: number;
  roundsElapsed: number;
}

export function loanPrincipal(value: number): number {
  return Math.round(value * LOAN_TO_VALUE_RATIO);
}

export function loanInterest(principal: number): number {
  return Math.round(principal * LOAN_INTEREST_RATE);
}

export interface PledgeOption {
  tileId: number;
  tileName: string;
  kind: "house" | "property";
  value: number;
  principal: number;
}

/** Tiles/houses a player could still pledge as loan collateral (no active loan on them yet). */
export function getPledgeableOptions(
  board: Tile[],
  ownership: Record<number, string | null>,
  houses: Record<number, number>,
  loans: Loan[],
  playerId: string,
): PledgeOption[] {
  const options: PledgeOption[] = [];
  for (const tile of board) {
    if (!isOwnable(tile)) continue;
    if (ownership[tile.id] !== playerId) continue;
    if (loans.some((l) => l.tileId === tile.id)) continue;
    options.push({
      tileId: tile.id,
      tileName: tile.name,
      kind: "property",
      value: tile.price,
      principal: loanPrincipal(tile.price),
    });
    if (tile.type === "property" && (houses[tile.id] ?? 0) > 0) {
      const value = houseCostForGroup(tile.colorGroup);
      options.push({ tileId: tile.id, tileName: tile.name, kind: "house", value, principal: loanPrincipal(value) });
    }
  }
  return options;
}
