# Plan: Agent

## Harness vocabulary alignment

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

`spx/12-agent-harness.pdr.md` distinguishes the SPX-managed harness, agents, agent adapters, and agent sessions. Align this node and `spx/46-agent.enabler/21-resume.enabler` so their specs, command text, and launch vocabulary describe coding-agent session coordination: discovering and relaunching running or resumable Codex and Claude Code interactions as agent sessions, distinct from SPX handoff session files and from the harness that manages repository-local agent configuration.
