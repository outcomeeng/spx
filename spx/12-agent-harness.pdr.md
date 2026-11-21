# Agent harness

DEFINES agent harness AS the SPX-managed repository behavior that manages agent configuration, instruction files, invocation policy and isolated execution state, and installs plugin marketplaces, plugins and skills into the agent home it sets for each coding agent product configuration selects
DEFINES user scope AS a coding agent's own home in the person's home directory, owned by the person, which SPX reads for diagnostics and never writes
DEFINES agent home AS the directory SPX sets as a coding agent's configuration home, through the configuration-home variable that agent reads, owned by SPX
DEFINES repository AS the product's working tree, owned by the product, which carries agent configuration and instruction files that declare which capabilities are enabled
DEFINES agent AS a coding agent SPX supports
DEFINES agent adapter AS the configured way SPX launches, resumes, observes, or communicates with one agent
DEFINES agent session AS one running or resumable interaction for one agent
GOVERNS where coding-agent state lives across the user scope, the agent home and the repository
SO THAT a person running SPX in a product repository
CAN RELY ON product-scoped capabilities installing only into the agent home SPX sets, never into their own home or the tracked working tree

### Test.Compliance: scopes

- agent-home-writes: ALWAYS: every write of a marketplace, plugin, or skill by the harness targets the agent home SPX sets for that coding agent.
- no-user-scope-writes: NEVER: the harness writes into the user scope of any coding agent.
- repository-plugin-defect: ALWAYS: diagnostics report a plugin, plugin cache, or marketplace clone found under the repository as a defect, naming the path and the agent home it belongs in.
- no-tracked-installs: NEVER: a repository ignore rule admits an installed plugin, skill, or marketplace directory under the repository as tracked content.
