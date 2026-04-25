# Migration Plan: specs/ + tests/ → spx/ co-located

## Approach

spx/ is the source of truth. Work outward from it:

1. **Prune** — Remove specs/ test files that are byte-identical to tests/ graduated copies. These run the same tests twice. No evaluation needed.
2. **Migrate by capability** — For each remaining specs/ capability, create the spx/ node (if needed), evaluate ALL tests from specs/ AND tests/ for that domain, move suitable tests directly to spx/, `git rm` originals from both locations.

No intermediate hops. Diverged specs/↔tests/ pairs are resolved at the spx/ target, not by merging into tests/ first. tests/ files are handled alongside their specs/ counterparts during capability migration.

**Collision rule:** spx/ wins. When an incoming file collides with an existing spx/ test, the incoming file gets a `-legacy` suffix. After migration, evaluate whether `-legacy` files add unique coverage. Merge if so, `git rm` if not.

**Diverged pair rule:** When specs/ and tests/ have different versions of the same test, diff both, merge unique cases, move the result directly to spx/, `git rm` both originals. The merge happens at the destination, not at an intermediate location.

---

## Skills Invoked

| Skill                               | Purpose                                                    | Status                          |
| ----------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| `/spec-tree:understanding`          | Foundation: node types, truth hierarchy, assertion types   | Loaded                          |
| `/spec-tree:contextualizing spx/`   | Tree structure, existing nodes, gaps                       | Loaded                          |
| `/spx-legacy:migrating-spec-to-spx` | Migration methodology, verification gates, failure modes   | Loaded (old — used selectively) |
| `/typescript:testing-typescript`    | Test level classification, naming conventions, DI patterns | Loaded                          |

Skills to invoke during execution (not loaded yet):

| Skill                                 | When                                                              |
| ------------------------------------- | ----------------------------------------------------------------- |
| `/spec-tree:authoring`                | Phase 2, when creating new spx/ nodes                             |
| `/spec-tree:testing`                  | Each phase, before moving tests                                   |
| `/spec-tree:refactoring`              | Phase 2c-i (session rearchitecture) and Phase 4 (31-spec-domain)  |
| `/spec-tree:aligning`                 | Before closing any node, to verify spec ↔ test ↔ code alignment   |
| `/typescript:architecting-typescript` | Phase 2c-i, when authoring ADRs for prune and batch consolidation |
| `/typescript:coding-typescript`       | Phase 2c-i, when writing the consolidated src modules             |
| `/spec-tree:committing-changes`       | Every commit boundary                                             |

---

## Baseline

Counts at plan inception, current counts in parentheses.

| Location  | Files at start | Tests at start | Files now | Tests now |
| --------- | -------------- | -------------- | --------- | --------- |
| specs/    | 40             | 485            | 0         | 0         |
| tests/    | 47             | 480            | 12        | ~140      |
| spx/      | 47             | 408            | 106       | ~910      |
| **Total** | **134**        | **1373**       | **118**   | **1049**  |

All 1049 tests passing. The remaining 12 files in `tests/` are core-cli-related (reporter, tree, scanner, CLI commands, harness) and cover Phase 3.

---

## Target State

- All tests co-located in `spx/.../tests/` with level suffixes (`.unit.test.ts`, `.integration.test.ts`, `.e2e.test.ts`)
- `specs/` retains frozen spec markdown only — zero test files
- `tests/` retains fixtures and harness utilities only — zero test cases
- SPX-MIGRATION.md at every level where tests were migrated
- `vitest.config.ts` includes only `spx/**/*.test.ts`

---

## Structural Reality

The spx/ tree has mixed node types from two eras:

| Node                         | Suffix        | Methodology                                           |
| ---------------------------- | ------------- | ----------------------------------------------------- |
| `21-core-cli.capability/`    | `.capability` | Pre-methodology (children use `.feature/.story`)      |
| `26-scoped-cli.capability/`  | `.capability` | Pre-methodology (children use `.feature/.story`)      |
| `31-spec-domain.capability/` | `.capability` | Pre-methodology (DUPLICATE of below)                  |
| `31-spec-domain.outcome/`    | `.outcome`    | Current spec-tree                                     |
| `36-session.enabler/`        | `.enabler`    | Current spec-tree (children converting to `.enabler`) |

**Decision:** Structural normalization (`.capability` → `.enabler`/`.outcome`, `.feature`/`.story` → `.outcome`) is OUT OF SCOPE for this migration. It requires `/spec-tree:refactoring` and is a separate initiative. This plan migrates tests into the tree as it exists today.

**Exception:** The 31-spec-domain BSP collision (two nodes at index 31) must be resolved because it violates tree invariants.

---

## Sharing Map (Critical — Required Before Any Removal)

Modules with tests in multiple locations (specs/, tests/, spx/):

