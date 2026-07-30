# Open Issues

## Locale-dependent ordering remains in projection and listing paths

`String.prototype.localeCompare` without a pinned locale orders by the host locale and ICU build, so equal input can project in different orders across machines. The spec-context manifest (`src/lib/spec-tree/context-manifest.ts`, `src/lib/spec-tree/context-target.ts`) orders ordinally via `compareSpecContextOrdinal`; the same class remains at:

- `src/lib/spec-tree/index.ts` — sibling and entry ordering inside snapshot assembly, which feeds every spec-tree projection including the context manifest, so the manifest's byte-identity is fully host-independent only once this site is ordinal too. Owned by [`spx/23-spec-tree.enabler`](23-spec-tree.enabler/spec-tree.md).
- `src/domains/agent/resume.ts` and `src/domains/agent/search/results.ts` — session listing tie-breakers.
- `testing/harnesses/agent/resume.ts` — mirrors the production resume ordering and must change together with it.

**Impact:** ordering can differ across hosts for names where locale collation disagrees with code-unit order (hyphen and dot weighting); committed projections and CI comparisons assume one order.

**Resolution:** replace each site with an ordinal code-unit comparator in the owning node's own changeset — a pinned `Intl.Collator` locale is not sufficient, because the ICU collation tables still vary by Node build independent of the locale argument. The spec-tree library change alters observable projection order and needs its node's tests run and its spec audit; remove this entry when the last site is ordinal.

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

## Literal-reuse and test-owned literal cleanup remains

Literal-reuse cleanup spans product config, CLI help text, value allowlist tests, and enabled spec-tree test files. Current [spx.config.yaml](../spx.config.yaml) uses the `validation` section and no longer carries the retired literal allowlist structure. The `--allowlist-existing` CLI description and value-allowlist test titles now name `validation.literal.values.include`.

One concern remains:

1. **ADR-21 test literal ownership** — Some findings reflect test-owned semantic constants per [21-typescript-conventions.adr.md](41-validation.enabler/32-typescript-validation.enabler/21-typescript-conventions.adr.md): output markers, CLI flag strings, and spec-tree file-extension constants. ADR-21 requires source-owned values or generated fixture data instead of duplicated test-owned constants.

**Skills:** `/typescript:testing-typescript`, `/typescript:auditing-typescript-tests`, `/spec-tree:testing`.

**Scope:** Multi-node; clean up one owning subtree at a time.

**Resolution:** For each finding, classify the literal — source-owned value, generator input, or fixture data. Export source-owned values from the owning module, generate variable inputs through `fast-check`, or move durable real-world data to fixture files. Validate each owning subtree end-to-end after cleanup.

## PDR-11 scope does not cover testing

`spx/41-validation.enabler/11-tool-based-validation.pdr.md` governs aggregate-vs-leaf tool naming under the validation subtree. The same principle applies to `41-test.enabler/` (aggregate tool-agnostic, leaves name tools — pytest, vitest), but the PDR's explicit scope excludes testing.

**Resolution:** Either move the PDR to product root with broader scope ("every spec under `41-validation.enabler/` and `41-test.enabler/`"), or author a sibling PDR for testing. Scope: follow-up work.

## Product-level audit assertions need testability review

PR #138 migrates product-level assertions in [spx.product.md](spx.product.md) from the legacy `[review]` marker to `[audit]`. Review identified product-level compliance assertions whose mechanism may be deterministic `[test]` evidence instead: CLI latency after process startup, deterministic spec-tree context ingestion, `spx.config.{toml,json,yaml}` governance, persisted execution state, product-root resolution via `git rev-parse` with `$PWD` fallback, and no network access for core operations.

**Impact:** Keeping testable product behavior under `[audit]` weakens the spec-test map and conflicts with the rule that `[audit]` is judgment evidence, not a placeholder for behavior the product can verify.

**Resolution:** Revisit each product-level `[audit]` assertion and reclassify any deterministic behavior to `[test]` with co-located product-root evidence. Start with the CLI latency, deterministic context ingestion, config governance, persisted execution state, `git rev-parse` fallback, and no-network core-operations assertions. Keep judgment-only product properties as `[audit]`.

## Test assertion flow lives in harnesses instead of executed test files

Across the product, 34 executed `spx/.../tests/*.test.ts` files are two-line shims that import and call a `register*()` function, while the `describe`/`it`/`expect` assertion flow they should own lives in `testing/harnesses/` register-suite modules — for example `testing/harnesses/literal/output-modes-scenario.ts`, `testing/harnesses/session/session-identity-scenarios.ts`, and `testing/harnesses/process-lifecycle/compliance.ts`.

[`spx/12-test-infrastructure.adr.md`](12-test-infrastructure.adr.md) requires executed spec-tree test files to own the assertion flow, and the `what-goes-where` methodology reference states test infrastructure does not contain test assertion code. The register-suite-in-harness shape inverts that boundary: the harness owns the suite and the `tests/` file owns nothing. Sibling nodes such as [`spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/21-detection.enabler`](41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/21-detection.enabler) keep `describe`/`it`/`expect` directly in their `tests/*.test.ts` files, so the pattern is inconsistent product-wide.

**Impact:** Each node's `tests/` directory no longer carries the node's evidence; assertion titles and structure sit one indirection away from the node. Cross-file duplication analysis reads test-suite duplication as harness duplication.

**Skills:** `/test-typescript`, `/audit-typescript-tests`, `/apply`.

**Scope:** Product-wide — 34 test files and roughly 25 harness modules. Unwind one owning subtree at a time: move each `register*()` harness function's `describe`/`it`/`expect` body into the node's executed `tests/*.test.ts` file, leaving genuine lifecycle and setup helpers (`withLiteralFixtureEnv`, expected-value builders, seed and run-count machinery) in the harness. Retire redundant scenario/compliance duplicates as encountered, and re-run each node's tests plus its test-evidence audit after the move.

## Product author command is undeclared

`AGENTS.md` states that a product author command appears later in the file and must run after spec, test, or implementation mutations, but the file declares no author command. The workflow can invoke `/author` and repository formatting and validation commands, yet it cannot execute the promised product-specific regeneration command.

**Revisit condition:** Before a workflow depends on generated author artifacts, define the product author command in the product-owned instruction section or remove the unsupported command claim from the managed router.
