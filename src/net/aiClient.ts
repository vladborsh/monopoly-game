import type { Action } from "../core/actions";
import type { GameState } from "../core/state";

const AI_BACKEND_URL = import.meta.env.VITE_AI_BACKEND_URL ?? "http://localhost:3001";

/** Asks the local AI backend (server/) to decide the next Action for `playerId`. */
export async function fetchAiAction(
  state: GameState,
  playerId: string,
): Promise<{ action: Action; reasoning?: string }> {
  const res = await fetch(`${AI_BACKEND_URL}/api/ai-move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, playerId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `AI backend returned ${res.status}`);
  }
  const data = (await res.json()) as { action: Action; reasoning?: string };
  return { action: data.action, reasoning: data.reasoning };
}