| src/ module                    | specs/ tests | tests/ tests | spx/ tests | Risk                                    |
| ------------------------------ | ------------ | ------------ | ---------- | --------------------------------------- |
| `src/session/timestamp`        | 1            | 1            | 1          | All three — verify all cover same logic |
| `src/session/delete`           | 1            | 1            | 1          | Same                                    |
| `src/session/show`             | 1            | 1            | 1          | Same                                    |
| `src/session/create`           | 1            | 1            | 0          | specs/ is identical to tests/           |
| `src/session/list`             | 2            | 1            | 4          | High sharing — remove specs/ last       |
| `src/session/pickup`           | 2            | 1            | 2          | High sharing                            |
| `src/session/release`          | 1            | 1            | 1          | All three                               |
| `src/session/errors`           | 3            | 3            | 2          | High sharing — careful                  |
| `src/validation`               | 8            | 2            | 0          | No spx/ coverage yet                    |
| `src/validation/discovery/*`   | 2            | 2            | 0          | Identical pairs exist                   |
| `src/precommit/*`              | 2            | 2            | 0          | Identical pairs exist                   |
| `src/config/defaults`          | 2            | 1            | 3          | Widely shared — 10 total test files     |
| `src/domains/types`            | 1            | 0            | 1          | specs/ unique for this module           |
| `src/git/root`                 | 2            | 0            | 1          | specs/-only for git root tests          |
| `src/commands/session/handoff` | 1            | 1            | 1          | All three                               |
| `src/lib/claude/permissions/*` | 6            | 0            | 0          | specs/-ONLY — no coverage elsewhere     |

**Critical:** `src/lib/claude/permissions/*` has coverage ONLY in `specs/capability-33`. Removing those files without creating spx/ replacements destroys coverage entirely.

---

## Verification Protocol

Every phase follows this protocol:

### Before Moving Tests

1. Record test count: `pnpm test` → note file count and test count
2. Record coverage on affected src/ modules: `pnpm test -- --coverage` → note line coverage for each src/ module this phase touches

### After Moving Tests (git mv)

1. Fix import paths in moved files (relative `../` paths change)
2. `pnpm test` → same test count, zero failures
3. `pnpm test -- --coverage` → coverage on affected src/ modules within ±0.5%

### After Removing Old Tests (git rm)

1. `pnpm test` → test count decreased by exactly the number of removed files' tests
2. `pnpm test -- --coverage` → coverage on affected src/ modules unchanged (the remaining copies cover the same code)
3. If coverage drops > 0.5%: STOP. Identify which test cases were unique to the removed file. Restore and merge before proceeding.

### Before Committing

1. `pnpm run validate` passes (ESLint, TypeScript, circular deps)
2. `git status` shows only expected changes
3. SPX-MIGRATION.md exists at every level where tests were migrated
4. Invoke `/spec-tree:committing-changes`

---

## Phase 0: Foundation

**Status:** Done. Worktree at `../spx_pre-migration` (HEAD `306dc91`); product spec authored at `spx/spx.product.md` (commits `eb9677e`, `fd45443`).

### 0a: Create Reference Worktree

```bash
git worktree add "../spx_pre-migration" HEAD
```

This provides a pristine baseline for coverage comparison and recovery.

### 0b: Record Per-Module Coverage Baseline

```bash
pnpm test -- --coverage
```

Save the coverage report. This is the baseline every phase compares against.

### 0c: Create Product File

The spx/ tree lacks a `{product}.product.md`. This is required by the contextualizing workflow.

**Action:** Invoke `/spec-tree:authoring` to create `spx/spx.product.md` derived from `specs/work/spx-platform.prd.md`.

### Commit: "chore: add product spec and reference worktree baseline"

---

## Phase 1: Prune Byte-Identical specs/ Copies

**Status:** Done in `1553ad2` — 10 files removed, zero coverage delta.

**Goal:** Remove 10 specs/ test files that are byte-identical to their tests/ counterparts. These run the same tests twice — removing them loses zero coverage.

**Risk:** None. Byte-identical means the tests/ copy provides exactly the same coverage.

### Files to `git rm` (specs/ copies)

