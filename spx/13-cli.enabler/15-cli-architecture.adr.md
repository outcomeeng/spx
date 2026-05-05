# CLI Architecture

## Purpose

This decision governs two architectural concerns for the SPX command-line interface boundary:

1. **Source layering** — where CLI-specific code lives versus generic process-orchestration code under `src/`.
2. **Process lifecycle** — how termination signals, broken pipes, and uncaught exceptions propagate from the CLI parent to its tracked subprocesses.

It applies to every module under `src/interfaces/cli/` and `src/lib/process-lifecycle/`, every consumer of the `ProcessRunner` interface (`src/validation/types.ts`), and `src/cli.ts` itself.

## Context

**Business impact:** Operators run `spx` interactively (Ctrl-C must be responsive) and through pipelines (`spx ... | head -N` must not leak orphan processes). Validation steps spawn long-running tools (ESLint, tsc, Knip) as subprocesses. Without lifecycle handling those subprocesses outlive the parent on stdio close and accumulate as zombies, producing fork-bomb-shaped resource exhaustion under repeated invocations.

**Technical constraints:** Node.js raises an `error` event on `process.stdout` and `process.stderr` writes when the downstream pipe is closed; without an `error` handler the event becomes an uncaught exception. Signals delivered to the parent are not automatically forwarded to children spawned via `child_process.spawn`. Synchronous `child_process.execSync` and `child_process.spawnSync` self-reap before the parent exits, so they do not require lifecycle tracking. Validation steps accept an injected `ProcessRunner` interface (`src/validation/types.ts:34`), providing a dependency-injection seam. The `@/*` path alias maps to `src/*`, so any subdirectory under `src/` is reachable from any module.

This ADR refines, but does not contradict, the product-level decisions: `spx/15-worktree-resolution.pdr.md` (root resolution under git worktrees) and `spx/19-language-registration.adr.md` (typed language descriptors and explicit registry imports).

## Decision

The SPX CLI partitions source code along the boundary between CLI-specific concerns and generic process-orchestration concerns: CLI-specific modules live under `src/interfaces/cli/` and process-lifecycle modules live under `src/lib/process-lifecycle/`. Process-lifecycle handling installs once at CLI entry, registers every asynchronously spawned child in a module-scoped registry exposed as a `ProcessRunner`-conformant `lifecycleProcessRunner`, and forwards SIGINT, SIGTERM, EPIPE, and uncaught-exception events to all registered children with the conventional exit codes (130, 143, 0, 1) before the parent exits.

## Rationale

**Layering.** CLI concerns — argument sanitization for diagnostic echo, subcommand dispatch primitives, package-script invocation invariants — operate at the boundary between `argv` / terminal output and the application's typed surface. They belong at an interface layer. Process-lifecycle concerns — signal forwarding, EPIPE handling, child-process tracking — operate on Node.js process state regardless of the entrypoint shape; a daemon mode, supervised worker, or REPL invocation would reuse them unchanged. Placing lifecycle under `src/lib/` separates mechanism from policy.

Alternatives considered:

- **Single `src/cli/` directory** — collapses the interface/orchestration distinction and forces process-lifecycle modules to import via the CLI namespace even when no CLI is present. Rejected because it conflates *what runs* with *what wraps the run*, and a future non-CLI entrypoint would either duplicate the lifecycle logic or import a misleadingly-named module.
- **Inline lifecycle in `src/cli.ts`** — keeps the entry small but spreads handler installation, registry state, and the runner adapter across one large file. Rejected because lifecycle logic is non-trivial and benefits from dedicated unit tests at the registry, handler, and runner-adapter levels.

**Lifecycle shape.** A module-scoped registry installed once at CLI entry, paired with a runner adapter that implements `ProcessRunner`, lets every validation step receive an injected runner; production wires `lifecycleProcessRunner`, tests inject any conforming object. Pure singleton state forces test-runner module resets between cases; full dependency-injected registry threading makes every spawn site explicitly receive a registry argument it does not otherwise need. Module-scope strikes the balance: state lives in one place, the install site is one call, and the runner adapter is the only object threaded through dependency injection.

Alternatives considered:

- **Process-group with `detached: true`** — sends signals to the entire group rather than tracking individual handles. Rejected because it changes signal semantics for child commands that internally spawn (e.g., `tsc -w`), and complicates exit-code propagation when a child exits before the parent forwards a signal.
- **Per-call-site cleanup** — each spawn site owns its own teardown logic. Rejected because it duplicates the registry pattern at every site, makes consistent SIGINT handling impossible, and relies on review to catch missing cleanup.

**Exit codes.** The mapping (SIGINT → 130, SIGTERM → 143, EPIPE on stdout → 0, uncaught exception → 1) follows POSIX convention: 128 + signal number for signal-terminated processes, 0 for `SIGPIPE`-style downstream-closed pipes, non-zero for genuine internal failures. This makes shell pipelines (`set -o pipefail`) and CI exit-code checks behave as operators expect. Treating EPIPE as 0 matches `head` and `tee`; an internal crash that closes the pipe still produces non-zero through the uncaught-exception path.

