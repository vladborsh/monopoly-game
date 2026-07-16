export type Action =
  | { type: "ROLL_DICE" }
  | { type: "BUY_PROPERTY" }
  | { type: "DECLINE_PROPERTY" }
  | { type: "PAY_RENT" }
  | { type: "OFFER_BUYOUT" }
  | { type: "ACCEPT_BUYOUT"; playerId: string }
  | { type: "REJECT_BUYOUT"; playerId: string }
  | { type: "PLAY_CASINO"; stake: number }
  | { type: "SKIP_CASINO" }
  | { type: "PAY_BAIL" }
  | { type: "USE_JAIL_CARD" }
  | { type: "END_TURN" }
  | { type: "BUILD_HOUSE"; tileId: number }
  | { type: "TAKE_LOAN"; tileId: number; kind: "house" | "property"; playerId: string }
  | { type: "REPAY_LOAN"; tileId: number }
  | { type: "DECLARE_BANKRUPTCY"; playerId: string };
