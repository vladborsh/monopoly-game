import type { Tile } from "./board";
import { BOARD_SIZE, SALARY } from "./board";
import type { GameState, Player, TurnPhase } from "./state";
import { currentPlayer } from "./state";
import type { Action } from "./actions";
import type { GameEvent } from "./events";
import type { Card, CardEffect } from "./cards";
import { rollDice, seedToFloat, nextSeed } from "./rng";
import { shuffleDeck } from "./cards";
import {
  calculateRent,
  ownsFullColorGroup,
  totalHousesOwned,
  buyoutAmountForTile,
  BAIL_AMOUNT,
  MAX_JAIL_ATTEMPTS,
} from "./rules";
import { spinCasino, MIN_CASINO_STAKE } from "./casino";
import { isOwnable } from "./board";
import { houseCostForBuild, MAX_HOUSES, PROPERTY_TAX_SURCHARGE_PER_HOUSE } from "./houses";
import { LOAN_DUE_ROUNDS, loanInterest, loanPrincipal } from "./loans";

export interface GameConfig {
  board: Tile[];
  chanceCards: Card[];
  treasuryCards: Card[];
}

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}

export const DEFAULT_STARTING_CASH = 500_000;
const STARTING_JACKPOT = 200_000;

export function createInitialState(
  players: { id: string; name: string }[],
  config: GameConfig,
  rngSeed: number,
  startingCash: number = DEFAULT_STARTING_CASH,
): GameState {
  let seed = rngSeed;
  const chanceFloats: number[] = [];
  const treasuryFloats: number[] = [];
  for (let i = 0; i < config.chanceCards.length; i++) {
    seed = nextSeed(seed);
    chanceFloats.push(seedToFloat(seed));
  }
  for (let i = 0; i < config.treasuryCards.length; i++) {
    seed = nextSeed(seed);
    treasuryFloats.push(seedToFloat(seed));
  }

  const initialPlayers: Player[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    cash: startingCash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    getOutOfJailCards: 0,
    bankrupt: false,
  }));

  const ownership: Record<number, string | null> = {};
  const houses: Record<number, number> = {};
  const buyoutCount: Record<number, number> = {};
  for (const tile of config.board) {
    if (isOwnable(tile)) {
      ownership[tile.id] = null;
      buyoutCount[tile.id] = 0;
    }
    if (tile.type === "property") houses[tile.id] = 0;
  }

  return {
    players: initialPlayers,
    currentPlayerIndex: 0,
    ownership,
    houses,
    buyoutCount,
    pendingOffer: null,
    loans: [],
    pendingDebt: null,
    chanceOrder: shuffleDeck(config.chanceCards.map((c) => c.id), chanceFloats),
    chanceIndex: 0,
    treasuryOrder: shuffleDeck(config.treasuryCards.map((c) => c.id), treasuryFloats),
    treasuryIndex: 0,
    turnPhase: "awaiting_roll",
    lastDice: null,
    lastCasinoResult: null,
    jackpot: STARTING_JACKPOT,
    rngSeed: seed,
    winnerId: null,
    log: [],
  };
}

function findTile(board: Tile[], id: number): Tile {
  const tile = board[id];
  if (!tile) throw new Error(`Unknown tile id ${id}`);
  return tile;
}

function withPlayer(state: GameState, playerId: string, update: (p: Player) => Player): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? update(p) : p)),
  };
}

function hasAvailableCollateral(state: GameState, playerId: string): boolean {
  return Object.entries(state.ownership).some(
    ([tileId, ownerId]) => ownerId === playerId && !state.loans.some((l) => l.tileId === Number(tileId)),
  );
}

