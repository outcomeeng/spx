# Session Subtree Rearchitecture Plan

This plan captures the Phase 2c-i work from the top-level `PLAN.md` at the node level so `/spec-tree:contextualizing` surfaces it when any session node is the target.

## Why this plan exists

The subtree under `spx/36-session.outcome/` misapplies the methodology in three ways, discovered during the migration session (2026-04-07 → 2026-04-09):

1. **False outcomes.** Every child except `21-session-test-harness.enabler` is declared `.outcome` but lacks a user-behavior-change hypothesis. Only `session.md` at the parent declares a real outcome ("agents adopt CLI handoffs instead of manual file operations"). Everything below is infrastructure.
2. **Junk-drawer container names.** `32-core-operations.outcome` and `54-advanced-operations.outcome` don't describe what they contain — they accept arbitrary scope.
3. **Split implementations of single concerns.** `src/session/prune.ts` (pure selection/formatting) is orphaned dead code; `src/commands/session/prune.ts` reimplements the selection logic inline. `src/session/batch.ts` is correctly architected but per-command handlers duplicate its logic inline.

See `ISSUES.md` at this node for the full list.

## Target tree

```text
spx/36-session.enabler/
├── session.md                          # THE enabler
├── 21-directory-structure.adr.md       # unchanged
├── 21-timestamp-format.adr.md          # unchanged
├── 21-atomic-claiming.adr.md           # unchanged
├── 21-auto-injection.adr.md            # unchanged
├── 26-worktree-detection.adr.md        # unchanged
├── tests/                              # Cross-cutting session tests
│
├── 21-session-test-harness.enabler/    # unchanged (was already correct)
├── 32-session-identity.enabler/        # NEW: ID format, metadata parsing
├── 43-session-store.enabler/           # NEW: CRUD primitives over directory store
├── 54-auto-injection.enabler/          # RENAMED from .outcome
├── 54-session-retention.enabler/       # REPLACES 54-advanced-operations.outcome
├── 65-session-claim.enabler/           # REPLACES 43-session-lifecycle.outcome
└── 76-session-cli.enabler/             # REPLACES 76-batch-operations.outcome + CLI surface
```

## Dependency order (by index)

| Index | Node                | Depends on                                        |
| ----- | ------------------- | ------------------------------------------------- |
| 21    | `test-harness`      | nothing                                           |
| 32    | `session-identity`  | nothing                                           |
| 43    | `session-store`     | 32 (identity)                                     |
| 54    | `auto-injection`    | 43 (store)                                        |
| 54    | `session-retention` | 43 (store) — independent of auto-injection        |
| 65    | `session-claim`     | 43 (store), 54 (auto-injection — pickup calls it) |
| 76    | `session-cli`       | all of the above                                  |

## Dissolved nodes

| Old                              | Concerns migrate to                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `32-core-operations.outcome`     | Split: `32-session-identity` (timestamp, metadata) and `43-session-store` (list/show/create/delete/handoff CRUD) |
| `43-session-lifecycle.outcome`   | `65-session-claim` (atomic pickup/release, auto-selection)                                                       |
| `54-advanced-operations.outcome` | `54-session-retention` (prune + archive — directory lifecycle)                                                   |
| `54-auto-injection.outcome`      | `54-auto-injection.enabler` (suffix change only — content stays)                                                 |
| `76-batch-operations.outcome`    | `76-session-cli` (variadic args, error handling, exit codes, plus all CLI surface concerns)                      |

## Step-by-step execution plan

**Prerequisite:** Capture a coverage baseline on `src/session/**` and `src/commands/session/**` with ALL current tests running (`specs/` + `tests/` + `spx/`). Save the report. Every step below must preserve or improve this baseline.

### Step 1 — Declare `32-session-identity.enabler`

- `mkdir -p spx/36-session.enabler/32-session-identity.enabler/tests`
- Invoke `/spec-tree:authoring` to write `session-identity.md`
  - PROVIDES: timestamp ID generation (per ADR `21-timestamp-format`) and session front-matter metadata parsing
  - SO THAT: other session nodes can identify sessions uniquely and parse their metadata
  - CAN: determine session order, priority, and file-injection targets without reimplementing parsing
- Spec assertions derive from ADR `21-timestamp-format` and current behavior of `src/session/timestamp.ts`, `src/session/list.ts` (parsing portion)
- `git mv` tests from existing `32-core-operations.outcome/tests/timestamp.unit.test.ts` and `metadata.unit.test.ts` (if present)
- Run vitest for this node, verify pass
- Commit: `refactor(spec-tree): declare 32-session-identity.enabler (was part of core-operations)`

### Step 2 — Declare `43-session-store.enabler`

- `mkdir -p spx/36-session.enabler/43-session-store.enabler/tests`
- Invoke `/spec-tree:authoring` to write `session-store.md`
  - PROVIDES: directory-backed CRUD primitives for sessions following ADR `21-directory-structure`
  - SO THAT: higher-level nodes (claim, retention, CLI) can list, read, write, and remove sessions without reimplementing filesystem access
