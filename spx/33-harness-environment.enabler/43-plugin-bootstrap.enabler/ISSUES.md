# Open Issues

## Capability installation names no location

**Evidence:** `plugin-bootstrap.md` promises "exact product-scoped
capabilities without manual installation steps" and forbids mutating
"user-scope coding-agent configuration," and names no directory into which
`spx agent config apply` installs. Three scopes exist: user scope
(`$HOME/.codex`, `$HOME/.claude`), which spx never mutates; the agent home
spx sets (`$CODEX_HOME`, `CLAUDE_CONFIG_DIR`); and the repository, which
carries configuration only. On 2026-07-25 a Codex session with this worktree
as project root, with no `$CODEX_HOME` set for it, cloned the marketplace and
installed `spec-tree@0.85.0` under `.codex/` inside the repository, 44 MB,
gitignored.

**Impact:** "product-scoped" has no defined target, so an agent left to its
defaults installs into the repository and no check reports it.

**Settlement condition:** the spec names the spx-set agent home as the only
install target for capability sources, native packages, plugins, and skills,
states that spx sets `$CODEX_HOME` and `CLAUDE_CONFIG_DIR` before launching
or preparing a coding agent, and declares a plugin cache under the repository
a defect the diagnose marketplace-install check reports.
