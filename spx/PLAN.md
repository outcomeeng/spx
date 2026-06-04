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
- Audit state is branch-scoped under `.spx/audit/{branch-slug}`.
- Review execution has a current spec-tree node before implementation begins.
- Agent environment management has a current spec-tree node before implementation begins.
- `spx validation all` passes.
- The full package test gate passes.

---

## Test Infrastructure Governance

The methodology treats test infrastructure — harnesses, generators, inert fixtures — as production code with a mandated spec-tree shape and the same audit obligations as product modules (`/spec-tree:understanding` `references/what-goes-where.md`). spx's implementation is rich (27 harnesses, 18 generators, fixtures under `testing/`), but its governance is partial: most harnesses and generators carry no spec assertions and no audit obligation. This section plans the adoption of the mandated governance.

### Mandated shape

- A top-level `infrastructure` enabler with a `testing` enabler child and three grandchildren `generators`, `fixtures`, `harnesses` (normative slugs), governed by `spx/15-test-infrastructure.pdr.md` (absent today).
- Implementation stays in `testing/` at the project root, path-mapped to `@testing/`. No code moves; governance is added on top.

### Current governance (reconcile, do not duplicate)

- `spx/22-test-environment.enabler/` governs the callback-scoped temp-dir primitive (`withTempDir`), the spec-tree env (`withTestEnv`/`withSpecTreeEnv`), the git-worktree harness, and spec-tree fixtures, under `21-callback-scoped-environment.adr.md`.
- `spx/36-audit.enabler/21-audit-test-harness.enabler/` governs the audit harness.
- `spx/41-validation.enabler/32-typescript-validation.enabler/32-literal-reuse.enabler/45-ts-snippet-generators.enabler/` governs the snippet generators.
- Ungoverned today: the testing recording-runner (`testing/harnesses/testing/`) and the config, session, node-status, literal, precommit, file-inclusion, and most validation harnesses and generators.

### Migration

1. Author `spx/15-test-infrastructure.pdr.md` (the governing decision: mandated shape plus the `testing/` implementation location) via `/spec-tree:authoring`.
2. Create the `infrastructure.enabler/testing.enabler/{generators,fixtures,harnesses}` subtree via `/spec-tree:decomposing` and `/spec-tree:authoring`.
3. Reconcile the existing test-infra enablers (`22-test-environment`, `36-audit/21-audit-test-harness`, `45-ts-snippet-generators`) via `/spec-tree:refactoring`: decide per node whether its governance moves under the new subtree or the subtree references it — domain-coupled infrastructure may stay near its domain with a reference; cross-cutting infrastructure centralizes.
4. Author assertions for the ungoverned harnesses and generators under the new subtree; each then passes the code, test-evidence, and architecture audits per `/spec-tree:applying`.

### Related test-strategy gaps

- **Canonical evidence naming (separate PR):** 10 test files use `.unit.`, which is not one of the five evidence types, and several mix property and scenario evidence in one file. Reclassify and split them into one-evidence-per-file canonical names, and add a validation rule enforcing the evidence token so it cannot regress. Skills: `/spec-tree:testing`, `/typescript:testing-typescript`, `/spec-tree:applying`.
- **Fixture placement (minor):** `spx/13-cli.enabler/tests/fixtures/epipe-emitter.ts` is a subprocess fixture inside a `tests/` directory; the methodology homes inert fixtures under `testing/fixtures/`. Relocate it when the CLI node is next edited.
- **Conformance coverage (minor):** the run-state `state.json` machine contract is covered by parsing and property tests, not a conformance assertion; the `spx spec status` JSON output is conformance-tested through `spx/31-spec-domain.enabler/32-spec-cli-rendering.enabler/`. Consider a conformance assertion for the recorded `state.json` shape when `41-testing`'s evidence schema is next edited.

### Caveat

Confirm whether the mandated test-infrastructure shape post-dates spx's current structure (a planned migration) versus an oversight; either way the target is the mandated shape.