function bankruptPlayer(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  creditorId: string | null,
): GameState {
  let next = withPlayer(state, playerId, (p) => ({ ...p, cash: 0, bankrupt: true }));
  const releasedOwnership = { ...next.ownership };
  const releasedHouses = { ...next.houses };
  const releasedBuyoutCount = { ...next.buyoutCount };
  for (const tileId of Object.keys(releasedOwnership)) {
    const idNum = Number(tileId);
    if (releasedOwnership[idNum] === playerId) {
      releasedOwnership[idNum] = null;
      releasedHouses[idNum] = 0;
      releasedBuyoutCount[idNum] = 0;
    }
  }
  next = {
    ...next,
    ownership: releasedOwnership,
    houses: releasedHouses,
    buyoutCount: releasedBuyoutCount,
    loans: next.loans.filter((l) => l.playerId !== playerId),
  };
  events.push({ type: "PlayerBankrupt", playerId, creditorId });
  return next;
}

function settlePhaseAfterCharge(state: GameState, fallbackPhase: TurnPhase): GameState {
  if (state.turnPhase === "awaiting_loan_decision") return state;
  return { ...state, turnPhase: fallbackPhase };
}

function chargeCash(
  state: GameState,
  events: GameEvent[],
  payerId: string,
  amount: number,
  creditorId: string | null,
  allowLoan = false,
): GameState {
  const payer = state.players.find((p) => p.id === payerId);
  if (!payer) return state;
  const remaining = payer.cash - amount;
  if (remaining < 0) {
    if (allowLoan && hasAvailableCollateral(state, payerId)) {
      events.push({ type: "LoanRequired", playerId: payerId, creditorId, amount });
      return { ...state, turnPhase: "awaiting_loan_decision", pendingDebt: { payerId, creditorId, amount } };
    }
    return bankruptPlayer(state, events, payerId, creditorId);
  }
  let next = withPlayer(state, payerId, (p) => ({ ...p, cash: remaining }));
  if (creditorId) {
    next = withPlayer(next, creditorId, (p) => ({ ...p, cash: p.cash + amount }));
  }
  return next;
}

function payAllOthers(state: GameState, events: GameEvent[], fromId: string, amount: number): GameState {
  let next = state;
  for (const p of state.players) {
    if (p.id === fromId || p.bankrupt) continue;
    next = chargeCash(next, events, fromId, amount, p.id);
  }
  return next;
}

function receiveFromAllOthers(state: GameState, events: GameEvent[], toId: string, amount: number): GameState {
  let next = state;
  for (const p of state.players) {
    if (p.id === toId || p.bankrupt) continue;
    next = chargeCash(next, events, p.id, amount, toId);
  }
  return next;
}

function payBank(state: GameState, events: GameEvent[], playerId: string, amount: number, allowLoan = false): GameState {
  return chargeCash(state, events, playerId, amount, null, allowLoan);
}

function receiveFromBank(state: GameState, playerId: string, amount: number): GameState {
  return withPlayer(state, playerId, (p) => ({ ...p, cash: p.cash + amount }));
}

function moveTo(
  state: GameState,
  events: GameEvent[],
  playerId: string,
  toPosition: number,
  grantSalaryOnPass: boolean,
): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const wrapped = toPosition < player.position;
  const earnsSalary = grantSalaryOnPass && (wrapped || toPosition === 0);
  let next = withPlayer(state, playerId, (p) => ({ ...p, position: toPosition }));
  events.push({ type: "PlayerMoved", playerId, from: player.position, to: toPosition, passedGo: earnsSalary });
  if (earnsSalary) {
    next = withPlayer(next, playerId, (p) => ({ ...p, cash: p.cash + SALARY }));
    events.push({ type: "SalaryPaid", playerId, amount: SALARY });
  }
  return next;
}

function sendToJail(state: GameState, events: GameEvent[], playerId: string, reason: "doubles" | "card"): GameState {
  const next = withPlayer(state, playerId, (p) => ({ ...p, position: 10, inJail: true, jailTurns: 0 }));
  events.push({ type: "PlayerJailed", playerId, reason });
  return next;
}

