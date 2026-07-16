import { describe, expect, it } from "vitest";
import { createInitialState, reduce, type GameConfig } from "../engine";
import { rollDice } from "../rng";
import { BOARD_TILES } from "../../data/board";
import { CHANCE_CARDS, TREASURY_CARDS } from "../../data/cards";
import type { GameState } from "../state";

const config: GameConfig = { board: BOARD_TILES, chanceCards: CHANCE_CARDS, treasuryCards: TREASURY_CARDS };

function players() {
  return [
    { id: "A", name: "Alice" },
    { id: "B", name: "Bob" },
  ];
}

/**
 * Brute-forces an initial seed whose *first in-game roll* (i.e. after
 * createInitialState has consumed seed values shuffling the decks) matches
 * the predicate.
 */
function findSeed(predicate: (dice: [number, number]) => boolean, start = 0): number {
  for (let seed = start; seed < 200_000; seed++) {
    const state = createInitialState(players(), config, seed);
    const { dice } = rollDice(state.rngSeed);
    if (predicate(dice)) return seed;
  }
  throw new Error("no seed found");
}

describe("createInitialState", () => {
  it("gives every player starting cash and leaves properties unowned", () => {
    const state = createInitialState(players(), config, 42);
    expect(state.players.every((p) => p.cash === 500_000)).toBe(true);
    expect(state.jackpot).toBe(200_000);
    expect(Object.values(state.ownership).every((owner) => owner === null)).toBe(true);
    expect(state.turnPhase).toBe("awaiting_roll");
  });
});

describe("buying property", () => {
  it("deducts price and assigns ownership on BUY_PROPERTY", () => {
    // sum 3, non-double -> lands on tile 3 (Warsaw, price 80_000)
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    expect(state.turnPhase).toBe("awaiting_property_decision");

    ({ state } = reduce(state, { type: "BUY_PROPERTY" }, config));
    expect(state.ownership[3]).toBe("A");
    expect(state.players[0]?.cash).toBe(500_000 - 80_000);
    expect(state.turnPhase).toBe("turn_over");
  });

  it("does not charge cash on DECLINE_PROPERTY", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "DECLINE_PROPERTY" }, config));
    expect(state.ownership[3]).toBeNull();
    expect(state.players[0]?.cash).toBe(500_000);
  });
});

describe("rent", () => {
  it("charges rent to the payer and credits the owner", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, ownership: { ...state.ownership, 3: "B" } };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    expect(state.turnPhase).toBe("awaiting_rent_or_buyout_choice");
    ({ state } = reduce(state, { type: "PAY_RENT" }, config));

    expect(state.players[0]?.cash).toBe(500_000 - 6_000);
    expect(state.players[1]?.cash).toBe(500_000 + 6_000);
    expect(state.turnPhase).toBe("turn_over");
  });

  it("doubles rent when the owner holds the full color group", () => {
    const seed = findSeed((d) => d[0] + d[1] === 6 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    const blueGroupIds = BOARD_TILES.filter((t) => t.type === "property" && t.colorGroup === "blue").map((t) => t.id);
    const ownership = { ...state.ownership };
    for (const id of blueGroupIds) ownership[id] = "B";
    state = { ...state, ownership };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    expect(state.turnPhase).toBe("awaiting_rent_or_buyout_choice");
    ({ state } = reduce(state, { type: "PAY_RENT" }, config));

    expect(state.players[0]?.cash).toBe(500_000 - 16_000);
  });

  it("bankrupts a player who cannot cover rent", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      ownership: { ...state.ownership, 3: "B" },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    expect(state.turnPhase).toBe("awaiting_rent_or_buyout_choice");
    ({ state } = reduce(state, { type: "PAY_RENT" }, config));

    expect(state.players[0]?.bankrupt).toBe(true);
    expect(state.players[0]?.cash).toBe(0);
    expect(Object.values(state.ownership).some((o) => o === "A")).toBe(false);
  });

  it("clears houses on properties released by a bankrupt player", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      ownership: { ...state.ownership, 3: "B", 1: "A" },
      houses: { ...state.houses, 1: 2 },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "PAY_RENT" }, config));
    // A still owns tile 1, so instead of instant bankruptcy the loan offer kicks in.
    expect(state.turnPhase).toBe("awaiting_loan_decision");
    ({ state } = reduce(state, { type: "DECLARE_BANKRUPTCY" }, config));

    expect(state.players[0]?.bankrupt).toBe(true);
    expect(state.ownership[1]).toBeNull();
    expect(state.houses[1]).toBe(0);
  });

  it("resets buyoutCount on properties released by a bankrupt player", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      ownership: { ...state.ownership, 3: "B", 1: "A" },
      buyoutCount: { ...state.buyoutCount, 1: 2 },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "PAY_RENT" }, config));
    expect(state.turnPhase).toBe("awaiting_loan_decision");
    ({ state } = reduce(state, { type: "DECLARE_BANKRUPTCY" }, config));

    expect(state.players[0]?.bankrupt).toBe(true);
    expect(state.buyoutCount[1]).toBe(0);
  });
});

