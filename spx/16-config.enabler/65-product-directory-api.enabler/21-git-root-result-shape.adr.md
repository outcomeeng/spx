# Git Root Result Shape

`detectGitCommonDirProductRoot` returns a result carrying the local worktree root as a required `worktreeRoot` field alongside the Git common-dir `productDir`, while `detectWorktreeProductRoot` returns the base `GitProductDirResult` without it — so a caller needing both roots reads `git rev-parse --show-toplevel` once. The two roots are those of [`spx/15-worktree-resolution.pdr.md`](../../15-worktree-resolution.pdr.md): the local worktree root from `--show-toplevel`, and the Git common-dir product root from the parent of `--git-common-dir`.

## Rationale

`detectGitCommonDirProductRoot` already runs `--show-toplevel` to resolve the common-dir root, so it holds the worktree root; returning that value lets a consumer that needs both roots — the session handoff-base gate, which records the current worktree path and the root-worktree path — obtain them from one resolver call rather than pairing it with a second `detectWorktreeProductRoot` that re-reads `--show-toplevel`. The field is required on the common-dir result so the consumer reads it without a fallback; an optional field would leave a `?? productDir` fallback dead on the only path that sets it. The base `GitProductDirResult` omits `worktreeRoot` because `detectWorktreeProductRoot`'s own `productDir` is the worktree root — a second field would duplicate it and expose an always-absent slot on that resolver's result.

## Invariants

- Every `detectGitCommonDirProductRoot` return path sets `worktreeRoot` to a string — the `--show-toplevel` value, or `cwd` outside a git repository.
- A `detectWorktreeProductRoot` result never carries `worktreeRoot`.

## Verification

### Testing

- ALWAYS: `detectGitCommonDirProductRoot` returns `worktreeRoot` as a required field on every return path, equal to the `git rev-parse --show-toplevel` value (or `cwd` outside a git repository) ([compliance])
- ALWAYS: the result's `productDir` is the Git common-dir product root — the parent of `git rev-parse --git-common-dir` — per [`spx/15-worktree-resolution.pdr.md`](../../15-worktree-resolution.pdr.md) ([compliance])
- NEVER: a `detectWorktreeProductRoot` result carries `worktreeRoot` — the base `GitProductDirResult` shape omits it, and that resolver's `productDir` is the worktree root ([compliance])

### Audit

- ALWAYS: the product-directory resolvers accept a dependency-injected git runner and verify over supplied values ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the git or filesystem boundary — resolver tests inject a git-dependencies double per [`spx/16-config.enabler/21-descriptor-registration.adr.md`](../21-descriptor-registration.adr.md) ([audit])
