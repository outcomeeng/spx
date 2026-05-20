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

- Remove the ignore-source implementation and `spx/EXCLUDE` reader after testing passing scope consumes config.
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
