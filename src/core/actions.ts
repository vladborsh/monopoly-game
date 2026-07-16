export type Action =
  | { type: "ROLL_DICE" }
  | { type: "BUY_PROPERTY" }
  | { type: "DECLINE_PROPERTY" }
  | { type: "PLAY_CASINO" }
  | { type: "SKIP_CASINO" }
  | { type: "PAY_BAIL" }
  | { type: "USE_JAIL_CARD" }
  | { type: "END_TURN" }
  | { type: "BUILD_HOUSE"; tileId: number };
