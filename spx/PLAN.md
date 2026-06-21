# Plan: Current Spec Tree Refactor

## Purpose

Keep the product spec tree on the current node model and remove the deprecated task-driven model from specs, source, tests, fixtures, validation policy, and coordination files.

## Completed

- Current `spx spec status` and `spx spec next` read the `spx/` tree through the public spec-tree surface.
- Current spec-tree source, entry recognition, assembly, traversal, state derivation, and projection evidence lives under `spx/23-spec-tree.enabler/`.
- Current spec-domain command, rendering, and CLI contract evidence lives under `spx/31-spec-domain.enabler/`.
- Current spec-tree fixtures use `withSpecTreeEnv` under `testing/harnesses/spec-tree/`.
- Deprecated root spec subtrees and deleted compatibility source paths are not product truth.
- Deprecated task-model directories, stale suffix excludes, and frozen legacy specs are removed from the product tree.
- Deprecated `testing/fixtures/repos/` task-model fixtures are removed; current fixture coverage lives under registered spec-tree and validation harnesses.
- Deprecated suffix debt manifest cleanup is complete; remaining deprecated suffix handling is enforcement-only.
- Stale migration notes are removed from the current spec-tree refactor plan; any remaining release-note work lives in the owning validation issue.

## Current Tranche

- Settled config packet foundations on `origin/main`: shared path-filter primitives, testing descriptor registration, canonical descriptor digest, and product-directory API vocabulary.
- Settled audit packet foundations on `origin/main`: audit config descriptor and branch-scoped run state.
- Settled agent-environment foundations on `origin/main`: agent-environment descriptor and runtime-config reconciliation.
- Active testing packets: extend spec-tree fixture coverage through `spx/22-test-environment.enabler/32-spec-tree-fixtures.enabler/` and persist cached status evidence through `spx/41-testing.enabler/43-last-run-evidence.enabler/`.
- Active file-inclusion packet: align reusable path-scope mechanics through `spx/17-file-inclusion.enabler/65-domain-path-filters.enabler/`; final ignore-source deletion follows testing passing-scope integration.
- Active audit packets: implement configured auditor execution through `spx/36-audit.enabler/65-auditor-execution.enabler/` and audit status reporting through `spx/36-audit.enabler/87-audit-status.enabler/`.
- Active agent-environment packets: add deterministic instruction-file management through `spx/33-agent-environment.enabler/21-agent-instructions.enabler/` and plugin bootstrap through `spx/33-agent-environment.enabler/43-plugin-bootstrap.enabler/`.
- Active reviewing packets: implement review config, hermetic execution, review state, branch review, and PR review through `spx/46-reviewing.enabler/`.

## Remaining Work

- Implement the git-tracking layer per the rewritten `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md`: the existing `21-ignore-source.enabler/` becomes a git-plumbing reader, the `spx/EXCLUDE`-reader code is deleted, and the consumer adapters in validation, testing, audit, and review wire the override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) per the rewritten PDR.
- Continue splitting `src/lib/spec-tree/index.ts` internally only after the public import surface stays stable.
- Keep command modules consuming the public spec-tree surface; command modules must not parse suffixes or assemble hierarchy themselves.
- Continue reducing test-owned constant debt until `eslint.test-owned-constant-debt-nodes.json` is empty.
- Keep reducing root-directory API and test vocabulary from `projectRoot` / `projectDir` to `productDir` in coherent owning tranches where product-root boundaries are edited.
- Reconcile or prune `spx/46-claude.outcome/` after agent instructions and plugin bootstrap settle under `spx/33-agent-environment.enabler/`.

## Acceptance

