import type { Card } from "./cards";

export type GameEvent =
  | { type: "DiceRolled"; playerId: string; dice: [number, number]; isDouble: boolean }
  | { type: "PlayerMoved"; playerId: string; from: number; to: number; passedGo: boolean }
  | { type: "SalaryPaid"; playerId: string; amount: number }
  | { type: "LandedOnProperty"; playerId: string; tileId: number; owned: boolean; ownerId: string | null }
  | { type: "RentCharged"; payerId: string; ownerId: string; amount: number }
  | { type: "PropertyBought"; playerId: string; tileId: number; price: number }
  | { type: "PropertyDeclined"; playerId: string; tileId: number }
  | { type: "BuyoutOffered"; tileId: number; buyerId: string; ownerId: string; amount: number }
  | { type: "BuyoutAccepted"; tileId: number; buyerId: string; ownerId: string; amount: number }
  | { type: "BuyoutRejected"; tileId: number; buyerId: string; ownerId: string; amount: number }
  | { type: "TaxCharged"; playerId: string; amount: number }
  | { type: "CardDrawn"; playerId: string; deck: "chance" | "treasury"; card: Card }
  | { type: "PlayerJailed"; playerId: string; reason: "doubles" | "card" }
  | { type: "PlayerReleasedFromJail"; playerId: string; method: "paid" | "card" | "doubles" }
  | { type: "CasinoResult"; playerId: string; multiplier: number; amount: number }
  | { type: "CasinoSkipped"; playerId: string }
  | { type: "PlayerBankrupt"; playerId: string; creditorId: string | null }
  | { type: "GameOver"; winnerId: string }
  | { type: "TurnEnded"; nextPlayerId: string }
  | { type: "HouseBuilt"; playerId: string; tileId: number; houses: number };