- `git mv` tests from existing `32-core-operations.outcome/tests/`: `list-command.unit.test.ts`, `list-command.integration.test.ts`, `show.unit.test.ts`, `delete.unit.test.ts`, `handoff.unit.test.ts`, `core-operations.unit.test.ts` (split the last one between identity and store based on what each test actually exercises)
- Run vitest, verify pass
- Commit: `refactor(spec-tree): declare 43-session-store.enabler, migrate CRUD tests`

### Step 3 — Convert `54-auto-injection.outcome` → `.enabler`

- `git mv spx/36-session.outcome/54-auto-injection.outcome spx/36-session.enabler/54-auto-injection.enabler`
- Amend `auto-injection.md` hypothesis to opening format: `PROVIDES ... SO THAT ... CAN ...`
  - PROVIDES: file content injection during session pickup based on YAML front-matter `specs:` and `files:` arrays
  - SO THAT: agents that pickup a session receive referenced file contents without manually reading them
- Assertions stay — they already describe the output
- Commit: `refactor(spec-tree): convert 54-auto-injection.outcome to enabler`

### Step 4 — Consolidate prune implementation (src/)

Before this step, invoke `/typescript:architecting-typescript` to document the architectural decision: which file owns pure selection/formatting logic.

Recommended target:

- `src/session/prune.ts` keeps `selectSessionsToPrune`, `formatPruneOutput`, `DEFAULT_KEEP_COUNT` — pure functions with no I/O
- `src/commands/session/prune.ts` imports from `src/session/prune.ts`, handles all I/O (read archive dir, delete files, emit output)
- Delete the inline duplicate of `selectSessionsToPrune` in `src/commands/session/prune.ts`
- Verify: `pnpm test -- --coverage` shows `src/session/prune.ts` coverage stays at ≥89% (legacy test still exists until Phase 2c-ii)

Commit: `refactor(src): consolidate prune selection logic in src/session/prune.ts`

### Step 5 — Consolidate batch argument handling (src/)

- All command handlers in `src/commands/session/{archive,delete,show,pickup,release}.ts` consume `src/session/batch.ts::processBatch()`
- Delete per-command inline loops that duplicate batch logic
- Verify: `pnpm test` passes, `src/session/batch.ts` coverage increases (now reached by every command handler's integration tests)

Commit: `refactor(src): consolidate batch arg handling via src/session/batch.ts`

### Step 6 — Declare `54-session-retention.enabler`

- `mkdir -p spx/36-session.enabler/54-session-retention.enabler/tests`
- Invoke `/spec-tree:authoring` to write `session-retention.md`
  - PROVIDES: archive (move to archive/ directory) and prune (retention-based deletion from archive/) for session lifecycle cleanup
- Assertions derive from existing prune/archive behavior in `src/session/prune.ts`, `src/session/archive.ts`
- `git mv` tests from `54-advanced-operations.outcome/tests/advanced-operations.unit.test.ts`
- After tests migrated, delete `54-advanced-operations.outcome` directory entirely (spec file, tests dir, container)
- Commit: `refactor(spec-tree): declare 54-session-retention.enabler, dissolve advanced-operations`

### Step 7 — Declare `65-session-claim.enabler`

- `mkdir -p spx/36-session.enabler/65-session-claim.enabler/tests`
- Invoke `/spec-tree:authoring` to write `session-claim.md`
  - PROVIDES: atomic pickup and release via `fs.rename()` per ADR `21-atomic-claiming`, priority-based auto-selection
- `git mv` tests from `43-session-lifecycle.outcome/tests/`
- Delete `43-session-lifecycle.outcome` directory after tests migrated
- Commit: `refactor(spec-tree): declare 65-session-claim.enabler (was 43-session-lifecycle.outcome)`

### Step 8 — Declare `76-session-cli.enabler`

- `mkdir -p spx/36-session.enabler/76-session-cli.enabler/tests`
- Invoke `/spec-tree:authoring` to write `session-cli.md`
  - PROVIDES: Commander bindings for all session subcommands, variadic arg parsing for batch operations, per-ID result reporting, non-zero exit on any failure, `<HANDOFF_ID>`/`<PICKUP_ID>` tag emission
- `git mv` tests from `76-batch-operations.outcome/tests/batch-operations.unit.test.ts`
- Delete `76-batch-operations.outcome` directory after tests migrated
- Commit: `refactor(spec-tree): declare 76-session-cli.enabler (was 76-batch-operations.outcome)`

### Verification gate — before proceeding to legacy deletion (Phase 2c-ii)

Run: `pnpm exec vitest run "spx/36-session.enabler/" --coverage`. Coverage on `src/session/**` and `src/commands/session/**` must equal or exceed the pre-rearchitecture baseline. If it drops, STOP — the rearchitecture is incomplete.

Also run: `pnpm exec vitest run` (all tests) to verify the full suite still passes.

## After this plan completes

Remove this PLAN.md file. A completed plan is a stale plan.

Continue with Phase 2c-ii in the top-level `PLAN.md`: delete the legacy `specs/work/doing/capability-28_session-core/` tree and `tests/unit/session/`, `tests/integration/session/`, `tests/integration/cli/session.integration.test.ts`. Verify coverage again.