describe("rent-or-buyout choice", () => {
  it("offers a choice when landing on an owned, house-less property", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, ownership: { ...state.ownership, 3: "B" } };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    expect(state.turnPhase).toBe("awaiting_rent_or_buyout_choice");
    expect(state.players[0]?.cash).toBe(500_000);
    expect(state.players[1]?.cash).toBe(500_000);
  });

  it("PAY_RENT charges normal rent and ends the turn", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, ownership: { ...state.ownership, 3: "B" } };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    ({ state } = reduce(state, { type: "PAY_RENT" }, config));

    expect(state.players[0]?.cash).toBe(500_000 - 6_000);
    expect(state.players[1]?.cash).toBe(500_000 + 6_000);
    expect(state.turnPhase).toBe("turn_over");
  });

  it("OFFER_BUYOUT sets a pending offer at 120% of the tile price", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, ownership: { ...state.ownership, 3: "B" } };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    ({ state } = reduce(state, { type: "OFFER_BUYOUT" }, config));

    expect(state.turnPhase).toBe("awaiting_buyout_response");
    expect(state.pendingOffer).toEqual({ tileId: 3, buyerId: "A", ownerId: "B", amount: Math.round(80_000 * 1.2) });
    expect(state.players[0]?.cash).toBe(500_000);
    expect(state.players[1]?.cash).toBe(500_000);
  });

  it("ACCEPT_BUYOUT transfers ownership and pays the owner", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, ownership: { ...state.ownership, 3: "B" } };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "OFFER_BUYOUT" }, config));
    const amount = Math.round(80_000 * 1.2);

    ({ state } = reduce(state, { type: "ACCEPT_BUYOUT", playerId: "B" }, config));

    expect(state.ownership[3]).toBe("A");
    expect(state.players[0]?.cash).toBe(500_000 - amount);
    expect(state.players[1]?.cash).toBe(500_000 + amount);
    expect(state.pendingOffer).toBeNull();
    expect(state.turnPhase).toBe("turn_over");
  });

  it("escalates the buyout price by 10% for each prior accepted buyout on the same tile", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, ownership: { ...state.ownership, 3: "B" }, buyoutCount: { ...state.buyoutCount, 3: 1 } };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    ({ state } = reduce(state, { type: "OFFER_BUYOUT" }, config));

    expect(state.pendingOffer?.amount).toBe(Math.round(80_000 * 1.2 * 1.1));
  });

  it("ACCEPT_BUYOUT increments buyoutCount regardless of the new owner", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, ownership: { ...state.ownership, 3: "B" } };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "OFFER_BUYOUT" }, config));
    ({ state } = reduce(state, { type: "ACCEPT_BUYOUT", playerId: "B" }, config));

    expect(state.buyoutCount[3]).toBe(1);
    expect(state.ownership[3]).toBe("A");
  });

  it("does not increment buyoutCount when the buyer can't afford the offer or the owner rejects", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, ownership: { ...state.ownership, 3: "B" } };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "OFFER_BUYOUT" }, config));
    ({ state } = reduce(state, { type: "REJECT_BUYOUT", playerId: "B" }, config));

    expect(state.buyoutCount[3]).toBe(0);
  });

  it("ignores ACCEPT_BUYOUT/REJECT_BUYOUT from a player other than the offer's owner", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, ownership: { ...state.ownership, 3: "B" } };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "OFFER_BUYOUT" }, config));
    const before = state;

    const accept = reduce(state, { type: "ACCEPT_BUYOUT", playerId: "A" }, config);
    const reject = reduce(state, { type: "REJECT_BUYOUT", playerId: "A" }, config);

    expect(accept.state).toEqual(before);
    expect(reject.state).toEqual(before);
  });

  it("REJECT_BUYOUT charges normal rent instead and leaves ownership unchanged", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, ownership: { ...state.ownership, 3: "B" } };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "OFFER_BUYOUT" }, config));

    ({ state } = reduce(state, { type: "REJECT_BUYOUT", playerId: "B" }, config));

    expect(state.ownership[3]).toBe("B");
    expect(state.players[0]?.cash).toBe(500_000 - 6_000);
    expect(state.players[1]?.cash).toBe(500_000 + 6_000);
    expect(state.pendingOffer).toBeNull();
    expect(state.turnPhase).toBe("turn_over");
  });

  it("skips the choice and auto-charges rent when the property has houses", () => {
    const seed = findSeed((d) => d[0] + d[1] === 6 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    const blueGroupIds = BOARD_TILES.filter((t) => t.type === "property" && t.colorGroup === "blue").map((t) => t.id);
    const ownership = { ...state.ownership };
    for (const id of blueGroupIds) ownership[id] = "B";
    state = { ...state, ownership, houses: { ...state.houses, 6: 1 } };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    expect(state.turnPhase).toBe("turn_over");
    expect(state.players[0]?.cash).toBeLessThan(500_000);
  });

  it("offers the choice for an owned company tile (never has houses)", () => {
    // sum 5, non-double -> lands on tile 5 (Авіакомпанія, a company tile)
    const seed = findSeed((d) => d[0] + d[1] === 5 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, ownership: { ...state.ownership, 5: "B" } };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    expect(state.turnPhase).toBe("awaiting_rent_or_buyout_choice");
  });

  it("leaves the tile with the original owner if the buyer can't afford the buyout and must pay rent instead", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      ownership: { ...state.ownership, 3: "B" },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    // Too poor to afford the 96_000 buyout, so OFFER_BUYOUT is a no-op...
    ({ state } = reduce(state, { type: "OFFER_BUYOUT" }, config));
    expect(state.turnPhase).toBe("awaiting_rent_or_buyout_choice");
    expect(state.pendingOffer).toBeNull();

    // ...and the buyer falls back to paying rent (which they also can't cover, so they bankrupt via that path instead).
    ({ state } = reduce(state, { type: "PAY_RENT" }, config));

    expect(state.ownership[3]).toBe("B");
    expect(state.players[0]?.bankrupt).toBe(true);
    expect(state.players[0]?.cash).toBe(0);
    expect(state.players[1]?.cash).toBe(500_000);
  });

  it("ignores OFFER_BUYOUT when the player cannot afford 120% of the tile price", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      ownership: { ...state.ownership, 3: "B" },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 90_000 } : p)), // buyout needs 96_000
    };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    const before = state;

    ({ state } = reduce(state, { type: "OFFER_BUYOUT" }, config));

    expect(state).toEqual(before);
    expect(state.turnPhase).toBe("awaiting_rent_or_buyout_choice");
    expect(state.pendingOffer).toBeNull();
  });

  it("rejects PAY_RENT/OFFER_BUYOUT/ACCEPT_BUYOUT/REJECT_BUYOUT from the wrong phase", () => {
    let state = createInitialState(players(), config, 1);

    const payRent = reduce(state, { type: "PAY_RENT" }, config);
    const offer = reduce(state, { type: "OFFER_BUYOUT" }, config);
    const accept = reduce(state, { type: "ACCEPT_BUYOUT", playerId: "B" }, config);
    const reject = reduce(state, { type: "REJECT_BUYOUT", playerId: "B" }, config);

    expect(payRent.state).toEqual(state);
    expect(offer.state).toEqual(state);
    expect(accept.state).toEqual(state);
    expect(reject.state).toEqual(state);
  });
});