| #  | specs/ file (to remove)                                                                          | tests/ file (kept)                                                      | Verified  |
| -- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------- |
| 1  | `specs/.../capability-28_.../story-21_timestamp-utils/tests/timestamp.unit.test.ts`              | `tests/unit/session/timestamp.test.ts`                                  | md5 match |
| 2  | `specs/.../capability-28_.../story-32_list-command/tests/list.unit.test.ts`                      | `tests/unit/session/list.test.ts`                                       | md5 match |
| 3  | `specs/.../capability-28_.../story-43_show-command/tests/show.unit.test.ts`                      | `tests/unit/session/show.test.ts`                                       | md5 match |
| 4  | `specs/.../capability-28_.../story-54_create-command/tests/create.unit.test.ts`                  | `tests/unit/session/create.test.ts`                                     | md5 match |
| 5  | `specs/.../capability-28_.../story-65_delete-command/tests/delete.unit.test.ts`                  | `tests/unit/session/delete.test.ts`                                     | md5 match |
| 6  | `specs/.../capability-15_.../story-44_tool-discovery/tests/tool-finder.test.ts`                  | `tests/unit/validation/tool-finder.test.ts`                             | md5 match |
| 7  | `specs/.../capability-15_.../story-44_tool-discovery/tests/tool-finder.integration.test.ts`      | `tests/integration/validation/tool-finder.integration.test.ts`          | md5 match |
| 8  | `specs/.../capability-15_.../story-21_file-categorization/tests/categorize.test.ts`              | `tests/unit/precommit/categorize.test.ts`                               | md5 match |
| 9  | `specs/.../capability-15_.../story-32_lefthook-config/tests/build-args.test.ts`                  | `tests/unit/precommit/build-args.test.ts`                               | md5 match |
| 10 | `specs/.../capability-33_.../story-54_cli-integration/tests/integration/cli.integration.test.ts` | `tests/integration/cli/claude-settings-consolidate.integration.test.ts` | md5 match |

### Steps

1. `git rm` all 10 files
2. Verification protocol: test count drops by the tests in those 10 files, coverage unchanged

### Commit: "refactor: remove 10 duplicate specs/ tests (identical to tests/ copies)"

---

## Phase 2: Migrate specs/ Capabilities to spx/

**Goal:** For each remaining specs/ capability, create the spx/ node (if needed), evaluate ALL tests from specs/ AND tests/ for that domain, move suitable tests directly to spx/, `git rm` originals from both locations.

**Ordering:** Smallest capability first.

**Diverged pair handling within each sub-phase:**

1. `git mv` the tests/ version to the spx/ target (preserves git history of the more recent copy)
2. Diff the specs/ version against the now-moved file
3. If specs/ has unique test cases: edit the spx/ file to add them
4. `git rm` the specs/ original

---

### 2a: Core Config (2 test files — lowest risk)

**Status:** Done. Initial migration to `16-core-config.enabler` in `65c6429`; later re-scoped and renamed to `16-config.enabler` (registry-composed) in `6229eb2`.

**Source:** `specs/capability-42_core-config`
**Code:** `src/config/`

**Create spx/ node:** Invoke `/spec-tree:authoring` → determines node type (enabler vs outcome), index, slug, and spec content. Proposed placement: `spx/NN-core-config.{type}/`.

**Tests to migrate (target paths depend on authoring output):**

| Source                                                              | Operation         |
| ------------------------------------------------------------------- | ----------------- |
| `specs/.../story-11_config-schema/tests/config-schema.unit.test.ts` | `git mv` + rename |
| `tests/unit/config/defaults.test.ts`                                | `git mv` + rename |

**Sharing risk:** `src/config/defaults` has 10 test files across all locations, but only these 2 directly test config modules. The other 8 just import defaults — removing the config tests doesn't affect their coverage.

**SPX-MIGRATION.md:** Create at the authored node.

**Commit:** message determined after authoring

---

### 2b: Claude (7 test files + 1 spec-only node)

**Status:** Done in `a109cd0`. `46-claude.outcome` with `21-settings-consolidation.outcome` and `32-marketplace.outcome` children. SPX-MIGRATION.md at the destination.

**Source:** `specs/capability-33_claude-settings`, `specs/capability-32_claude-marketplace`
**Code:** `src/lib/claude/permissions/`, `src/commands/claude/`

**CRITICAL:** `src/lib/claude/permissions/*` has coverage ONLY in specs/. Removing without migration destroys coverage.

**Create spx/ nodes:** Invoke `/spec-tree:authoring` → determines node types, indices, tree structure, and spec content for:

- Claude settings consolidation (discovery/parsing, subsumption/merging, CLI integration)
- Claude marketplace (spec declaration only — no tests exist)

**Tests to migrate (target paths depend on authoring output):**

| Source                                                                  | Domain              | Operation         |
| ----------------------------------------------------------------------- | ------------------- | ----------------- |
| `specs/.../story-21_.../tests/unit/discovery.test.ts`                   | Discovery/parsing   | `git mv` + rename |
| `specs/.../story-21_.../tests/unit/parser.test.ts`                      | Discovery/parsing   | `git mv` + rename |
| `specs/.../story-32_.../tests/unit/merger.test.ts`                      | Subsumption/merging | `git mv` + rename |
| `specs/.../story-32_.../tests/unit/merger.properties.test.ts`           | Subsumption/merging | `git mv` + rename |
| `specs/.../story-32_.../tests/unit/subsumption.test.ts`                 | Subsumption/merging | `git mv` + rename |
| `specs/.../story-32_.../tests/unit/subsumption.properties.test.ts`      | Subsumption/merging | `git mv` + rename |
| `tests/integration/cli/claude-settings-consolidate.integration.test.ts` | CLI integration     | `git mv` + rename |

**CRITICAL:** `src/lib/claude/permissions/*` has coverage ONLY in specs/. Removing without migration destroys coverage.

