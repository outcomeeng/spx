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

| Skill                           | When                                       |
| ------------------------------- | ------------------------------------------ |
| `/spec-tree:authoring`          | Phase 2, when creating new spx/ nodes      |
| `/spec-tree:testing`            | Each phase, before moving tests            |
| `/spec-tree:refactoring`        | Phase 4, when resolving 31-spec-domain dup |
| `/spec-tree:committing-changes` | Every commit boundary                      |

---

## Baseline

| Location  | Files   | Tests    |
| --------- | ------- | -------- |
| specs/    | 40      | 485      |
| tests/    | 47      | 480      |
| spx/      | 47      | 408      |
| **Total** | **134** | **1373** |

All 1373 tests passing. 10 byte-identical specs/↔tests/ pairs, 8 diverged specs/↔tests/ pairs, 22 specs/-only files, remaining tests/ files have no specs/ counterpart.

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

| Node                         | Suffix        | Methodology                                          |
| ---------------------------- | ------------- | ---------------------------------------------------- |
| `21-core-cli.capability/`    | `.capability` | Pre-methodology (children use `.feature/.story`)     |
| `26-scoped-cli.capability/`  | `.capability` | Pre-methodology (children use `.feature/.story`)     |
| `31-spec-domain.capability/` | `.capability` | Pre-methodology (DUPLICATE of below)                 |
| `31-spec-domain.outcome/`    | `.outcome`    | Current spec-tree                                    |
| `36-session.outcome/`        | `.outcome`    | Current spec-tree (children use `.enabler/.outcome`) |

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

### 2c: Session (8 specs/ + 14 tests/ = 22 files)

**Source:** Remaining `specs/capability-28_session-core` after Phase 1 + all `tests/**/session*`
**Target:** Existing `spx/36-session.outcome/` tree

spx/ session tests are rewrites, not copies. The incoming specs/ and tests/ files may cover cases the rewrites don't.

#### specs/-only files → move directly to spx/

| Source                                                                          | Target                                                                                     | Operation |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| `specs/.../story-54_create-command/tests/git-root.unit.test.ts`                 | `spx/36-session.outcome/32-core-operations.outcome/tests/git-root.unit.test.ts`            | `git mv`  |
| `specs/.../story-54_create-command/tests/git-root.integration.test.ts`          | `spx/36-session.outcome/32-core-operations.outcome/tests/git-root.integration.test.ts`     | `git mv`  |
| `specs/.../story-43_auto-pickup/tests/auto-pickup.unit.test.ts`                 | `spx/36-session.outcome/43-session-lifecycle.outcome/tests/auto-pickup.unit.test.ts`       | `git mv`  |
| `specs/.../story-54_cli-integration/tests/cli.integration.test.ts`              | `spx/36-session.outcome/43-session-lifecycle.outcome/tests/cli.integration.test.ts`        | `git mv`  |
| `specs/.../feature-32_session-lifecycle/tests/handoff-frontmatter.unit.test.ts` | `spx/36-session.outcome/32-core-operations.outcome/tests/handoff-frontmatter.unit.test.ts` | `git mv`  |

#### Diverged specs/↔tests/ pairs → merge at spx/ target, `git rm` both originals

| specs/ file                                            | tests/ file                                               | spx/ target                                                                |
| ------------------------------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| `story-21_pickup-command/.../pickup.unit.test.ts`      | `tests/unit/session/pickup.test.ts`                       | `spx/.../43-session-lifecycle.outcome/tests/pickup.unit.test.ts`           |
| `story-32_release-command/.../release.unit.test.ts`    | `tests/unit/session/release.test.ts`                      | `spx/.../43-session-lifecycle.outcome/tests/release.unit.test.ts`          |
| `feature-32/.../session-lifecycle.integration.test.ts` | `tests/integration/session/lifecycle.integration.test.ts` | `spx/.../43-session-lifecycle.outcome/tests/lifecycle.integration.test.ts` |

For lifecycle: spx/ already has `session-lifecycle.integration.test.ts`. Diff the incoming merged result against the spx/ rewrite — if the rewrite covers everything, `git rm` the merged result. If the merged result has unique cases, keep it alongside as `lifecycle-legacy.integration.test.ts`.

#### tests/-only session files → move to spx/