describe("tax", () => {
  it("charges the bank for landing on a tax tile", () => {
    // sum 7, non-double -> tile 7 ("Додатковий податок", 100_000)
    const seed = findSeed((d) => d[0] + d[1] === 7 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    expect(state.players[0]?.cash).toBe(500_000 - 100_000);
    expect(state.turnPhase).toBe("turn_over");
  });

  it("charges the base property tax when the player owns no houses", () => {
    // from position 27, sum 3 non-double -> tile 30 ("Податок на нерухомість", base 50_000)
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = { ...state, players: state.players.map((p) => (p.id === "A" ? { ...p, position: 27 } : p)) };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    expect(state.players[0]?.position).toBe(30);
    expect(state.players[0]?.cash).toBe(500_000 - 50_000);
  });

  it("surcharges property tax by 25_000 per house the player owns", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      players: state.players.map((p) => (p.id === "A" ? { ...p, position: 27 } : p)),
      ownership: { ...state.ownership, 1: "A", 3: "A" },
      houses: { ...state.houses, 1: 2 },
    };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    expect(state.players[0]?.cash).toBe(500_000 - 50_000 - 2 * 25_000);
  });

  it("does not surcharge non-property-tax tiles even if the player owns houses", () => {
    // sum 7, non-double -> tile 7 ("Додатковий податок", flat 100_000)
    const seed = findSeed((d) => d[0] + d[1] === 7 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      ownership: { ...state.ownership, 1: "A", 3: "A" },
      houses: { ...state.houses, 1: 2 },
    };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    expect(state.players[0]?.cash).toBe(500_000 - 100_000);
  });
});

