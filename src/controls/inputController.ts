import type { Action } from "../core/actions";
import type { GameUI, UIEventName } from "../ui/ui";

// "new-game" is intentionally omitted: it's a composition-root lifecycle
// operation (needs a fresh RNG seed + persistence reset), not a pure engine
// Action, so GameController listens for it directly.
const EVENT_TO_ACTION: Partial<Record<UIEventName, Action>> = {
  roll: { type: "ROLL_DICE" },
  buy: { type: "BUY_PROPERTY" },
  decline: { type: "DECLINE_PROPERTY" },
  "pay-rent": { type: "PAY_RENT" },
  "offer-buyout": { type: "OFFER_BUYOUT" },
  "casino-spin": { type: "PLAY_CASINO" },
  "casino-skip": { type: "SKIP_CASINO" },
  "pay-bail": { type: "PAY_BAIL" },
  "use-jail-card": { type: "USE_JAIL_CARD" },
  "end-turn": { type: "END_TURN" },
};

/** Translates UI-emitted intents into engine Action objects. Knows nothing about rendering. */
export class InputController {
  constructor(ui: GameUI, dispatch: (action: Action) => void) {
    for (const name of Object.keys(EVENT_TO_ACTION) as UIEventName[]) {
      const action = EVENT_TO_ACTION[name];
      if (!action) continue;
      ui.events.addEventListener(name, () => dispatch(action));
    }
    ui.events.addEventListener("build-house", (e) => {
      const tileId = (e as CustomEvent<{ tileId: number }>).detail.tileId;
      dispatch({ type: "BUILD_HOUSE", tileId });
    });
    ui.events.addEventListener("accept-buyout", (e) => {
      const playerId = (e as CustomEvent<{ playerId: string }>).detail.playerId;
      dispatch({ type: "ACCEPT_BUYOUT", playerId });
    });
    ui.events.addEventListener("reject-buyout", (e) => {
      const playerId = (e as CustomEvent<{ playerId: string }>).detail.playerId;
      dispatch({ type: "REJECT_BUYOUT", playerId });
    });
  }
}
