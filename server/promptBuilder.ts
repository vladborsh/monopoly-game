import type { Action } from "../src/core/actions";
import type { GameConfig } from "../src/core/engine";
import type { GameState } from "../src/core/state";
import { isOwnable, type PropertyTile } from "../src/core/board";
import { buyoutAmountForTile, calculateRent, COMPANY_RENT_BY_COUNT } from "../src/core/rules";
import { houseCostForBuild, rentPerHouseForGroup } from "../src/core/houses";
import type { ChooseActionTool } from "./anthropicClient";

export interface DescribedAction {
  action: Action;
  description: string;
}

function tileName(config: GameConfig, tileId: number): string {
  return config.board[tileId]?.name ?? `tile #${tileId}`;
}

function describeAction(action: Action, state: GameState, config: GameConfig): string {
  switch (action.type) {
    case "ROLL_DICE":
      return "Roll the dice";
    case "BUY_PROPERTY": {
      const player = state.players[state.currentPlayerIndex];
      const tile = player ? config.board[player.position] : undefined;
      const price = tile && isOwnable(tile) ? tile.price : 0;
      return `Buy ${tileName(config, player?.position ?? 0)} for ${price.toLocaleString()}`;
    }
    case "DECLINE_PROPERTY":
      return "Decline to buy this property";
    case "PAY_RENT": {
      const player = state.players[state.currentPlayerIndex];
      const tile = player ? config.board[player.position] : undefined;
      const ownerId = tile ? state.ownership[tile.id] : null;
      const amount =
        tile && ownerId ? calculateRent(tile, state.ownership, ownerId, config.board, state.houses) : 0;
      return `Pay rent of ${amount.toLocaleString()} to the owner`;
    }
    case "OFFER_BUYOUT": {
      const player = state.players[state.currentPlayerIndex];
      const tile = player ? config.board[player.position] : undefined;
      const amount = tile && isOwnable(tile) ? buyoutAmountForTile(tile.price, state.buyoutCount[tile.id] ?? 0) : 0;
      return `Offer to buy out the owner instead of paying rent, for ${amount.toLocaleString()}`;
    }
    case "ACCEPT_BUYOUT":
      return `Accept the buyout offer for ${tileName(config, state.pendingOffer?.tileId ?? -1)} (${(
        state.pendingOffer?.amount ?? 0
      ).toLocaleString()})`;
    case "REJECT_BUYOUT": {
      const offer = state.pendingOffer;
      const tile = offer ? config.board[offer.tileId] : undefined;
      const amount =
        offer && tile ? calculateRent(tile, state.ownership, offer.ownerId, config.board, state.houses) : 0;
      return `Reject the buyout offer for ${tileName(config, offer?.tileId ?? -1)} (falls back to a rent charge of ${amount.toLocaleString()})`;
    }
    case "PLAY_CASINO":
      return `Spin the casino with a stake of ${action.stake.toLocaleString()}`;
    case "SKIP_CASINO":
      return "Skip the casino";
    case "PAY_BAIL":
      return "Pay bail to get out of jail";
    case "USE_JAIL_CARD":
      return "Use a get-out-of-jail-free card";
    case "END_TURN":
      return "End the turn";
    case "BUILD_HOUSE":
      return `Build a house on ${tileName(config, action.tileId)}`;
    case "TAKE_LOAN":
      return `Take a bank loan against ${action.kind === "house" ? "a house on " : ""}${tileName(config, action.tileId)}`;
    case "REPAY_LOAN":
      return `Repay the loan on ${tileName(config, action.tileId)}`;
    case "DECLARE_BANKRUPTCY":
      return "Declare bankruptcy";
  }
}

export function describeLegalActions(legalActions: Action[], state: GameState, config: GameConfig): DescribedAction[] {
  return legalActions.map((action) => ({ action, description: describeAction(action, state, config) }));
}

export function buildTool(described: DescribedAction[]): ChooseActionTool {
  return {
    name: "choose_action",
    description: "Choose which legal Monopoly action to take next, by index.",
    input_schema: {
      type: "object",
      properties: {
        choiceIndex: {
          type: "integer",
          enum: described.map((_, i) => i),
          description: "Index into the numbered list of legal actions given in the prompt.",
        },
        reasoning: {
          type: "string",
          description: "One or two sentences, in Ukrainian, explaining why this action was chosen.",
        },
      },
      required: ["choiceIndex"],
    },
  };
}

function describePlayer(state: GameState, config: GameConfig, playerId: string): string {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return "";
  const tile = config.board[player.position];
  const parts = [
    `cash ${player.cash.toLocaleString()}`,
    `on ${tile?.name ?? `tile #${player.position}`}`,
  ];
  if (player.inJail) parts.push(`in jail (attempt ${player.jailTurns + 1}/3)`);
  if (player.getOutOfJailCards > 0) parts.push(`${player.getOutOfJailCards} jail-free card(s)`);
  return parts.join(", ");
}