describe("doubles", () => {
  it("does not grant an extra roll after rolling doubles", () => {
    // sum 10 double (5,5) -> tile 10 (jail, just visiting, no side effect)
    const seed = findSeed((d) => d[0] === d[1] && d[0] + d[1] === 10);
    let state = createInitialState(players(), config, seed);
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    expect(state.players[0]?.position).toBe(10);
    expect(state.turnPhase).toBe("turn_over");
    expect(state.currentPlayerIndex).toBe(0);
  });
});

describe("GO salary", () => {
  it("pays salary when passing GO", () => {
    const seed = findSeed((d) => d[0] + d[1] >= 5);
    let state: GameState = createInitialState(players(), config, seed);
    state = { ...state, players: state.players.map((p) => (p.id === "A" ? { ...p, position: 35 } : p)) };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    expect(state.players[0]?.cash).toBeGreaterThan(500_000);
  });
});

describe("jail", () => {
  it("lets a player pay bail to leave jail", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      players: state.players.map((p) => (p.id === "A" ? { ...p, inJail: true, position: 10 } : p)),
    };
    const { state: next } = reduce(state, { type: "PAY_BAIL" }, config);
    expect(next.players[0]?.inJail).toBe(false);
    expect(next.players[0]?.cash).toBe(500_000 - 50_000);
  });

  it("lets a player use a get-out-of-jail-free card", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === "A" ? { ...p, inJail: true, position: 10, getOutOfJailCards: 1 } : p,
      ),
    };
    const { state: next } = reduce(state, { type: "USE_JAIL_CARD" }, config);
    expect(next.players[0]?.inJail).toBe(false);
    expect(next.players[0]?.getOutOfJailCards).toBe(0);
  });
});

