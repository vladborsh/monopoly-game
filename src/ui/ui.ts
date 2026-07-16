import type { Tile } from "../core/board";
import { isOwnable } from "../core/board";
import type { GameState } from "../core/state";
import type { GameEvent } from "../core/events";
import type { PlayerColorMap } from "../render/boardRenderer";
import { ownsFullColorGroup } from "../core/rules";
import { houseCostForGroup, MAX_HOUSES } from "../core/houses";

export type UIEventName =
  | "roll"
  | "buy"
  | "decline"
  | "casino-spin"
  | "casino-skip"
  | "pay-bail"
  | "use-jail-card"
  | "end-turn"
  | "new-game"
  | "build-house";

function formatMoney(amount: number): string {
  return amount.toLocaleString("uk-UA");
}

export function describeEvent(event: GameEvent, board: Tile[]): string | null {
  switch (event.type) {
    case "DiceRolled":
      return `${event.playerId} rolled ${event.dice[0]} + ${event.dice[1]}${event.isDouble ? " (double!)" : ""}`;
    case "SalaryPaid":
      return `${event.playerId} passed GO, +${formatMoney(event.amount)}`;
    case "RentCharged":
      return `${event.payerId} paid ${formatMoney(event.amount)} rent to ${event.ownerId}`;
    case "PropertyBought":
      return `${event.playerId} bought ${board[event.tileId]?.name ?? event.tileId} for ${formatMoney(event.price)}`;
    case "TaxCharged":
      return `${event.playerId} paid ${formatMoney(event.amount)} tax`;
    case "CardDrawn":
      return `${event.playerId} drew a ${event.deck} card: "${event.card.text}"`;
    case "PlayerJailed":
      return `${event.playerId} was sent to jail (${event.reason})`;
    case "PlayerReleasedFromJail":
      return `${event.playerId} left jail (${event.method})`;
    case "CasinoResult":
      return event.multiplier > 0
        ? `${event.playerId} won x${event.multiplier} at the casino (+${formatMoney(event.amount)})`
        : `${event.playerId} lost at the casino`;
    case "CasinoSkipped":
      return `${event.playerId} skipped the casino`;
    case "PlayerBankrupt":
      return `${event.playerId} went bankrupt`;
    case "HouseBuilt":
      return `${event.playerId} built a house on ${board[event.tileId]?.name ?? event.tileId} (${event.houses}/${MAX_HOUSES})`;
    case "GameOver":
      return `${event.winnerId} wins the game!`;
    default:
      return null;
  }
}

export class GameUI {
  readonly events = new EventTarget();
  private root: HTMLElement;
  private playersEl: HTMLElement;
  private actionsEl: HTMLElement;
  private logEl: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = `
      <div class="ui-panel">
        <div id="ui-players" class="ui-players"></div>
        <div id="ui-actions" class="ui-actions"></div>
        <div id="ui-log" class="ui-log"></div>
      </div>
    `;
    this.playersEl = this.root.querySelector("#ui-players")!;
    this.actionsEl = this.root.querySelector("#ui-actions")!;
    this.logEl = this.root.querySelector("#ui-log")!;
  }

  private emit(name: UIEventName): void {
    this.events.dispatchEvent(new CustomEvent(name));
  }

  private emitBuildHouse(tileId: number): void {
    this.events.dispatchEvent(new CustomEvent("build-house", { detail: { tileId } }));
  }

  private button(label: string, name: UIEventName, disabled = false): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.disabled = disabled;
    btn.addEventListener("click", () => this.emit(name));
    return btn;
  }

  renderPlayers(state: GameState, colors: PlayerColorMap): void {
    this.playersEl.innerHTML = "";
    state.players.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "ui-player" + (i === state.currentPlayerIndex ? " ui-player--active" : "");
      if (p.bankrupt) row.classList.add("ui-player--bankrupt");
      const swatch = document.createElement("span");
      swatch.className = "ui-swatch";
      swatch.style.background = colors[p.id] ?? "#fff";
      row.appendChild(swatch);
      const label = document.createElement("span");
      label.textContent = `${p.name}: ${formatMoney(p.cash)}${p.inJail ? " (jail)" : ""}${p.bankrupt ? " (bankrupt)" : ""}`;
      row.appendChild(label);
      this.playersEl.appendChild(row);
    });
  }

  renderActions(state: GameState, board: Tile[]): void {
    this.actionsEl.innerHTML = "";
    const player = state.players[state.currentPlayerIndex];
    if (!player) return;

    switch (state.turnPhase) {
      case "awaiting_roll": {
        if (player.inJail) {
          this.actionsEl.appendChild(this.button("Roll for doubles", "roll"));
          this.actionsEl.appendChild(this.button(`Pay bail`, "pay-bail"));
          if (player.getOutOfJailCards > 0) {
            this.actionsEl.appendChild(this.button("Use jail card", "use-jail-card"));
          }
        } else {
          this.actionsEl.appendChild(this.button("Roll dice", "roll"));
        }
        break;
      }
      case "awaiting_property_decision": {
        const tile = board[player.position];
        const price = tile && isOwnable(tile) ? tile.price : 0;
        this.actionsEl.appendChild(this.button(`Buy for ${formatMoney(price)}`, "buy", player.cash < price));
        this.actionsEl.appendChild(this.button("Decline", "decline"));
        break;
      }
      case "awaiting_casino_spin": {
        this.actionsEl.appendChild(this.button("Spin casino", "casino-spin"));
        this.actionsEl.appendChild(this.button("Skip", "casino-skip"));
        break;
      }
      case "turn_over": {
        this.actionsEl.appendChild(this.button("End turn", "end-turn"));
        break;
      }
      case "game_over": {
        const p = document.createElement("p");
        p.textContent = `Game over. Winner: ${state.winnerId}`;
        this.actionsEl.appendChild(p);
        this.actionsEl.appendChild(this.button("Start new game", "new-game"));
        break;
      }
    }

    if (state.turnPhase === "awaiting_roll" || state.turnPhase === "turn_over") {
      this.renderBuildHouseButtons(state, board, player);
    }
  }

  private renderBuildHouseButtons(state: GameState, board: Tile[], player: GameState["players"][number]): void {
    const buildable = board.filter(
      (tile): tile is Extract<Tile, { type: "property" }> =>
        tile.type === "property" &&
        state.ownership[tile.id] === player.id &&
        (state.houses[tile.id] ?? 0) < MAX_HOUSES &&
        ownsFullColorGroup(tile, state.ownership, player.id, board),
    );
    for (const tile of buildable) {
      const houses = state.houses[tile.id] ?? 0;
      const cost = houseCostForGroup(tile.colorGroup);
      const btn = document.createElement("button");
      btn.textContent = `Побудувати будинок: ${tile.name} (${houses}/${MAX_HOUSES}) — ${formatMoney(cost)}`;
      btn.disabled = player.cash < cost;
      btn.addEventListener("click", () => this.emitBuildHouse(tile.id));
      this.actionsEl.appendChild(btn);
    }
  }

  setLog(entries: string[]): void {
    this.logEl.innerHTML = "";
    for (let i = entries.length - 1; i >= 0; i--) {
      const text = entries[i];
      if (text === undefined) continue;
      const line = document.createElement("div");
      line.textContent = text;
      this.logEl.appendChild(line);
    }
  }
}