function applyCardEffect(
  state: GameState,
  events: GameEvent[],
  config: GameConfig,
  playerId: string,
  effect: CardEffect,
): GameState {
  switch (effect.kind) {
    case "move_to": {
      const next = moveTo(state, events, playerId, effect.tileId, effect.grantSalaryIfPassGo);
      return resolveLanding(next, events, config, playerId);
    }
    case "move_relative": {
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return state;
      const raw = player.position + effect.steps;
      const target = ((raw % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
      const next = moveTo(state, events, playerId, target, effect.steps > 0);
      return resolveLanding(next, events, config, playerId);
    }
    case "pay_bank":
      return payBank(state, events, playerId, effect.amount);
    case "receive_bank":
      return receiveFromBank(state, playerId, effect.amount);
    case "pay_each_player":
      return payAllOthers(state, events, playerId, effect.amount);
    case "receive_each_player":
      return receiveFromAllOthers(state, events, playerId, effect.amount);
    case "go_to_jail":
      return sendToJail(state, events, playerId, "card");
    case "get_out_of_jail_free":
      return withPlayer(state, playerId, (p) => ({ ...p, getOutOfJailCards: p.getOutOfJailCards + 1 }));
  }
}

function drawCard(
  state: GameState,
  events: GameEvent[],
  config: GameConfig,
  playerId: string,
  deck: "chance" | "treasury",
): GameState {
  const order = deck === "chance" ? state.chanceOrder : state.treasuryOrder;
  const index = deck === "chance" ? state.chanceIndex : state.treasuryIndex;
  const cardId = order[index % order.length];
  const pool = deck === "chance" ? config.chanceCards : config.treasuryCards;
  const card = pool.find((c) => c.id === cardId);
  if (!card) return state;

  const nextIndex = (index + 1) % order.length;
  const withIndex: GameState =
    deck === "chance" ? { ...state, chanceIndex: nextIndex } : { ...state, treasuryIndex: nextIndex };

  events.push({ type: "CardDrawn", playerId, deck, card });
  return applyCardEffect(withIndex, events, config, playerId, card.effect);
}

/** Resolves whatever tile the player is currently standing on. May set turnPhase. */
function resolveLanding(state: GameState, events: GameEvent[], config: GameConfig, playerId: string): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.bankrupt) return state;
  const tile = findTile(config.board, player.position);

  switch (tile.type) {
    case "go":
    case "jail":
    case "free":
      return { ...state, turnPhase: "turn_over" };

    case "tax": {
      const surcharge =
        tile.id === 30 ? totalHousesOwned(playerId, state.ownership, state.houses) * PROPERTY_TAX_SURCHARGE_PER_HOUSE : 0;
      const amount = tile.amount + surcharge;
      const next = payBank(state, events, playerId, amount, true);
      if (next.turnPhase !== "awaiting_loan_decision") {
        events.push({ type: "TaxCharged", playerId, amount });
      }
      return settlePhaseAfterCharge(next, "turn_over");
    }

    case "chance":
      return finalizeAfterLanding(drawCard(state, events, config, playerId, "chance"), state, playerId);

    case "treasury":
      return finalizeAfterLanding(drawCard(state, events, config, playerId, "treasury"), state, playerId);

    case "casino":
      return { ...state, turnPhase: "awaiting_casino_spin" };

    case "property":
    case "company": {
      const ownerId = state.ownership[tile.id] ?? null;
      events.push({ type: "LandedOnProperty", playerId, tileId: tile.id, owned: ownerId !== null, ownerId });
      if (ownerId === null) {
        return { ...state, turnPhase: "awaiting_property_decision" };
      }
      if (ownerId === playerId) {
        return { ...state, turnPhase: "turn_over" };
      }
      const houseCount = tile.type === "property" ? (state.houses[tile.id] ?? 0) : 0;
      if (houseCount > 0) {
        const rent = calculateRent(tile, state.ownership, ownerId, config.board, state.houses);
        const next = chargeCash(state, events, playerId, rent, ownerId, true);
        if (next.turnPhase !== "awaiting_loan_decision") {
          events.push({ type: "RentCharged", payerId: playerId, ownerId, amount: rent });
        }
        return settlePhaseAfterCharge(next, "turn_over");
      }
      return { ...state, turnPhase: "awaiting_rent_or_buyout_choice" };
    }
  }
}

