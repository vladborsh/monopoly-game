import { reduce, createInitialState, type GameConfig } from "../core/engine";
import type { GameState } from "../core/state";
import { BOARD_SIZE } from "../core/board";
import type { Action } from "../core/actions";
import { LocalTransport, type Transport } from "../net/transport";
import { drawBoard, type PlayerColorMap } from "../render/boardRenderer";
import { drawTokens } from "../render/tokenRenderer";
import { drawDice } from "../render/diceRenderer";
import { drawCasinoReels, resultSymbolsForMultiplier } from "../render/casinoRenderer";
import { animateTokenMove, animateDiceRoll, animateCasinoSpin } from "../render/animations";
import { describeEvent, type GameUI, type RestartConfigDetail } from "../ui/ui";
import { clearSavedGame, loadGame, saveGame } from "./persistence";

const PLAYER_PALETTE = ["#e63946", "#2a9d8f", "#e9c46a", "#a663cc", "#f4a261", "#457b9d"];
const MAX_LOG_ENTRIES = 30;

export class GameController {
  state: GameState;
  private ui: GameUI;
  private config: GameConfig;
  private players: { id: string; name: string }[];
  private ctx: CanvasRenderingContext2D;
  private playerColors: PlayerColorMap = {};
  private transport: Transport = new LocalTransport();
  private busy = false;

  constructor(
    canvas: HTMLCanvasElement,
    ui: GameUI,
    config: GameConfig,
    players: { id: string; name: string }[],
    rngSeed: number,
  ) {
    this.ui = ui;
    this.config = config;
    this.players = players;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context unavailable");
    this.ctx = context;
    this.assignPlayerColors(players);

    const restored = loadGame(config, players);
    this.state = restored ?? createInitialState(players, config, rngSeed);
    if (!restored) saveGame(this.state, this.config, this.players);
    this.transport.onReceive((action) => void this.applyAction(action));
    this.ui.events.addEventListener("new-game", () => this.startNewGame());
    this.ui.events.addEventListener("restart-config", (e) =>
      this.restartGame((e as CustomEvent<RestartConfigDetail>).detail),
    );
    this.render();
  }

  dispatch(action: Action): void {
    this.transport.send(action);
  }

  private assignPlayerColors(players: { id: string; name: string }[]): void {
    this.playerColors = {};
    players.forEach((p, i) => {
      this.playerColors[p.id] = PLAYER_PALETTE[i % PLAYER_PALETTE.length] ?? "#ffffff";
    });
  }

  private buildPlayers(count: number): { id: string; name: string }[] {
    return Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }));
  }

  private startNewGame(): void {
    if (this.busy) return;
    clearSavedGame();
    this.state = createInitialState(this.players, this.config, Date.now());
    saveGame(this.state, this.config, this.players);
    this.render();
  }

  private restartGame(detail: RestartConfigDetail): void {
    if (this.busy) return;
    this.players = this.buildPlayers(detail.playerCount);
    this.assignPlayerColors(this.players);
    clearSavedGame();
    this.state = createInitialState(this.players, this.config, Date.now(), detail.startingCash);
    saveGame(this.state, this.config, this.players);
    this.render();
  }

  private async applyAction(action: Action): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const prevCash = Object.fromEntries(this.state.players.map((p) => [p.id, p.cash]));
      const { state: nextState, events } = reduce(this.state, action, this.config);

      let displayState = this.state;
      let displayDice = this.state.lastDice;
      for (const event of events) {
        if (event.type === "DiceRolled") {
          await animateDiceRoll(event.dice, (values, rotations) => {
            this.renderBoard(displayState, {}, values, rotations);
          });
          displayDice = event.dice;
          continue;
        }
        if (event.type === "CasinoResult") {
          await animateCasinoSpin(resultSymbolsForMultiplier(event.multiplier), (symbols) => {
            this.renderBoard(displayState, {}, displayDice, [0, 0], symbols);
          });
          continue;
        }
        if (event.type !== "PlayerMoved") continue;
        await animateTokenMove(event.from, event.to, BOARD_SIZE, (pos) => {
          this.renderBoard(displayState, pos ? { [event.playerId]: pos } : {}, displayDice);
        });
        displayState = {
          ...displayState,
          players: displayState.players.map((p) => (p.id === event.playerId ? { ...p, position: event.to } : p)),
        };
      }

      const playerNames = Object.fromEntries(this.players.map((p) => [p.id, p.name]));
      const newLines = events
        .map((event) => describeEvent(event, this.config.board, playerNames))
        .filter((line): line is NonNullable<typeof line> => line !== null);
      this.state = { ...nextState, log: [...nextState.log, ...newLines].slice(-MAX_LOG_ENTRIES) };
      saveGame(this.state, this.config, this.players);
      this.render();

      const moneyChanges = nextState.players
        .map((p) => ({ playerId: p.id, name: playerNames[p.id] ?? p.id, delta: p.cash - (prevCash[p.id] ?? p.cash) }))
        .filter((c) => c.delta !== 0);
      if (moneyChanges.length > 0) this.ui.showMoneyChanges(moneyChanges, this.playerColors);
    } finally {
      this.busy = false;
    }
  }

  private renderBoard(
    state: GameState,
    tokenOverrides: Record<string, { x: number; y: number }> = {},
    diceValues: [number, number] | null = state.lastDice,
    diceRotations: [number, number] = [0, 0],
    casinoSymbols: [string, string, string] | null = null,
  ): void {
    drawBoard(this.ctx, this.config.board, state, this.playerColors);
    drawTokens(this.ctx, state, this.playerColors, tokenOverrides);
    drawDice(this.ctx, diceValues, diceRotations);
    drawCasinoReels(this.ctx, casinoSymbols);
  }

  private idleCasinoSymbols(state: GameState): [string, string, string] | null {
    if (state.turnPhase === "awaiting_casino_spin") return ["❔", "❔", "❔"];
    return state.lastCasinoResult ? resultSymbolsForMultiplier(state.lastCasinoResult.multiplier) : null;
  }

  private render(state: GameState = this.state): void {
    this.renderBoard(state, {}, state.lastDice, [0, 0], this.idleCasinoSymbols(state));
    this.ui.renderPlayers(state, this.playerColors);
    this.ui.renderActions(state, this.config.board);
    this.ui.setLog(state.log, this.playerColors);
  }
}