**SPX-MIGRATION.md:** Create at every authored level.

**Commit:** message determined after authoring

---

### 2c: Session — rearchitect subtree, then delete legacy

**Status:** Done. 2c-i in `14b8ba2` + `13d36d2`; 2c-ii in `4be91b6` + `9441cdc`; 2c-iii in `4f62f2a`. SPX-MIGRATION.md at `spx/36-session.enabler/`.

**Source:** Remaining `specs/capability-28_session-core` after Phase 1 + all `tests/**/session*`
**Target:** Rearchitected `spx/36-session.enabler/` tree

**Discovered during execution:** The existing `spx/36-session.enabler/` subtree (formerly `.outcome`) misapplies the methodology:

1. **False outcomes.** Children like `32-core-operations.outcome`, `43-session-lifecycle.outcome`, `54-advanced-operations.outcome`, `54-auto-injection.outcome`, `76-batch-operations.outcome` are declared as outcomes but have no user-behavior-change hypothesis. The single real outcome is at `session.md`: agents switch from manual file editing to CLI commands. Everything below is infrastructure serving that outcome.
2. **Junk-drawer names.** `core-operations` and `advanced-operations` tell nothing about what they contain. They invite scope creep.
3. **Split implementations.** `src/session/prune.ts` (pure selection/formatting, orphaned) and `src/commands/session/prune.ts` (CLI handler with its own inline duplicate logic) both implement prune. Same disease affects batch: `src/session/batch.ts` + per-command inline variadic arg handling.
4. **Coverage gap.** Deleting `tests/unit/session/prune.test.ts` drops `src/session/prune.ts` from 89% to 0% coverage — because nothing in `src/` consumes it.

specs/ and tests/ session files are NOT migrated. The session implementation is complete in src/. specs/ and tests/ copies are graduated legacy duplicates. Coverage from legacy tests fills gaps only because of architecture flaws, not because the tests carry unique product intent.

#### 2c-i: Rearchitect spx/36-session.enabler/ subtree

Invoke `/spec-tree:refactoring` to execute the restructure. Target tree:

```text
spx/36-session.enabler/
├── session.md                          # THE enabler (PROVIDES/SO THAT/CAN)
├── 21-directory-structure.adr.md       # unchanged
├── 21-timestamp-format.adr.md          # unchanged
├── 21-atomic-claiming.adr.md           # unchanged
├── 21-auto-injection.adr.md            # unchanged
├── 26-worktree-detection.adr.md        # unchanged
├── tests/                              # Cross-cutting session tests
│
├── 21-test-harness.enabler/            # unchanged (was already correct)
├── 32-session-identity.enabler/        # NEW: ID format, metadata parsing
├── 43-session-store.enabler/           # NEW: CRUD primitives over directory store
├── 54-auto-injection.enabler/          # RENAMED from .outcome
├── 54-session-retention.enabler/       # REPLACES 54-advanced-operations.outcome
├── 65-session-claim.enabler/           # REPLACES 43-session-lifecycle.outcome
└── 76-session-cli.enabler/             # REPLACES 76-batch-operations.outcome + CLI surface concerns
```

**Dependency order (by index):**

| Index | Node                | Depends on                                         |
| ----- | ------------------- | -------------------------------------------------- |
| 21    | `test-harness`      | nothing                                            |
| 32    | `session-identity`  | nothing                                            |
| 43    | `session-store`     | 32 (identity)                                      |
| 54    | `auto-injection`    | 43 (store)                                         |
| 54    | `session-retention` | 43 (store), independent of auto-injection          |
| 65    | `session-claim`     | 43 (store), 54 (auto-injection runs during pickup) |
| 76    | `session-cli`       | all of the above                                   |

**Dissolved nodes:**

| Old                              | Where its concerns go                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `32-core-operations.outcome`     | Split into `32-session-identity` (timestamp, metadata parsing) and `43-session-store` (list, show, create, delete, handoff CRUD) |
| `43-session-lifecycle.outcome`   | `65-session-claim` (atomic pickup/release, auto-selection)                                                                       |
| `54-advanced-operations.outcome` | `54-session-retention` (prune + archive — directory lifecycle)                                                                   |
| `54-auto-injection.outcome`      | `54-auto-injection.enabler` (suffix change only — content stays)                                                                 |
| `76-batch-operations.outcome`    | `76-session-cli` (variadic args, error handling, exit codes, plus all CLI surface concerns)                                      |

**Per-node action plan (all use `/spec-tree:authoring` + `/spec-tree:testing`):**

1. **`32-session-identity.enabler`** — NEW. Author spec. Declares: timestamp ID format (ADR `21-timestamp-format`), front matter parsing with defaults. Tests migrate from existing `32-core-operations.outcome/tests/timestamp.unit.test.ts` and `metadata.unit.test.ts`.

