import "./style.css";
import "./ui/ui.css";
import { BOARD_TILES } from "./data/board";
import { CHANCE_CARDS, TREASURY_CARDS } from "./data/cards";
import type { GameConfig } from "./core/engine";
import { GameController } from "./app/gameController";
import { GameUI } from "./ui/ui";
import { InputController } from "./controls/inputController";
import { BOARD_PX } from "./render/layout";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="game-layout">
    <div id="ai-chat-root" class="ai-chat-panel"></div>
    <div id="board-wrapper" class="board-wrapper">
      <canvas id="board-canvas" width="${BOARD_PX}" height="${BOARD_PX}"></canvas>
      <div id="ui-snackbars" class="ui-snackbars"></div>
    </div>
    <div id="ui-root"></div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#board-canvas")!;
const uiRoot = document.querySelector<HTMLDivElement>("#ui-root")!;
const snackbarsRoot = document.querySelector<HTMLDivElement>("#ui-snackbars")!;
const aiChatRoot = document.querySelector<HTMLDivElement>("#ai-chat-root")!;

const config: GameConfig = { board: BOARD_TILES, chanceCards: CHANCE_CARDS, treasuryCards: TREASURY_CARDS };
const players = [
  { id: "p1", name: "Player 1", isAI: false },
  { id: "p2", name: "Player 2", isAI: false },
];

const ui = new GameUI(uiRoot, snackbarsRoot, aiChatRoot);
const controller = new GameController(canvas, ui, config, players, Date.now());
new InputController(ui, (action) => controller.dispatch(action));

window.addEventListener("beforeunload", (e) => {
  if (controller.state.turnPhase === "game_over") return;
  e.preventDefault();
  e.returnValue = "";
});
