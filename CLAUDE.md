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
- **houses.ts** — house cost/rent-per-house tables, keyed by color-group tier (`GROUP_TIER_ORDER`), plus `MAX_HOUSES` and the per-house tax surcharge. `houseCostForBuild(colorGroup, currentHouses)` escalates the base tier cost by `HOUSE_COST_ESCALATION_RATE` (1.2x) per house already built on that specific tile.
- **loans.ts** — bank-loan constants (`LOAN_TO_VALUE_RATIO`, `LOAN_INTEREST_RATE`, `LOAN_DUE_ROUNDS`), the `Loan` type (`principal` = 80% cash-out, `owed` = 100% repayment amount), `loanPrincipal`/`loanInterest` math, and `getPledgeableOptions` (the selector the UI uses to list what a player can still pledge).
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
  -> (rent/tax charge, or an involuntary card effect, would bankrupt the payer, and they own a pledgeable asset)
                                          -> awaiting_loan_decision -> TAKE_LOAN (repeatable, by the debtor) | DECLARE_BANKRUPTCY (by the debtor) -> turn_over
       (the debtor here can be a player other than whoever's turn it currently is -- see "Bank loans" below)
turn_over -> END_TURN -> awaiting_roll (next non-bankrupt player) | game_over (one player left)
```

`BUILD_HOUSE` is allowed during `awaiting_roll` or `turn_over` (i.e. anytime it's your turn and you're not mid-decision), gated by owning the full color group and having cash. `REPAY_LOAN` is allowed in those same two phases.

### Key mechanics

- **Currency**: all amounts are in whole units (game "hryvnia"), no decimals. Starting cash `500_000`, salary `200_000` on passing/landing on Go.
- **Rent**: base rent, doubled with a full color-group monopoly (`monopolyMultiplier`), or `baseRent + houses * rentPerHouseForGroup` once any house is built. Company (railroad-style) rent scales by *count of companies owned* (`COMPANY_RENT_BY_COUNT`), not by houses. Rent-per-house itself doesn't escalate, but the *build cost* does: each house on a given tile costs 20% more than the previous one on that same tile (`houseCostForBuild`).
- **Buyout mechanic** (this game's twist on undeveloped-property rent): landing on an owned, house-free property doesn't auto-charge rent — the *landing player* chooses to `PAY_RENT` or `OFFER_BUYOUT` (`buyoutAmountForTile`: 120% of price, compounding +10% for every prior *accepted* buyout on that specific tile via `GameState.buyoutCount`, regardless of who currently owns it). The *owner* then `ACCEPT_BUYOUT` (increments `buyoutCount` for that tile) or `REJECT_BUYOUT` (rejecting falls back to charging rent, no escalation). Once houses are built on a property this choice disappears and rent is automatic. `buyoutCount` for a tile resets to 0 when its owner goes bankrupt (property returns to the bank at the base 120%).
- **Jail**: 3 attempts to roll doubles; doubles release immediately and move; on the 3rd failed attempt bail is charged automatically and the player moves. `PAY_BAIL`/`USE_JAIL_CARD` are available anytime during `awaiting_roll` while jailed, to skip ahead of the roll.
- **Property tax surcharge** (tile 30): base tax + `25_000` per house the *landing player* owns anywhere on the board (`totalHousesOwned`).
- **Bank loans** (avoids instant bankruptcy on rent/tax/certain card effects): `chargeCash` takes an `allowLoan` flag, set `true` at the call sites that commonly bankrupt players during normal, involuntary play: `PAY_RENT`, the auto-rent-on-landing path, `REJECT_BUYOUT`'s rent fallback, tax tiles, and the card effects `pay_bank`, `pay_each_player`, and `receive_each_player` (bail, casino stakes, and buyout purchases stay instant-bankrupt since those are voluntary/skippable). When such a charge would go negative and the payer still owns at least one un-pledged ownable tile, the charge is deferred instead of applied: `turnPhase` becomes `awaiting_loan_decision` and a `pendingDebt` (`payerId`/`creditorId`/`amount`, plus an optional `remaining` queue of further `{payerId, creditorId, amount}` charges) is stored. The `remaining` queue exists because `pay_each_player`/`receive_each_player` can owe/collect from *several* players in one card draw — `payAllOthers`/`receiveFromAllOthers` build that queue and `chargeSequential` walks it one charge at a time (skipping any already-bankrupt payer), pausing again at `awaiting_loan_decision` if a later charge in the queue also can't be covered. Because `pendingDebt.payerId` can be a player *other than whoever's turn it currently is* (e.g. another player forced into debt by a card the current player drew), `TAKE_LOAN`/`DECLARE_BANKRUPTCY` both carry an explicit `playerId` field validated against `pendingDebt.payerId` — mirroring `ACCEPT_BUYOUT`/`REJECT_BUYOUT` — rather than assuming the current-turn player is the actor; the UI's loan dialog likewise renders based on `pendingDebt.payerId`, not the active player. From there, `TAKE_LOAN` lets the debtor pledge a whole property/company tile or a single house on one (each tile backs at most one active loan); the bank pays out `loan.principal` = `loanPrincipal(value)` = 80% of the tile's `price` (or `houseCostForBuild` at the index of the most recently built house on that tile, for a house) in cash, but the debt owed is the full `loan.owed` = 100% of that value — `Loan` stores both fields separately. Multiple loans can be taken in sequence in the same dialog until the debt is covered or collateral runs out, at which point it falls through to bankruptcy; once the current debt is settled, any further charges in `pendingDebt.remaining` are processed next, possibly reopening `awaiting_loan_decision` for a different player. `DECLARE_BANKRUPTCY` lets the player skip straight to bankruptcy even with collateral left (and still processes any `remaining` queue afterward). Every loan accrues `loanInterest(loan.principal)` (10% of the 80% cash-out amount, not the 100% owed) auto-deducted (best-effort, never itself bankrupts) at the start of each of the borrower's own `ROLL_DICE` turns; after `LOAN_DUE_ROUNDS` (3) unpaid turns the bank seizes the collateral (clears the tile's ownership, or decrements one house) and the debt is wiped regardless of the seized asset's value. `REPAY_LOAN` pays off `loan.owed` (the full 100%) early.
- **Bankruptcy**: `bankruptPlayer` (shared by `chargeCash`'s fallback branch and `DECLARE_BANKRUPTCY`) zeroes the payer's cash, marks them `bankrupt`, releases all their owned tiles/houses back to the bank, and drops any of their active loans. `advanceToNextPlayer` skips bankrupt players and ends the game once one remains.
- **Determinism**: dice, card shuffles, and casino spins all thread through `rngSeed` in `GameState` — replaying the same action sequence from the same seed reproduces the same game, which is what `engine.test.ts` relies on and what makes save/load safe.

### App/render layers

- `app/gameController.ts` is the only place that calls `reduce()`. It sequences events into animations (`animateDiceRoll`, `animateTokenMove`), appends `describeEvent()` log lines, persists via `saveGame`, and pushes cash-delta toasts (`ui.showMoneyChanges`) — all inside `applyAction`, guarded by a `busy` flag so actions can't overlap mid-animation.
- `net/transport.ts`'s `Transport` interface exists so hotseat (`LocalTransport`, a same-process passthrough) can later be swapped for a networked implementation without touching `app/` wiring.
- `app/persistence.ts` versions saves with `SCHEMA_VERSION` plus board/player fingerprints; any mismatch (code change, different player set) discards the save rather than risking a corrupt load.
- `data/board.ts` is a best-effort transcription of a physical board photo — entries marked `// verify:` are uncertain and worth cross-checking if the board layout ever seems wrong.

## Testing

`src/core/__tests__/engine.test.ts` covers `reduce()` directly with hand-built `GameConfig`/`GameState` fixtures — no DOM, no canvas. Prefer adding engine behavior tests here over app/render-level tests.