describe("chance/treasury cards", () => {
  it("draws a valid card and emits CardDrawn", () => {
    // sum 2 double (1,1) -> tile 2 (Chance)
    const seed = findSeed((d) => d[0] === 1 && d[1] === 1);
    let state = createInitialState(players(), config, seed);
    const { events } = reduce(state, { type: "ROLL_DICE" }, config);
    const drawn = events.find((e) => e.type === "CardDrawn");
    expect(drawn).toBeDefined();
    if (drawn?.type === "CardDrawn") {
      expect(CHANCE_CARDS.some((c) => c.id === drawn.card.id)).toBe(true);
    }
  });
});

describe("casino", () => {
  it("charges the stake and resolves a payout", () => {
    // sum 20 unreachable with 2 dice; instead drive position manually onto the casino tile (20)
    let state = createInitialState(players(), config, 7);
    state = { ...state, turnPhase: "awaiting_casino_spin" };
    const { state: next, events } = reduce(state, { type: "PLAY_CASINO", stake: 10_000 }, config);
    const result = events.find((e) => e.type === "CasinoResult");
    expect(result).toBeDefined();
    expect(next.turnPhase).toBe("turn_over");
  });

  it("clamps the requested stake to the player's available cash", () => {
    let state = createInitialState(players(), config, 7);
    state = {
      ...state,
      turnPhase: "awaiting_casino_spin",
      players: state.players.map((p, i) => (i === 0 ? { ...p, cash: 5_000 } : p)),
    };
    const { events } = reduce(state, { type: "PLAY_CASINO", stake: 1_000_000 }, config);
    const result = events.find((e) => e.type === "CasinoResult");
    expect(result?.type).toBe("CasinoResult");
    if (result?.type === "CasinoResult") expect(result.stake).toBe(5_000);
  });

  it("clears lastCasinoResult once the turn ends, so the reels don't linger for later turns", () => {
    let state = createInitialState(players(), config, 7);
    state = { ...state, turnPhase: "awaiting_casino_spin" };
    ({ state } = reduce(state, { type: "PLAY_CASINO", stake: 10_000 }, config));
    expect(state.lastCasinoResult).not.toBeNull();
    expect(state.turnPhase).toBe("turn_over");

    ({ state } = reduce(state, { type: "END_TURN" }, config));
    expect(state.lastCasinoResult).toBeNull();
    expect(state.currentPlayerIndex).toBe(1);
  });
});

