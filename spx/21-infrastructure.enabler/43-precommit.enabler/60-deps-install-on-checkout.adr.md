# Dependency Install On Checkout

A `post-checkout` hook installs dependencies with `pnpm install --frozen-lockfile` in every worktree when a branch-or-HEAD checkout changes `pnpm-lock.yaml`, so a worktree advanced to a new commit through `git switch`, `git checkout`, or `git worktree add` carries dependencies matching the checked-out lockfile. The install decision is fact-shaped — a pure function over the checkout's branch-checkout flag and whether the lockfile changed across the checkout range, reachable through an exported function as the rebuild-dist main-checkout gate is — so tests exercise explicit checkout facts rather than lefthook shell side effects.

## Rationale

A worktree's installed dependencies must match the lockfile of its checked-out commit, or the next package-manager command repairs dependencies inline and its setup output displaces the evidence of the command the caller intended to run. The rebuild-dist hooks ([21-dist-rebuild-on-pull.adr.md](21-dist-rebuild-on-pull.adr.md)) already install before building, but they fire only on `post-merge` and `post-rewrite`, so a worktree advanced to a new commit by a plain checkout — the path a bare-repository pool uses to park a member at a branch tip — never re-installs. A `post-checkout` install closes that gap for every worktree, not only the main checkout, because each worktree resolves commands against its own installed dependencies.

Installing only when the lockfile changed across the checkout range keeps the hook off the path of the frequent file-level and same-lockfile branch checkouts that do not affect dependencies. Git's post-checkout flag distinguishes a branch-or-HEAD checkout from a file checkout, and a null previous ref — a fresh worktree's first checkout — is treated as a lockfile change so a newly added worktree installs. Re-deriving the changed-lockfile or branch-flag decision in shell is rejected for the reason the main-checkout gate is fact-shaped: a tested exported function keeps the decision verifiable without driving lefthook. Unconditional install on every checkout is rejected because post-checkout fires on every branch switch and file checkout, making even a no-op install a tax on routine navigation; the lockfile-change guard limits the install to checkouts that move dependencies.

## Invariants

- The install decision is a pure function of two facts: whether the checkout is a branch-or-HEAD checkout and whether `pnpm-lock.yaml` changed across the checkout range.
- A fresh worktree's first checkout — a null or all-zero previous ref — resolves to a lockfile change, so the gate installs.
- The post-checkout install runs with `--frozen-lockfile`, so a hook never rewrites the lockfile.

## Verification

### Audit

- ALWAYS: `lefthook.yml` declares a `post-checkout` command that gathers the git post-checkout arguments, routes them through the exported install-gate function, and runs `pnpm install --frozen-lockfile` only when the gate signals install ([audit])
- ALWAYS: the install-gate decision is an exported pure function mapping checkout facts — the branch-checkout flag and whether the lockfile changed — to an install-or-skip exit code, so tests exercise explicit facts rather than lefthook shell side effects ([audit])
- ALWAYS: resolving whether `pnpm-lock.yaml` changed across the checkout range, and resolving the branch-checkout flag, are thin probes separated from the pure decision function, and a null or all-zero previous ref resolves to a lockfile change so a newly added pool worktree installs ([audit])
- ALWAYS: the lockfile-diff probe reaches git only through injected git dependencies and an explicit working directory, so the gate's exit-code resolution verifies under a controlled git runner without a real repository ([audit])
- ALWAYS: an error from the lockfile-diff probe resolves to the failure exit code, so a probe failure surfaces as a hook failure rather than a silent skip or install ([audit])
- ALWAYS: the post-checkout install runs in every worktree, not only the main checkout, because each worktree resolves commands against its own installed dependencies ([audit])
- NEVER: lefthook shell re-derives the install decision from branch names or duplicated checkout-range parsing instead of the exported gate function ([audit])
- NEVER: the post-checkout install drops `--frozen-lockfile` — a hook never rewrites the lockfile ([audit])
- NEVER: tests for the gate replace modules through `vi.mock()` or `jest.mock()`; they exercise the real exported function with explicit facts ([audit])