2. **`43-session-store.enabler`** — NEW. Author spec. Declares: directory-backed CRUD (list/show/create/delete/handoff) following ADR `21-directory-structure`. Tests migrate from existing `32-core-operations.outcome/tests/{list-command,show,delete,handoff,core-operations}.{unit,integration}.test.ts`.

3. **`54-auto-injection.enabler`** — RENAME `.outcome` → `.enabler`. Spec content stays. Tests stay. `git mv` directory only.

4. **`54-session-retention.enabler`** — NEW. Author spec. Declares: archive (atomic move to archive dir) + prune (retention-based deletion from archive dir). **Before tests migrate, rearchitect src:**
   - Consolidate `src/session/prune.ts` + `src/commands/session/prune.ts` into one clean module structure
   - Pure selection/formatting in `src/session/retention.ts` (or keep in `src/session/prune.ts` as the authoritative home)
   - CLI handler in `src/commands/session/prune.ts` imports from the pure module (no inline duplicates)
   - Archive follows the same split
   - Delete dead code
   - Tests migrate from existing `54-advanced-operations.outcome/tests/advanced-operations.unit.test.ts`
   - Tests remain in the `/spec-tree:testing` flow — write tests that verify the new spec's assertions, not the current tests'

5. **`65-session-claim.enabler`** — NEW (replaces `43-session-lifecycle.outcome`). Author spec. Declares: atomic pickup/release via `fs.rename()` per ADR `21-atomic-claiming`, priority-based auto-selection. Tests `git mv` from `43-session-lifecycle.outcome/tests/`.

6. **`76-session-cli.enabler`** — NEW (replaces `76-batch-operations.outcome`). Author spec. Declares: Commander bindings for all session subcommands, variadic arg parsing for batch operations, per-ID result reporting, non-zero exit on any failure, `<HANDOFF_ID>`/`<PICKUP_ID>` tag emission. **Before tests migrate, rearchitect src:**
   - `src/session/batch.ts` becomes the sole home for variadic arg processing
   - All command handlers in `src/commands/session/*.ts` consume `batch.processBatch()` — no inline loops
   - Delete per-command duplicated batch logic
   - Tests migrate from existing `76-batch-operations.outcome/tests/batch-operations.unit.test.ts`

**Commits during 2c-i (one per node rearchitecture):**

1. `refactor(spec-tree): dissolve session false outcomes, declare 32-session-identity.enabler`
2. `refactor(spec-tree): declare 43-session-store.enabler, migrate CRUD tests`
3. `refactor(spec-tree): convert 54-auto-injection.outcome to enabler`
4. `refactor(src): consolidate src/session/prune.ts and src/commands/session/prune.ts`
5. `refactor(src): consolidate batch arg handling via src/session/batch.ts`
6. `refactor(spec-tree): declare 54-session-retention.enabler, migrate prune/archive tests`
7. `refactor(spec-tree): declare 65-session-claim.enabler (was 43-session-lifecycle.outcome)`
8. `refactor(spec-tree): declare 76-session-cli.enabler (was 76-batch-operations.outcome)`

**Verification after 2c-i:** `pnpm test` passes. Coverage on `src/session/**` and `src/commands/session/**` is unchanged or improved from pre-rearchitecture baseline. Every moved test still exercises the same src code paths.

#### 2c-ii: Delete legacy session copies

Only after 2c-i is complete and coverage is verified:

```bash
git rm -r specs/work/doing/capability-28_session-core/
git rm tests/unit/session/*.test.ts
git rm tests/integration/session/*.test.ts
git rm tests/integration/cli/session.integration.test.ts
```

**Verification:** `pnpm test` passes. `pnpm test -- --coverage` shows `src/session/**` and `src/commands/session/**` coverage unchanged from the 2c-i post-rearchitecture baseline (NOT from the pre-migration baseline, which included legacy tests hiding the dead code).

**Commit:** `refactor(session): remove legacy specs/ and tests/ session copies, now covered by rearchitected spx/36-session subtree`

#### 2c-iii: Create SPX-MIGRATION.md

At `spx/36-session.enabler/SPX-MIGRATION.md`. Documents:

- The rearchitecture (old → new node mapping)
- The src consolidation (which files merged, which deleted)
- Coverage verification before deletion
- Why no files from specs/ or tests/ were migrated (legacy was redundant after cleanup)

**Commit:** `docs(spx): document session rearchitecture and legacy deletion`

---

### 2d: Validation (15 specs/ + 17 tests/ = 32 files — largest)

**Status:** Done in `f43d85a`, `3478198`, `7c751a1`, `dc6272e`. The migration was not file-for-file: the `41-validation.enabler/` subtree was rebuilt per `11-tool-based-validation.pdr.md` (each leaf names its tool — ESLint, tsc, madge, literal-reuse detector, markdownlint-cli2). Precommit was not absorbed into validation because lefthook's runner is a peer quality gate, not a `spx validation` subcommand — it lives at `spx/43-precommit.enabler/` (added by this phase, not anticipated in the original plan). SPX-MIGRATION.md at both `spx/41-validation.enabler/` and `spx/43-precommit.enabler/`.

