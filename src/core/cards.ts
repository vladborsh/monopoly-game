export type CardEffect =
  | { kind: "move_to"; tileId: number; grantSalaryIfPassGo: boolean }
  | { kind: "move_relative"; steps: number }
  | { kind: "pay_bank"; amount: number }
  | { kind: "receive_bank"; amount: number }
  | { kind: "pay_each_player"; amount: number }
  | { kind: "receive_each_player"; amount: number }
  | { kind: "go_to_jail" }
  | { kind: "get_out_of_jail_free" };

export interface Card {
  id: string;
  deck: "chance" | "treasury";
  text: string;
  effect: CardEffect;
}

/** Deterministic Fisher-Yates shuffle driven by a seeded float sequence. */
export function shuffleDeck<T>(items: T[], randomFloats: number[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const r = randomFloats[result.length - 1 - i] ?? 0;
    const j = Math.floor(r * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}
