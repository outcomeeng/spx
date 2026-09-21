# Hook Event Runner

SPX exposes agent lifecycle hooks as a product-level event runner invoked as
`spx hook run <event>`. Hook events are named by lowercase hyphenated operands
derived from the upstream agent lifecycle event they serve, take the lifecycle
payload delivered on standard input as their only invocation input, and may
coordinate multiple SPX domains without becoming commands in any one domain.
`session-start` is the first required event: it resolves session and project
identity from that payload, establishes worktree occupancy, and emits compact
lifecycle source hook stdout according to the invoking agent's hook policy. A
hook invocation leaves the invoking agent's environment untouched.

## Rationale

Lifecycle hooks integrate plugins through hook events. A hook event can span
worktree occupancy, session identity, Spec Tree context, stale-base detection,
queued-work discoverability, and agent hook policy in one invocation, so the
product contract belongs to hooks infrastructure and the domain-specific
commands remain focused on explicit operator actions.

Every agent that exposes lifecycle hooks delivers one JSON object on standard
input carrying the session identity and the transcript path, so a hook event has
everything it needs before reading any variable. Taking the payload as the only
input keeps one invocation contract across every agent whose hooks SPX serves,
and leaves the invoking agent's environment as that agent's own — a variable SPX
placed there would outlive the invocation and reach every later process in the
session under a name SPX does not own.

## Product properties

1. A plugin invokes SPX hook behavior by naming an agent lifecycle event and
   delivering that event's payload on standard input.
2. `session-start` produces session identity, project identity, and worktree
   occupancy when the hook payload provides enough information to resolve them.
3. `session-start` emits compact-source hook stdout only when the CLI-resolved
   `hooks.sessionStart.compactStdout` policy for the payload-classified agent is
   true.
4. `session-start` reports degraded responsibilities explicitly and does not
   block session startup because one responsibility degrades.
5. A hook invocation adds, changes, and removes no variable in the invoking
   agent's environment.

## Verification

### Audit

- ALWAYS: hook behavior that consumes agent lifecycle payloads is described as
  SPX hook event behavior, not as a command in the worktree, session, or Spec
  Tree domains ([audit])
- ALWAYS: the public hook invocation contract is `spx hook run <event>`, and
  `session-start` is the first required event operand ([audit])
- ALWAYS: `session-start` provides the first startup behavior slice: session
  identity, project identity, and worktree occupancy state ([audit])
- ALWAYS: the hook CLI transport resolves hook execution context once before
  running a known hook event, including compact-source stdout policy ([audit])
- ALWAYS: the hook CLI transport resolves compact-source stdout policy from
  `harnessEnvironment.agents.<agent>.hooks.sessionStart.compactStdout`,
  defaulting to the value the classified agent's own node declares ([audit])
- ALWAYS: for `session-start`, the hook CLI transport resolves compact-source
  stdout policy from the product directory named by the hook payload `cwd` when
  the payload is readable, rather than from the process launch directory
  ([audit])
- ALWAYS: compact-source stdout agent selection and session identity resolution
  read the same payload-classified agent, so one lifecycle fact decides both and
  neither is inferred from the other ([audit])
- ALWAYS: a failed `session-start` responsibility degrades by recording an
  explicit marker or diagnostic while allowing the hook invocation to complete
  successfully ([audit])
- NEVER: a hook event reads its session identity, its agent classification, or
  its product directory from the process environment ([audit])
- NEVER: a hook event writes a variable into the invoking agent's environment
  ([audit])
- NEVER: `session-start` emits model-visible hook stdout for the compact
  lifecycle source when the invoking agent's compact stdout policy is false
  ([audit])
- NEVER: hook stdout carries diagnostics; stdout is reserved for hook-specific
  model-visible context ([audit])