- No product spec-tree directory uses a deprecated node suffix.
- No source, test, fixture, or coordination file imports from deleted compatibility source paths.
- No validation rule, test helper, or public identifier uses deprecated task-model names.
- Deprecated node suffixes are rejected by lint policy without a debt manifest.
- Testing passing-scope policy is read from the testing config descriptor.
- Validation, testing, auditing, and reviewing consume shared config primitives where their descriptor shapes repeat.
- Audit state is branch-scoped under `.spx/branch/{branch-slug}/audit/`.
- Review execution has a current spec-tree node before implementation begins.
- Agent environment management has a current spec-tree node before implementation begins.
- `spx validation all` passes.
- The full package test gate passes.

---

## Infrastructure Governance

spx groups global product machinery under `spx/21-infrastructure.enabler/`. Test infrastructure implementation modules can live together under the product-root `testing/` package, path-mapped to `@testing/`, while their specifications stay with the product domain that owns the behavior they verify. Only global machinery and cross-domain harnesses, generators, and fixtures belong under the infrastructure node.

### Placement model

- `spx/21-infrastructure.enabler/` governs global operational substrate: hooks, shared workflow machinery, cross-domain worktree layout harnesses, and similar product-wide enablers.
- Domain-owned harness, generator, and fixture specs stay with the domain they verify, even when the implementation modules live under `testing/`.
- Code package layout never determines spec placement by itself; spec placement follows product concern ownership, dependency order, and verification scope.

### Current governance (reconcile, do not duplicate)

- `spx/22-test-environment.enabler/` governs the callback-scoped temp-dir primitive (`withTempDir`), the spec-tree env (`withTestEnv`/`withSpecTreeEnv`), the git-worktree harness, and spec-tree fixtures, under `21-callback-scoped-environment.adr.md`.
- `spx/36-audit.enabler/21-audit-test-harness.enabler/` governs the audit harness.
- `spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/45-ts-snippet-generators.enabler/` governs the snippet generators.
- `spx/21-infrastructure.enabler/43-precommit.enabler/` governs Lefthook precommit behavior and precommit-specific test harnessing.
- A per-module `21-test-harness.enabler` governs each promoted harness beside its owning domain node: the file-inclusion harnesses under `spx/17-file-inclusion.enabler/{21-ignore-source,32-path-predicates,43-scope-resolver,54-tool-adapters}.enabler/`, the literal-reuse harnesses under `spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/{21-detection,21-fixture-classification,32-value-allowlist.enabler/21-allowlist-existing}.enabler/`, and the session-store harness under `spx/36-session.enabler/43-session-store.enabler/`.
- Ungoverned today: the testing recording-runner (`testing/harnesses/testing/`), the remaining session harnesses (`testing/harnesses/session/{launch-runner,picker}.ts`), and the config, node-status, and remaining validation harnesses and generators.

### Migration

1. Reconcile the existing test-infra enablers (`spx/22-test-environment.enabler`, `spx/36-audit.enabler/21-audit-test-harness.enabler`, `spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/45-ts-snippet-generators.enabler`) via `/spec-tree:refactoring`: keep domain-coupled infrastructure with its domain and move only cross-domain machinery under `spx/21-infrastructure.enabler/`.
2. Author assertions for the ungoverned harnesses and generators in their owning domains, or under `spx/21-infrastructure.enabler/` when they are global; each then passes the code, test-evidence, and architecture audits per `/spec-tree:applying`.
3. Record the shared methodology drift separately: the installed spec-tree guidance says the spec tree itself must mirror `testing/{generators,fixtures,harnesses}`, while spx treats that as code package layout rather than spec placement.

### Related test-strategy gaps

- **Canonical evidence naming:** in flight — see the "Canonical test-evidence naming cascade" section below for live status, the #2b enforcement-rule spec, and operating constraints.
- **Conformance coverage (minor):** the run-state JSONL machine contract is covered by parsing and property tests, not a conformance assertion; the `spx spec status` JSON output is conformance-tested through `spx/31-spec-domain.enabler/32-spec-cli-rendering.enabler/`. Consider a conformance assertion for the recorded JSONL shape when `41-testing`'s evidence schema is next edited.

## Canonical test-evidence naming cascade

