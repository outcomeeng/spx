# Plan

## Harness vocabulary guard

Before applying this plan to agent-driven release-note composition or SDK-backed runner boundaries, read `spx/12-agent-harness.pdr.md` and use its vocabulary as the authority: agent harness, agent, agent adapter, and agent session. Treat nearby `agent`, `runtime`, `session`, `Claude`, or `Codex` wording as lower-layer/local vocabulary until reconciled; every touched spec, command text, source name, test, and pickup prompt names the precise harness role it describes.

## Coordination

- Add the shared production `AgentRunner` when the `spx release` command consumes agent-authored artifacts. Reconcile the implementation against `spx/26-release.enabler/18-release-architecture.adr.md` and `spx/26-release.enabler/32-release-notes.enabler/21-release-notes-generation.adr.md`; use `@anthropic-ai/claude-agent-sdk` rather than `claude-code-sdk`.
- Run the release-notes faithfulness audit against a generated changelog artifact when the production agent path is available.
