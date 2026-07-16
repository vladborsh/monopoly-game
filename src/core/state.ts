export type TurnPhase =
  | "awaiting_roll"
  | "awaiting_property_decision"
  | "awaiting_casino_spin"
  | "turn_over"
  | "game_over";

export interface Player {
  id: string;
  name: string;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  getOutOfJailCards: number;
  bankrupt: boolean;
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  /** tileId -> owning player id, or null if bank-owned/unownable */
  ownership: Record<number, string | null>;
  /** tileId -> house count (0-3), only meaningful for property tiles */
  houses: Record<number, number>;
  chanceOrder: string[];
  chanceIndex: number;
  treasuryOrder: string[];
  treasuryIndex: number;
  turnPhase: TurnPhase;
  lastDice: [number, number] | null;
  jackpot: number;
  rngSeed: number;
  winnerId: string | null;
  log: string[];
}

export function currentPlayer(state: GameState): Player {
  const player = state.players[state.currentPlayerIndex];
  if (!player) {
    throw new Error("currentPlayerIndex out of range");
  }
  return player;
}
