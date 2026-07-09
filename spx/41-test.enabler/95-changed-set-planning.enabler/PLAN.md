# Plan: Changed-Set Planning Shared Git Consumption

## Purpose

Make `spx test --changed` consume the shared git changed-path utility owned by
`spx/18-state.enabler/PLAN.md#git-utility-consolidation-queued`, while
keeping test-specific operand planning under this node.

## Spec Plan

1. Update `spx/41-test.enabler/95-changed-set-planning.enabler/11-changed-set-resolution.adr.md`
   so git root/ref and changed-path primitives live under `src/lib/git/*`
   rather than `src/git/*`.
2. Preserve this node's boundary: it owns changed-path partitioning into
   spec/test operands and source files, related-test registry routing, staged
   candidate test reads, and targeted-execution dispatch inputs.
3. Do not move related-test capability or targeted-execution behavior into the
   shared git utility; those remain test-domain behavior.

## Test Plan

1. Keep changed-set planning tests for:
   - changed spec/test paths selecting discovered tests.
   - changed source paths resolving through the language registry.
   - unresolved source paths being reported.
   - product input changes selecting the full spec test tree.
   - staged candidate path/content behavior.
2. Move shared git-path tests for name-status parsing, rename/copy path
   inclusion, path whitespace, staged path reads, and untracked path reads to the
   shared git utility node when it exists.
3. Keep the property test for operand union and changed-path partition order
   independence in this node, because it verifies test-domain planning.

## Code Plan

1. Replace the private `changedPaths` and `untrackedWorktreePaths` functions in
   `src/commands/test/changed-set-planning.ts` with calls to
   `src/lib/git/changed-paths.ts`.
2. Replace `dirtyWorktreePaths` in `src/commands/test/run-command.ts` with the
   shared dirty-worktree resolver.
3. Keep `src/domains/test/changed-set-planning.ts` pure: no git, filesystem, or
   process access.
4. Keep `src/commands/test/changed-set-planning.ts` as orchestration over
   injected git access, test discovery, staged file reads, the testing registry,
   and domain partitioning.
