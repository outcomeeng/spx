# Hooks

PROVIDES the SPX hook event interface — a `spx hook run <event>` runner
that consumes agent lifecycle payloads, writes hook-runtime exports, emits
hook-specific context, and coordinates shared domain services
SO THAT installed agent plugins
CAN delegate lifecycle behavior to SPX without reimplementing it in plugin
scripts or forcing cross-domain hook work through one domain's command surface

## Assertions

### Compliance

- ALWAYS: agent lifecycle hook behavior that serves multiple product domains is
  governed under the hooks infrastructure node, not under the first domain that
  consumes the event ([audit])
- ALWAYS: hook event execution is invoked through `spx hook run <event>`, with
  the upstream hook event name as the event operand ([audit])
- ALWAYS: hook events may coordinate multiple SPX domains in one invocation while
  preserving each domain's ownership of its underlying state and rules ([audit])
- NEVER: expose an agent lifecycle hook as a domain-specific command such as
  `spx worktree session-start` ([audit])