**Source:** Remaining `specs/capability-15_infrastructure` after Phase 1 + all `tests/**/validation*`, `tests/**/precommit*`, `tests/**/eslint*`, `tests/**/commands/validation*`, validation harness
**Code:** `src/validation/`, `src/commands/validation/`, `src/precommit/`, ESLint rules

**Create spx/ nodes:** Invoke `/spec-tree:authoring` → determines node types, indices, tree structure, and spec content. The validation domain has four functional areas that need nodes:

- Validation core (arg builders, scope resolution, tool discovery, circular deps)
- ESLint rules (custom rules for codebase conventions)
- Precommit enforcement (test enforcement in pre-commit hooks)
- Validation commands (CLI `spx validation` subcommands)

Authoring determines whether each is an enabler or outcome, the parent-child relationships, and the indices.

**Diverged pairs in this domain (5 pairs) — resolved at spx/ target:**

| specs/ file (story-45 or story-48)        | tests/ file                                                        | Resolution                                            |
| ----------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| `story-45/.../argument-builders.test.ts`  | `tests/unit/validation/argument-builders.test.ts`                  | `git mv` tests/ to spx/, diff specs/, merge, `git rm` |
| `story-45/.../scope-resolution.test.ts`   | `tests/unit/validation/scope-resolution.test.ts`                   | Same                                                  |
| `story-45/.../validation-exports.test.ts` | `tests/unit/validation/validation-exports.test.ts`                 | Same                                                  |
| `story-48/.../format.test.ts`             | `tests/unit/commands/validation/format.test.ts`                    | Same                                                  |
| `story-48/.../output.integration.test.ts` | `tests/integration/commands/validation/output.integration.test.ts` | Same                                                  |

**One commit per child node.** Target paths and commit messages determined after authoring.

**All test files in this domain (target paths depend on authoring output):**

| Source                                                                            | Domain              | Note          |
| --------------------------------------------------------------------------------- | ------------------- | ------------- |
| `specs/.../story-43_.../unit/build-args.test.ts`                                  | Validation core     | specs/-only   |
| `specs/.../story-43_.../unit/circular-deps.test.ts`                               | Validation core     | specs/-only   |
| `specs/.../story-43_.../unit/validation-helpers.test.ts`                          | Validation core     | specs/-only   |
| `specs/.../story-43_.../integration/circular-deps-validation.integration.test.ts` | Validation core     | specs/-only   |
| `specs/.../story-43_.../integration/eslint-validation.integration.test.ts`        | Validation core     | specs/-only   |
| `specs/.../story-43_.../integration/typescript-validation.integration.test.ts`    | Validation core     | specs/-only   |
| `specs/.../story-22_.../test-harness-demo.integration.test.ts`                    | Validation core     | specs/-only   |
| `tests/unit/validation/argument-builders.test.ts`                                 | Validation core     | diverged pair |
| `specs/.../story-45_.../argument-builders.test.ts`                                | (merge into above)  | diverged pair |
| `tests/unit/validation/scope-resolution.test.ts`                                  | Validation core     | diverged pair |
| `specs/.../story-45_.../scope-resolution.test.ts`                                 | (merge into above)  | diverged pair |
| `tests/unit/validation/validation-exports.test.ts`                                | Validation core     | diverged pair |
| `specs/.../story-45_.../validation-exports.test.ts`                               | (merge into above)  | diverged pair |
| `tests/unit/validation/extracted-functions.test.ts`                               | Validation core     | tests/-only   |
| `tests/unit/validation/tool-finder.test.ts`                                       | Validation core     | tests/-only   |
| `tests/integration/validation/tool-finder.integration.test.ts`                    | Validation core     | tests/-only   |
| `tests/integration/validation/typecheck-scripts.integration.test.ts`              | Validation core     | tests/-only   |
| `tests/unit/eslint-rules/no-hardcoded-statuses.test.ts`                           | ESLint rules        | tests/-only   |
| `tests/unit/eslint-rules/no-hardcoded-work-item-kinds.test.ts`                    | ESLint rules        | tests/-only   |
| `tests/integration/eslint-rules/eslint-rules.integration.test.ts`                 | ESLint rules        | tests/-only   |
| `specs/.../story-43_vitest-integration/tests/run.test.ts`                         | Precommit           | specs/-only   |
| `tests/unit/precommit/categorize.test.ts`                                         | Precommit           | tests/-only   |
| `tests/unit/precommit/build-args.test.ts`                                         | Precommit           | tests/-only   |
| `tests/integration/precommit/hook-enforcement.integration.test.ts`                | Precommit           | tests/-only   |
| `specs/.../story-46_.../validation-cli.integration.test.ts`                       | Validation commands | specs/-only   |
| `specs/.../story-46_.../validation-domain.test.ts`                                | Validation commands | specs/-only   |
| `tests/unit/commands/validation/format.test.ts`                                   | Validation commands | diverged pair |
| `specs/.../story-48_.../format.test.ts`                                           | (merge into above)  | diverged pair |
| `tests/integration/commands/validation/output.integration.test.ts`                | Validation commands | diverged pair |
| `specs/.../story-48_.../output.integration.test.ts`                               | (merge into above)  | diverged pair |
| `tests/integration/cli/validation.integration.test.ts`                            | Validation commands | tests/-only   |
| `tests/harness/with-validation-env.test.ts`                                       | Validation (parent) | tests/-only   |

