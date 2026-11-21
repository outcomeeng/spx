# Agent Harness Placement

CONSTRAINS how the spec tree classifies and describes its agent-harness artifacts
TO the vocabulary of [spx/12-agent-harness.pdr.md](spx/12-agent-harness.pdr.md), applied at each top-level artifact and at root-level placement
SO THAT every rule in the harness's reach is attributable to one subject and one scope, and the harness stays one concern that root-level decomposition places deliberately

## Audit: harness artifacts

- harness-subject-and-scope: ALWAYS: a top-level spec or decision that governs a coding agent, agent selection, agent configuration, agent adapters, agent sessions, plugin bootstrap, skill bootstrap, isolated agent execution, or agent observation identifies whether it describes the harness, an agent, an agent adapter, or an agent session, and which of the three scopes it writes.
- harness-placement: ALWAYS: root-level placement and decomposition account for top-level enablers, outcomes, command domains, and source domains whose behavior configures, launches, resumes, isolates, equips, or journals verification runs executed by coding agents.
- qualified-agent: NEVER: an artifact uses unqualified "agent" for an adapter implementation, a session identity, a plugin package, a marketplace package, or the SPX-managed harness when that specific role is meant.