describe("building houses", () => {
  it("does not allow building without a full color group monopoly", () => {
    let state = createInitialState(players(), config, 1);
    state = { ...state, ownership: { ...state.ownership, 1: "A" } }; // only Budapest, not Warsaw

    const { state: next } = reduce(state, { type: "BUILD_HOUSE", tileId: 1 }, config);

    expect(next.houses[1]).toBe(0);
    expect(next.players[0]?.cash).toBe(500_000);
  });

  it("deducts the group's house cost and increments the house count", () => {
    let state = createInitialState(players(), config, 1);
    state = { ...state, ownership: { ...state.ownership, 1: "A", 3: "A" } }; // full gold group

    const { state: next, events } = reduce(state, { type: "BUILD_HOUSE", tileId: 1 }, config);

    expect(next.houses[1]).toBe(1);
    expect(next.players[0]?.cash).toBe(500_000 - 50_000);
    expect(events.some((e) => e.type === "HouseBuilt")).toBe(true);
  });

  it("does not allow more than 3 houses on a tile", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      ownership: { ...state.ownership, 1: "A", 3: "A" },
      houses: { ...state.houses, 1: 3 },
    };

    const { state: next } = reduce(state, { type: "BUILD_HOUSE", tileId: 1 }, config);

    expect(next.houses[1]).toBe(3);
    expect(next.players[0]?.cash).toBe(500_000);
  });

  it("does not allow building without enough cash", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      ownership: { ...state.ownership, 1: "A", 3: "A" },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 10_000 } : p)),
    };

    const { state: next } = reduce(state, { type: "BUILD_HOUSE", tileId: 1 }, config);

    expect(next.houses[1]).toBe(0);
    expect(next.players[0]?.cash).toBe(10_000);
  });

  it("charges 20% more for each subsequent house on the same tile", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      ownership: { ...state.ownership, 1: "A", 3: "A" },
      houses: { ...state.houses, 1: 1 },
    };

    const { state: afterSecond } = reduce(state, { type: "BUILD_HOUSE", tileId: 1 }, config);
    expect(afterSecond.houses[1]).toBe(2);
    expect(afterSecond.players[0]?.cash).toBe(500_000 - 60_000); // 50_000 * 1.2

    const { state: afterThird } = reduce(afterSecond, { type: "BUILD_HOUSE", tileId: 1 }, config);
    expect(afterThird.houses[1]).toBe(3);
    expect(afterThird.players[0]?.cash).toBe(500_000 - 60_000 - 72_000); // 50_000 * 1.2^2
  });

  it("blocks building a subsequent house if the player can't afford the escalated cost", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      ownership: { ...state.ownership, 1: "A", 3: "A" },
      houses: { ...state.houses, 1: 1 },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 55_000 } : p)), // covers base 50_000, not 60_000
    };

    const { state: next } = reduce(state, { type: "BUILD_HOUSE", tileId: 1 }, config);

    expect(next.houses[1]).toBe(1);
    expect(next.players[0]?.cash).toBe(55_000);
  });

  it("is rejected outside awaiting_roll/turn_over phases", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      ownership: { ...state.ownership, 1: "A", 3: "A" },
      turnPhase: "awaiting_property_decision",
    };

    const { state: next } = reduce(state, { type: "BUILD_HOUSE", tileId: 1 }, config);

    expect(next.houses[1]).toBe(0);
  });

  it("is allowed during turn_over", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      ownership: { ...state.ownership, 1: "A", 3: "A" },
      turnPhase: "turn_over",
    };

    const { state: next } = reduce(state, { type: "BUILD_HOUSE", tileId: 1 }, config);

    expect(next.houses[1]).toBe(1);
  });

  it("charges house-scaled rent instead of the monopoly multiplier", () => {
    // sum 6, non-double -> lands on tile 6 (Prague, blue group, baseRent 8_000)
    const seed = findSeed((d) => d[0] + d[1] === 6 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    const blueGroupIds = BOARD_TILES.filter((t) => t.type === "property" && t.colorGroup === "blue").map((t) => t.id);
    const ownership = { ...state.ownership };
    for (const id of blueGroupIds) ownership[id] = "B";
    state = { ...state, ownership, houses: { ...state.houses, 6: 2 } };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));

    // 8_000 base + 2 houses * 40_000/house = 88_000, not the 16_000 monopoly-multiplier rent
    expect(state.players[0]?.cash).toBe(500_000 - 88_000);
  });
});

