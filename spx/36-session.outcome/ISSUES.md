# Open Issues

## Subtree misdeclaration: false outcomes

Every child of `36-session.outcome/` except `21-session-test-harness.enabler` declares itself as `.outcome` but has no user-behavior-change hypothesis. The single real outcome is the parent at `session.md` ("agents adopt CLI handoffs instead of manual file operations"). Everything below is infrastructure serving that outcome.

Affected nodes:

- `32-core-operations.outcome` — junk-drawer container (timestamp + list + show + create + delete + handoff + metadata); needs to split into `32-session-identity.enabler` and `43-session-store.enabler`
- `43-session-lifecycle.outcome` — atomic pickup/release; should become `65-session-claim.enabler`
- `54-advanced-operations.outcome` — another junk drawer (prune + archive); should become `54-session-retention.enabler`
- `54-auto-injection.outcome` — file injection during pickup; should become `54-auto-injection.enabler`
- `76-batch-operations.outcome` — variadic arg handling across all commands; should become `76-session-cli.enabler`

**Resolution:** PLAN.md at this node documents the full rearchitecture. Execute via `/spec-tree:refactoring` following the dependency order: 21 test-harness → 32 session-identity → 43 session-store → 54 auto-injection || 54 session-retention → 65 session-claim → 76 session-cli.

## Dead code: `src/session/prune.ts`

`src/session/prune.ts` (pure selection + formatting) is imported by no `src/` module. Its only consumer is `tests/unit/session/prune.test.ts`. The real CLI handler at `src/commands/session/prune.ts` reimplements the selection logic inline, so the pure module is not connected to anything.

**Resolution:** PLAN.md step 4 of Phase 2c-i consolidates the two files. Expected direction: keep the pure module as the home of selection/formatting logic, have the CLI handler import from it, delete the inline duplicate. Before deleting `tests/unit/session/prune.test.ts` the consolidation must be complete so the `src/session/prune.ts` module has real consumers.

## Inline duplication: batch arg handling

`src/session/batch.ts` provides a generic `processBatch(ids, handler)` for multi-ID operations. It's correctly architected. However, individual command handlers in `src/commands/session/{archive,delete,show,pickup,release}.ts` duplicate batch logic inline instead of consuming `processBatch()`. The result: the `76-batch-operations.outcome` tests verify the shared helper, but the command handlers have their own copies of the loop-and-collect-errors pattern.

**Resolution:** PLAN.md step 5 of Phase 2c-i consolidates. All command handlers must consume `src/session/batch.ts`. Per-command inline loops are deleted.

## Missing product file

This is inherited from `spx/ISSUES.md`: no `spx/*.product.md` exists. `/spec-tree:contextualizing` runs in degraded mode on every session node because of it.
