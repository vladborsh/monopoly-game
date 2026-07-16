/** colorGroups ordered cheapest to priciest, matching data/board.ts price tiers. */
const GROUP_TIER_ORDER = ["gold", "blue", "orange", "magenta", "green", "red", "teal", "purple"];

const HOUSE_COST = [50_000, 70_000, 90_000, 110_000, 130_000, 150_000, 175_000, 200_000];
const RENT_PER_HOUSE = [25_000, 40_000, 55_000, 70_000, 85_000, 100_000, 125_000, 150_000];

export const MAX_HOUSES = 3;
export const PROPERTY_TAX_SURCHARGE_PER_HOUSE = 25_000;

function tierIndex(colorGroup: string): number {
  const index = GROUP_TIER_ORDER.indexOf(colorGroup);
  return index === -1 ? 0 : index;
}

export function houseCostForGroup(colorGroup: string): number {
  return HOUSE_COST[tierIndex(colorGroup)] ?? 0;
}

export function rentPerHouseForGroup(colorGroup: string): number {
  return RENT_PER_HOUSE[tierIndex(colorGroup)] ?? 0;
}
