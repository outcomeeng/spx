# Open Issues

## Root outcome node remains after enabler-only direction

`spx/46-claude.outcome/` is still a root outcome node. Eliminating every outcome node in the tree requires a separate root-level `/spec-tree:refactoring` pass that audits whether the Claude integration content becomes an enabler, dissolves into existing enablers, or is deleted.

**Resolution:** Track separately from `spx/PLAN.md`. Revisit before declaring the whole spec tree enabler-only.

## Enabled tests still contain manifest-tracked test-owned named constants

The TypeScript testing guidance forbids test-owned named constants. Several enabled tests still carry them. `spx/no-test-owned-domain-constants` now catches this class, and `eslint.test-owned-constant-debt-nodes.json` downgrades existing debt nodes to warnings during migration. Examples observed during the strict lint cleanup:

- `spx/41-validation.enabler/32-typescript-validation.enabler/tests/support.ts` exports `TYPESCRIPT_VALIDATION_TEST_FILE`
- `spx/41-validation.enabler/32-typescript-validation.enabler/32-lint.enabler/tests/lint.integration.test.ts` declares output marker constants
- `spx/41-validation.enabler/32-typescript-validation.enabler/tests/typescript-validation.integration.test.ts` declares output marker constants

The spec-tree fixture support now lives in `testing/generators/spec-tree.ts`; audit that generator as source-side test-data API debt, separate from enabled-test constant cleanup.

Observed while verifying the spec-tree boundary correction on May 1, 2026: `pnpm run validate` passed and reported 231 `spx/no-test-owned-domain-constants` warnings from the existing debt manifest.

**Skills:** `typescript:testing-typescript`, `typescript:auditing-typescript-tests`, and `spec-tree:testing`.

**Resolution:** Convert each case to source-owned constants, source-side test-data generators, or inline assertion data as required by the testing guidance, then remove the owning node from `eslint.test-owned-constant-debt-nodes.json`.

## GitHub Scorecard code-scanning alerts remain open

The May 1, 2026 dependency update merge closed the open Dependabot alerts: GitHub reports 0 open Dependabot alerts and 22 fixed Dependabot alerts for `outcomeeng/spx`. GitHub code scanning still reports 13 open Scorecard alerts:

- High: Branch-Protection, Code-Review, Dependency-Update-Tool, Token-Permissions in `.github/workflows/claude.yml`, and Token-Permissions in `.github/workflows/claude-code-review.yml`
- Medium: Security-Policy, SAST, and four Pinned-Dependencies alerts across `.github/workflows/claude.yml` and `.github/workflows/claude-code-review.yml`
- Low: CII-Best-Practices and License

**Skills:** `github:github`, GitHub security triage, and the workflow-specific implementation skill for any `.github/workflows/` edits.

**Resolution:** Triage repository-policy alerts separately from workflow-file alerts. For workflow-file alerts, audit token permissions and pin external actions before changing the automation.

## Literal-reuse and test-owned literal cleanup remains

Literal-reuse cleanup spans product config, CLI help text, value allowlist tests, and enabled spec-tree test files. Current [spx.config.yaml](../spx.config.yaml) uses the `validation` section and no longer carries the retired literal allowlist structure. The `--allowlist-existing` CLI description and value-allowlist test titles now name `validation.literal.values.include`.

One concern remains:

1. **ADR-21 test literal ownership** — Some findings reflect test-owned semantic constants per [21-typescript-conventions.adr.md](41-validation.enabler/32-typescript-validation.enabler/21-typescript-conventions.adr.md): output markers, CLI flag strings, settings-permission strings, and spec-tree file-extension constants. ADR-21 requires source-owned values or generated fixture data instead of duplicated test-owned constants.

**Skills:** `/typescript:testing-typescript`, `/typescript:auditing-typescript-tests`, `/spec-tree:testing`.

**Scope:** Multi-node; clean up one owning subtree at a time.

**Resolution:** For each finding, classify the literal — source-owned value, generator input, or fixture data. Export source-owned values from the owning module, generate variable inputs through `fast-check`, or move durable real-world data to fixture files. Once an entire subtree is clean, validate end-to-end and remove the matching debt-manifest entry.

## PDR-11 scope does not cover testing

`spx/41-validation.enabler/11-tool-based-validation.pdr.md` governs aggregate-vs-leaf tool naming under the validation subtree. The same principle applies to `41-testing.enabler/` (aggregate tool-agnostic, leaves name tools — pytest, vitest), but the PDR's explicit scope excludes testing.

**Resolution:** Either move the PDR to product root with broader scope ("every spec under `41-validation.enabler/` and `41-testing.enabler/`"), or author a sibling PDR for testing. Scope: follow-up work.

## Product-level audit assertions need testability review

PR #138 migrates product-level assertions in [spx.product.md](spx.product.md) from the legacy `[review]` marker to `[audit]`. Review identified product-level compliance assertions whose mechanism may be deterministic `[test]` evidence instead: root resolution via `git rev-parse` with `$PWD` fallback, and no network access for core operations.

**Impact:** Keeping testable product behavior under `[audit]` weakens the spec-test map and conflicts with the rule that `[audit]` is judgment evidence, not a placeholder for behavior the product can verify.

**Resolution:** Revisit each product-level `[audit]` assertion and reclassify any deterministic behavior to `[test]` with co-located product-root evidence. Start with the `git rev-parse` fallback assertion and the no-network core-operations assertion. Keep judgment-only product properties as `[audit]`.
