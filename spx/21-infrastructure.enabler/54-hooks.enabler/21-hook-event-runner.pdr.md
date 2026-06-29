# Hook Event Runner

SPX exposes agent lifecycle hooks as a product-level event runner invoked as
`spx hook run <event>`. Hook events are named by lowercase hyphenated operands
derived from the upstream agent lifecycle event they serve, consume the hook
payload and hook runtime environment, and may coordinate multiple SPX domains
without becoming commands in any one domain. `session-start` is the first
required event: it reports session and project identity, writes hook-runtime
exports, reports whether the worktree is held by the agent session, and emits
compact lifecycle source hook stdout according to the invoking runtime's
configured hook policy.

## Rationale

Lifecycle hooks are a plugin integration surface, not a worktree command surface.
A hook event can span worktree occupancy, session identity, Spec Tree context,
stale-base detection, queued-work discoverability, and runtime-specific hook
policy in one invocation, so the product contract belongs to hooks
infrastructure and the domain-specific command surfaces remain focused on
explicit operator actions.

## Product properties

1. A plugin invokes SPX hook behavior by naming an agent lifecycle event and
   providing that event's payload and runtime context.
2. `session-start` produces session identity, project identity, and worktree
   occupancy state when the hook payload and runtime context provide enough
   information to resolve them.
3. `session-start` emits compact-source hook stdout only when the CLI-resolved
   `hooks.sessionStart.compactStdout` policy is true.
4. `session-start` reports degraded responsibilities explicitly and does not
   block session startup because one responsibility degrades.

## Verification

### Audit

- ALWAYS: hook behavior that consumes agent lifecycle payloads is described as
  SPX hook event behavior, not as a command in the worktree, session, or Spec
  Tree domains ([audit])
- ALWAYS: the public hook invocation contract is `spx hook run <event>`, and
  `session-start` is the first required event operand ([audit])
- ALWAYS: `session-start` provides the first startup behavior slice: session
  identity, project identity, worktree occupancy state, and hook-runtime env
  exports ([audit])
- ALWAYS: the hook CLI transport resolves hook execution context once before
  running a known hook event, including hook env-file selection and
  compact-source stdout policy ([audit])
- ALWAYS: the hook CLI transport resolves compact-source stdout policy from the
  hook runtime's
  `agentEnvironment.runtimes.<runtime>.hooks.sessionStart.compactStdout` config,
  defaulting Codex to false and Claude Code to true ([audit])
- ALWAYS: for `session-start`, the hook CLI transport resolves compact-source
  stdout policy from the product directory named by the hook payload `cwd` when
  the payload is readable, rather than from the process launch directory
  ([audit])
- ALWAYS: compact-source stdout policy runtime selection treats
  `CODEX_THREAD_ID` as the Codex runtime marker even when a `CLAUDE_SESSION_ID`
  value is also present, treats `CLAUDE_SESSION_ID` as the Claude Code runtime
  marker when `CODEX_THREAD_ID` is absent, and treats `CLAUDE_ENV_FILE` as the
  tertiary Claude Code runtime marker when both session markers are absent;
  session identity resolution remains an event-specific `session-start`
  responsibility ([audit])
- ALWAYS: a failed `session-start` responsibility degrades by recording an
  explicit marker or diagnostic while allowing the hook invocation to complete
  successfully ([audit])
- NEVER: `session-start` emits model-visible hook stdout for the compact
  lifecycle source when the invoking runtime's compact stdout policy is false
  ([audit])
- NEVER: hook stdout carries diagnostics; stdout is reserved for hook-specific
  model-visible context ([audit])
