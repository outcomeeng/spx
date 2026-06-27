# Hook Event Runner

SPX exposes agent lifecycle hooks as a product-level event runner invoked as
`spx hook run <event>`. Hook events are named by lowercase hyphenated operands
derived from the upstream agent lifecycle event they serve, consume the hook
payload and hook runtime environment, and may coordinate multiple SPX domains
without becoming commands in any one domain. `session-start` is the first
required event: it reports session and project identity, writes hook-runtime
exports, reports whether the worktree is held by the agent session, and emits
model-visible startup guidance on hook stdout — on the compact lifecycle source,
the guidance names the compact source as the hook-firing reason and directs
re-establishment of spec-tree foundation before spec-governed work resumes.

## Rationale

Lifecycle hooks are a plugin integration surface, not a worktree command surface.
A hook event can span worktree occupancy, session identity, Spec Tree context,
stale-base detection, and queued-work discoverability in one invocation, so the
product contract belongs to hooks infrastructure and the domain-specific command
surfaces remain focused on explicit operator actions.

## Product properties

1. A plugin invokes SPX hook behavior by naming an agent lifecycle event and
   providing that event's payload and runtime context.
2. `session-start` produces session identity, project identity, and worktree
   occupancy state when the hook payload and runtime context provide enough
   information to resolve them.
3. `session-start` reports degraded responsibilities explicitly and does not
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
- ALWAYS: a failed `session-start` responsibility degrades by recording an
  explicit marker or diagnostic while allowing the hook invocation to complete
  successfully ([audit])
- ALWAYS: the compact-source startup directive names the compact lifecycle
  source as the hook-firing reason, actionably re-establishes spec-tree
  foundation — directing re-invocation of `/understand` then `/contextualize`
  before spec-governed work resumes — and classifies compaction-summary skill
  text as context only, outside active instruction authority ([audit])
- NEVER: hook stdout carries diagnostics; stdout is reserved for hook-specific
  model-visible context ([audit])
