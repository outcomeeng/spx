# Run-Scoped Temp Root

Every temp directory a run creates lives under one run root in the local worktree's `.spx/worktree/test-runs/`, or under a product-local scratch parent, and one central temp-directory library owns both placements and their removal. A run removes what it created at its end, and the next run in the same worktree removes whatever a killed run left.

## Rationale

A run root in the worktree's own state directory keeps every temp entry attributable to one worktree and one run, so removal is a bounded sweep of paths the library resolved and never a search of the shared user temp folder. Two runs never share one worktree at once, so the sweep needs no liveness marker and no lock. This placement agrees with [test infrastructure ownership](spx/12-test-infrastructure.adr.md), which requires every temp directory to come from this primitive.

## Invariants

- Every directory the primitive creates lies inside a run root or a product-local scratch parent it resolved.
- A root-creating process leaves no run root of its own after it exits, and no run root of an earlier run survives its worktree's next run.

## Verification

- ALWAYS: A run root is a directory `run-<token>` in `.spx/worktree/test-runs/` at the local worktree root the run resolves through the state module's worktree scope, where `<token>` is random; the root carries no liveness marker and takes no lock.
- ALWAYS: The primitive exports its root's path to child processes through the environment variable `SPX_RUN_TEMP_ROOT`; a process that inherits an existing root creates its directories inside it, creates no root of its own, and removes no other root.
- ALWAYS: The primitive exports `GIT_CEILING_DIRECTORIES` naming the run root beside `SPX_RUN_TEMP_ROOT`, so git run in a directory inside the root never discovers the repository that encloses the worktree.
- ALWAYS: The process that created a root removes it with everything inside at exit; before its first use, a root-creating process removes every directory in its worktree's `.spx/worktree/test-runs/`, because two runs never share one worktree at once.
- ALWAYS: A product-local scratch directory is created under the requested product's `node_modules/.cache/spx/` with the prefix `spx-run-` and a random token, and removed at its release; at a run's first scratch request for a parent inside its worktree, the run removes every leftover `spx-run-` entry in that parent.
- ALWAYS: The primitive is one library at `src/lib/temp-directory/` behind a single public surface, consumed by `src/` code and by `testing/harnesses/with-temp-dir.ts`, which composes on it.
- ALWAYS: When the primitive creates a root it sets `SPX_RUN_TEMP_ROOT` and `GIT_CEILING_DIRECTORIES` in its own process environment through its injected environment dependency, so every child process started afterwards inherits them.
- ALWAYS: The process that created a root removes it through a synchronous exit hook, and a process ended by SIGKILL leaves its root for the next run in that worktree to sweep.
- ALWAYS: The primitive reads and removes only paths inside its own worktree that lie in a run root or scratch parent it resolved, and never a path outside them.
- ALWAYS: The primitive reaches the filesystem, the worktree resolution, and the environment through injected dependencies, so creation, inheritance, removal, and the sweep verify over controlled inputs without module interception.
