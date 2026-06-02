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

## Status and Testing Responsibility Reconciliation

spx's spec tree declares `spx spec status --update` as the command that runs each node's tests and persists `spx.status.json` (`spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md`). That declaration conflicts with the testing model, where `spx test` runs node tests and status reads recorded evidence without running a runner; reconciling it also keeps test execution multi-language per `spx/19-language-registration.adr.md`. This section coordinates the correction; the authoritative decision content lands in the PDRs and ADRs named under Cascade.

### Intent

Testing owns running tests (multi-language, via the registry) and produces ephemeral per-worktree evidence; status owns reading that evidence and runs testing only when the evidence is insufficient. The decision shapes — the two-artifact split (committed `spx.status.json` vs. ephemeral `.spx/local/testing/`), the `.spx/local/*` per-worktree resolution, the status-to-testing delegation, and the no-language-in-status rule — are authored in the PDRs and ADRs named under Cascade, not held here.

### Contradiction this resolves

- `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` invariant "`spx spec status --update` is the only command path that executes node tests" contradicts `spx/41-testing.enabler/testing.md`, where `spx test` executes node tests and records last-run evidence and status reads that evidence without invoking a runner. The conflict is over which command executes tests. The two persisted artifacts are not duplicates and both survive: `spx.status.json` records lifecycle state (`declared`/`specified`/`failing`/`passing`); the testing `state.json` records raw run evidence (runner outcomes, digests, timestamps).

### Cascade (top of the truth hierarchy down)

1. PDRs:
   - `spx/15-worktree-resolution.pdr.md` — add a new resolution tier where `.spx/local/*` resolves to the worktree root (via `git rev-parse --show-toplevel`), distinct from the existing common-dir `.spx/` root, so testing evidence can live in per-worktree `.spx/local/testing/`; the evidence-directory relocation in the Architecture step is the driver.
   - `spx/31-spec-domain.enabler/21-node-status.enabler/15-status-file-contract.pdr.md` — status reads latest valid evidence and invokes testing when it is stale, failing, or absent; remove "`--update` is the only path that executes node tests"; `spx.status.json` stays the committed per-worktree status artifact.
2. Specs:
   - `spx/41-testing.enabler/43-last-run-evidence.enabler/last-run-evidence.md` and `spx/41-testing.enabler/testing.md` — relocate evidence to the per-worktree `.spx/local/testing/` directory set by the ADR named in the Architecture step. Also revise `testing.md`'s status assertions: reading recorded evidence without invoking a runner holds only for valid evidence; status invoking testing when evidence is stale, failing, or absent is permitted.
   - `spx/31-spec-domain.enabler/21-node-status.enabler/node-status.md` and `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/spec-cli-commands.md` — status consumes evidence and delegates to testing; the per-node test run is testing's registry-based, multi-language surface, not a status-owned runner.
3. Architecture:
   - `spx/41-testing.enabler/43-last-run-evidence.enabler/11-last-run-directory.adr.md` (and the sibling `21-testing-state-storage.adr.md`) — relocate the evidence directory from the common-dir `.spx/testing/{branch-slug}/runs/.../state.json` to per-worktree `.spx/local/testing/`, consistent with the `.spx/local/*` resolution encoded in `spx/15-worktree-resolution.pdr.md`.
   - Author a status-to-testing wiring ADR under `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/` (none exists on `main`): status invokes testing's registry-based per-node run when evidence is insufficient and composes no language runner directly.
   - Testing exposes a registry-based per-node run surface; the registry `src/testing/registry.ts` is unbuilt (see `spx/41-testing.enabler/ISSUES.md`).
4. Code:
   - `spx spec status --update` is declared but unwired on `main`, and the status read path does not consume persisted evidence. Implement both under the new model: `--update` reads evidence, invokes testing's multi-language per-node run when the evidence is insufficient, derives state, and writes `spx.status.json`; the plain read path reports recorded evidence and runs no tests.
   - Testing writes its evidence under `.spx/local/testing/`.
