# Plan: Verification Run Context Changed-Path Consolidation

## Purpose

Make verification run start consume the shared git changed-path utility owned by
`spx/18-state.enabler/PLAN.md#git-utility-consolidation-queued`, so
`spx verification run start --scope-type changeset --scope <base>..<head>`
does not keep a command-local git diff implementation.

## Spec Plan

1. Keep the run-context assertion that changeset scope resolves base/head into
   verification-context reconstruction fields and reports changed product paths
   as run scope metadata outside the canonical context.
2. If the shared git utility node materializes, update this node's context links
   or governing references to point at that provider rather than implying the
   verification command owns changed-path derivation.
3. Preserve the current verification scope boundary: `changeset` means the
   committed `<base>..<head>` range. Do not include untracked worktree paths
   unless a future verification-context subject represents working-tree scope.

## Test Plan

1. Keep this node's tests focused on verification behavior:
   - committed changed paths appear in the `start` report.
   - changed paths stay outside the canonical verification context digest.
   - malformed or unsupported scope types are rejected before run creation.
2. Move parser-specific rename, copy, whitespace, and staged/worktree coverage
   to the shared git utility tests when that node exists.

## Code Plan

1. Replace `resolveChangedScope` in `src/commands/verify/cli.ts` with a call to
   `src/lib/git/changed-paths.ts`.
2. Remove direct imports of `changesetNameStatusArgs` and `pathsFromNameStatus`
   from `src/commands/verify/cli.ts` once the shared resolver returns the
   committed-range path set.
3. Keep `src/commands/verify/cli.ts` responsible only for lifecycle
   orchestration, error mapping, verification-context creation, journal opening,
   recorded input persistence, and result rendering.
