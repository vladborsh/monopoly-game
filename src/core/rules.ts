import type { PropertyTile, CompanyTile, Tile } from "./board";
import { isOwnable } from "./board";
import { rentPerHouseForGroup } from "./houses";

export const BAIL_AMOUNT = 50_000;
export const MAX_JAIL_ATTEMPTS = 3;

export function ownsFullColorGroup(
  tile: PropertyTile,
  ownership: Record<number, string | null>,
  ownerId: string,
  allTiles: Tile[],
): boolean {
  const groupTiles = allTiles.filter(
    (t): t is PropertyTile => t.type === "property" && t.colorGroup === tile.colorGroup,
  );
  return groupTiles.every((t) => ownership[t.id] === ownerId);
}

export function calculatePropertyRent(
  tile: PropertyTile,
  ownership: Record<number, string | null>,
  ownerId: string,
  allTiles: Tile[],
  houses: Record<number, number>,
): number {
  const houseCount = houses[tile.id] ?? 0;
  if (houseCount > 0) {
    return tile.baseRent + houseCount * rentPerHouseForGroup(tile.colorGroup);
  }
  const hasMonopoly = ownsFullColorGroup(tile, ownership, ownerId, allTiles);
  return hasMonopoly ? tile.baseRent * tile.monopolyMultiplier : tile.baseRent;
}

/** Rent scales with how many company tiles (any kind) the owner holds, railroad-style. */
const COMPANY_RENT_BY_COUNT = [0, 25_000, 50_000, 100_000, 150_000, 200_000];

export function calculateCompanyRent(
  _tile: CompanyTile,
  ownership: Record<number, string | null>,
  ownerId: string,
  allTiles: Tile[],
): number {
  const ownedCount = allTiles.filter((t) => t.type === "company" && ownership[t.id] === ownerId).length;
  return COMPANY_RENT_BY_COUNT[Math.min(ownedCount, COMPANY_RENT_BY_COUNT.length - 1)] ?? 0;
}

export function totalHousesOwned(
  playerId: string,
  ownership: Record<number, string | null>,
  houses: Record<number, number>,
): number {
  return Object.entries(houses).reduce((sum, [tileId, count]) => {
    return ownership[Number(tileId)] === playerId ? sum + count : sum;
  }, 0);
}

export function calculateRent(
  tile: Tile,
  ownership: Record<number, string | null>,
  ownerId: string,
  allTiles: Tile[],
  houses: Record<number, number>,
): number {
  if (!isOwnable(tile)) return 0;
  if (tile.type === "property") return calculatePropertyRent(tile, ownership, ownerId, allTiles, houses);
  return calculateCompanyRent(tile, ownership, ownerId, allTiles);
}