**Handler ordering.** EPIPE fires synchronously in the writing code path; signal handlers run on the next tick. Installing handlers in the order EPIPE → uncaughtException → SIGTERM → SIGINT means the first triggered cleanup path engages, and a `cleanupOnce` boolean plus per-child `killed` checks make subsequent paths no-ops. This handles the race in which SIGINT arrives mid-write to a closed pipe.

## Trade-offs accepted

| Trade-off                                                                                                                       | Mitigation / reasoning                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two top-level directories under `src/` (`interfaces/`, `lib/process-lifecycle/`) carry interface and process-orchestration code | Directory names express purpose; future entrypoints (HTTP, LSP) extend `src/interfaces/`; future process-level concerns extend `src/lib/process-lifecycle/`                  |
| Module-scoped registry holds state outside the type system                                                                      | Install is a single call at CLI entry; tests instantiate fresh registries per case via injection; the registry's identity is observable through the exported runner          |
| EPIPE on stdout exits 0 even if the downstream consumer crashed                                                                 | Matches `head`/`tee` convention; pipelines use `set -o pipefail` to detect upstream failures; spx-internal errors still produce non-zero through the uncaught-exception path |
| Synchronous `execSync`/`spawnSync` are exempt from registry membership                                                          | They self-reap before parent exit; tracking them adds zero safety value and incurs interface complexity                                                                      |
| The `lifecycleProcessRunner` is module-scoped state, not a parameter to validation steps                                        | Validation steps already accept `ProcessRunner` via DI; production wires the lifecycle runner, tests inject controlled implementations; the seam is preserved                |

## Invariants

- For every successful CLI invocation, the count of registered children at process exit is zero.
- For every signal-terminated invocation (SIGINT or SIGTERM), every child observed in the registry receives the corresponding signal exactly once.
- For every EPIPE on `process.stdout`, the next observable process state is exit code 0 with no `uncaughtException` text on `process.stderr`.
- For every spawn site that consumes the `ProcessRunner` interface in production, the injected runner is the shared `lifecycleProcessRunner`.

## Compliance

### Recognized by

- A single `installLifecycle()` call as the first executable statement in `src/cli.ts`.
- The exported `lifecycleProcessRunner` from `src/lib/process-lifecycle/` implements the `ProcessRunner` interface from `src/validation/types.ts`.
- Every `defaultXxxProcessRunner` constant in `src/validation/steps/` references `lifecycleProcessRunner`.
- No `import { spawn } from "node:child_process"` outside `src/lib/process-lifecycle/`.
- No subdirectory under `src/lib/` named `cli` or `interfaces`; no subdirectory under `src/interfaces/` named `lib` or `process-lifecycle`.

### MUST

- `installLifecycle()` is the first executable statement in `src/cli.ts`, preceding any domain registration ([review])
- The `lifecycleProcessRunner` exported from `src/lib/process-lifecycle/` is structurally compatible with the `ProcessRunner` interface so it substitutes for any `{ spawn }` literal default ([review])
- SIGINT, SIGTERM, EPIPE, and uncaughtException handlers are installed once per process; subsequent installations are no-ops ([review])
- The lifecycle signal-to-exit-code mapping is SIGINT → 130, SIGTERM → 143, EPIPE → 0, uncaughtException → 1 ([review])
- Cleanup is idempotent: invoking the SIGINT or SIGTERM handler N times kills each registered child exactly once ([review])
- CLI-specific modules — argument sanitization, dispatch primitives, package-script invariants — live under `src/interfaces/cli/` ([review])
- Process-lifecycle modules — registry, handlers, lifecycle runner, install entrypoint — live under `src/lib/process-lifecycle/` ([review])
- Validation steps that spawn subprocesses accept the runner through dependency injection and consume `lifecycleProcessRunner` as the production default ([review])

### NEVER

- Import `child_process.spawn` for asynchronous child processes outside `src/lib/process-lifecycle/`; synchronous `execSync` and `spawnSync` are exempt because they self-reap before parent exit ([review])
- Set `detached: true` on subprocess spawns in production code paths; detachment changes signal semantics and contradicts the registry's tracking model ([review])
- Spawn a child via `lifecycleProcessRunner.spawn` without registering its handle in the lifecycle registry ([review])
- Use `vi.mock()` or `jest.mock()` to replace the spawn primitive, the registry, or the lifecycle runner; tests inject controlled implementations through the `ProcessRunner` interface ([review])
- Place CLI-specific code under `src/lib/` or process-lifecycle code under `src/interfaces/`; the interface/orchestration boundary is mandatory ([review])
- Write to `process.stdout` or `process.stderr` without an `error` listener installed; unhandled EPIPE becomes an uncaught exception that violates the exit-code mapping ([review])
