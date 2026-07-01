# Plan: Diagnose

## Harness vocabulary alignment

Before applying this plan, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

`spx/12-agent-harness.pdr.md` includes top-level command domains that inspect agent sessions, plugin installation, marketplace configuration, worktree occupancy, and local harness health. Align this node's specs, diagnostic provider names, manifest vocabulary, command text, and report text so each check identifies whether it describes the harness, an agent, an agent adapter, or an agent session.
