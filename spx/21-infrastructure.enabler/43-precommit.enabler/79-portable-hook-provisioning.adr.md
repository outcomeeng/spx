# Portable Hook Dependency Provisioning

The portable lefthook hook honors `$LEFTHOOK_BIN` as an explicit override, otherwise runs the invoking worktree's `node_modules/.bin/lefthook` when it exists, and only then falls back to `lefthook` on `PATH`. When no reachable lefthook binary exists and `pnpm` is available, it provisions the worktree's dependencies with a single non-interactive `pnpm install --frozen-lockfile` and then runs the worktree-local lefthook binary directly, rather than delegating provisioning to `pnpm exec lefthook`.

## Rationale

A worktree created by `git worktree add` has no installed dependencies, so the first hook to fire in it must provision them before any hook command runs. An explicit `pnpm install --frozen-lockfile` makes that provisioning a single canonical, lockfile-faithful step whose output reads as a dependency install, after which the now-present worktree-local lefthook binary runs the hook directly. `CI=true` keeps the install non-interactive so it proceeds without a TTY prompt in the hook context. Preferring the worktree-local binary over `PATH` keeps hook execution on the dependency version selected by the product lockfile instead of an unrelated globally installed lefthook.

Delegating provisioning to `pnpm exec lefthook` is rejected because the install is then an opaque side effect of binary resolution rather than an explicit, observable provisioning step, it leaves the install's lockfile faithfulness unstated, and it interleaves package-manager setup output with hook resolution. The explicit install also lets the same provisioned binary run every subsequent hook in that worktree without re-resolving through pnpm.

## Invariants

- The portable hook never provisions dependencies with a command other than `pnpm install --frozen-lockfile`, so a hook-triggered install never rewrites the lockfile.
- After provisioning, the portable hook invokes the worktree-local lefthook binary directly, never through `pnpm exec`.
- When worktree-local lefthook exists, the portable hook invokes it before trying `lefthook` on `PATH`.

## Verification

### Testing

- ALWAYS: the portable hook's no-reachable-lefthook fallback runs `pnpm install --frozen-lockfile` before invoking lefthook, then invokes the worktree-local lefthook binary directly ([compliance])
- ALWAYS: the portable hook honors `$LEFTHOOK_BIN` first, then the worktree-local lefthook binary, then `lefthook` on `PATH` ([compliance])
- ALWAYS: the provisioning install runs non-interactively under `CI=true`, so it proceeds without a TTY in the hook context ([compliance])
- NEVER: the portable hook's fallback delegates to `pnpm exec lefthook` — provisioning is an explicit `--frozen-lockfile` install that never rewrites the lockfile ([compliance])

### Audit

- ALWAYS: the portable hook text is produced by an exported pure function of the hook name, so the rendered shim verifies by direct assertion on its content without installing a real hook ([audit])
