import type { GameState } from "./state";
import { currentPlayer } from "./state";
import type { Action } from "./actions";
import type { GameConfig } from "./engine";
import { isOwnable } from "./board";
import { ownsFullColorGroup, buyoutAmountForTile, BAIL_AMOUNT } from "./rules";
import { houseCostForBuild, MAX_HOUSES } from "./houses";
import { MIN_CASINO_STAKE } from "./casino";
import { getPledgeableOptions } from "./loans";

/** Which player must act on the current state, which is not always `currentPlayer(state)`. */
export function actionablePlayerId(state: GameState): string {
  if (state.turnPhase === "awaiting_buyout_response" && state.pendingOffer) {
    return state.pendingOffer.ownerId;
  }
  if (state.turnPhase === "awaiting_loan_decision" && state.pendingDebt) {
    return state.pendingDebt.payerId;
  }
  return currentPlayer(state).id;
}

/** BUILD_HOUSE/REPAY_LOAN are both legal during awaiting_roll and turn_over. */
function ownTurnActions(state: GameState, config: GameConfig, playerId: string): Action[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];
  const actions: Action[] = [];

  for (const tile of config.board) {
    if (tile.type !== "property") continue;
    if (state.ownership[tile.id] !== playerId) continue;
    if (!ownsFullColorGroup(tile, state.ownership, playerId, config.board)) continue;
    const currentHouses = state.houses[tile.id] ?? 0;
    if (currentHouses >= MAX_HOUSES) continue;
    const cost = houseCostForBuild(tile.colorGroup, currentHouses);
    if (player.cash < cost) continue;
    actions.push({ type: "BUILD_HOUSE", tileId: tile.id });
  }

  for (const loan of state.loans) {
    if (loan.playerId !== playerId) continue;
    if (player.cash < loan.owed) continue;
    actions.push({ type: "REPAY_LOAN", tileId: loan.tileId });
  }

  return actions;
}

/** Returns every fully-parameterized Action `forPlayerId` may legally dispatch right now. */
export function getLegalActions(state: GameState, config: GameConfig, forPlayerId: string): Action[] {
  if (state.turnPhase === "game_over") return [];
  if (forPlayerId !== actionablePlayerId(state)) return [];

  const player = state.players.find((p) => p.id === forPlayerId);
  if (!player) return [];

  switch (state.turnPhase) {
    case "awaiting_roll": {
      const actions: Action[] = [{ type: "ROLL_DICE" }];
      if (player.inJail) {
        if (player.getOutOfJailCards > 0) actions.push({ type: "USE_JAIL_CARD" });
        if (player.cash >= BAIL_AMOUNT) actions.push({ type: "PAY_BAIL" });
      }
      actions.push(...ownTurnActions(state, config, forPlayerId));
      return actions;
    }

    case "awaiting_property_decision": {
      const tile = config.board[player.position];
      const actions: Action[] = [{ type: "DECLINE_PROPERTY" }];
      if (tile && isOwnable(tile) && player.cash >= tile.price) {
        actions.push({ type: "BUY_PROPERTY" });
      }
      return actions;
    }

    case "awaiting_rent_or_buyout_choice": {
      const tile = config.board[player.position];
      const actions: Action[] = [{ type: "PAY_RENT" }];
      if (tile && isOwnable(tile)) {
        const amount = buyoutAmountForTile(tile.price, state.buyoutCount[tile.id] ?? 0);
        if (player.cash >= amount) actions.push({ type: "OFFER_BUYOUT" });
      }
      return actions;
    }

    case "awaiting_buyout_response":
      return [
        { type: "ACCEPT_BUYOUT", playerId: forPlayerId },
        { type: "REJECT_BUYOUT", playerId: forPlayerId },
      ];

    case "awaiting_casino_spin": {
      const stakes = new Set<number>();
      if (player.cash >= MIN_CASINO_STAKE) {
        stakes.add(MIN_CASINO_STAKE);
        stakes.add(Math.min(player.cash, MIN_CASINO_STAKE * 3));
        stakes.add(player.cash);
      }
      const actions: Action[] = [{ type: "SKIP_CASINO" }];
      for (const stake of stakes) actions.push({ type: "PLAY_CASINO", stake });
      return actions;
    }

    case "awaiting_loan_decision": {
      const actions: Action[] = [{ type: "DECLARE_BANKRUPTCY", playerId: forPlayerId }];
      const options = getPledgeableOptions(config.board, state.ownership, state.houses, state.loans, forPlayerId);
      for (const option of options) {
        actions.push({ type: "TAKE_LOAN", tileId: option.tileId, kind: option.kind, playerId: forPlayerId });
      }
      return actions;
    }

    case "turn_over":
      return [{ type: "END_TURN" }, ...ownTurnActions(state, config, forPlayerId)];
  }
}
