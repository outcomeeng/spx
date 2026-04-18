# SPX-MIGRATION: 36-session.enabler

## Origin

**From**:

- `specs/work/doing/capability-28_session-core/` — legacy task-driven capability with 4 feature/story subtrees and 4 ADRs under `decisions/`
- `tests/unit/session/*.test.ts` (11 files)
- `tests/integration/session/*.test.ts` (2 files)
- `tests/integration/cli/session.integration.test.ts`
- `spx/36-session.outcome/` — pre-rearchitecture enabler-under-outcome layout

**Migration Dates**:

- 2026-04-18 — Phase 2c-i: rearchitecture (commits `14b8ba2`, `13d36d2`)
- 2026-04-18 — Phase 2c-ii: legacy removal and coverage preservation (commits `f4667ce`, `9441cdc`, `4be91b6`)

## Structural Changes

### Parent retype

`36-session.outcome` → `36-session.enabler`. Session management is infrastructure the spx product provides, not a hypothesis whose assertions could change while the outcome stays the same.

### Dissolved false outcomes

| Dissolved outcome                | Replaced by                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- |
| `32-core-operations.outcome`     | Split into `32-session-identity.enabler` + `43-session-store.enabler`       |
| `43-session-lifecycle.outcome`   | `65-session-claim.enabler`                                                  |
| `54-advanced-operations.outcome` | `54-session-retention.enabler`                                              |
| `76-batch-operations.outcome`    | `76-session-cli.enabler`                                                    |
| `54-auto-injection.outcome`      | Retyped to `54-auto-injection.enabler` (child of .enabler must be .enabler) |

### New ADR

- `32-domain-command-split.adr.md` — declares the two-module split between pure domain logic (`src/session/`) and I/O orchestration (`src/commands/session/`), and forbids inline reimplementation of pure logic in command handlers.

## Test Inventory

### Renamed and moved (tracked as renames by git)

| New location                                                        | Origin                                                                                                                           | Operation                   |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `tests/session.unit.test.ts`                                        | `32-core-operations.outcome/tests/core-operations.unit.test.ts`                                                                  | `git mv` + rename           |
| `32-session-identity.enabler/tests/session-identity.unit.test.ts`   | `32-core-operations.outcome/tests/timestamp.unit.test.ts` + `metadata.unit.test.ts`                                              | Merged under new slug       |
| `43-session-store.enabler/tests/session-store.unit.test.ts`         | `32-core-operations.outcome/tests/list-command.unit.test.ts`, `show.unit.test.ts`, `delete.unit.test.ts`, `handoff.unit.test.ts` | Merged under new slug       |
| `43-session-store.enabler/tests/session-store.integration.test.ts`  | `32-core-operations.outcome/tests/list-command.integration.test.ts`                                                              | `git mv` + rename           |
| `54-auto-injection.enabler/tests/auto-injection.unit.test.ts`       | `54-auto-injection.outcome/tests/auto-injection.unit.test.ts`                                                                    | `git mv` (directory retype) |
| `54-session-retention.enabler/tests/session-retention.unit.test.ts` | `54-advanced-operations.outcome/tests/advanced-operations.unit.test.ts`                                                          | `git mv` + rename           |
| `65-session-claim.enabler/tests/session-claim.unit.test.ts`         | `43-session-lifecycle.outcome/tests/session-lifecycle.unit.test.ts`                                                              | `git mv` + rename           |
| `65-session-claim.enabler/tests/session-claim.integration.test.ts`  | `43-session-lifecycle.outcome/tests/session-lifecycle.integration.test.ts`                                                       | `git mv` + rename           |
| `76-session-cli.enabler/tests/session-cli.unit.test.ts`             | `76-batch-operations.outcome/tests/batch-operations.unit.test.ts`                                                                | `git mv` + rename           |

### Removed (legacy task-driven tree)

The following sources were removed in Phase 2c-ii after the new co-located tests and additional edge-case ports were in place:

- `tests/unit/session/{archive,create,delete,dry-run,handoff,list,pickup,prune,release,show,timestamp}.test.ts`
- `tests/integration/session/{advanced-cli,lifecycle}.integration.test.ts`
- `tests/integration/cli/session.integration.test.ts`
- `specs/work/doing/capability-28_session-core/` (four features, 13 stories, four ADRs, PRD, capability spec)

Unique edge-case assertions from the removed tests — invalid-ID sort determinism, empty-content handoff rejection, YAML-parses-to-null fallback, and out-of-range timestamp components — were ported to the new spec-tree tests under assertions added to `session-store.md`, `session-retention.md`, `session-claim.md`, and `session-identity.md`.

## Source Code Changes

| Module                            | Change                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/commands/session/prune.ts`   | Consolidated to import `selectSessionsToDelete` and `DEFAULT_KEEP_COUNT` from `src/session/prune.ts` per `32-domain-command-split.adr.md`                                                                                 |
| `src/commands/session/archive.ts` | Consolidated to import `buildArchivePaths`, `findSessionForArchive`, types from `src/session/archive.ts`                                                                                                                  |
| `src/session/create.ts`           | Removed `buildSessionPath` and `CreateSessionConfig` (no callers); collapsed unreachable whitespace-only branch in `validateSessionContent`                                                                               |
| `src/session/prune.ts`            | Removed `formatPruneResult`, `PruneResult`, `FormatPruneOptions`, `PruneAction`, `PRUNE_ACTION_WOULD_DELETE`, `PRUNE_ACTION_DELETED` (no callers)                                                                         |
| `src/session/archive.ts`          | Tightened `ArchivePathConfig` — `todoDir` and `doingDir` now required, matching the only caller's `SessionDirectoryConfig`; removed the runtime "Missing \<status\>Dir" throw that was unreachable under the tighter type |

## Verification

```bash
pnpm test -- spx/36-session.enabler/
# 133 tests passing across 10 files

pnpm run validate
# TypeScript and circular-dependency checks pass on the session subtree
```

Coverage on `src/session/**` and `src/commands/session/**` meets or exceeds the pre-migration baseline, with improvements in `create.ts`, `list.ts`, `prune.ts`, and `release.ts` from the ported edge-case tests.

## Known Open Issues

- `26-worktree-detection.adr.md` contains temporal language (line 15: "Add …") and a misplaced Testing Strategy section — tracked in `ISSUES.md`.
- `pickup` and `release` commands use singular `sessionId` while `session-cli.md` scenarios describe variadic IDs — tracked in `76-session-cli.enabler/ISSUES.md`.