describe("loans", () => {
  it("defers to a loan decision instead of bankrupting when the player owns another asset", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      ownership: { ...state.ownership, 3: "B", 1: "A" },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "PAY_RENT" }, config));

    expect(state.turnPhase).toBe("awaiting_loan_decision");
    expect(state.pendingDebt).toEqual({ payerId: "A", creditorId: "B", amount: 6_000 });
    expect(state.players[0]?.bankrupt).toBe(false);
    expect(state.players[0]?.cash).toBe(1_000);
  });

  it("bankrupts immediately when the player owns no pledgeable assets (unchanged behavior)", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      ownership: { ...state.ownership, 3: "B" },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "PAY_RENT" }, config));

    expect(state.turnPhase).toBe("turn_over");
    expect(state.players[0]?.bankrupt).toBe(true);
  });

  it("TAKE_LOAN against a whole property adds 80% of its price and settles the debt", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      ownership: { ...state.ownership, 3: "B", 1: "A" },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "PAY_RENT" }, config));
    expect(state.turnPhase).toBe("awaiting_loan_decision");

    ({ state } = reduce(state, { type: "TAKE_LOAN", tileId: 1, kind: "property" }, config));

    expect(state.turnPhase).toBe("turn_over");
    expect(state.pendingDebt).toBeNull();
    expect(state.loans).toEqual([{ tileId: 1, playerId: "A", kind: "property", principal: 48_000, owed: 60_000, roundsElapsed: 0 }]);
    // 1_000 + 48_000 loan - 6_000 rent
    expect(state.players[0]?.cash).toBe(1_000 + 48_000 - 6_000);
    expect(state.players[1]?.cash).toBe(500_000 + 6_000);
  });

  it("TAKE_LOAN against a house values it at the group's house cost instead of the tile price", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      ownership: { ...state.ownership, 3: "B", 1: "A" },
      houses: { ...state.houses, 1: 2 },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "PAY_RENT" }, config));

    ({ state } = reduce(state, { type: "TAKE_LOAN", tileId: 1, kind: "house" }, config));

    // tile 1 has 2 houses; pledge values the most recently built (index 1): 50_000 * 1.2 = 60_000 -> principal 48_000
    expect(state.loans).toEqual([{ tileId: 1, playerId: "A", kind: "house", principal: 48_000, owed: 60_000, roundsElapsed: 0 }]);
    expect(state.ownership[1]).toBe("A");
    expect(state.houses[1]).toBe(2);
    expect(state.turnPhase).toBe("turn_over");
  });

  it("allows taking several loans in sequence when one alone doesn't cover the debt", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      turnPhase: "awaiting_loan_decision",
      pendingDebt: { payerId: "A", creditorId: "B", amount: 100_000 },
      ownership: { ...state.ownership, 1: "A", 3: "A" },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };

    ({ state } = reduce(state, { type: "TAKE_LOAN", tileId: 1, kind: "property" }, config));
    expect(state.turnPhase).toBe("awaiting_loan_decision");
    expect(state.players[0]?.cash).toBe(1_000 + 48_000);

    ({ state } = reduce(state, { type: "TAKE_LOAN", tileId: 3, kind: "property" }, config));
    expect(state.turnPhase).toBe("turn_over");
    expect(state.pendingDebt).toBeNull();
    expect(state.loans.map((l) => l.tileId).sort()).toEqual([1, 3]);
    expect(state.players[0]?.cash).toBe(1_000 + 48_000 + 64_000 - 100_000);
    expect(state.players[1]?.cash).toBe(500_000 + 100_000);
  });

  it("falls through to bankruptcy when a loan still isn't enough and no collateral remains", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      turnPhase: "awaiting_loan_decision",
      pendingDebt: { payerId: "A", creditorId: "B", amount: 999_999 },
      ownership: { ...state.ownership, 1: "A" },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };

    ({ state } = reduce(state, { type: "TAKE_LOAN", tileId: 1, kind: "property" }, config));

    expect(state.turnPhase).toBe("turn_over");
    expect(state.players[0]?.bankrupt).toBe(true);
    expect(state.players[0]?.cash).toBe(0);
    expect(state.pendingDebt).toBeNull();
    expect(state.loans.some((l) => l.playerId === "A")).toBe(false);
    expect(state.ownership[1]).toBeNull();
  });

  it("DECLARE_BANKRUPTCY bankrupts even though collateral was available", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      turnPhase: "awaiting_loan_decision",
      pendingDebt: { payerId: "A", creditorId: "B", amount: 6_000 },
      ownership: { ...state.ownership, 1: "A" },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };

    ({ state } = reduce(state, { type: "DECLARE_BANKRUPTCY" }, config));

    expect(state.turnPhase).toBe("turn_over");
    expect(state.players[0]?.bankrupt).toBe(true);
    expect(state.pendingDebt).toBeNull();
    expect(state.ownership[1]).toBeNull();
  });

  it("ignores TAKE_LOAN/DECLARE_BANKRUPTCY when the acting player isn't the debtor", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      turnPhase: "awaiting_loan_decision",
      pendingDebt: { payerId: "B", creditorId: "A", amount: 6_000 },
      ownership: { ...state.ownership, 1: "A" },
    };
    const before = state;

    const takeLoan = reduce(state, { type: "TAKE_LOAN", tileId: 1, kind: "property" }, config);
    const bankrupt = reduce(state, { type: "DECLARE_BANKRUPTCY" }, config);

    expect(takeLoan.state).toEqual(before);
    expect(bankrupt.state).toEqual(before);
  });

  it("REPAY_LOAN deducts the full owed amount and removes the loan", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      ownership: { ...state.ownership, 1: "A" },
      loans: [{ tileId: 1, playerId: "A", kind: "property" as const, principal: 64_000, owed: 80_000, roundsElapsed: 1 }],
    };

    const { state: next } = reduce(state, { type: "REPAY_LOAN", tileId: 1 }, config);

    expect(next.loans).toEqual([]);
    expect(next.players[0]?.cash).toBe(500_000 - 80_000);
  });

  it("REPAY_LOAN no-ops without enough cash or for someone else's loan", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      ownership: { ...state.ownership, 1: "A" },
      loans: [{ tileId: 1, playerId: "A", kind: "property" as const, principal: 64_000, owed: 80_000, roundsElapsed: 1 }],
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 10_000 } : p)),
    };

    const { state: poorResult } = reduce(state, { type: "REPAY_LOAN", tileId: 1 }, config);
    expect(poorResult.loans).toHaveLength(1);

    let stateB = {
      ...state,
      loans: [{ tileId: 1, playerId: "B", kind: "property" as const, principal: 64_000, owed: 80_000, roundsElapsed: 1 }],
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 500_000 } : p)),
    };
    const { state: wrongOwnerResult } = reduce(stateB, { type: "REPAY_LOAN", tileId: 1 }, config);
    expect(wrongOwnerResult.loans).toHaveLength(1);
  });

  it("charges interest each of the player's own rolls and seizes the collateral after 3 unpaid rounds", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      ownership: { ...state.ownership, 1: "A" },
      loans: [{ tileId: 1, playerId: "A", kind: "property" as const, principal: 64_000, owed: 80_000, roundsElapsed: 0 }],
    };

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    let loan = state.loans.find((l) => l.tileId === 1);
    expect(loan?.roundsElapsed).toBe(1);
    expect(state.players[0]?.cash).toBeLessThan(500_000);

    state = { ...state, turnPhase: "awaiting_roll" };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    loan = state.loans.find((l) => l.tileId === 1);
    expect(loan?.roundsElapsed).toBe(2);
    expect(state.ownership[1]).toBe("A");

    state = { ...state, turnPhase: "awaiting_roll" };
    const { state: finalState, events } = reduce(state, { type: "ROLL_DICE" }, config);

    expect(finalState.loans.some((l) => l.tileId === 1)).toBe(false);
    expect(finalState.ownership[1]).toBeNull();
    expect(events.some((e) => e.type === "LoanCollateralSeized")).toBe(true);
  });

  it("a repay before the 3rd round prevents seizure", () => {
    let state = createInitialState(players(), config, 1);
    state = {
      ...state,
      ownership: { ...state.ownership, 1: "A" },
      loans: [{ tileId: 1, playerId: "A", kind: "property" as const, principal: 64_000, owed: 80_000, roundsElapsed: 1 }],
    };

    ({ state } = reduce(state, { type: "REPAY_LOAN", tileId: 1 }, config));
    expect(state.loans).toEqual([]);

    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    expect(state.ownership[1]).toBe("A");
  });
});

describe("end turn", () => {
  it("advances to the next player", () => {
    const seed = findSeed((d) => d[0] + d[1] === 7 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    expect(state.turnPhase).toBe("turn_over");
    ({ state } = reduce(state, { type: "END_TURN" }, config));
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.turnPhase).toBe("awaiting_roll");
  });
});
