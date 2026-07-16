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

  it("leaves the tile with the original owner if the buyer goes bankrupt paying the buyout", () => {
    const seed = findSeed((d) => d[0] + d[1] === 3 && d[0] !== d[1]);
    let state = createInitialState(players(), config, seed);
    state = {
      ...state,
      ownership: { ...state.ownership, 3: "B" },
      players: state.players.map((p) => (p.id === "A" ? { ...p, cash: 1_000 } : p)),
    };
    ({ state } = reduce(state, { type: "ROLL_DICE" }, config));
    ({ state } = reduce(state, { type: "OFFER_BUYOUT" }, config));

    ({ state } = reduce(state, { type: "ACCEPT_BUYOUT", playerId: "B" }, config));

    expect(state.ownership[3]).toBe("B");
    expect(state.players[0]?.bankrupt).toBe(true);
    expect(state.players[0]?.cash).toBe(0);
    expect(state.players[1]?.cash).toBe(500_000);
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
    const { state: next, events } = reduce(state, { type: "PLAY_CASINO" }, config);
    const result = events.find((e) => e.type === "CasinoResult");
    expect(result).toBeDefined();
    expect(next.turnPhase).toBe("turn_over");
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
