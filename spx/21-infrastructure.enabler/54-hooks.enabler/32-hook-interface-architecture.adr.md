# Hook Interface Architecture

Hook handling is a peer interface layer under `src/interfaces/hooks/`, with an
explicit event registry keyed by agent lifecycle event name. The CLI transport
for `spx hook run <event>` dispatches into that hook interface, and hook adapters
own the hook process contract: stdin payload reading, bounded native-session
metadata reads, stdout context, stderr diagnostics, and nonblocking degraded
completion. Hook adapters call shared domain services directly; they never depend
on `src/commands/` handlers, and shared operations needed by both commands and
hooks live below both interface layers. A hook adapter takes the agent session
identity and the agent from the stdin payload alone, and SPX writes no
environment variable into any coding agent's own environment mechanism.

## Rationale

SPX is invoked in three worlds, and each supplies agent session identity by its
own means. A hook invocation carries the lifecycle payload on stdin, so the
event's session identity and originating agent are inputs the invoking agent
already states. An agent-invoked command runs inside a coding agent's own
session, so that agent's own environment names the session. An operator-invoked
command runs from a shell with no agent session in scope, so no agent session
identity exists to resolve. Modelling commands and hooks as one operator/host
pair collapses the second world into the third and pushes hooks toward command
names such as `spx worktree session-start`; a peer hook interface keeps lifecycle
semantics separate while still sharing domain logic with command surfaces.

Every coding agent that exposes lifecycle hooks delivers one JSON object on the
hook's standard input carrying the session identity, so the hook world needs no
environment input to resolve identity and therefore owes no environment output.
Writing into a coding agent's own environment mechanism is rejected on that
ground and on ownership: the mechanism belongs to the agent, a name written there
is read by every later process in that session, and a vendor prefix SPX does not
own may acquire a second definition from its owner with no signal that two
parties defined one variable. A cross-world bridge through that mechanism is
unnecessary as well as unowned — a worktree occupancy claim is addressed from the
worktree root any invocation can resolve, so a later command finds the claim
without SPX having exported its path.

The originating agent is a payload fact rather than an environment fact because
one agent may publish another agent's session variables into the hook
environment, leaving the environment unable to distinguish them. A transcript
path proven canonically contained by a configured agent's session-store root
names that agent without relying on any variable a second agent can also set.

An exact native transcript path is a session fact available at the lifecycle
boundary. Store scanning and latest-file selection are rejected because two agent
processes can start in the same product directory, making a recency winner an
uncertain holder identity. Canonical containment establishes path provenance
before content is read; lexical containment alone is insufficient because a
symlink inside the store can resolve outside it. A path outside every configured
store root, or malformed or mismatched evidence inside one, degrades to no agent
classification and therefore no worktree claim.

## Invariants

- Hook event handlers depend on domain services and shared libraries, not on command handlers.
- Command handlers and hook handlers never import each other.
- The hook event registry is the complete set of lowercase hyphenated event
  operands accepted by `spx hook run <event>`.
- Hook adapters are the only modules that interpret hook payload stdin and
  hook-specific stdout semantics.
- A hook invocation resolves agent session identity as a function of its stdin
  payload alone; no environment variable participates.
- The set of environment variables SPX writes into a coding agent's own
  environment mechanism is empty.
- An agent classification is accepted only from a transcript path proven
  canonically contained by exactly one configured agent session-store root.

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
- ALWAYS: hook adapters own hook process I/O — stdin payload, stdout context, and
  stderr diagnostics — because those are hook interface concerns rather than
  domain concerns ([audit])
- ALWAYS: hook adapters isolate bounded transcript reads and output writes behind
  typed boundary functions or injected dependencies so event logic verifies
  without replacing modules through a mocking framework ([audit])
- ALWAYS: `session-start` resolves the agent session identity from the stdin
  payload session id and records no identity when that id is absent ([audit])
- ALWAYS: `session-start` classifies the originating agent from the stdin payload
  transcript path, accepting the classification only when that path canonically
  resolves inside exactly one configured agent session-store root ([audit])
- ALWAYS: native transcript metadata reads are bounded independently of
  transcript size and use a typed injected reader; canonical path resolution for
  a configured store root and a supplied transcript path is injected through the
  same boundary ([audit])
- NEVER: lexical containment substitutes for canonical containment when a
  transcript path can traverse a symlink ([audit])
- NEVER: `session-start` scans an agent session store, selects a latest
  transcript, reads a transcript outside a configured store root, or records a
  worktree claim from untrusted, malformed, missing, or product-mismatched
  transcript metadata ([audit])
- NEVER: a hook adapter reads an agent session identity, an agent classification,
  or a product directory from the process environment — the stdin payload is the
  hook world's only input for each ([audit])
- NEVER: SPX writes, appends to, or unsets a variable in a coding agent's own
  environment mechanism, whatever the variable's prefix — the mechanism belongs
  to that agent, and a name SPX places there outlives the hook invocation and
  collides with whatever its owner later defines ([audit])
- NEVER: SPX exports a cross-invocation value that a later invocation can derive
  for itself from the worktree root, the product directory, or its own agent's
  environment ([audit])
- NEVER: hook tests use `vi.mock()` or `jest.mock()` to replace hook event
  modules, command handlers, or shared domain services; tests exercise real
  registry dispatch or typed injected boundary objects ([audit])
- ALWAYS: the `session-start` hook adapter owns worktree occupancy setup for the
  agent session, and the `PreToolUse` hook adapter does not perform a
  status-then-claim occupancy repair loop ([audit])
- ALWAYS: an environment variable SPX introduces into its own process
  environment carries the `SPX_` prefix naming SPX as the party that defines it
  ([audit])
- NEVER: a module under `src/interfaces/hooks/` imports from `src/commands/` ([audit])
- NEVER: a domain-specific command descriptor exposes an agent lifecycle event as
  a subcommand ([audit])
- NEVER: hook event behavior is organized by the implementation package that
  first consumes it; hook behavior is organized by lifecycle event and delegates
  to consuming domains as needed ([audit])
