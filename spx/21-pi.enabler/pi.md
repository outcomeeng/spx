# Pi

PROVIDES the Pi coding agent's own adapter facts — registered agent id,
session-store resolution, agent-session identity variable, transcript metadata
shape, native resume command, hook stdout policy default, and consumption of the
capability surface declared by
[`spx/20-claude-code.enabler/claude-code.md`](../20-claude-code.enabler/claude-code.md)
SO THAT hook agent classification, harness environment configuration, session
identity resolution, agent resume and search, and environment diagnosis
CAN address Pi through its declared facts without any of them enumerating which
coding agents SPX supports

## Assertions

### Compliance

- ALWAYS: Pi sessions resolve from `PI_CODING_AGENT_SESSION_DIR` when that variable is set, otherwise from `PI_CODING_AGENT_DIR` plus `sessions`, otherwise from `~/.pi/agent/sessions` ([test](tests/pi.compliance.l1.test.ts))
- ALWAYS: a command running inside a Pi agent session reads its agent session identity from `PI_SESSION_ID`, which names the Pi session even when the environment also carries another coding agent's identity variable ([test](tests/pi.compliance.l1.test.ts))
- ALWAYS: Pi installs the marketplaces, plugins, and skills of the capability surface declared by [`spx/20-claude-code.enabler/claude-code.md`](../20-claude-code.enabler/claude-code.md) as its own native packages ([test](tests/pi.compliance.l1.test.ts))
- ALWAYS: Pi resolves `hooks.sessionStart.compactStdout` to true, so a compact-source `session-start` invocation classified as Pi emits the compact foundation directive as hook stdout ([test](tests/pi.compliance.l1.test.ts))
- NEVER: Pi acquires branch identity from live repository inference — its transcript metadata records none, so Pi participates in worktree scope and is excluded from explicit branch scope ([test](tests/pi.compliance.l1.test.ts))

### Mappings

- The Pi transcript's versioned opening session row maps to the session's id, recorded working directory, format version, and creation time, and carries no initial branch ([test](tests/pi.mapping.l1.test.ts))
- A Pi candidate maps to the native resume invocation `pi --session <source-path>` launched from the candidate's recorded working directory, resuming the exact discovered source rather than a reconstructed session identity ([test](tests/pi.mapping.l1.test.ts))
