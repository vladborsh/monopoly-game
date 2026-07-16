import type { Tile } from "../core/board";
import { isOwnable } from "../core/board";
import type { GameState } from "../core/state";
import type { GameEvent } from "../core/events";
import type { LogLine, LogSegment } from "../core/log";
import type { PlayerColorMap } from "../render/boardRenderer";
import { ownsFullColorGroup, calculateRent } from "../core/rules";
import { houseCostForGroup, MAX_HOUSES } from "../core/houses";
import { DEFAULT_STARTING_CASH } from "../core/engine";

export type UIEventName =
  | "roll"
  | "buy"
  | "decline"
  | "pay-rent"
  | "offer-buyout"
  | "accept-buyout"
  | "reject-buyout"
  | "casino-spin"
  | "casino-skip"
  | "pay-bail"
  | "use-jail-card"
  | "end-turn"
  | "new-game"
  | "build-house"
  | "restart-config";

export interface RestartConfigDetail {
  playerCount: number;
  startingCash: number;
}

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const DEFAULT_PLAYER_COUNT = 2;

function formatMoney(amount: number): string {
  return amount.toLocaleString("uk-UA");
}

function playerSegment(playerId: string, playerNames: Record<string, string>): LogSegment {
  return { text: playerNames[playerId] ?? playerId, playerId };
}

