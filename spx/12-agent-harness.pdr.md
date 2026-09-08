# Agent harness

SPX provides an **agent harness** for product repositories. The harness manages agent configuration, instruction files, invocation policy, and isolated execution state in the repository, and installs plugin marketplaces, plugins, and skills into the agent home it sets for each coding agent selected by product configuration. Three scopes hold coding-agent state, and each has one owner:

**User scope.** The coding agent's own home — `$HOME/.codex`, `$HOME/.claude` — owned by the person. SPX reads it for diagnostics and never writes to it.

**Agent home.** The directory SPX sets as the coding agent's configuration home — `$CODEX_HOME` for Codex, `CLAUDE_CONFIG_DIR` for Claude Code — owned by SPX. Product-scoped capabilities — marketplaces, plugins, skills — install here and nowhere else.

**Repository.** The product's working tree, owned by the product. It carries agent configuration and instruction files that declare which capabilities are enabled; it never contains an installed plugin, a plugin cache, or a marketplace clone.

**Agent.** A selectable coding agent, such as Codex or Claude Code.

**Agent adapter.** The configured way SPX launches, resumes, observes, or communicates with one agent.

**Agent session.** One running or resumable interaction for one agent.

## Rationale

Codex and Claude Code are agents. The harness is the SPX-managed repository behavior around those agents. The terms harness, agent, agent adapter, and agent session stay separate so configuration, connection mechanics, and run identity do not collapse into one term.

The three scopes keep a repository that declares its capabilities distinct from a location that contains them. A plugin installed under the repository is invisible to git's view of product truth, duplicates the agent home, and lets a coding agent's own bookkeeping — cache directories, marketplace clones, generated configuration stanzas — masquerade as tracked product state. Writing into the user scope would let one product alter every other product's agent behavior on the same machine.

## Product properties

1. The agent harness manages repository-scoped agent configuration, instruction files, invocation policy, and isolated execution state, and installs product-scoped marketplaces, plugins, and skills only into the agent home it sets.
2. The terms harness, agent, agent adapter, and agent session stay separate across configuration, invocation, observation, and resume behavior.
3. Top-level enablers, outcomes, command domains, and source domains that configure, launch, resume, isolate, equip, or journal verification runs executed by coding agents are part of the agent harness.

## Verification

- ALWAYS: every write of a marketplace, plugin, or skill by the harness targets the agent home SPX sets for that coding agent
- NEVER: the harness writes into the user scope of any coding agent
- ALWAYS: a plugin, plugin cache, or marketplace clone found under the repository is reported as a defect by diagnostics, naming the path and the agent home it belongs in
- NEVER: a repository ignore rule admits an installed plugin, skill, or marketplace directory under the repository as tracked content

### Audit

- ALWAYS: top-level specs and decisions that govern Codex, Claude Code, agent selection, agent configuration, agent adapters, agent sessions, plugin bootstrap, skill bootstrap, isolated agent execution, or agent observation identify whether they are describing the harness, an agent, an agent adapter, or an agent session, and which of the three scopes they write ([audit])
- ALWAYS: root-level placement and decomposition account for top-level enablers, outcomes, command domains, and source domains whose behavior configures, launches, resumes, isolates, equips, or journals verification runs executed by coding agents ([audit])
- NEVER: use unqualified agent for adapter implementation, session identity, plugin package, marketplace package, or the SPX-managed harness when that specific role is meant ([audit])
