# Plan: Agent run journal

## Harness vocabulary alignment

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, configured agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

`spx/12-agent-harness.pdr.md` distinguishes configured agents, agent adapters, and agent sessions from verification-run identity. Align this node's specs, journal event vocabulary, and projection text so run records identify the agent-related subject they describe without collapsing verification runs into agent sessions.