**SPX-MIGRATION.md:** Create at every authored level.

---

## Phase 3: Remaining tests/ → Existing spx/ Nodes

**Status:** Done. 5 `.feature` dirs renamed to `.enabler`, 5 specs rewritten with typed assertions, 5 canonical test files written, 12 originals removed. All 1110 tests pass.

**Goal:** Move remaining tests/ files into existing `spx/21-core-cli.capability/` nodes. These are tests/-only files (no specs/ counterpart) for the core CLI domain.

### 3a: Reporter tests → 65-output-formatting.feature/

| Source                                                 | Target                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `tests/unit/reporter/text.test.ts`                     | `spx/.../65-output-formatting.feature/tests/text-legacy.unit.test.ts`           |
| `tests/unit/reporter/json.test.ts`                     | `spx/.../65-output-formatting.feature/tests/json-legacy.unit.test.ts`           |
| `tests/unit/reporter/markdown.test.ts`                 | `spx/.../65-output-formatting.feature/tests/markdown-legacy.unit.test.ts`       |
| `tests/unit/reporter/table.test.ts`                    | `spx/.../65-output-formatting.feature/tests/table-legacy.unit.test.ts`          |
| `tests/integration/tree-formatter-integration.test.ts` | `spx/.../65-output-formatting.feature/tests/tree-formatter.integration.test.ts` |

### 3b: Tree tests → 54-tree-building.feature/

| Source                             | Target                                                                |
| ---------------------------------- | --------------------------------------------------------------------- |
| `tests/unit/tree/build.test.ts`    | `spx/.../54-tree-building.feature/tests/build-legacy.unit.test.ts`    |
| `tests/unit/tree/validate.test.ts` | `spx/.../54-tree-building.feature/tests/validate-legacy.unit.test.ts` |

### 3c: Scanner tests → 32-directory-walking.feature/

| Source                                                  | Target                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `tests/unit/scanner/scanner-di.test.ts`                 | `spx/.../32-directory-walking.feature/tests/scanner-di.unit.test.ts`                 |
| `tests/unit/scanner/scanner-no-hardcoded-paths.test.ts` | `spx/.../32-directory-walking.feature/tests/scanner-no-hardcoded-paths.unit.test.ts` |

### 3d: CLI command tests → 76-cli-integration.feature/

| Source                                             | Target                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `tests/unit/commands/next.test.ts`                 | `spx/.../76-cli-integration.feature/tests/next.unit.test.ts`          |
| `tests/integration/cli/status.integration.test.ts` | `spx/.../76-cli-integration.feature/tests/status.integration.test.ts` |
| `tests/integration/cli/next.integration.test.ts`   | `spx/.../76-cli-integration.feature/tests/next.integration.test.ts`   |
| `tests/integration/cli/errors.integration.test.ts` | `spx/.../76-cli-integration.feature/tests/errors.integration.test.ts` |

### 3e: Harness test

| Source                                            | Target                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `tests/harness/with-spec-env.integration.test.ts` | `spx/21-core-cli.capability/48-test-harness.feature/tests/with-spec-env.integration.test.ts` |

**Commit:** "refactor(core-cli): reverse-graduate tests/ into spx/21-core-cli"

---

## Phase 4: Resolve 31-spec-domain Duplicate

**Status:** Not started. Partial movement happened in `3670c6c` (the legacy `.outcome` was retyped to `.enabler`), but the duplicate sibling at the same index was not dissolved.

Two nodes at sparse-integer index 31 with the same slug — a tree invariant violation. Same index means independent peers, but same slug means the same concern; they cannot be both.

**Current state:**

- `31-spec-domain.capability/` — pre-methodology subtree: `21-configurable-hierarchy.feature/`, `32-container-model.feature/`, `43-naming-parsing.feature/`, `54-outcomes-ledger.feature/`, `65-status-derivation.feature/`, `76-cli-commands.feature/`, plus `docs/`, `tests/`, `CLAUDE.md`, `AGENTS.md`, `spec-domain.capability.md`
- `31-spec-domain.enabler/` — current methodology: `spec-domain.md` only (no children, no tests, no decisions)

**Assessment needed:** Invoke `/spec-tree:refactoring`. For each `.feature/` child under `.capability`, classify as:

