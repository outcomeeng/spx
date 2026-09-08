# Plugin Bootstrap

PROVIDES deterministic status, exact apply, and methodology-compatible update of configured coding-agent capability sources, native packages, plugins, and skills, installed into the agent home spx sets for each coding agent
SO THAT participating coding agents launched or prepared by spx
CAN depend on exact product-scoped capabilities without manual installation steps or cross-agent artifact translation

## Assertions

- Every capability source, native package, plugin, and skill that apply or update installs is written into the agent home spx sets for the target coding agent — `$CODEX_HOME` for Codex, `CLAUDE_CONFIG_DIR` for Claude Code — and into no other location
- spx sets the agent home for a coding agent before launching or preparing it, so the agent's own capability lookups resolve there
- A plugin, plugin cache, or marketplace clone under the repository is a defect that the diagnose marketplace-install check reports, naming the path and the agent home it belongs in

### Compliance

- ALWAYS: capability reconciliation distinguishes configured sources, native packages, plugins, and skills by type, exact version, and target coding agent ([audit])
- ALWAYS: `spx agent config status` reports installed, missing, stale, incompatible, and failed capability entries deterministically without writes or required network access ([test](tests/capability-status.compliance.l1.test.ts))
- ALWAYS: `spx agent config apply` resolves network inputs and reproduces the exact committed capability versions for each explicitly enabled and available coding agent ([test](tests/capability-apply.compliance.l1.test.ts))
- ALWAYS: `spx agent config update` selects only package versions whose declared `methodology.supports` range contains the declared methodology version, persists exact pins through the config owner, and applies those versions ([test](tests/capability-update.compliance.l1.test.ts))
- NEVER: silently install network-fetched capabilities during offline core operations ([audit])
- NEVER: translate one coding agent's capability artifacts into another coding agent's native package format ([audit])
- NEVER: capability reconciliation mutates user-scope coding-agent configuration or targets a disabled or unavailable coding agent ([test](tests/capability-boundary.compliance.l1.test.ts))
