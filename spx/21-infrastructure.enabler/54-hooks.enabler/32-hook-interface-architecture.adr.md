# Hook Interface Architecture

Hook handling is a peer interface layer under `src/interfaces/hooks/`, with an
explicit event registry keyed by agent lifecycle event name. The CLI transport
for `spx hook run <event>` dispatches into that hook interface, and hook adapters
own the hook process contract: stdin payload reading, hook runtime environment
interpretation, bounded native-session metadata reads, stdout context, stderr
diagnostics, env-file writes, and nonblocking degraded completion. Hook adapters
call shared domain services directly; they never depend on `src/commands/`
handlers, and shared operations needed by both commands and hooks live below both
interface layers. The `session-start` adapter resolves an explicit payload
session id first; a Pi payload without that id supplies the exact native
transcript path, whose bounded opening metadata identifies the session only when
it is a valid Pi header for the resolved product directory.

## Rationale

Commands represent operator-invoked product actions, while hooks represent
host-invoked lifecycle events. Reusing command handlers for hook work creates the
wrong dependency boundary and encourages command names such as
`spx worktree session-start`; a peer hook interface keeps host lifecycle
semantics separate while still sharing domain logic with command surfaces.

An exact Pi transcript path is a native session fact available at Pi's
`session_start` lifecycle boundary. Reading that path's bounded header preserves
Pi's native identity without inventing a second identifier or guessing from
store recency. Store scanning and latest-file selection are rejected because two
Pi processes can start in the same product directory, making a recency winner an
uncertain holder identity. Header validation and product-directory agreement
bind the supplied path to the hook invocation; malformed or mismatched evidence
degrades to no identity and therefore no worktree claim.

## Invariants

- Hook event handlers depend on domain services and shared libraries, not on command handlers.
- Command handlers and hook handlers never import each other.
- The hook event registry is the complete set of lowercase hyphenated event
  operands accepted by `spx hook run <event>`.
- Hook adapters are the only modules that interpret hook payload stdin, hook
  env-file paths, and hook-specific stdout semantics.
- Pi native-session identity is accepted only from a valid bounded header at the
  exact transcript path supplied by the Pi lifecycle adapter, with a cwd that
  matches the hook's resolved product directory.

## Verification

### Audit

- ALWAYS: hook event adapters live under `src/interfaces/hooks/` and are
  registered through an explicit hook event registry ([audit])
- ALWAYS: the `spx hook run <event>` CLI transport delegates to the hook event
  registry without embedding event behavior in the CLI command descriptor
  ([audit])
- ALWAYS: shared operations used by both `spx worktree claim` and
  `spx hook run session-start` live below the command and hook interface layers,
  so both surfaces call the same worktree occupancy logic without one depending
  on the other ([audit])
- ALWAYS: hook adapters own hook process I/O — stdin payload, hook runtime env,
  stdout context, stderr diagnostics, and env-file writes — because those are
  hook interface concerns rather than domain concerns ([audit])
- ALWAYS: hook adapters isolate hook runtime reads, bounded transcript reads,
  output writes, and env-file writes behind typed boundary functions or injected
  dependencies so event logic verifies without replacing modules through a
  mocking framework ([audit])
- ALWAYS: `session-start` gives a non-empty explicit payload session id
  precedence over every inferred identity; when a Pi payload omits that id, the
  adapter derives identity only from a valid Pi header at the exact supplied
  transcript path whose cwd matches the resolved product directory ([audit])
- ALWAYS: Pi transcript metadata reads are bounded independently of transcript
  size and use a typed injected reader ([audit])
- NEVER: `session-start` scans a Pi session store, selects a latest transcript,
  or records a worktree claim from malformed, missing, or product-mismatched Pi
  transcript metadata ([audit])
- NEVER: hook tests use `vi.mock()` or `jest.mock()` to replace hook event
  modules, command handlers, or shared domain services; tests exercise real
  registry dispatch or typed injected boundary objects ([audit])
- ALWAYS: the `session-start` hook adapter owns worktree occupancy setup for the
  agent session, and the `PreToolUse` hook adapter does not perform a
  status-then-claim occupancy repair loop ([audit])
- ALWAYS: the `session-start` hook adapter writes hook env-file exports for
  `CLAUDE_SESSION_ID`, `CLAUDE_PROJECT_DIR`, and `PROJECT_DIR` when the hook
  runtime supplies an env-file path and enough identity and project information
  to compute each value, writes an absolute `SPX_WORKTREE_CLAIM_PATH` export
  when the worktree claim succeeds, and writes `unset SPX_WORKTREE_CLAIM_PATH`
  when the worktree claim is unavailable ([audit])
- NEVER: a module under `src/interfaces/hooks/` imports from `src/commands/` ([audit])
- NEVER: a domain-specific command descriptor exposes an agent lifecycle event as
  a subcommand ([audit])
- NEVER: hook event behavior is organized by the implementation package that
  first consumes it; hook behavior is organized by lifecycle event and delegates
  to consuming domains as needed ([audit])
