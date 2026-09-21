# Agent harness

SPX provides an **agent harness** for product repositories. The harness manages repository-local agent configuration, instruction files, plugin marketplaces, plugins, skills, invocation policy, and isolated execution state for coding agents selected by product configuration.

**Agent.** A selectable coding agent that declares its own adapter contract.

**Agent adapter.** The configured way SPX launches, resumes, observes, or communicates with one agent.

**Agent session.** One running or resumable interaction for one agent.

## Rationale

A coding agent is an agent. The harness is the SPX-managed repository behavior around the agents product configuration enables. The terms harness, agent, agent adapter, and agent session stay separate so configuration, connection mechanics, and run identity do not collapse into one term. Which agents exist is declared by the agent nodes themselves, so no ancestor spec or decision carries a roster that drifts as the set changes.

## Product properties

1. The agent harness manages repository-local agent configuration, instruction files, plugin marketplaces, plugins, skills, invocation policy, and isolated execution state.
2. The terms harness, agent, agent adapter, and agent session stay separate across configuration, invocation, observation, and resume behavior.
3. Top-level enablers, outcomes, command domains, and source domains that configure, launch, resume, isolate, equip, or journal verification runs executed by coding agents are part of the agent harness.

## Verification

### Audit

- ALWAYS: top-level specs and decisions that govern a coding agent, agent selection, agent configuration, agent adapters, agent sessions, plugin bootstrap, skill bootstrap, isolated agent execution, or agent observation identify whether they are describing the harness, an agent, an agent adapter, or an agent session ([audit])
- NEVER: a spec or decision names the coding agents SPX supports as a list; each agent's own node declares that agent, and the supported set is read from the agent nodes ([audit])
- ALWAYS: root-level placement and decomposition account for top-level enablers, outcomes, command domains, and source domains whose behavior configures, launches, resumes, isolates, equips, or journals verification runs executed by coding agents ([audit])
- NEVER: use unqualified agent for adapter implementation, session identity, plugin package, marketplace package, or the SPX-managed harness when that specific role is meant ([audit])
