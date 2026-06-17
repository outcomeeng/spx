# Hook Event Runner

SPX exposes agent lifecycle hooks as a product-level event runner invoked as
`spx hook run <event>`. Hook events are named by the upstream agent lifecycle
event they serve, consume the hook payload and hook runtime environment, and may
coordinate multiple SPX domains without becoming commands in any one domain.
`SessionStart` is the first required event: it
provides Spec Tree startup behavior, reports session and project identity,
reports whether the worktree is held by the agent session, and surfaces startup
guidance when guidance applies.

## Rationale

Lifecycle hooks are a plugin integration surface, not a worktree command surface.
A hook event can span worktree occupancy, session identity, Spec Tree context,
stale-base detection, and queued-work discoverability in one invocation, so the
product contract belongs to hooks infrastructure and the domain-specific command
surfaces remain focused on explicit operator actions.

## Product properties

1. A plugin invokes SPX hook behavior by naming an agent lifecycle event and
   providing that event's payload and runtime context.
2. `SessionStart` produces session identity, project identity, and worktree
   occupancy state when the hook payload and runtime context provide enough
   information to resolve them.
3. `SessionStart` presents only applicable startup guidance, reports degraded
   responsibilities explicitly, and does not block session startup because one
   responsibility degrades.

## Verification

### Audit

- ALWAYS: hook behavior that consumes agent lifecycle payloads is described as
  SPX hook event behavior, not as a command in the worktree, session, or Spec
  Tree domains ([audit])
- ALWAYS: the public hook invocation contract is `spx hook run <event>`, and
  `SessionStart` is the first required event operand ([audit])
- ALWAYS: `SessionStart` provides Spec Tree startup behavior: session identity,
  project identity, worktree occupancy state, the foundation directive, the
  stale-base directive, and queued-work discoverability ([audit])
- ALWAYS: a failed `SessionStart` responsibility degrades by recording an
  explicit marker or diagnostic while allowing the hook invocation to complete
  successfully ([audit])
- NEVER: hook stdout carries diagnostics; stdout is reserved for hook-specific
  model-visible context ([audit])