/**
 * A card may have moved the player without itself setting turnPhase (e.g. plain
 * pay/receive effects leave the phase untouched by resolveLanding's caller).
 * If a nested resolveLanding call already picked a phase, keep it; otherwise
 * this is a non-movement card effect, so the turn is simply over.
 */
function finalizeAfterLanding(next: GameState, before: GameState, _playerId: string): GameState {
  if (next.turnPhase !== before.turnPhase) return next;
  return { ...next, turnPhase: "turn_over" };
}

function advanceToNextPlayer(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const activePlayers = state.players.filter((p) => !p.bankrupt);
  if (activePlayers.length <= 1) {
    const winner = activePlayers[0];
    if (winner) {
      events.push({ type: "GameOver", winnerId: winner.id });
      return { state: { ...state, turnPhase: "game_over", winnerId: winner.id }, events };
    }
  }
  let nextIndex = state.currentPlayerIndex;
  for (let i = 0; i < state.players.length; i++) {
    nextIndex = (nextIndex + 1) % state.players.length;
    if (!state.players[nextIndex]?.bankrupt) break;
  }
  const nextPlayer = state.players[nextIndex];
  if (!nextPlayer) return { state, events };
  events.push({ type: "TurnEnded", nextPlayerId: nextPlayer.id });
  return {
    state: { ...state, currentPlayerIndex: nextIndex, turnPhase: "awaiting_roll", lastCasinoResult: null },
    events,
  };
}

function applyLoanRoundStart(state: GameState, events: GameEvent[], playerId: string): GameState {
  let next = state;
  for (const loan of state.loans.filter((l) => l.playerId === playerId)) {
    const debtor = next.players.find((p) => p.id === playerId);
    const interest = loanInterest(loan.principal);
    const paid = Math.min(debtor?.cash ?? 0, interest);
    if (paid > 0) {
      next = withPlayer(next, playerId, (p) => ({ ...p, cash: p.cash - paid }));
    }
    events.push({ type: "LoanInterestCharged", playerId, tileId: loan.tileId, amount: paid });

    const roundsElapsed = loan.roundsElapsed + 1;
    if (roundsElapsed >= LOAN_DUE_ROUNDS) {
      if (loan.kind === "property") {
        next = {
          ...next,
          ownership: { ...next.ownership, [loan.tileId]: null },
          houses: { ...next.houses, [loan.tileId]: 0 },
        };
      } else {
        next = {
          ...next,
          houses: { ...next.houses, [loan.tileId]: Math.max(0, (next.houses[loan.tileId] ?? 0) - 1) },
        };
      }
      next = { ...next, loans: next.loans.filter((l) => l !== loan) };
      events.push({ type: "LoanCollateralSeized", playerId, tileId: loan.tileId, kind: loan.kind });
    } else {
      next = { ...next, loans: next.loans.map((l) => (l === loan ? { ...l, roundsElapsed } : l)) };
    }
  }
  return next;
}