1. **Still relevant** — the concern lives, but its current home is elsewhere (some are subsumed by `23-spec-tree-shape.enabler`, the kind-registry work in `926ca39`, `19-language-registration.adr.md`, or the recently-added `feat(spec-domain): add status and next commands` in `112558e`)
2. **Superseded** — the concern was reframed by the methodology shift (e.g., status derivation is now spec-state derived from tests, not a separate CLI feature)
3. **Dead** — describes deprecated CLI surface that was removed (`3c291eb refactor(spec-domain): remove historical status and next commands`) and not re-added

**Action:** absorb survivors into `31-spec-domain.enabler/` (or other already-existing nodes), `git rm` the rest, end with exactly one `31-spec-domain.{enabler|outcome}/` directory.

**Commit:** Determined by `/spec-tree:refactoring` output.

---

## Phase 5: Final Cleanup

**Status:** Not started.

### 5a: Resolve `-legacy` Suffixes

For every `*-legacy.unit.test.ts` file created in Phases 2-3:

1. Run coverage comparison against its spx/ counterpart
2. If coverage delta is 0: `git rm` the legacy file
3. If coverage delta > 0: merge unique test cases into the spx/ file, then `git rm`

### 5b: Update vitest.config.ts

```typescript
// Before
include: ["tests/**/*.test.ts", "spx/**/*.test.ts", "specs/**/*.test.ts"],

// After
include: ["spx/**/*.test.ts"],
```

Keep `tests/fixtures/**` in exclude (fixtures still used by spx/ tests via `@test` alias).

### 5c: Clean Up Empty Directories

```bash
pnpm run clean   # removes empty dirs, .DS_Store, __pycache__
```

### 5d: Remove Worktree

```bash
git worktree remove "../spx_pre-migration"
```

### 5e: Final Validation Gate

- [ ] `pnpm run validate` passes
- [ ] `pnpm test` passes — zero failures
- [ ] `find specs/ -name '*.test.ts'` returns nothing
- [ ] `find tests/ -name '*.test.ts' -not -path '*/fixtures/*'` returns nothing
- [ ] `find spx/ -name 'DONE.md'` returns nothing
- [ ] All SPX-MIGRATION.md files present
- [ ] Coverage on every src/ module ≥ baseline (±0.5%)

**Commit:** "chore: finalize migration, update vitest config, remove legacy test locations"

---

## Execution Summary

| Phase     | Scope                                                        | Status      | Files                   | Commits |
| --------- | ------------------------------------------------------------ | ----------- | ----------------------- | ------- |
| 0         | Foundation (worktree, product file)                          | Done        | 1 created               | 2+      |
| 1         | Prune identical specs/ copies                                | Done        | 10 removed              | 1       |
| 2a        | Core Config → spx/                                           | Done        | 2 moved                 | 2       |
| 2b        | Claude → spx/                                                | Done        | 7 moved                 | 1       |
| 2c-i      | Session subtree rearchitecture + src consolidation           | Done        | 7 nodes + 2 src modules | 2       |
| 2c-ii     | Delete legacy session specs/ and tests/                      | Done        | ~30 removed             | 2       |
| 2c-iii    | Session SPX-MIGRATION.md                                     | Done        | 1 created               | 1       |
| 2d        | Validation rebuild + precommit peer + ESLint rules + cleanup | Done        | 4 migrated + 23 deleted | 4       |
| 3         | Core CLI tests/ → spx/                                       | Done        | 12 removed, 5 written   | TBD     |
| 4         | Resolve 31-spec-domain dup                                   | Not started | TBD                     | TBD     |
| 5         | Cleanup + vitest config                                      | Not started | config + -legacy        | 1       |
| **Total** |                                                              |             |                         |         |

## Open Questions

1. **Phase 4 (31-spec-domain):** Requires `/spec-tree:refactoring`. Each `.feature/` child under `.capability` must be classified (still relevant / superseded by methodology shift / dead) before survivors are absorbed and the duplicate dissolved. Some concerns now live under `23-spec-tree-shape.enabler`, the kind-registry work in `926ca39`, or `19-language-registration.adr.md`; others were removed in `3c291eb` and partially re-added in `112558e`. Cannot be fully specified until classification runs.
2. **Phase 3 risk:** `tests/` files for core-cli are tests/-only with no specs/ counterpart, so the unknown is whether the existing `21-core-cli.capability/` children's specs already cover the assertions these tests carry, or whether each move requires extending the destination spec.
3. **Legacy suffix cleanup:** Phase 5a addresses any `-legacy.test.ts` files surfaced during Phase 3 collisions. None exist yet — count depends on collisions during the relocation.
4. **Structural normalization (.capability → .enabler/.outcome):** Out of scope for this plan. Phase 2c showed the session subtree itself needed a separate structural cleanup. Phase 4 will repeat this for `31-spec-domain.capability/`. The remaining `21-core-cli.capability/` and `26-scoped-cli.capability/` subtrees carry the same misapplication and need similar attention in a future initiative.
