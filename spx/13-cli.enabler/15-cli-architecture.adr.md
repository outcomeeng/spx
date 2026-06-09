# CLI Architecture

The SPX CLI partitions source between CLI-specific concerns under `src/interfaces/cli/` and generic process-orchestration concerns under `src/lib/process-lifecycle/`. Process-lifecycle handling installs once at CLI entry (`installLifecycle()` as the first executable statement in `src/cli.ts`), registers every asynchronously spawned child in a module-scoped registry exposed as a `ProcessRunner`-conformant `lifecycleProcessRunner`, exposes a managed subprocess helper that owns parent-piped stdio for long-running children, and forwards SIGINT, SIGTERM, EPIPE, and uncaught-exception events to all registered children with the conventional exit codes (130, 143, 0, 1) before the parent exits. This governs every module under `src/interfaces/cli/` and `src/lib/process-lifecycle/`, every consumer of the `ProcessRunner` interface (`src/lib/process-lifecycle/types.ts`), and `src/cli.ts` itself; it refines `spx/15-worktree-management.pdr.md` and `spx/19-language-registration.adr.md` without contradicting them.

## Rationale

Layering separates mechanism from policy: CLI concerns — argument sanitization for diagnostic echo, subcommand dispatch, package-script invariants — operate at the `argv` / terminal boundary and belong at an interface layer, while process-lifecycle concerns — signal forwarding, EPIPE handling, child tracking — operate on Node process state regardless of entrypoint and would be reused unchanged by a daemon, worker, or REPL. A module-scoped registry installed once, paired with a `ProcessRunner` adapter, lets every domain runner receive an injected runner (production wires `lifecycleProcessRunner`, tests inject any conforming object) without threading a registry argument through every spawn site or forcing test-runner module resets between cases. The exit-code mapping follows POSIX — 128 + signal number for signal termination, 0 for downstream-closed pipes (matching `head` / `tee`), non-zero for genuine failures — so `set -o pipefail` and CI exit-code checks behave as operators expect. Handlers install in the order EPIPE → uncaughtException → SIGTERM → SIGINT with a `cleanupOnce` guard and per-child `killed` checks so the first triggered path engages and the SIGINT-mid-write-to-a-closed-pipe race resolves to a single cleanup.

Rejected: a single `src/cli/` directory (conflates what runs with what wraps the run, forcing non-CLI entrypoints to import a misleadingly-named module or duplicate the lifecycle logic); inline lifecycle in `src/cli.ts` (spreads handler installation, registry state, and the runner adapter across one large file that resists unit testing at the registry, handler, and adapter levels); a process group with `detached: true` (changes signal semantics for children that internally spawn, such as `tsc -w`, and complicates exit-code propagation); and per-call-site cleanup (duplicates the registry pattern at every site and makes consistent SIGINT handling impossible).

## Invariants

- For every successful CLI invocation, the count of registered children at process exit is zero.
- For every signal-terminated invocation (SIGINT or SIGTERM), every child observed in the registry receives the corresponding signal exactly once.
- For every EPIPE on `process.stdout`, the next observable process state is exit code 0 with no `uncaughtException` text on `process.stderr`.
- For every spawn site that consumes the `ProcessRunner` interface in production, the injected runner is the shared `lifecycleProcessRunner`.
- For every long-running child process launched through the managed subprocess helper, the child receives parent-owned piped stdio rather than inherited outer stdout/stderr descriptors.

## Verification

### Audit

- ALWAYS: `installLifecycle()` is the first executable statement in `src/cli.ts`, preceding any domain registration ([audit])
- ALWAYS: the `lifecycleProcessRunner` exported from `src/lib/process-lifecycle/` is structurally compatible with the `ProcessRunner` interface so it substitutes for any `{ spawn }` literal default ([audit])
- ALWAYS: SIGINT, SIGTERM, EPIPE, and uncaughtException handlers are installed once per process; subsequent installations are no-ops ([audit])
- ALWAYS: the lifecycle signal-to-exit-code mapping is SIGINT → 130, SIGTERM → 143, EPIPE → 0, uncaughtException → 1 ([audit])
- ALWAYS: cleanup is idempotent — invoking the SIGINT or SIGTERM handler N times kills each registered child exactly once ([audit])
- ALWAYS: CLI-specific modules — argument sanitization, dispatch primitives, package-script invariants — live under `src/interfaces/cli/` ([audit])
- ALWAYS: process-lifecycle modules — registry, handlers, lifecycle runner, install entrypoint — live under `src/lib/process-lifecycle/` ([audit])
- ALWAYS: domain runners that spawn long-running subprocesses accept the runner through dependency injection and consume `lifecycleProcessRunner` as the production default ([audit])
- ALWAYS: domain runners that spawn long-running subprocesses use the managed subprocess helper instead of setting `stdio` directly at the call site ([audit])
- ALWAYS: domain runners that spawn long-running subprocesses drain the child stdout and stderr streams through the domain output adapter ([audit])
- NEVER: import `child_process.spawn` for asynchronous child processes outside `src/lib/process-lifecycle/`; synchronous `execSync` and `spawnSync` are exempt because they self-reap before parent exit ([audit])
- NEVER: set `detached: true` on subprocess spawns in production code paths; detachment changes signal semantics and contradicts the registry's tracking model ([audit])
- NEVER: set `stdio` directly at a long-running subprocess call site that consumes `ProcessRunner`; the managed subprocess helper owns that policy ([audit])
- NEVER: spawn a child via `lifecycleProcessRunner.spawn` without registering its handle in the lifecycle registry ([audit])
- NEVER: use `vi.mock()` or `jest.mock()` to replace the spawn primitive, the registry, or the lifecycle runner; tests inject controlled implementations through the `ProcessRunner` interface ([audit])
- NEVER: place CLI-specific code under `src/lib/` or process-lifecycle code under `src/interfaces/`; the interface/orchestration boundary is mandatory ([audit])
- NEVER: write to `process.stdout` or `process.stderr` without an `error` listener installed; unhandled EPIPE becomes an uncaught exception that violates the exit-code mapping ([audit])
