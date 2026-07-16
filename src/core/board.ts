export type TileType =
  | "go"
  | "property"
  | "company"
  | "chance"
  | "treasury"
  | "tax"
  | "casino"
  | "jail"
  | "free";

export interface PropertyTile {
  type: "property";
  id: number;
  name: string;
  price: number;
  colorGroup: string;
  baseRent: number;
  /** Rent multiplier once the owner holds every tile in colorGroup. */
  monopolyMultiplier: number;
}

export type CompanyKind = "airline" | "trucking" | "shipping" | "internet" | "metro";

export interface CompanyTile {
  type: "company";
  id: number;
  name: string;
  price: number;
  kind: CompanyKind;
}

export interface SimpleTile {
  type: "go" | "chance" | "treasury" | "casino" | "jail" | "free";
  id: number;
  name: string;
}

export interface TaxTile {
  type: "tax";
  id: number;
  name: string;
  amount: number;
}

export type Tile = PropertyTile | CompanyTile | SimpleTile | TaxTile;

export function isOwnable(tile: Tile): tile is PropertyTile | CompanyTile {
  return tile.type === "property" || tile.type === "company";
}

export const BOARD_SIZE = 40;
export const SALARY = 200_000;
