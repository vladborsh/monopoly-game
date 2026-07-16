import type { Action } from "../core/actions";

/**
 * Abstraction over how Actions travel from a local player's input to the
 * authority that runs the engine. `LocalTransport` is a same-process
 * pass-through for hotseat play; a future networked implementation (e.g. a
 * WebSocket client that forwards actions to a server-authoritative engine)
 * can implement the same interface without any change to app/ wiring.
 */
export interface Transport {
  send(action: Action): void;
  onReceive(handler: (action: Action) => void): void;
}

export class LocalTransport implements Transport {
  private handler: ((action: Action) => void) | null = null;

  send(action: Action): void {
    this.handler?.(action);
  }

  onReceive(handler: (action: Action) => void): void {
    this.handler = handler;
  }
}