function ownerLabel(state: GameState, ownerId: string | null | undefined): string {
  if (!ownerId) return "bank";
  return state.players.find((p) => p.id === ownerId)?.name ?? ownerId;
}

function describePropertyTile(state: GameState, tile: PropertyTile): string {
  const houses = state.houses[tile.id] ?? 0;
  const loan = state.loans.some((l) => l.tileId === tile.id);
  const buyouts = state.buyoutCount[tile.id] ?? 0;
  const bits = [
    `price ${tile.price.toLocaleString()}`,
    `rent ${tile.baseRent.toLocaleString()}×${tile.monopolyMultiplier}`,
    `owner: ${ownerLabel(state, state.ownership[tile.id])}`,
  ];
  if (houses > 0) bits.push(`houses:${houses}`);
  if (loan) bits.push("loan");
  if (buyouts > 0) bits.push(`buyouts:${buyouts}`);
  return `${tile.name}[${bits.join(", ")}]`;
}

/** One compact line per color group + one for companies: static zone economics plus who owns what. */
function describeBoard(state: GameState, config: GameConfig): string[] {
  const groups = new Map<string, PropertyTile[]>();
  const companies: Extract<(typeof config.board)[number], { type: "company" }>[] = [];
  for (const tile of config.board) {
    if (tile.type === "property") {
      const list = groups.get(tile.colorGroup) ?? [];
      list.push(tile);
      groups.set(tile.colorGroup, list);
    } else if (tile.type === "company") {
      companies.push(tile);
    }
  }

  const lines: string[] = [];
  for (const [group, tiles] of groups) {
    const rentPerHouse = rentPerHouseForGroup(group);
    const houseCost = houseCostForBuild(group, 0);
    const tilesText = tiles.map((tile) => describePropertyTile(state, tile)).join("; ");
    lines.push(`${group} (rent/house ${rentPerHouse.toLocaleString()}, house cost ${houseCost.toLocaleString()} +20%/house): ${tilesText}`);
  }
  if (companies.length > 0) {
    const rentScale = COMPANY_RENT_BY_COUNT.slice(1)
      .map((amount, i) => `${i + 1}${i === COMPANY_RENT_BY_COUNT.length - 2 ? "+" : ""}→${amount.toLocaleString()}`)
      .join(", ");
    const tilesText = companies
      .map((tile) => `${tile.name}[price ${tile.price.toLocaleString()}, owner: ${ownerLabel(state, state.ownership[tile.id])}]`)
      .join("; ");
    lines.push(`Companies (rent by count owned: ${rentScale}): ${tilesText}`);
  }
  return lines;
}

export function buildPrompt(
  state: GameState,
  config: GameConfig,
  playerId: string,
  described: DescribedAction[],
): string {
  const player = state.players.find((p) => p.id === playerId);
  const opponents = state.players
    .filter((p) => p.id !== playerId)
    .map((p) => `${p.name} (cash ${p.cash.toLocaleString()}${p.bankrupt ? ", bankrupt" : ""})`)
    .join("; ");

  const lines = [
    `You are playing Ukrainian Monopoly as ${player?.name ?? playerId}. Choose the best legal action for your position.`,
    `Your status: ${describePlayer(state, config, playerId)}.`,
    `Opponents: ${opponents || "none"}.`,
    "Buyout rule: landing on another player's house-free property lets you offer a buyout instead of paying rent. " +
      "Price = tile price × 1.2, +10% compounding for every previously accepted buyout on that specific tile. " +
      "The owner then accepts (sells) or rejects (falls back to normal rent, no escalation).",
    `Board — zone economics and current ownership (rent = baseRent×monopolyMultiplier once you own the whole group; ` +
      `once any house is built there, rent = baseRent + houses×rentPerHouse instead):\n` +
      describeBoard(state, config).join("\n"),
    `Current turn phase: ${state.turnPhase}.`,
  ];

  if (state.turnPhase === "awaiting_buyout_response" && state.pendingOffer) {
    const offer = state.pendingOffer;
    lines.push(
      `${state.players.find((p) => p.id === offer.buyerId)?.name ?? offer.buyerId} has offered ${offer.amount.toLocaleString()} to buy out your tile ${tileName(config, offer.tileId)}.`,
    );
  }
  if (state.turnPhase === "awaiting_loan_decision" && state.pendingDebt) {
    const debt = state.pendingDebt;
    lines.push(`You owe ${debt.amount.toLocaleString()} and cannot cover it in cash. Take a loan or declare bankruptcy.`);
  }

  lines.push(
    "All dollar amounts you need are already computed in the action descriptions below — use those numbers directly, do not recompute rent/prices yourself from the Board table above (it's for strategic context only).",
  );
  lines.push("Legal actions:");
  described.forEach((d, i) => lines.push(`${i}: ${d.description}`));
  lines.push(
    "Call choose_action with the index of the best action and a brief reasoning. Write the reasoning in Ukrainian — it will be shown to the players in the game chat.",
  );

  return lines.join("\n");
}
