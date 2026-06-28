# Agent harness

SPX provides an **agent harness** for product repositories. The harness manages `spx/33-agent-environment.enabler`, `spx/33-agent-environment.enabler/21-agent-instructions.enabler`, `spx/33-agent-environment.enabler/43-plugin-bootstrap.enabler`, invocation policy, and isolated execution state for configured coding agents.

**Configured agent.** A selectable coding agent, such as Codex or Claude Code.

**Agent adapter.** The configured way SPX launches, resumes, observes, or communicates with one configured agent.

**Agent session.** One running or resumable interaction for a configured agent.

## Rationale

Codex and Claude Code are configured agents. Runtime vocabulary names execution tools such as Node.js, shells, and containers. The terms harness, configured agent, agent adapter, and agent session stay separate so configuration, agent connection, and run identity do not collapse into one term.

## Product properties

1. The agent harness manages repository-local agent configuration, instruction files, plugin marketplaces, plugins, skills, invocation policy, and isolated execution state without making any configured agent the product owner.
2. The terms harness, configured agent, agent adapter, and agent session stay separate across configuration, invocation, observation, and resume behavior.
3. Top-level enablers, outcomes, command domains, and source domains that configure, launch, resume, observe, isolate, or equip coding agents are part of the agent harness, including `spx/33-agent-environment.enabler`, `spx/36-session.enabler`, `spx/38-worktree.enabler`, and `spx/15-agent-run-journal.enabler`.

## Verification

### Audit

- ALWAYS: top-level specs and decisions that govern Codex, Claude Code, configured agent selection, agent configuration, agent adapters, agent sessions, plugin bootstrap, skill bootstrap, isolated agent execution, or agent observation identify whether they are describing the harness, a configured agent, an agent adapter, or an agent session ([audit])
- ALWAYS: root-level placement and decomposition account for top-level enablers, outcomes, command domains, and source domains whose behavior configures, launches, resumes, observes, isolates, or equips coding agents ([audit])
- NEVER: use runtime as the noun for the SPX-managed harness, a configured coding agent, an agent adapter, or an agent session ([audit])
- NEVER: use agent as the noun for adapter implementation, session identity, plugin package, marketplace package, or the SPX-managed harness ([audit])
