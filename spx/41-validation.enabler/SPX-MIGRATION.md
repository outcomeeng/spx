# SPX-MIGRATION: 41-validation.enabler

## Origin

Two legacy locations fed into the current subtree:

- `specs/work/doing/capability-15_infrastructure/feature-{21,25,32,47,48,65}_.../**/tests/**` — task-driven spec tree with features for testable-validation, eslint-rules-enforcement, code-formatting, validation-commands, validation-output-enhancements, precommit-test-enforcement
- `tests/{unit,integration}/{validation,commands/validation,precommit,eslint-rules}/**` and `tests/harness/with-validation-env.test.ts` — graduated tests awaiting relocation
- `tests/integration/cli/validation.integration.test.ts` — top-level CLI integration test

## Structural changes

### Not a 1:1 migration — rebuild

The subtree was not migrated file-for-file. A rebuild preceded the deletion, driven by `11-tool-based-validation.pdr.md`: each validation stage is a named tool invocation (ESLint, tsc, madge, the cross-file literal-reuse detector, markdownlint-cli2), and leaf enablers under `32-typescript-validation.enabler/` name their tool directly rather than abstracting over one.

Children of the rebuilt subtree:

- `21-validation-cli.enabler` — `spx validation` dispatcher, `sanitizeCliArgument` sentinel-based pure function
- `32-typescript-validation.enabler` — aggregate, gated on `detectTypeScript`; children `32-lint`, `32-type-check`, `32-ast-enforcement`, `32-circular-deps`, `32-literal-reuse`
- `32-python-validation.enabler` — aggregate, specified-state (listed in `spx/EXCLUDE`); children `32-lint`, `32-type-check`, `32-ast-enforcement` likewise specified
- `65-markdown-validation.enabler` — markdownlint-cli2-based link integrity and structural checks across `spx/` and `docs/`

### Dissolved feature nodes

| Legacy feature                              | Where its concerns live now                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `feature-21_testable-validation`            | `21-validation-cli.enabler` (dispatch/sanitization) + `32-typescript-validation.enabler/*` (stages) |
| `feature-25_eslint-rules-enforcement`       | `32-typescript-validation.enabler/32-ast-enforcement.enabler`                                       |
| `feature-32_code-formatting`                | Out of scope — `dprint` runs outside `spx validation all`; no spec-tree coverage                    |
| `feature-47_validation-commands`            | Absorbed into `21-validation-cli.enabler` (dispatch) and command handlers verified via integration  |
| `feature-48_validation-output-enhancements` | Covered by `41-validation.enabler` parent integration tests (step-by-step reporting assertions)     |
| `feature-65_precommit-test-enforcement`     | Relocated to `43-precommit.enabler` — peer quality-gate enabler, not a child of validation          |

### Relocated tests

- Four precommit tests moved to `43-precommit.enabler/tests/` — see `spx/43-precommit.enabler/SPX-MIGRATION.md`
- Three ESLint rule tests (`no-hardcoded-statuses`, `no-hardcoded-work-item-kinds`, `eslint-rules.scenario.l2`) moved to `32-typescript-validation.enabler/32-ast-enforcement.enabler/tests/` alongside extended spec assertions for the two registry-backed rules

### Deleted tests (covered by rebuilt tree)

The following legacy test files were deleted after confirming the rebuilt subtree's integration and unit tests exercise equivalent behavior:

- `tests/unit/validation/{argument-builders,scope-resolution,extracted-functions,tool-finder}.test.ts` — internal helpers exercised transitively by `32-{lint,type-check,circular-deps}.enabler/tests/*.integration.test.ts`
- `tests/integration/validation/{tool-finder,typecheck-scripts}.integration.test.ts` — tool discovery and tsc-on-scripts covered by `32-type-check.enabler/tests/type-check.integration.test.ts`
- `tests/unit/commands/validation/format.test.ts` — duration and output formatting covered by `41-validation.enabler/tests/validation.integration.test.ts` (C3: step duration annotation)
- `tests/integration/commands/validation/output.integration.test.ts` — step output sequencing covered by `41-validation.enabler/tests/validation.integration.test.ts` (S5: ordered step completion)
- `tests/integration/cli/validation.integration.test.ts` — CLI surface covered by the subtree's integration tests and `21-validation-cli.enabler/tests/dispatch.*.test.ts`
- `tests/harness/with-validation-env.test.ts` — the harness is still live infrastructure; its test-of-harness is redundant with every integration test that exercises it
- 13 `*.test.ts` files across the dissolved `specs/work/doing/capability-15_infrastructure/**` subtree

## Coverage verification

Before deletion: 141 test files, 1212 tests, all passing.
After deletion: 118 test files, 1049 tests, all passing.

The deltas (-23 files, -163 tests) match the deleted file count and the tests-per-file of the deleted files. No src/ module lost coverage; the rebuilt subtree exercises every affected path through integration tests.

## Future work

- `spx/41-validation.enabler/ISSUES.md` records the `allCommand` hardcoded-dispatch issue (ADR-19 violation) — out of scope for this migration; unchanged by it.
- `spx/17-language-detection.enabler/ISSUES.md` records the `src/validation/discovery/language-finder.ts` placement mismatch — out of scope here.
