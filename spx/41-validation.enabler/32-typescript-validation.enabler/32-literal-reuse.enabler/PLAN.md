# Plan: literal-reuse reconciliation

## Current State

- The parent [`literal-reuse.md`](literal-reuse.md) is an aggregate node. Its assertion-bearing work now lives in child enablers:
  - [`21-detection.enabler/`](spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/21-detection.enabler/detection.md) — cross-file indexing and traversal.
  - [`21-fixture-classification.enabler/`](spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/21-fixture-classification.enabler/fixture-classification.md) — fixture writer and test-file classification.
  - [`32-value-allowlist.enabler/`](spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/32-value-allowlist.enabler/value-allowlist.md) — `validation.literal.values.*` config and value write-back.
  - [`32-path-filter.enabler/`](spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/32-path-filter.enabler/path-filter.md) — global `validation.paths.{exclude,include}` filtering for the detector.
  - [`36-literal-fixture-harness.enabler/`](spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/36-literal-fixture-harness.enabler/literal-fixture-harness.md) — reusable literal fixture harness.
  - [`45-ts-snippet-generators.enabler/`](spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/45-ts-snippet-generators.enabler/ts-snippet-generators.md) — TypeScript snippet generators for literal tests.
  - [`54-output-modes.enabler/`](spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/54-output-modes.enabler/output-modes.md) — literal output formatting modes.
- The retired parent-level `tests/literal.{scenario,mapping,property,compliance}.l1.test.ts` files and their parent `tests/support.ts` are gone. Evidence lives in the child test files.
- No literal-reuse child is listed in [`spx/EXCLUDE`](spx/EXCLUDE). The child assertions are active in the normal quality gate.
- Literal value config uses the 4-segment path `validation.literal.values.{presets,include,exclude}`. The `--allowlist-existing` CLI description and write-back tests name `validation.literal.values.include`.
- The detector uses the global `validation.paths.{exclude,include}` filter. A node listed only in `spx/EXCLUDE` is still parsed and indexed by literal-reuse unless it is also covered by `validation.paths.exclude`.

## Remaining Work

- Continue product-wide ADR-21 literal ownership cleanup from the root [ISSUES.md](spx/ISSUES.md#literal-reuse-and-test-owned-literal-cleanup-remains). This node owns literal-reuse-specific cleanup when the finding involves detector, allowlist, path-filter, fixture-classification, harness, snippet-generator, or output-mode evidence.
- Keep future literal-reuse tests generator-driven. Variable input values, file paths, node names, and command arguments come from `testing/generators/literal/literal.ts`, and filesystem fixtures go through `testing/harnesses/literal/harness.ts`.
- Per-tool path filtering is tracked in this node's [ISSUES.md](ISSUES.md#future-enhancement-per-tool-path-filter-at-validationpathsliteral). Do not change the global `validation.paths` contract when implementing that follow-up; compose the per-tool filter inside the owning validation enabler.

## Validation Notes

- For documentation-only reconciliation, run the markdown/spec validation path required by the current branch scope.
- For source or test changes under this node, run `pnpm run validate` and focused `spx test spx/<touched-literal-reuse-node>`, then apply the TypeScript implementation and test-audit gates before committing.