Reclassify legacy test filenames to the canonical `<subject>.<evidence>.<level>[.<runner>].test.ts` form and add a validation rule that enforces the evidence and level tokens so they cannot regress. Skills: `/spec-tree:testing`, `/typescript:testing-typescript`, `/spec-tree:applying`, `/spec-tree:opening-pr`, `/spec-tree:managing-pr`. Operator authorization: "let it ride to merge".

### Status

- **Done — PR #110 (merged, mergeCommit `7e8763b`):** literal-reuse test determinism fix. Legacy independent `fc.sample({ numRuns: 1 })` draws the test logic assumed distinct could collide intermittently in CI (a colliding dupe/source literal flips a dupe finding into a reuse; two harness iterations drawing the same fixture path overwrite an occurrence). Routed distinctness-requiring values through guaranteed-distinct generators (`arbitraryLiteralReuseFixtureInputs`; new `sampleDistinctSourceFilePaths` mirroring `sampleDistinctTestFilePaths`). This put the deterministic suite on main and unblocked the rest of the cascade.
- **Done — PR #109 (merged, mergeCommit `5ecf222`):** canonical renames (`.unit` → `<evidence>.l1` across `41-validation` and `46-claude`) plus the `36-audit/21-audit-test-harness` split into `.scenario.l1` + `.property.l1`, plus a `docs(audit)` commit repointing `36-audit/ISSUES.md`.
- **To build — #2b enforcement rule:** specified below.

### #2b — test-evidence-naming enforcement rule (to build)

A new `spx validation` check: every `spx/**/tests/*.test.ts` filename matches `<subject>.<evidence>.<level>[.<runner>].test.ts` with evidence in {scenario, mapping, conformance, property, compliance} and level in {l1, l2, l3}. Model it on `src/validation/literal/` (index/detector/config), `src/validation/registry.ts`, `src/validation/types.ts`, `src/validation/languages/`, the `validation all` composition, and the `spx validation <name>` registration in `src/interfaces/cli/`. Ship a debt-allowlist JSON keyed on node directories (mirror `eslint.test-owned-constant-debt-nodes.json`) of the still-non-canonical files — re-derive the live list with `git ls-files 'spx/**/tests/*.test.ts'` filtered to names that fail the canonical pattern (expected: the 8 `.integration`/`.e2e` files plus the 3 precommit `.unit` files `categorize`/`build-args`/`run`; trust the live list, not this count). Author the rule's node spec under `spx/41-validation.enabler/` via `/spec-tree:authoring`; implement plus a `[test]` against violating fixtures via `/spec-tree:applying` (run the architecture, test-evidence, and code audit gates via delegated isolated auditor agents); wire it into the pipeline and `validation all`. FOLLOW-UP in the rule node's ISSUES.md: reclassify the allowlisted files (`.integration`/`.e2e` → `<evidence>.l2`; the precommit `.unit` via the precommit rearchitecture) and shrink the allowlist.

### Deferred

The precommit test evidence-typing rearchitecture is owned by `spx/21-infrastructure.enabler/43-precommit.enabler/precommit.md`; future precommit test changes stay under that infrastructure node.

### Operating constraints

The bare-pool container `/Users/shz/Code/outcomeeng/spx` is off-limits for commits; the pnpm-linked `spx` ships only when the operator ff+rebuilds from the main checkout (`git -C /Users/shz/Code/outcomeeng/spx/spx pull --ff-only && pnpm -C /Users/shz/Code/outcomeeng/spx/spx run build`) — merged is not shipped. Merge with `gh pr merge <n> --repo outcomeeng/spx --rebase --delete-branch` (the local `--delete-branch` errors because main is checked out at `…/spx/spx`, but the merge lands; verify state MERGED, then fetch, detach, and delete the local and remote branch). Push with `--force-with-lease` only; never run more than one full suite per turn; run `uptime` before heavy commands and defer when the 5-minute load exceeds the core count; verify reviewer citations against the cited authority before complying.
