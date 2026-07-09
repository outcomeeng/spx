# Plan: State

> **Reconcile against `spx/PLAN.md` first.** The corrected model renames "materialization" → `backend`, separates `persistence` (records / journals / snapshots) from `backend` and `delivery`, makes verification the five types that *consume* the journal (never contain it), names `spx verification run` the SPX projection/validation home, requires additive migration (never a wholesale move), defers `.surface`, and builds the changes domain first. This node is the mis-named current home of `persistence`. Where this note predates that model, the root plan governs.

## Harness governance

Governed under the node-local harness-governance pattern: per-module test-harness or generator enablers, spec-auditor and test-evidence-auditor gates including coverage, and literal-collision checks. Coverage survey dispositions for the state+worktree modules:

- **Governed (new nodes):** `testing/harnesses/state/in-memory-file-system.ts` (the `StateStoreFileSystem` double, was 34% consumer-covered) → `spx/18-state.enabler/43-record-store.enabler/21-test-harness.enabler` (it doubles the record-store's FS port); `testing/harnesses/worktree/harness.ts`'s recording `OccupancyFileSystem` double (un-exercised `readFile`/`rm` recording) → `spx/38-worktree.enabler/32-occupancy-store.enabler/21-test-harness.enabler`. Both harness files reach 100% statement coverage.
- **Already governed:** `git-deps.ts` (100%) and `product-root-probe.ts` are governed by `spx/18-state.enabler/15-state-test-harness.enabler`.
- **Fully consumer-covered (no node):** the `state-store`, `worktree`, `main-checkout`, and `git-worktree` generators — every live export is consumer-exercised; dead exports were demoted to private consts.
- **Deferred to batch 7 (infrastructure):** `testing/harnesses/worktree-layout/worktree-layout.ts` (6 consumer nodes across state/worktree/session) and `testing/harnesses/with-git-env.ts` (5 consumers across precommit/verification/worktree) are cross-cutting git/worktree provisioners that belong with the infrastructure batch, not a single domain node.
- **Coverage follow-up:** `product-root-probe.ts`'s invalid-JSON error branch (one un-exercised line) is debt against `15-state-test-harness.enabler`; extend its `[test]` when that node is next edited.

## Git utility consolidation (queued)

This slice removes the duplicated and misplaced git plumbing that now sits in
`src/git/*` and in command handlers. `spx/18-state.enabler` is the current
holding node because it already owns product-root resolution, worktree topology,
default-branch resolution, and the injected git-runner boundary consumed by
higher-index domains.

### Placement

- Current holding node: `spx/18-state.enabler`.
- Target implementation namespace in the current source layout: `src/lib/git/`.
- Do not create another `src/git/` peer of `src/domains/`.
- Do not keep git execution, changed-path parsing, or worktree-path resolution in
  `src/commands/*`; command handlers only orchestrate injected capabilities and
  map results to command output per `spx/14-cli-composition.adr.md`.
- If a dedicated spec node is needed before implementation, decompose it under
  `spx/18-state.enabler` as a git-utility enabler. Treat it as a provider for
  infrastructure, precommit, release-data, file-inclusion, testing,
  verification, session, diagnose, and worktree consumers.

### Spec plan

1. Update architecture/spec references that name `src/git/*` so the governed
   implementation home is `src/lib/git/*`. At minimum inspect:
   - `spx/26-release.enabler/21-release-data.enabler/21-release-data-computation.adr.md`
   - `spx/21-infrastructure.enabler/43-precommit.enabler/21-dist-rebuild-on-pull.adr.md`
   - `spx/41-test.enabler/95-changed-set-planning.enabler/11-changed-set-resolution.adr.md`
   - state and worktree tests/specs that import or cite `@/git/root`
2. Keep product-root and worktree-topology behavior governed by
   `spx/15-worktree-management.pdr.md`,
   `spx/18-state.enabler/21-product-root.enabler`, and
   `spx/18-state.enabler/32-worktree-topology.enabler`; this slice changes the
   implementation namespace, not the product-root contract.
3. Add shared changed-path resolver truth before code moves if no existing
   assertion covers it: committed-range paths, staged paths, worktree dirty
   paths, untracked paths, NUL-delimited name-status parsing, rename/copy
   two-path records, and whitespace preservation.

### Test plan

1. Move or add shared git utility tests for:
   - `git diff --name-status -z <base>..<head>` committed-range path resolution.
   - staged name-status path resolution.
   - worktree dirty-path resolution from tracked diff plus untracked
     `git ls-files --others --exclude-standard -z`.
   - parser behavior for NUL-delimited rename/copy records and path whitespace.
2. Keep domain tests focused on domain behavior:
   - `spx/41-test.enabler/95-changed-set-planning.enabler` tests verify
     changed paths become targeted test operands and related-test inputs.
   - `spx/34-verification.enabler/32-verify.enabler/21-run-context.enabler`
     tests verify committed changeset paths are reported as run scope metadata
     outside the canonical verification context.
3. Run focused `spx test` for the changed nodes. Widen only if the source move
   changes shared path aliases, import resolution, or generated status.

### Code plan

1. Move the current git modules into `src/lib/git/`:
   - `src/git/environment.ts` -> `src/lib/git/environment.ts`
   - `src/git/root.ts` -> `src/lib/git/root.ts`
   - `src/git/release.ts` -> `src/lib/git/release.ts`
   - `src/git/tracked-paths.ts` -> `src/lib/git/tracked-paths.ts`
2. Keep `src/lib/git/name-status.ts` as the pure parser/argv helper home.
3. Add `src/lib/git/changed-paths.ts` for injected-runner changed-path
   orchestration shared by test and verification:
   - committed range: base/head -> changed product paths
   - staged diff: base -> staged changed paths
   - dirty worktree: tracked changed paths plus untracked paths
4. Update every import from `@/git/*` to `@/lib/git/*`.
5. Remove command-local duplicate git path readers from
   `src/commands/verify/cli.ts`,
   `src/commands/test/changed-set-planning.ts`, and
   `src/commands/test/run-command.ts` after the shared utility covers their
   behavior.