export function describeEvent(
  event: GameEvent,
  board: Tile[],
  playerNames: Record<string, string>,
): LogLine | null {
  const name = (playerId: string): LogSegment => playerSegment(playerId, playerNames);
  switch (event.type) {
    case "DiceRolled":
      return [
        name(event.playerId),
        { text: ` rolled ${event.dice[0]} + ${event.dice[1]}${event.isDouble ? " (double!)" : ""}` },
      ];
    case "SalaryPaid":
      return [name(event.playerId), { text: ` passed GO, +${formatMoney(event.amount)}` }];
    case "RentCharged":
      return [
        name(event.payerId),
        { text: ` paid ${formatMoney(event.amount)} rent to ` },
        name(event.ownerId),
      ];
    case "PropertyBought":
      return [
        name(event.playerId),
        { text: ` bought ${board[event.tileId]?.name ?? event.tileId} for ${formatMoney(event.price)}` },
      ];
    case "BuyoutOffered":
      return [
        name(event.buyerId),
        {
          text: ` offered to buy ${board[event.tileId]?.name ?? event.tileId} for ${formatMoney(event.amount)}`,
        },
      ];
    case "BuyoutAccepted":
      return [
        name(event.ownerId),
        { text: ` accepted the offer, selling ${board[event.tileId]?.name ?? event.tileId} to ` },
        name(event.buyerId),
        { text: ` for ${formatMoney(event.amount)}` },
      ];
    case "BuyoutRejected":
      return [name(event.ownerId), { text: " rejected the buyout offer" }];
    case "TaxCharged":
      return [name(event.playerId), { text: ` paid ${formatMoney(event.amount)} tax` }];
    case "CardDrawn":
      return [name(event.playerId), { text: ` drew a ${event.deck} card: "${event.card.text}"` }];
    case "PlayerJailed":
      return [name(event.playerId), { text: ` was sent to jail (${event.reason})` }];
    case "PlayerReleasedFromJail":
      return [name(event.playerId), { text: ` left jail (${event.method})` }];
    case "CasinoResult":
      return event.multiplier > 0
        ? [name(event.playerId), { text: ` won x${event.multiplier} at the casino (+${formatMoney(event.amount)})` }]
        : [name(event.playerId), { text: " lost at the casino" }];
    case "CasinoSkipped":
      return [name(event.playerId), { text: " skipped the casino" }];
    case "PlayerBankrupt":
      return [name(event.playerId), { text: " went bankrupt" }];
    case "HouseBuilt":
      return [
        name(event.playerId),
        { text: ` built a house on ${board[event.tileId]?.name ?? event.tileId} (${event.houses}/${MAX_HOUSES})` },
      ];
    case "GameOver":
      return [name(event.winnerId), { text: " wins the game!" }];
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
  private restartDialog: HTMLDialogElement;
  private restartForm: HTMLFormElement;
  private playerCountInput: HTMLInputElement;
  private startingCashInput: HTMLInputElement;
  private snackbarsEl: HTMLElement;

  constructor(root: HTMLElement, snackbarsRoot: HTMLElement) {
    this.root = root;
    this.snackbarsEl = snackbarsRoot;
    this.root.innerHTML = `
      <div class="ui-panel">
        <div class="ui-header">
          <button type="button" id="ui-restart-btn">Restart game</button>
        </div>
        <div id="ui-players" class="ui-players"></div>
        <div id="ui-actions" class="ui-actions"></div>
        <div id="ui-log" class="ui-log"></div>
      </div>
      <dialog id="ui-restart-dialog" class="ui-restart-dialog">
        <form id="ui-restart-form" method="dialog" class="ui-restart-form">
          <h2>Restart game</h2>
          <label>
            Players
            <input type="number" id="ui-restart-players" min="${MIN_PLAYERS}" max="${MAX_PLAYERS}" step="1" value="${DEFAULT_PLAYER_COUNT}" required />
          </label>
          <label>
            Starting budget
            <input type="number" id="ui-restart-cash" min="0" step="10000" value="${DEFAULT_STARTING_CASH}" required />
          </label>
          <div class="ui-restart-form__buttons">
            <button type="button" id="ui-restart-cancel">Cancel</button>
            <button type="submit" id="ui-restart-confirm">Start</button>
          </div>
        </form>
      </dialog>
    `;
    this.playersEl = this.root.querySelector("#ui-players")!;
    this.actionsEl = this.root.querySelector("#ui-actions")!;
    this.logEl = this.root.querySelector("#ui-log")!;
    this.restartDialog = this.root.querySelector("#ui-restart-dialog")!;
    this.restartForm = this.root.querySelector("#ui-restart-form")!;
    this.playerCountInput = this.root.querySelector("#ui-restart-players")!;
    this.startingCashInput = this.root.querySelector("#ui-restart-cash")!;

    this.root.querySelector("#ui-restart-btn")!.addEventListener("click", () => this.openRestartDialog());
    this.root.querySelector("#ui-restart-cancel")!.addEventListener("click", () => this.restartDialog.close());
    this.restartForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.confirmRestart();
    });
  }

  private openRestartDialog(): void {
    this.playerCountInput.value = String(DEFAULT_PLAYER_COUNT);
    this.startingCashInput.value = String(DEFAULT_STARTING_CASH);
    this.restartDialog.showModal();
  }

  private confirmRestart(): void {
    const playerCount = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(Number(this.playerCountInput.value))));
    const startingCash = Math.max(0, Math.round(Number(this.startingCashInput.value)));
    this.restartDialog.close();
    this.events.dispatchEvent(
      new CustomEvent<RestartConfigDetail>("restart-config", { detail: { playerCount, startingCash } }),
    );
  }

  private emit(name: UIEventName): void {
    this.events.dispatchEvent(new CustomEvent(name));
  }

  private emitBuildHouse(tileId: number): void {
    this.events.dispatchEvent(new CustomEvent("build-house", { detail: { tileId } }));
  }

  private emitBuyoutResponse(name: "accept-buyout" | "reject-buyout", playerId: string): void {
    this.events.dispatchEvent(new CustomEvent(name, { detail: { playerId } }));
  }

  private buyoutButton(label: string, name: "accept-buyout" | "reject-buyout", ownerId: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", () => this.emitBuyoutResponse(name, ownerId));
    return btn;
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
      case "awaiting_rent_or_buyout_choice": {
        const tile = board[player.position];
        const ownerId = tile ? state.ownership[tile.id] : null;
        if (tile && isOwnable(tile) && ownerId) {
          const rent = calculateRent(tile, state.ownership, ownerId, board, state.houses);
          const buyoutAmount = Math.round(tile.price * 1.2);
          this.actionsEl.appendChild(this.button(`Pay rent (${formatMoney(rent)})`, "pay-rent"));
          this.actionsEl.appendChild(
            this.button(`Offer buyout (${formatMoney(buyoutAmount)})`, "offer-buyout", player.cash <= 0),
          );
        }
        break;
      }
      case "awaiting_buyout_response": {
        const offer = state.pendingOffer;
        if (offer) {
          const ownerName = state.players.find((p) => p.id === offer.ownerId)?.name ?? offer.ownerId;
          const buyerName = state.players.find((p) => p.id === offer.buyerId)?.name ?? offer.buyerId;
          const p = document.createElement("p");
          p.textContent = `${ownerName}: ${buyerName} offers ${formatMoney(offer.amount)} for this property. Accept?`;
          this.actionsEl.appendChild(p);
          this.actionsEl.appendChild(this.buyoutButton("Accept", "accept-buyout", offer.ownerId));
          this.actionsEl.appendChild(this.buyoutButton("Reject", "reject-buyout", offer.ownerId));
        }
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

  showMoneyChanges(changes: { playerId: string; name: string; delta: number }[], colors: PlayerColorMap): void {
    for (const change of changes) {
      const toast = document.createElement("div");
      toast.className = `ui-snackbar ${change.delta > 0 ? "ui-snackbar--gain" : "ui-snackbar--loss"}`;
      toast.style.borderLeftColor = colors[change.playerId] ?? "#fff";
      toast.textContent = `${change.name}: ${change.delta > 0 ? "+" : ""}${formatMoney(change.delta)}`;
      this.snackbarsEl.appendChild(toast);
      setTimeout(() => toast.remove(), 2500);
    }
  }

  setLog(entries: LogLine[], colors: PlayerColorMap): void {
    this.logEl.innerHTML = "";
    for (let i = entries.length - 1; i >= 0; i--) {
      const segments = entries[i];
      if (segments === undefined) continue;
      const line = document.createElement("div");
      for (const segment of segments) {
        if (segment.playerId) {
          const span = document.createElement("span");
          span.className = "ui-log-player";
          span.style.color = colors[segment.playerId] ?? "inherit";
          span.textContent = segment.text;
          line.appendChild(span);
        } else {
          line.appendChild(document.createTextNode(segment.text));
        }
      }
      this.logEl.appendChild(line);
    }
  }
}
