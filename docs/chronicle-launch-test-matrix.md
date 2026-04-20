# Chronicle Launch Test Matrix

This file pins the smallest useful regression ladder for Chronicle launch readiness.
Do not expand the matrix unless a bug introduces a genuinely new failure class.

## Failure Severity

### P0 (Blocker)

- Missing `mechanicFacts`.
- Non-deterministic turn result.
- Divergence between state and `mechanicFacts`.
- Parser misroutes an action to the wrong system.
- Any turn that produces "No measurable change occurred" for a meaningful player action without explicit failure reasoning.

### P1 (High)

- Stale affordances, such as ignitable after burning.
- Duplicate facts, including achieved, opportunities, and hazards.
- Opportunity not invalidated or duplicated.

### P2 (Medium)

- Weak outcome classification.
- Noisy or redundant presentation.
- Minor wording inconsistencies.

Rule:

- P0 must be fixed before playtest.
- P1 must be fixed within the same session.
- P2 can accumulate and be batch cleaned.

## Determinism Guarantee

For any ritual:

- Given the same initial state.
- Given the same input sequence.
- Given the same RNG seed.
- Given the same engine version.

The output must be identical:

- `stateDeltas`
- `ledgerAdds`
- `mechanicFacts`
- derived UI surfaces

Any divergence is a P0 failure.

## Operating Rules

- Parser or routing bugs belong in layer 1.
- Canonical truth or derivation bugs belong in layer 2.
- Closed-loop mechanic bugs belong in layer 3 or 4.
- Cross-system regressions belong in layer 5.
- When a layer fails, fix the underlying layer first. Do not patch the UI to mask it.

## 1. Parser / Routing Unit Tests

Purpose: prove inputs route to the correct resolver path.

Keep only boundary cases:

- `ignite it` routes to fire or environment resolution, not inventory.
- `ignite the lantern` routes to inventory ignition.
- `hide in the shadows` routes to stealth or opportunity resolution.
- `wait` routes to no-op or progression, not an action effect branch.
- One malformed or ambiguous input case still resolves deterministically.

Recommended tests:

- [`src/lib/engine/inventory/__tests__/parseInventoryIntent.test.ts`](/Users/craigtolfree/dungeonpp/src/lib/engine/inventory/__tests__/parseInventoryIntent.test.ts)
- [`src/lib/engine/__tests__/resolveActionEffects.test.ts`](/Users/craigtolfree/dungeonpp/src/lib/engine/__tests__/resolveActionEffects.test.ts)
- [`src/server/turn/__tests__/deterministicTurn.test.ts`](/Users/craigtolfree/dungeonpp/src/server/turn/__tests__/deterministicTurn.test.ts)

Pass rule:

- Correct route.
- No cross-system misclassification.

## 2. Fact-Derivation Unit Tests

Purpose: prove canonical mechanic truth stays stable.

Keep only these classes:

- Achieved facts come from turn deltas only.
- Persistent facts come from durable state only.
- Stale affordances disappear after state changes.
- Duplicate ledger or state evidence dedupes to one fact.
- No-op turns still yield total `mechanicFacts`.

Recommended tests:

- [`src/lib/engine/presentation/__tests__/mechanicFacts.test.ts`](/Users/craigtolfree/dungeonpp/src/lib/engine/presentation/__tests__/mechanicFacts.test.ts)
- [`src/lib/engine/presentation/__tests__/stateSummaryTranslator.test.ts`](/Users/craigtolfree/dungeonpp/src/lib/engine/presentation/__tests__/stateSummaryTranslator.test.ts)

Pass rule:

- One truth path.
- No replayed achieved text.
- No stale opportunities.
- No missing `mechanicFacts` on no-op turns.

## 3. Oil / Fire Ritual

Purpose: prove the environmental hazard loop is closed.

Sequence:

- `DO splash oil`
- `DO ignite it`
- `WAIT`
- `WAIT`

Assert:

- Turn 1 applies oil exactly once.
- Turn 2 starts fire.
- Turn 3 and later evolve fire deterministically.
- The ignitable prompt disappears after ignition.
- `world`, `careNow`, and `pressure` reflect active fire.

Recommended tests:

- [`src/lib/engine/__tests__/resolveActionEffects.test.ts`](/Users/craigtolfree/dungeonpp/src/lib/engine/__tests__/resolveActionEffects.test.ts)
- [`src/server/turn/__tests__/deterministicTurn.test.ts`](/Users/craigtolfree/dungeonpp/src/server/turn/__tests__/deterministicTurn.test.ts)
- [`src/lib/engine/presentation/__tests__/mechanicFacts.test.ts`](/Users/craigtolfree/dungeonpp/src/lib/engine/presentation/__tests__/mechanicFacts.test.ts)

Pass rule:

- Oil is applied once.
- Fire begins on the ignite turn.
- Fire evolves on later turns.
- No stale ignitable affordance remains after burning begins.

## 4. Stealth / Opportunity Ritual

Purpose: prove the opportunity loop is closed.

Sequence:

- `DO hide in the shadows`
- `DO strike from the shadows`
- `WAIT`

Assert:

- Hiding creates an opportunity.
- Striking consumes it.
- No stale opportunity window remains.
- No duplicate opportunity facts appear.
- Pressure and opportunity stay aligned.

Recommended tests:

- [`src/server/turn/__tests__/opportunityRules.test.ts`](/Users/craigtolfree/dungeonpp/src/server/turn/__tests__/opportunityRules.test.ts)
- [`src/server/turn/__tests__/opportunityEvolution.test.ts`](/Users/craigtolfree/dungeonpp/src/server/turn/__tests__/opportunityEvolution.test.ts)
- [`src/server/turn/__tests__/opportunityInvalidation.test.ts`](/Users/craigtolfree/dungeonpp/src/server/turn/__tests__/opportunityInvalidation.test.ts)
- [`src/lib/engine/presentation/__tests__/mechanicFacts.test.ts`](/Users/craigtolfree/dungeonpp/src/lib/engine/presentation/__tests__/mechanicFacts.test.ts)

Pass rule:

- One window, one fact, one consumption.
- No stale window after the consume turn.
- No duplicate opportunity cards.

## 5. Combined Canary Ritual

Purpose: catch cross-system drift.

Sequence:

- `DO splash oil`
- `DO ignite it`
- `DO hide in the shadows`
- `DO strike from the shadows`
- `WAIT`
- `WAIT`

Assert:

- No missing `mechanicFacts`.
- No parser misrouting.
- Fire evolves while stealth and opportunity still work.
- No stale ignitable affordance after ignition.
- No duplicate achieved or opportunity facts.
- Persisted state, route response, client, and presenter agree.

Recommended tests:

- [`src/server/turn/__tests__/deterministicTurn.test.ts`](/Users/craigtolfree/dungeonpp/src/server/turn/__tests__/deterministicTurn.test.ts)
- [`app/api/turn/__tests__/route.test.ts`](/Users/craigtolfree/dungeonpp/app/api/turn/__tests__/route.test.ts)
- [`components/play/__tests__/presenters.test.ts`](/Users/craigtolfree/dungeonpp/components/play/__tests__/presenters.test.ts)

Pass rule:

- The full loop remains green after fixes.
- A combined run should not reintroduce stale truth, duplicate facts, or missing mechanic facts.

## Release Gate

Treat the slice as playtest-ready when:

- All five layers pass.
- The combined canary stays green after fixes for 2 to 3 consecutive sessions.
- No new test is added unless it represents a new failure class.
