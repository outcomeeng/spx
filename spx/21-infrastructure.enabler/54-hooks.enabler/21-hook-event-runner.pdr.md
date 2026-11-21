# Hook Event Runner

DEFINES hook event AS an agent lifecycle event SPX serves, named by a lowercase hyphenated operand derived from the upstream lifecycle event
GOVERNS agent lifecycle hooks as one product-level event runner invoked as `spx hook run <event>`
SO THAT a plugin that integrates a coding agent's lifecycle with SPX
CAN RELY ON one hook invocation that coordinates worktree occupancy, session identity, project identity and hook policy, and that never blocks the agent's startup because one responsibility degrades

## Audit: hook events

- hook-event-behavior: ALWAYS: hook behavior that consumes agent lifecycle payloads is SPX hook event behavior, not a command in the worktree, session, or Spec Tree domains.
- invocation-contract: ALWAYS: the public hook invocation contract is `spx hook run <event>`, and `session-start` is the first required event operand.
- session-start-slice: ALWAYS: `session-start` provides session identity, project identity, worktree occupancy state, the worktree claim path when the agent session holds the worktree, and hook-environment exports, whenever the hook payload and hook execution context provide enough information to resolve them.
- execution-context-once: ALWAYS: the hook CLI transport resolves hook execution context once before running a known hook event, including hook env-file selection and compact-source stdout policy.
- compact-policy-source: ALWAYS: the hook CLI transport resolves compact-source stdout policy by the compact-policy Mapping of [spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md](spx/33-harness-environment.enabler/21-harness-environment-descriptor.adr.md), reading configuration from the product directory the hook payload `cwd` names when the payload is readable, rather than from the process launch directory.
- degraded-responsibility: ALWAYS: a failed `session-start` responsibility degrades by recording an explicit marker or diagnostic while the hook invocation completes successfully.
- compact-stdout-off: NEVER: `session-start` emits model-visible hook stdout for the compact lifecycle source when the resolved compact-source stdout policy is false.
- stdout-reserved: NEVER: hook stdout carries diagnostics; stdout is reserved for hook-specific model-visible context.