| Source                                                       | Target                                                                          | Collision?             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ---------------------- |
| `tests/unit/session/timestamp.test.ts`                       | `spx/.../32-core-operations.outcome/tests/timestamp-legacy.unit.test.ts`        | Yes — spx/ has rewrite |
| `tests/unit/session/list.test.ts`                            | `spx/.../32-core-operations.outcome/tests/list-legacy.unit.test.ts`             | Yes — spx/ has rewrite |
| `tests/unit/session/show.test.ts`                            | `spx/.../32-core-operations.outcome/tests/show-legacy.unit.test.ts`             | Yes — spx/ has rewrite |
| `tests/unit/session/create.test.ts`                          | `spx/.../32-core-operations.outcome/tests/create.unit.test.ts`                  | No                     |
| `tests/unit/session/delete.test.ts`                          | `spx/.../32-core-operations.outcome/tests/delete-legacy.unit.test.ts`           | Yes — spx/ has rewrite |
| `tests/unit/session/handoff.test.ts`                         | `spx/.../32-core-operations.outcome/tests/handoff-legacy.unit.test.ts`          | Yes — spx/ has rewrite |
| `tests/unit/session/archive.test.ts`                         | `spx/.../54-advanced-operations.outcome/tests/archive.unit.test.ts`             | No                     |
| `tests/unit/session/prune.test.ts`                           | `spx/.../54-advanced-operations.outcome/tests/prune.unit.test.ts`               | No                     |
| `tests/unit/session/dry-run.test.ts`                         | `spx/.../54-advanced-operations.outcome/tests/dry-run.unit.test.ts`             | No                     |
| `tests/integration/session/advanced-cli.integration.test.ts` | `spx/.../54-advanced-operations.outcome/tests/advanced-cli.integration.test.ts` | No                     |
| `tests/integration/cli/session.integration.test.ts`          | `spx/36-session.outcome/tests/session-cli.integration.test.ts`                  | No                     |

**Commit:** "refactor(session): consolidate specs/ and tests/ session tests into spx/36-session"

**SPX-MIGRATION.md:** Create at `spx/36-session.outcome/SPX-MIGRATION.md`

---

### 2d: Validation (15 specs/ + 17 tests/ = 32 files — largest)

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

Two nodes at BSP 31 — this is a tree invariant violation.

**Current state:**

- `31-spec-domain.capability/` — 6 features, docs, tests (37 test files covering legacy `spx spec`/`spx spx` CLI)
- `31-spec-domain.outcome/` — apply enabler with 3 test files

**Assessment needed:** Invoke `/spec-tree:refactoring` to determine:

1. Which `.capability` features are still relevant (or describe deprecated CLI commands)
2. Whether `.capability` tests cover code that `.outcome` tests don't
3. Target structure (merge into `.outcome` or renumber one node)

**Action depends on refactoring skill output.** Possible outcomes:

- **Merge:** `.capability` content absorbed into `.outcome` children → `git mv` tests, `git rm` capability tree
- **Renumber:** Keep both but fix the BSP collision (e.g., rename `.capability` to `28-spec-domain-legacy.enabler`)
- **Prune:** `.capability` describes deprecated CLI → `git rm` after verifying coverage is elsewhere

**Commit:** Determined by `/spec-tree:refactoring` output.

---

## Phase 5: Final Cleanup

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

| Phase     | Scope                               | Files            | Commits         | Risk   |
| --------- | ----------------------------------- | ---------------- | --------------- | ------ |
| 0         | Foundation (worktree, product file) | 1 created        | 1               | Low    |
| 1         | Prune identical specs/ copies       | 10 removed       | 1               | Low    |
| 2a        | Core Config → spx/                  | 2 moved          | 1               | Low    |
| 2b        | Claude → spx/                       | 7 moved          | 1               | Medium |
| 2c        | Session → spx/                      | 22 handled       | 1               | Medium |
| 2d-i      | Validation Core → spx/              | 19 handled       | 1               | High   |
| 2d-ii     | ESLint Rules → spx/                 | 3 moved          | 1               | Low    |
| 2d-iii    | Precommit → spx/                    | 4 moved          | 1               | Low    |
| 2d-iv     | Validation Commands → spx/          | 9 handled        | 1               | Medium |
| 3         | Core CLI tests/ → spx/              | 14 moved         | 1               | Low    |
| 4         | Resolve 31-spec-domain dup          | TBD              | TBD             | Medium |
| 5         | Cleanup + vitest config             | config + -legacy | 1               | Low    |
| **Total** |                                     | **~90 files**    | **~12 commits** |        |

## Open Questions

1. **Phase 4 (31-spec-domain):** Requires `/spec-tree:refactoring` to determine target structure. This phase cannot be fully specified until that skill is invoked.
2. **Legacy suffix cleanup:** After migration, some files will have `-legacy` suffixes. Phase 5a addresses this but the exact count depends on coverage comparison results.
3. **Structural normalization (.capability → .enabler/.outcome):** Explicitly out of scope. Flagged for a future initiative.
