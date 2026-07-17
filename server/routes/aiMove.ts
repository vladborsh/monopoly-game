import type { Request, Response } from "express";
import type { GameState } from "../../src/core/state";
import type { GameConfig } from "../../src/core/engine";
import { BOARD_TILES } from "../../src/data/board";
import { CHANCE_CARDS, TREASURY_CARDS } from "../../src/data/cards";
import { actionablePlayerId, getLegalActions } from "../../src/core/legalActions";
import { describeLegalActions, buildPrompt, buildTool } from "../promptBuilder";
import { decideAction } from "../anthropicClient";

const config: GameConfig = { board: BOARD_TILES, chanceCards: CHANCE_CARDS, treasuryCards: TREASURY_CARDS };

function isValidBody(body: unknown): body is { state: GameState; playerId: string } {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.playerId !== "string" || b.playerId.length === 0) return false;
  const state = b.state as Partial<GameState> | undefined;
  if (!state || typeof state !== "object") return false;
  if (!Array.isArray(state.players) || typeof state.turnPhase !== "string") return false;
  return true;
}

export async function aiMoveHandler(req: Request, res: Response): Promise<void> {
  if (!isValidBody(req.body)) {
    res.status(400).json({ error: "Body must be { state: GameState, playerId: string }" });
    return;
  }
  const { state, playerId } = req.body;

  if (!state.players.some((p) => p.id === playerId)) {
    res.status(400).json({ error: `Unknown playerId "${playerId}"` });
    return;
  }

  const actionable = actionablePlayerId(state);
  if (playerId !== actionable) {
    res.status(409).json({ error: `It is not "${playerId}"'s decision right now — "${actionable}" must act.` });
    return;
  }

  const legalActions = getLegalActions(state, config, playerId);
  if (legalActions.length === 0) {
    res.status(422).json({ error: "No legal actions available (game may be over)." });
    return;
  }

  if (legalActions.length === 1) {
    res.status(200).json({ action: legalActions[0], legalActionCount: 1 });
    return;
  }

  const described = describeLegalActions(legalActions, state, config);
  const tool = buildTool(described);
  const prompt = buildPrompt(state, config, playerId, described);

  try {
    const { choiceIndex, reasoning } = await decideAction(prompt, tool);
    const chosen = described[choiceIndex];
    if (!chosen) {
      res.status(502).json({ error: `Model returned out-of-range choiceIndex ${choiceIndex}` });
      return;
    }
    res.status(200).json({ action: chosen.action, reasoning, legalActionCount: legalActions.length });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Anthropic call failed" });
  }
}
