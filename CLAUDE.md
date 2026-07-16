# CLAUDE.md

Guidance for working in this repo: a browser-based Ukrainian Monopoly ("Монополія UA Люкс") clone built with TypeScript + Vite, rendered on an HTML canvas, no framework.

## Commands

- `npm run dev` / `npm start` — Vite dev server
- `npm run build` — typecheck (`tsc`) then production build
- `npm test` — run Vitest (`src/core/__tests__/engine.test.ts`)

## Architecture

Strict layering, each layer only depends on the ones below it:

```
main.ts                     composition root: wires everything together
  app/gameController.ts     orchestrates engine + rendering + persistence + UI
  app/persistence.ts        localStorage save/load (versioned, fingerprinted)
  controls/inputController.ts   UI events -> engine Actions
  ui/ui.ts                  DOM-based side panel (players, action buttons, log, snackbars)
  render/*.ts                canvas drawing: board, tokens, dice, animations, layout, colors
  net/transport.ts          Transport interface; LocalTransport is same-process pass-through
  core/*.ts                 pure game engine (framework-agnostic, no DOM)
  data/*.ts                 static content: board tiles, chance/treasury cards
```

The `core/` engine is pure and side-effect-free — it never touches the DOM, canvas, or localStorage. That's what makes it unit-testable in isolation (see `engine.test.ts`) and swappable behind a real network `Transport` later.

### Core engine (`src/core/`)

- **state.ts** — `GameState`, `Player`, `TurnPhase`. State is a plain serializable object (safe to JSON round-trip for save/load).
- **actions.ts** — `Action` union: the only way to intend a state change (`ROLL_DICE`, `BUY_PROPERTY`, `BUILD_HOUSE`, etc).
- **events.ts** — `GameEvent` union: the observable log of what happened during a `reduce()` call. Used to drive animations, log lines, and money-change toasts — never used to derive state.
- **engine.ts** — `reduce(state, action, config) -> { state, events }`. The single pure reducer. Deterministic given `rngSeed`. All money/ownership/position mutations happen here via small helpers (`chargeCash`, `moveTo`, `sendToJail`, `applyCardEffect`, `resolveLanding`, `advanceToNextPlayer`).
- **rules.ts** — rent math (`calculateRent`, monopoly detection, company rent scaling, house count aggregation for the property-tax surcharge).
- **houses.ts** — house cost/rent-per-house tables, keyed by color-group tier (`GROUP_TIER_ORDER`), plus `MAX_HOUSES` and the per-house tax surcharge.
- **casino.ts** — weighted-table casino spin (`spinCasino`), deterministic off the same seed chain.
- **cards.ts** — `Card`/`CardEffect` types and a seeded Fisher-Yates `shuffleDeck`.
- **rng.ts** — `mulberry32`-style pure PRNG. Same seed -> same sequence, always. `rngSeed` lives in `GameState` and advances on every roll/shuffle/casino spin, making replays and save/load fully deterministic.
- **board.ts** — `Tile` union (`property`, `company`, `tax`, `go`/`jail`/`free`/`chance`/`treasury`/`casino`), `isOwnable`, `BOARD_SIZE` (40), `SALARY`.
- **log.ts** — `LogLine`/`LogSegment` types for the colorized event log (a segment can be tagged with a `playerId` for tinting).

### Turn state machine (`TurnPhase`)

```
awaiting_roll
  -> (land on unowned property/company) -> awaiting_property_decision -> BUY_PROPERTY | DECLINE_PROPERTY -> turn_over
  -> (land on owned, no houses)          -> awaiting_rent_or_buyout_choice -> PAY_RENT | OFFER_BUYOUT -> turn_over
       OFFER_BUYOUT -> awaiting_buyout_response -> ACCEPT_BUYOUT | REJECT_BUYOUT (owner-only) -> turn_over
  -> (land on owned, has houses)         -> rent auto-charged -> turn_over
  -> (land on casino)                    -> awaiting_casino_spin -> PLAY_CASINO | SKIP_CASINO -> turn_over
  -> (land on chance/treasury)           -> card drawn & effect applied, may chain into another resolveLanding
  -> (land on tax/go/jail/free)          -> turn_over
  -> (in jail, roll)                     -> doubles: released & moves; 3rd failed attempt: forced payout & moves; else stays turn_over
turn_over -> END_TURN -> awaiting_roll (next non-bankrupt player) | game_over (one player left)
```

`BUILD_HOUSE` is allowed during `awaiting_roll` or `turn_over` (i.e. anytime it's your turn and you're not mid-decision), gated by owning the full color group and having cash.

### Key mechanics

- **Currency**: all amounts are in whole units (game "hryvnia"), no decimals. Starting cash `500_000`, salary `200_000` on passing/landing on Go.
- **Rent**: base rent, doubled with a full color-group monopoly (`monopolyMultiplier`), or `baseRent + houses * rentPerHouseForGroup` once any house is built. Company (railroad-style) rent scales by *count of companies owned* (`COMPANY_RENT_BY_COUNT`), not by houses.
- **Buyout mechanic** (this game's twist on undeveloped-property rent): landing on an owned, house-free property doesn't auto-charge rent — the *landing player* chooses to `PAY_RENT` or `OFFER_BUYOUT` (120% of price). The *owner* then `ACCEPT_BUYOUT` or `REJECT_BUYOUT` (rejecting falls back to charging rent). Once houses are built on a property this choice disappears and rent is automatic.
- **Jail**: 3 attempts to roll doubles; doubles release immediately and move; on the 3rd failed attempt bail is charged automatically and the player moves. `PAY_BAIL`/`USE_JAIL_CARD` are available anytime during `awaiting_roll` while jailed, to skip ahead of the roll.
- **Property tax surcharge** (tile 30): base tax + `25_000` per house the *landing player* owns anywhere on the board (`totalHousesOwned`).
- **Bankruptcy**: `chargeCash` zeroes the payer's cash, marks them `bankrupt`, and releases all their owned tiles/houses back to the bank when a charge would go negative. `advanceToNextPlayer` skips bankrupt players and ends the game once one remains.
- **Determinism**: dice, card shuffles, and casino spins all thread through `rngSeed` in `GameState` — replaying the same action sequence from the same seed reproduces the same game, which is what `engine.test.ts` relies on and what makes save/load safe.

### App/render layers

- `app/gameController.ts` is the only place that calls `reduce()`. It sequences events into animations (`animateDiceRoll`, `animateTokenMove`), appends `describeEvent()` log lines, persists via `saveGame`, and pushes cash-delta toasts (`ui.showMoneyChanges`) — all inside `applyAction`, guarded by a `busy` flag so actions can't overlap mid-animation.
- `net/transport.ts`'s `Transport` interface exists so hotseat (`LocalTransport`, a same-process passthrough) can later be swapped for a networked implementation without touching `app/` wiring.
- `app/persistence.ts` versions saves with `SCHEMA_VERSION` plus board/player fingerprints; any mismatch (code change, different player set) discards the save rather than risking a corrupt load.
- `data/board.ts` is a best-effort transcription of a physical board photo — entries marked `// verify:` are uncertain and worth cross-checking if the board layout ever seems wrong.

## Testing

`src/core/__tests__/engine.test.ts` covers `reduce()` directly with hand-built `GameConfig`/`GameState` fixtures — no DOM, no canvas. Prefer adding engine behavior tests here over app/render-level tests.
