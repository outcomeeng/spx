# Open Issues

## Validation warning baseline remains noisy

`pnpm run validate` passed on June 25, 2026 while emitting 89 ESLint warnings across source modules and testing helpers. The warning classes include `sonarjs/cognitive-complexity`, `@typescript-eslint/no-unnecessary-condition`, and `unicorn/prefer-code-point`.

Observed command:

```bash
pnpm run validate
```

Impact: the local gate succeeds, but the warning stream makes validation output harder to scan and can hide new warnings inside a large baseline.

Resolution condition: group the warnings by rule and owning node, then clear or deliberately downgrade them in coherent scoped changes. Keep each cleanup isolated from behavior changes and run the current local validation gate after each batch.

## Worktree-management PDR names git plumbing in its decision content

`spx/15-worktree-management.pdr.md` carries a "Git mechanism" column in its state-class table and several `### Audit` rules that name specific git commands (`git rev-parse --git-common-dir`, `git rev-parse --show-toplevel`, `git config --get core.bare`) and a code-naming constraint (root-resolution helper-name alignment). A PDR audit argued these describe how root resolution is implemented rather than what users observe, and belong in [`spx/17-state.adr.md`](17-state.adr.md).

**Impact:** Contestable. The PDR/ADR boundary is product-relative (`what-goes-where`): for a developer harness whose observable contract is where shared state resolves across worktrees, pinning the resolution rule in the PDR is defensible. The same content passed property-quality, consistency, atemporal-voice, and tag-mechanics checks. This established structure applies across capabilities.

**Scope:** Product-root PDR + `17-state.adr.md`; belongs to a dedicated methodology-cleanup change.

**Resolution:** Decide whether the git-mechanism naming stays as the PDR's observable resolution contract or moves into `spx/17-state.adr.md`, then either close this note or re-home the mechanism content across the PDR and the state ADR in one coherent pass and re-run the PDR and ADR audits.

## Enabled tests still contain manifest-tracked test-owned named constants

The TypeScript testing guidance forbids test-owned named constants. Several enabled tests still carry them. `spx/no-test-owned-domain-constants` now catches this class, and `eslint.test-owned-constant-debt-nodes.json` downgrades existing debt nodes to warnings during migration. Examples observed during the strict lint cleanup:

- `spx/41-validation.enabler/32-typescript-validation.enabler/tests/support.ts` exports `TYPESCRIPT_VALIDATION_TEST_FILE`
- `spx/41-validation.enabler/32-typescript-validation.enabler/32-lint.enabler/tests/lint.integration.test.ts` declares output marker constants

The spec-tree fixture support now lives in `testing/generators/spec-tree.ts`; audit that generator as source-side test-data API debt, separate from enabled-test constant cleanup.

Observed while verifying the spec-tree boundary correction on May 1, 2026: `pnpm run validate` passed and reported 231 `spx/no-test-owned-domain-constants` warnings from the existing debt manifest.

**Skills:** `typescript:testing-typescript`, `typescript:auditing-typescript-tests`, and `spec-tree:testing`.

**Resolution:** Convert each case to source-owned constants, source-side test-data generators, or inline assertion data as required by the testing guidance, then remove the owning node from `eslint.test-owned-constant-debt-nodes.json`.

## GitHub Scorecard code-scanning alerts remain open

The root `renovate.json` — declared by [`spx/21-infrastructure.enabler/32-dependency-updates.enabler/dependency-updates.md`](21-infrastructure.enabler/32-dependency-updates.enabler/dependency-updates.md) — satisfies the Scorecard Dependency-Update-Tool check, which clears on the next Scorecard run. GitHub code scanning reports the remaining open Scorecard alerts:

- High: Branch-Protection and Code-Review (repository-policy alerts, no associated file)
- Medium: Security-Policy and SAST (repository-policy alerts), and two Pinned-Dependencies alerts in `.github/workflows/spec-tree.yml` and `.github/workflows/agentic-verification.yml`
- Low: CII-Best-Practices (repository-policy alert)