export function reduce(state: GameState, action: Action, config: GameConfig): ReduceResult {
  const events: GameEvent[] = [];
  const player = currentPlayer(state);

  switch (action.type) {
    case "ROLL_DICE": {
      if (state.turnPhase !== "awaiting_roll") return { state, events };

      const afterInterest = applyLoanRoundStart(state, events, player.id);
      const { dice, nextSeed: seedAfterRoll } = rollDice(afterInterest.rngSeed);
      const isDouble = dice[0] === dice[1];
      events.push({ type: "DiceRolled", playerId: player.id, dice, isDouble });
      let next: GameState = { ...afterInterest, rngSeed: seedAfterRoll, lastDice: dice };

      if (player.inJail) {
        if (isDouble) {
          next = withPlayer(next, player.id, (p) => ({ ...p, inJail: false, jailTurns: 0 }));
          events.push({ type: "PlayerReleasedFromJail", playerId: player.id, method: "doubles" });
          const sum = dice[0] + dice[1];
          const target = (player.position + sum) % BOARD_SIZE;
          next = moveTo(next, events, player.id, target, true);
          next = resolveLanding(next, events, config, player.id);
          return { state: next, events };
        }
        const jailTurns = player.jailTurns + 1;
        if (jailTurns >= MAX_JAIL_ATTEMPTS) {
          next = withPlayer(next, player.id, (p) => ({ ...p, inJail: false, jailTurns: 0 }));
          next = payBank(next, events, player.id, BAIL_AMOUNT);
          events.push({ type: "PlayerReleasedFromJail", playerId: player.id, method: "paid" });
          const sum = dice[0] + dice[1];
          const target = (player.position + sum) % BOARD_SIZE;
          next = moveTo(next, events, player.id, target, true);
          next = resolveLanding(next, events, config, player.id);
          return { state: { ...next, turnPhase: "turn_over" }, events };
        }
        next = withPlayer(next, player.id, (p) => ({ ...p, jailTurns }));
        return { state: { ...next, turnPhase: "turn_over" }, events };
      }

      const sum = dice[0] + dice[1];
      const target = (player.position + sum) % BOARD_SIZE;
      next = moveTo(next, events, player.id, target, true);
      next = resolveLanding(next, events, config, player.id);
      return { state: next, events };
    }

    case "BUY_PROPERTY": {
      if (state.turnPhase !== "awaiting_property_decision") return { state, events };
      const tile = findTile(config.board, player.position);
      if (!isOwnable(tile)) return { state, events };
      if (player.cash < tile.price) return { state, events };
      let next = withPlayer(state, player.id, (p) => ({ ...p, cash: p.cash - tile.price }));
      next = { ...next, ownership: { ...next.ownership, [tile.id]: player.id } };
      events.push({ type: "PropertyBought", playerId: player.id, tileId: tile.id, price: tile.price });
      next = { ...next, turnPhase: "turn_over" };
      return { state: next, events };
    }

    case "DECLINE_PROPERTY": {
      if (state.turnPhase !== "awaiting_property_decision") return { state, events };
      const tile = findTile(config.board, player.position);
      events.push({ type: "PropertyDeclined", playerId: player.id, tileId: tile.id });
      return { state: { ...state, turnPhase: "turn_over" }, events };
    }

    case "PAY_RENT": {
      if (state.turnPhase !== "awaiting_rent_or_buyout_choice") return { state, events };
      const tile = findTile(config.board, player.position);
      const ownerId = state.ownership[tile.id];
      if (!ownerId) return { state, events };
      const rent = calculateRent(tile, state.ownership, ownerId, config.board, state.houses);
      const next = chargeCash(state, events, player.id, rent, ownerId, true);
      if (next.turnPhase !== "awaiting_loan_decision") {
        events.push({ type: "RentCharged", payerId: player.id, ownerId, amount: rent });
      }
      return { state: settlePhaseAfterCharge(next, "turn_over"), events };
    }

    case "OFFER_BUYOUT": {
      if (state.turnPhase !== "awaiting_rent_or_buyout_choice") return { state, events };
      const tile = findTile(config.board, player.position);
      if (!isOwnable(tile)) return { state, events };
      const ownerId = state.ownership[tile.id];
      if (!ownerId) return { state, events };
      const amount = buyoutAmountForTile(tile.price, state.buyoutCount[tile.id] ?? 0);
      if (player.cash < amount) return { state, events };
      events.push({ type: "BuyoutOffered", tileId: tile.id, buyerId: player.id, ownerId, amount });
      return {
        state: {
          ...state,
          turnPhase: "awaiting_buyout_response",
          pendingOffer: { tileId: tile.id, buyerId: player.id, ownerId, amount },
        },
        events,
      };
    }

    case "ACCEPT_BUYOUT": {
      if (state.turnPhase !== "awaiting_buyout_response" || !state.pendingOffer) return { state, events };
      const offer = state.pendingOffer;
      if (action.playerId !== offer.ownerId) return { state, events };
      let next = chargeCash(state, events, offer.buyerId, offer.amount, offer.ownerId);
      next = { ...next, pendingOffer: null };
      const buyer = next.players.find((p) => p.id === offer.buyerId);
      if (buyer && !buyer.bankrupt) {
        next = {
          ...next,
          ownership: { ...next.ownership, [offer.tileId]: offer.buyerId },
          buyoutCount: { ...next.buyoutCount, [offer.tileId]: (next.buyoutCount[offer.tileId] ?? 0) + 1 },
        };
      }
      events.push({
        type: "BuyoutAccepted",
        tileId: offer.tileId,
        buyerId: offer.buyerId,
        ownerId: offer.ownerId,
        amount: offer.amount,
      });
      return { state: { ...next, turnPhase: "turn_over" }, events };
    }

    case "REJECT_BUYOUT": {
      if (state.turnPhase !== "awaiting_buyout_response" || !state.pendingOffer) return { state, events };
      const offer = state.pendingOffer;
      if (action.playerId !== offer.ownerId) return { state, events };
      events.push({
        type: "BuyoutRejected",
        tileId: offer.tileId,
        buyerId: offer.buyerId,
        ownerId: offer.ownerId,
        amount: offer.amount,
      });
      const tile = findTile(config.board, offer.tileId);
      const rent = calculateRent(tile, state.ownership, offer.ownerId, config.board, state.houses);
      let next = chargeCash(state, events, offer.buyerId, rent, offer.ownerId, true);
      next = { ...next, pendingOffer: null };
      if (next.turnPhase !== "awaiting_loan_decision") {
        events.push({ type: "RentCharged", payerId: offer.buyerId, ownerId: offer.ownerId, amount: rent });
      }
      return { state: settlePhaseAfterCharge(next, "turn_over"), events };
    }

    case "PLAY_CASINO": {
      if (state.turnPhase !== "awaiting_casino_spin") return { state, events };
      const stake = Math.min(Math.max(action.stake, MIN_CASINO_STAKE), player.cash);
      const { multiplier, nextSeed: seedAfter } = spinCasino(state.rngSeed);
      const amount = multiplier * stake;
      let next = payBank(state, events, player.id, stake);
      if (multiplier > 0) {
        next = receiveFromBank(next, player.id, amount);
      }
      events.push({ type: "CasinoResult", playerId: player.id, multiplier, amount, stake });
      next = { ...next, rngSeed: seedAfter, turnPhase: "turn_over", lastCasinoResult: { multiplier, stake } };
      return { state: next, events };
    }

    case "SKIP_CASINO": {
      if (state.turnPhase !== "awaiting_casino_spin") return { state, events };
      events.push({ type: "CasinoSkipped", playerId: player.id });
      return { state: { ...state, turnPhase: "turn_over" }, events };
    }

    case "PAY_BAIL": {
      if (state.turnPhase !== "awaiting_roll" || !player.inJail) return { state, events };
      let next = payBank(state, events, player.id, BAIL_AMOUNT);
      next = withPlayer(next, player.id, (p) => ({ ...p, inJail: false, jailTurns: 0 }));
      events.push({ type: "PlayerReleasedFromJail", playerId: player.id, method: "paid" });
      return { state: next, events };
    }

    case "USE_JAIL_CARD": {
      if (state.turnPhase !== "awaiting_roll" || !player.inJail || player.getOutOfJailCards <= 0) {
        return { state, events };
      }
      const next = withPlayer(state, player.id, (p) => ({
        ...p,
        inJail: false,
        jailTurns: 0,
        getOutOfJailCards: p.getOutOfJailCards - 1,
      }));
      events.push({ type: "PlayerReleasedFromJail", playerId: player.id, method: "card" });
      return { state: next, events };
    }

    case "BUILD_HOUSE": {
      if (state.turnPhase !== "awaiting_roll" && state.turnPhase !== "turn_over") return { state, events };
      const tile = findTile(config.board, action.tileId);
      if (tile.type !== "property") return { state, events };
      if (state.ownership[tile.id] !== player.id) return { state, events };
      if (!ownsFullColorGroup(tile, state.ownership, player.id, config.board)) return { state, events };
      const currentHouses = state.houses[tile.id] ?? 0;
      if (currentHouses >= MAX_HOUSES) return { state, events };
      const cost = houseCostForBuild(tile.colorGroup, currentHouses);
      if (player.cash < cost) return { state, events };
      let next = withPlayer(state, player.id, (p) => ({ ...p, cash: p.cash - cost }));
      next = { ...next, houses: { ...next.houses, [tile.id]: currentHouses + 1 } };
      events.push({ type: "HouseBuilt", playerId: player.id, tileId: tile.id, houses: currentHouses + 1 });
      return { state: next, events };
    }

    case "TAKE_LOAN": {
      if (state.turnPhase !== "awaiting_loan_decision" || !state.pendingDebt) return { state, events };
      const debt = state.pendingDebt;
      if (debt.payerId !== player.id) return { state, events };
      const tile = findTile(config.board, action.tileId);
      if (!isOwnable(tile)) return { state, events };
      if (state.ownership[tile.id] !== player.id) return { state, events };
      if (state.loans.some((l) => l.tileId === tile.id)) return { state, events };

      let value: number;
      if (action.kind === "house") {
        if (tile.type !== "property") return { state, events };
        const houseCount = state.houses[tile.id] ?? 0;
        if (houseCount <= 0) return { state, events };
        value = houseCostForBuild(tile.colorGroup, houseCount - 1);
      } else {
        value = tile.price;
      }
      const principal = loanPrincipal(value);

      let next = withPlayer(state, player.id, (p) => ({ ...p, cash: p.cash + principal }));
      next = {
        ...next,
        loans: [...next.loans, { tileId: tile.id, playerId: player.id, kind: action.kind, principal, owed: value, roundsElapsed: 0 }],
      };
      events.push({ type: "LoanTaken", playerId: player.id, tileId: tile.id, kind: action.kind, principal });

      const debtor = next.players.find((p) => p.id === player.id)!;
      if (debtor.cash >= debt.amount || !hasAvailableCollateral(next, player.id)) {
        next = chargeCash(next, events, debt.payerId, debt.amount, debt.creditorId, false);
        next = { ...next, pendingDebt: null, turnPhase: "turn_over" };
      }
      return { state: next, events };
    }

    case "REPAY_LOAN": {
      if (state.turnPhase !== "awaiting_roll" && state.turnPhase !== "turn_over") return { state, events };
      const loan = state.loans.find((l) => l.tileId === action.tileId && l.playerId === player.id);
      if (!loan) return { state, events };
      if (player.cash < loan.owed) return { state, events };
      let next = withPlayer(state, player.id, (p) => ({ ...p, cash: p.cash - loan.owed }));
      next = { ...next, loans: next.loans.filter((l) => l !== loan) };
      events.push({ type: "LoanRepaid", playerId: player.id, tileId: loan.tileId, kind: loan.kind, amount: loan.owed });
      return { state: next, events };
    }

    case "DECLARE_BANKRUPTCY": {
      if (state.turnPhase !== "awaiting_loan_decision" || !state.pendingDebt) return { state, events };
      const debt = state.pendingDebt;
      if (debt.payerId !== player.id) return { state, events };
      let next = bankruptPlayer(state, events, player.id, debt.creditorId);
      next = { ...next, pendingDebt: null, turnPhase: "turn_over" };
      return { state: next, events };
    }

    case "END_TURN": {
      if (state.turnPhase !== "turn_over") return { state, events };
      const result = advanceToNextPlayer(state);
      return { state: result.state, events: [...events, ...result.events] };
    }
  }
}
