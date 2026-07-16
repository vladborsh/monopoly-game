import type { GameState } from "../core/state";
import type { GameConfig } from "../core/engine";
import type { Tile } from "../core/board";

const STORAGE_KEY = "monopoly:save";
const SCHEMA_VERSION = 7; // bump whenever GameState/Player/Tile shape changes

interface SavedGame {
  schemaVersion: number;
  boardFingerprint: string;
  playersFingerprint: string;
  state: GameState;
}

function fingerprintBoard(board: Tile[]): string {
  return board.map((t) => `${t.id}:${t.type}`).join("|");
}

function fingerprintPlayers(players: { id: string; name: string }[]): string {
  return players.map((p) => p.id).join(",");
}

export function saveGame(state: GameState, config: GameConfig, players: { id: string; name: string }[]): void {
  const payload: SavedGame = {
    schemaVersion: SCHEMA_VERSION,
    boardFingerprint: fingerprintBoard(config.board),
    playersFingerprint: fingerprintPlayers(players),
    state,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // storage unavailable/full — persistence is best-effort, never fatal
  }
}

export function loadGame(config: GameConfig, players: { id: string; name: string }[]): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGame;
    if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
    if (parsed.boardFingerprint !== fingerprintBoard(config.board)) return null;
    if (parsed.playersFingerprint !== fingerprintPlayers(players)) return null;
    return parsed.state;
  } catch {
    return null;
  }
}

export function clearSavedGame(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
