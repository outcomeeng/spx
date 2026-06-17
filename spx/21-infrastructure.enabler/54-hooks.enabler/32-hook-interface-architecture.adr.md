# Hook Interface Architecture

Hook handling is a peer interface layer under `src/interfaces/hooks/`, with an
explicit event registry keyed by agent lifecycle event name. The CLI transport
for `spx hook run <event>` dispatches into that hook interface, and hook adapters
own the hook process contract: stdin payload reading, hook runtime environment
interpretation, stdout context, stderr diagnostics, env-file writes, and
nonblocking degraded completion. Hook adapters call shared domain services
directly; they never depend on `src/commands/` handlers, and shared operations
needed by both commands and hooks live below both interface layers.

## Rationale

Commands represent operator-invoked product actions, while hooks represent
host-invoked lifecycle events. Reusing command handlers for hook work creates the
wrong dependency boundary and encourages command names such as
`spx worktree session-start`; a peer hook interface keeps host lifecycle
semantics separate while still sharing domain logic with command surfaces.

## Invariants

- Hook event handlers depend on domain services and shared libraries, not on command handlers.
- Command handlers and hook handlers never import each other.
- The hook event registry is the complete set of event names accepted by `spx hook run <event>`.
- Hook adapters are the only modules that interpret hook payload stdin, hook
  env-file paths, and hook-specific stdout semantics.

## Verification

### Audit

- ALWAYS: hook event adapters live under `src/interfaces/hooks/` and are
  registered through an explicit hook event registry ([audit])
- ALWAYS: the `spx hook run <event>` CLI transport delegates to the hook event
  registry without embedding event behavior in the CLI command descriptor
  ([audit])
- ALWAYS: shared operations used by both `spx worktree claim` and
  `spx hook run SessionStart` live below the command and hook interface layers,
  so both surfaces call the same worktree occupancy logic without one depending
  on the other ([audit])
- ALWAYS: hook adapters own hook process I/O — stdin payload, hook runtime env,
  stdout context, stderr diagnostics, and env-file writes — because those are
  hook interface concerns rather than domain concerns ([audit])
- ALWAYS: the `SessionStart` hook adapter owns worktree occupancy setup for the
  agent session, and the `PreToolUse` hook adapter does not perform a
  status-then-claim occupancy repair loop ([audit])
- ALWAYS: the `SessionStart` hook adapter writes hook env-file exports for
  `CLAUDE_SESSION_ID`, `CLAUDE_PROJECT_DIR`, `PROJECT_DIR`, and
  `CLAUDE_WORKTREE_CLAIMED` when the hook runtime supplies an env-file path
  and enough identity or project information to compute each value ([audit])
- NEVER: a module under `src/interfaces/hooks/` imports from `src/commands/` ([audit])
- NEVER: a domain-specific command descriptor exposes an agent lifecycle event as
  a subcommand ([audit])
- NEVER: hook event behavior is organized by the implementation package that
  first consumes it; hook behavior is organized by lifecycle event and delegates
  to consuming domains as needed ([audit])