**Skills:** `github:github`, GitHub security triage, and the workflow-specific implementation skill for any `.github/workflows/` edits.

**Resolution:** Triage the repository-policy alerts (Branch-Protection, Code-Review, Security-Policy, SAST, CII-Best-Practices) separately from the workflow-file alerts. For the two Pinned-Dependencies alerts, pin the external actions in `.github/workflows/spec-tree.yml` and `.github/workflows/agentic-verification.yml` to commit digests before changing the automation.

## GitHub dependency vulnerability alerts remain open

The pre-push hook for `feat/snapshot-adapter-impl` reported: "GitHub found 2 vulnerabilities on outcomeeng/spx's default branch (2 moderate)" and linked `https://github.com/outcomeeng/spx/security/dependabot`.

**Impact:** The default branch carries unresolved dependency vulnerability alerts. The snapshot-adapter PR does not modify dependencies, so remediation belongs in a separate dependency-security changeset.

**Skills:** GitHub security triage and the dependency-update implementation workflow for any manifest or lockfile changes.

**Resolution:** Inspect the Dependabot security alerts, identify affected packages and patched ranges, update dependencies through `pnpm add` / `pnpm remove` so `package.json` and `pnpm-lock.yaml` stay synchronized, then run `pnpm run validate`, `pnpm test`, and the security alert closure check.

## Literal-reuse and test-owned literal cleanup remains

Literal-reuse cleanup spans product config, CLI help text, value allowlist tests, and enabled spec-tree test files. Current [spx.config.yaml](../spx.config.yaml) uses the `validation` section and no longer carries the retired literal allowlist structure. The `--allowlist-existing` CLI description and value-allowlist test titles now name `validation.literal.values.include`.

One concern remains:

1. **ADR-21 test literal ownership** — Some findings reflect test-owned semantic constants per [21-typescript-conventions.adr.md](41-validation.enabler/32-typescript-validation.enabler/21-typescript-conventions.adr.md): output markers, CLI flag strings, settings-permission strings, and spec-tree file-extension constants. ADR-21 requires source-owned values or generated fixture data instead of duplicated test-owned constants.

**Skills:** `/typescript:testing-typescript`, `/typescript:auditing-typescript-tests`, `/spec-tree:testing`.

**Scope:** Multi-node; clean up one owning subtree at a time.

**Resolution:** For each finding, classify the literal — source-owned value, generator input, or fixture data. Export source-owned values from the owning module, generate variable inputs through `fast-check`, or move durable real-world data to fixture files. Once an entire subtree is clean, validate end-to-end and remove the matching debt-manifest entry.

## PDR-11 scope does not cover testing

`spx/41-validation.enabler/11-tool-based-validation.pdr.md` governs aggregate-vs-leaf tool naming under the validation subtree. The same principle applies to `41-test.enabler/` (aggregate tool-agnostic, leaves name tools — pytest, vitest), but the PDR's explicit scope excludes testing.

**Resolution:** Either move the PDR to product root with broader scope ("every spec under `41-validation.enabler/` and `41-test.enabler/`"), or author a sibling PDR for testing. Scope: follow-up work.

## Product-level audit assertions need testability review

PR #138 migrates product-level assertions in [spx.product.md](spx.product.md) from the legacy `[review]` marker to `[audit]`. Review identified product-level compliance assertions whose mechanism may be deterministic `[test]` evidence instead: CLI latency after process startup, deterministic spec-tree context ingestion, `spx.config.{toml,json,yaml}` governance, persisted execution state, product-root resolution via `git rev-parse` with `$PWD` fallback, and no network access for core operations.

**Impact:** Keeping testable product behavior under `[audit]` weakens the spec-test map and conflicts with the rule that `[audit]` is judgment evidence, not a placeholder for behavior the product can verify.

**Resolution:** Revisit each product-level `[audit]` assertion and reclassify any deterministic behavior to `[test]` with co-located product-root evidence. Start with the CLI latency, deterministic context ingestion, config governance, persisted execution state, `git rev-parse` fallback, and no-network core-operations assertions. Keep judgment-only product properties as `[audit]`.
