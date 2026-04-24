# SPX-MIGRATION: 43-precommit.enabler

## Origin

**From**:

- `tests/unit/precommit/build-args.test.ts` → `tests/build-args.unit.test.ts`
- `tests/unit/precommit/categorize.test.ts` → `tests/categorize.unit.test.ts`
- `tests/integration/precommit/hook-enforcement.integration.test.ts` → `tests/precommit.integration.test.ts`
- `specs/work/doing/capability-15_infrastructure/feature-65_precommit-test-enforcement/story-43_vitest-integration/tests/run.test.ts` → `tests/run.unit.test.ts`

**Migration commit**: `f43d85a spec(precommit): author 43-precommit.enabler and migrate lefthook tests`

## Structural changes

### New product-root enabler

The pre-commit test runner (`src/precommit/run.ts`, invoked by `lefthook.yml`'s `pre-commit.tests` command) had no home in the rebuilt `41-validation.enabler` subtree. `41-validation.enabler` is scoped to tools invoked by `spx validation <subcommand>`; the pre-commit runner is a separate quality gate invoked by lefthook, not by spx.

`43-precommit.enabler` declares the runner as a peer quality gate at index 43 — higher than `41-testing.enabler` and `41-validation.enabler` (independent peers it does not constrain) and higher than `22-test-environment.enabler`, `17-file-inclusion.enabler`, and `17-language-detection.enabler` (infrastructure it relies on indirectly through the vitest invocation).

### Destination spec

The enabler's `precommit.md` spec declares scenarios, mappings, properties, and compliance rules that cover:

- File categorization (test/source/other) in `src/precommit/categorize.ts`
- Vitest argument shape in `src/precommit/build-args.ts` — `related --run <sources>` for source files, `--run <tests>` for test files
- Runner orchestration in `src/precommit/run.ts` — skip on no-relevant-files, propagate vitest exit code
- Lefthook integration — the pre-commit hook blocks failing tests and allows passing ones

### Import updates

None required. All four migrated tests use the `@/precommit/*` and `@test/harness/with-git-env` path aliases, which resolve identically from the new location.

## Coverage verification

Running `pnpm vitest run spx/43-precommit.enabler/tests/` after the move passes 69/69 tests (27 categorize unit + 17 build-args unit + 22 run unit + 3 lefthook integration). The same tests passed in their legacy locations before the move — this is a relocation, not a rewrite.

## Future work

None declared by this migration. The node's PLAN.md and ISSUES.md escape hatches are not present — if future changes need a deferred plan or known issue note, create them per the spec-tree convention.
