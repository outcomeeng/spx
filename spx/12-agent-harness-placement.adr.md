# Agent Harness Placement

The spec tree classifies its own artifacts by the vocabulary `spx/12-agent-harness.pdr.md` defines. Every top-level enabler, outcome, command domain, and source domain whose behavior configures, launches, resumes, isolates, equips, or journals verification runs executed by coding agents is an agent-harness artifact, and root-level placement and decomposition account for it as one. Every top-level spec and decision that governs Codex, Claude Code, agent selection, agent configuration, agent adapters, agent sessions, plugin bootstrap, skill bootstrap, isolated agent execution, or agent observation identifies which of harness, agent, agent adapter, or agent session it describes and which of the three scopes — user scope, agent home, repository — it writes. The four terms stay separate across configuration, invocation, observation, and resume behavior, and an unqualified "agent" never names an adapter implementation, a session identity, a plugin package, a marketplace package, or the harness.

## Rationale

The harness, an agent, an agent adapter, and an agent session are four subjects with different configuration, connection mechanics, and run identity. A spec or decision that names one when it means another collapses those subjects into one term, so a reader cannot tell whether a rule constrains what spx manages, what a coding agent does, how spx connects to it, or one running interaction — and cannot tell which scope a write lands in. Naming the subject and the scope at the artifact that governs them keeps every rule in the harness's reach attributable. Accounting for harness artifacts at root-level placement keeps the harness one concern the tree can decompose deliberately instead of a label individual nodes adopt or drop on their own.

## Verification

### Audit

- ALWAYS: top-level specs and decisions that govern Codex, Claude Code, agent selection, agent configuration, agent adapters, agent sessions, plugin bootstrap, skill bootstrap, isolated agent execution, or agent observation identify whether they are describing the harness, an agent, an agent adapter, or an agent session, and which of the three scopes they write ([audit])
- ALWAYS: root-level placement and decomposition account for top-level enablers, outcomes, command domains, and source domains whose behavior configures, launches, resumes, isolates, equips, or journals verification runs executed by coding agents ([audit])
- NEVER: an artifact uses unqualified "agent" for an adapter implementation, a session identity, a plugin package, a marketplace package, or the SPX-managed harness when that specific role is meant ([audit])
