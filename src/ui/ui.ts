import type { Tile } from "../core/board";
import { isOwnable } from "../core/board";
import type { GameState } from "../core/state";
import type { GameEvent } from "../core/events";
import type { LogLine, LogSegment } from "../core/log";
import { tileColor, type PlayerColorMap } from "../render/boardRenderer";
import {
  ownsFullColorGroup,
  calculateRent,
  calculatePropertyRent,
  buyoutAmountForTile,
  COMPANY_RENT_BY_COUNT,
} from "../core/rules";
import { houseCostForBuild, rentPerHouseForGroup, MAX_HOUSES } from "../core/houses";
import { getPledgeableOptions } from "../core/loans";
import { DEFAULT_STARTING_CASH } from "../core/engine";
import { MIN_CASINO_STAKE } from "../core/casino";

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
  | "take-loan"
  | "repay-loan"
  | "declare-bankruptcy"
  | "restart-config";

export interface RestartConfigDetail {
  playerCount: number;
  startingCash: number;
  aiFlags: boolean[];
}

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const DEFAULT_PLAYER_COUNT = 2;
const MAX_AI_CHAT_MESSAGES = 50;

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
        ? [
            name(event.playerId),
            { text: ` won x${event.multiplier} at the casino on a ${formatMoney(event.stake)} bet (+${formatMoney(event.amount)})` },
          ]
        : [name(event.playerId), { text: ` lost their ${formatMoney(event.stake)} bet at the casino` }];
    case "CasinoSkipped":
      return [name(event.playerId), { text: " skipped the casino" }];
    case "PlayerBankrupt":
      return [name(event.playerId), { text: " went bankrupt" }];
    case "LoanRequired":
      return [name(event.playerId), { text: ` cannot cover ${formatMoney(event.amount)} and must take a loan or go bankrupt` }];
    case "LoanTaken":
      return [
        name(event.playerId),
        {
          text: ` pledged ${event.kind === "house" ? "a house on " : ""}${board[event.tileId]?.name ?? event.tileId} for a loan of ${formatMoney(event.principal)}`,
        },
      ];
    case "LoanRepaid":
      return [
        name(event.playerId),
        { text: ` repaid the loan on ${board[event.tileId]?.name ?? event.tileId} (${formatMoney(event.amount)})` },
      ];
    case "LoanInterestCharged":
      return event.amount > 0
        ? [
            name(event.playerId),
            { text: ` paid ${formatMoney(event.amount)} interest on the loan for ${board[event.tileId]?.name ?? event.tileId}` },
          ]
        : null;
    case "LoanCollateralSeized":
      return [
        name(event.playerId),
        {
          text: ` failed to repay in time — the bank seized ${event.kind === "house" ? "a house on " : ""}${board[event.tileId]?.name ?? event.tileId}`,
        },
      ];
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
  private tileInfoEl: HTMLElement;
  private actionsEl: HTMLElement;
  private logEl: HTMLElement;
  private aiChatEl: HTMLElement;
  private restartDialog: HTMLDialogElement;
  private restartForm: HTMLFormElement;
  private playerCountInput: HTMLInputElement;
  private startingCashInput: HTMLInputElement;
  private aiListEl: HTMLElement;
  private snackbarsEl: HTMLElement;

  constructor(root: HTMLElement, snackbarsRoot: HTMLElement, aiChatRoot: HTMLElement) {
    this.root = root;
    this.snackbarsEl = snackbarsRoot;
    aiChatRoot.innerHTML = `
      <div class="ui-ai-chat-title">AI chat</div>
      <div id="ui-ai-chat" class="ui-ai-chat"></div>
    `;
    this.aiChatEl = aiChatRoot.querySelector("#ui-ai-chat")!;
    this.root.innerHTML = `
      <div class="ui-panel">
        <div class="ui-header">
          <button type="button" id="ui-restart-btn">Restart game</button>
        </div>
        <div id="ui-players" class="ui-players"></div>
        <div id="ui-actions" class="ui-actions"></div>
        <div id="ui-log" class="ui-log"></div>
        <div id="ui-tile-info" class="ui-tile-info"></div>
      </div>
      <dialog id="ui-restart-dialog" class="ui-restart-dialog">
        <form id="ui-restart-form" method="dialog" class="ui-restart-form">
          <h2>Restart game</h2>
          <label>
            Players
            <input type="number" id="ui-restart-players" min="${MIN_PLAYERS}" max="${MAX_PLAYERS}" step="1" value="${DEFAULT_PLAYER_COUNT}" required />
          </label>
          <div id="ui-restart-ai-list" class="ui-restart-ai-list"></div>
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
    this.tileInfoEl = this.root.querySelector("#ui-tile-info")!;
    this.actionsEl = this.root.querySelector("#ui-actions")!;
    this.logEl = this.root.querySelector("#ui-log")!;
    this.restartDialog = this.root.querySelector("#ui-restart-dialog")!;
    this.restartForm = this.root.querySelector("#ui-restart-form")!;
    this.playerCountInput = this.root.querySelector("#ui-restart-players")!;
    this.startingCashInput = this.root.querySelector("#ui-restart-cash")!;
    this.aiListEl = this.root.querySelector("#ui-restart-ai-list")!;

    this.root.querySelector("#ui-restart-btn")!.addEventListener("click", () => this.openRestartDialog());
    this.root.querySelector("#ui-restart-cancel")!.addEventListener("click", () => this.restartDialog.close());
    this.playerCountInput.addEventListener("input", () => this.syncAiCheckboxCount());
    this.restartForm.addEventListener("submit", (e) => {
      e.preventDefault();
      this.confirmRestart();
    });
  }

  private renderAiCheckboxes(count: number, checked: boolean[] = []): void {
    this.aiListEl.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const label = document.createElement("label");
      label.className = "ui-restart-ai-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = checked[i] ?? false;
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(` Player ${i + 1} is a bot`));
      this.aiListEl.appendChild(label);
    }
  }

  private syncAiCheckboxCount(): void {
    const count = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(Number(this.playerCountInput.value)) || MIN_PLAYERS));
    const existingChecked = Array.from(this.aiListEl.querySelectorAll("input[type=checkbox]")).map(
      (el) => (el as HTMLInputElement).checked,
    );
    this.renderAiCheckboxes(count, existingChecked);
  }

  private openRestartDialog(): void {
    this.playerCountInput.value = String(DEFAULT_PLAYER_COUNT);
    this.startingCashInput.value = String(DEFAULT_STARTING_CASH);
    this.renderAiCheckboxes(DEFAULT_PLAYER_COUNT);
    this.restartDialog.showModal();
  }

  private confirmRestart(): void {
    const playerCount = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(Number(this.playerCountInput.value))));
    const startingCash = Math.max(0, Math.round(Number(this.startingCashInput.value)));
    const aiFlags = Array.from(this.aiListEl.querySelectorAll("input[type=checkbox]"))
      .slice(0, playerCount)
      .map((el) => (el as HTMLInputElement).checked);
    this.restartDialog.close();
    this.events.dispatchEvent(
      new CustomEvent<RestartConfigDetail>("restart-config", { detail: { playerCount, startingCash, aiFlags } }),
    );
  }

  showAiThinking(name: string): void {
    this.actionsEl.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = `${name} (bot) is thinking...`;
    this.actionsEl.appendChild(p);
  }

  addAiChatMessage(playerId: string, name: string, text: string, colors: PlayerColorMap): void {
    const row = document.createElement("div");
    row.className = "ui-ai-chat__msg";
    const nameEl = document.createElement("span");
    nameEl.className = "ui-ai-chat__name";
    nameEl.style.color = colors[playerId] ?? "inherit";
    nameEl.textContent = `${name}: `;
    row.appendChild(nameEl);
    row.appendChild(document.createTextNode(text));
    this.aiChatEl.appendChild(row);
    while (this.aiChatEl.childElementCount > MAX_AI_CHAT_MESSAGES) {
      this.aiChatEl.firstElementChild?.remove();
    }
    this.aiChatEl.scrollTop = this.aiChatEl.scrollHeight;
  }

  clearAiChat(): void {
    this.aiChatEl.innerHTML = "";
  }

  private emit(name: UIEventName): void {
    this.events.dispatchEvent(new CustomEvent(name));
  }

  private emitBuildHouse(tileId: number): void {
    this.events.dispatchEvent(new CustomEvent("build-house", { detail: { tileId } }));
  }

  private emitTakeLoan(tileId: number, kind: "house" | "property", playerId: string): void {
    this.events.dispatchEvent(new CustomEvent("take-loan", { detail: { tileId, kind, playerId } }));
  }

  private emitDeclareBankruptcy(playerId: string): void {
    this.events.dispatchEvent(new CustomEvent("declare-bankruptcy", { detail: { playerId } }));
  }

  private emitRepayLoan(tileId: number): void {
    this.events.dispatchEvent(new CustomEvent("repay-loan", { detail: { tileId } }));
  }

  private emitPlayCasino(stake: number): void {
    this.events.dispatchEvent(new CustomEvent("casino-spin", { detail: { stake } }));
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
      const loanCount = state.loans.filter((l) => l.playerId === p.id).length;
      const label = document.createElement("span");
      label.textContent = `${p.name}${p.isAI ? " 🤖" : ""}: ${formatMoney(p.cash)}${p.inJail ? " (jail)" : ""}${p.bankrupt ? " (bankrupt)" : ""}${loanCount > 0 ? ` (loans: ${loanCount})` : ""}`;
      row.appendChild(label);
      this.playersEl.appendChild(row);
    });
  }

  renderTileInfo(state: GameState, board: Tile[], colors: PlayerColorMap): void {
    this.tileInfoEl.innerHTML = "";
    const player = state.players[state.currentPlayerIndex];
    const tile = player ? board[player.position] : undefined;
    if (!player || !tile || !isOwnable(tile)) return;

    const row = (label: string, value: string, color?: string): void => {
      const el = document.createElement("div");
      el.className = "ui-tile-info__row";
      const labelEl = document.createElement("span");
      labelEl.className = "ui-tile-info__label";
      labelEl.textContent = label;
      const valueEl = document.createElement("span");
      valueEl.className = "ui-tile-info__value";
      valueEl.textContent = value;
      if (color) valueEl.style.color = color;
      el.appendChild(labelEl);
      el.appendChild(valueEl);
      this.tileInfoEl.appendChild(el);
    };

    const title = document.createElement("div");
    title.className = "ui-tile-info__title";
    const swatch = document.createElement("span");
    swatch.className = "ui-tile-info__swatch";
    swatch.style.background = tileColor(tile);
    title.appendChild(swatch);
    title.appendChild(document.createTextNode(tile.name));
    this.tileInfoEl.appendChild(title);

    row("Price", formatMoney(tile.price));

    const ownerId = state.ownership[tile.id];
    if (ownerId) {
      const ownerName = state.players.find((p) => p.id === ownerId)?.name ?? ownerId;
      row("Owner", ownerName, colors[ownerId]);
      const rent = calculateRent(tile, state.ownership, ownerId, board, state.houses);
      row("Rent", formatMoney(rent));
    }

    if (tile.type === "property") {
      const landOnlyRent = ownerId ? calculatePropertyRent(tile, state.ownership, ownerId, board, {}) : tile.baseRent;
      row("Rent (land only)", formatMoney(landOnlyRent));

      const houses = state.houses[tile.id] ?? 0;
      row("Rent per house", formatMoney(rentPerHouseForGroup(tile.colorGroup)));
      if (houses < MAX_HOUSES) {
        row("Next house cost", formatMoney(houseCostForBuild(tile.colorGroup, houses)));
      } else {
        row("Houses", "Max built");
      }
    } else if (tile.type === "company") {
      const ownedCount = ownerId
        ? board.filter((t) => t.type === "company" && state.ownership[t.id] === ownerId).length
        : 0;
      for (let count = 1; count < COMPANY_RENT_BY_COUNT.length; count++) {
        const isLast = count === COMPANY_RENT_BY_COUNT.length - 1;
        const label = isLast ? `Rent (${count}+ companies)` : `Rent (${count} compan${count === 1 ? "y" : "ies"})`;
        const isCurrentTier = ownerId ? ownedCount === count || (isLast && ownedCount >= count) : false;
        row(label, formatMoney(COMPANY_RENT_BY_COUNT[count] ?? 0), isCurrentTier ? colors[ownerId!] : undefined);
      }
    }
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
          const buyoutAmount = buyoutAmountForTile(tile.price, state.buyoutCount[tile.id] ?? 0);
          this.actionsEl.appendChild(this.button(`Pay rent (${formatMoney(rent)})`, "pay-rent"));
          this.actionsEl.appendChild(
            this.button(`Offer buyout (${formatMoney(buyoutAmount)})`, "offer-buyout", player.cash < buyoutAmount),
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
        const maxStake = Math.max(MIN_CASINO_STAKE, player.cash);
        const stakeLabel = document.createElement("label");
        stakeLabel.textContent = "Bet: ";
        const stakeInput = document.createElement("input");
        stakeInput.type = "number";
        stakeInput.min = String(MIN_CASINO_STAKE);
        stakeInput.max = String(maxStake);
        stakeInput.step = String(MIN_CASINO_STAKE);
        stakeInput.value = String(Math.min(MIN_CASINO_STAKE, maxStake));
        stakeLabel.appendChild(stakeInput);
        this.actionsEl.appendChild(stakeLabel);

        const spinBtn = document.createElement("button");
        spinBtn.textContent = "Spin casino";
        spinBtn.disabled = player.cash < MIN_CASINO_STAKE;
        spinBtn.addEventListener("click", () => {
          const stake = Math.min(maxStake, Math.max(MIN_CASINO_STAKE, Math.round(Number(stakeInput.value))));
          this.emitPlayCasino(stake);
        });
        this.actionsEl.appendChild(spinBtn);

        this.actionsEl.appendChild(this.button("Skip", "casino-skip"));
        break;
      }
      case "awaiting_loan_decision": {
        const debt = state.pendingDebt;
        const debtor = debt ? state.players.find((p) => p.id === debt.payerId) : undefined;
        const p = document.createElement("p");
        p.textContent =
          debt && debtor
            ? `${debtor.name} cannot cover ${formatMoney(debt.amount)}. Pledge an asset for a loan, or declare bankruptcy.`
            : "";
        this.actionsEl.appendChild(p);
        if (debtor) {
          const options = getPledgeableOptions(board, state.ownership, state.houses, state.loans, debtor.id);
          for (const option of options) {
            const label =
              option.kind === "house"
                ? `Pledge a house on ${option.tileName} for ${formatMoney(option.principal)}`
                : `Pledge ${option.tileName} for ${formatMoney(option.principal)}`;
            const btn = document.createElement("button");
            btn.textContent = label;
            btn.addEventListener("click", () => this.emitTakeLoan(option.tileId, option.kind, debtor.id));
            this.actionsEl.appendChild(btn);
          }
          const bankruptBtn = document.createElement("button");
          bankruptBtn.textContent = "Declare bankruptcy";
          bankruptBtn.addEventListener("click", () => this.emitDeclareBankruptcy(debtor.id));
          this.actionsEl.appendChild(bankruptBtn);
        }
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
      this.renderLoanRepayButtons(state, board, player);
    }
  }

  private renderLoanRepayButtons(state: GameState, board: Tile[], player: GameState["players"][number]): void {
    const loans = state.loans.filter((l) => l.playerId === player.id);
    for (const loan of loans) {
      const tileName = board[loan.tileId]?.name ?? loan.tileId;
      const btn = document.createElement("button");
      btn.textContent = `Repay loan on ${tileName} — ${formatMoney(loan.owed)}`;
      btn.disabled = player.cash < loan.owed;
      btn.addEventListener("click", () => this.emitRepayLoan(loan.tileId));
      this.actionsEl.appendChild(btn);
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
      const cost = houseCostForBuild(tile.colorGroup, houses);
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
