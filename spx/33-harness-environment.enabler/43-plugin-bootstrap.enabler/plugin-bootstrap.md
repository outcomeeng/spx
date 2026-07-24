# Plugin Bootstrap

PROVIDES deterministic status, exact apply, and methodology-compatible update of configured coding-agent capability sources, native packages, plugins, and skills
SO THAT participating coding agents launched or prepared by spx
CAN depend on exact product-scoped capabilities without manual installation steps or cross-agent artifact translation

## Assertions

### Compliance

- ALWAYS: capability reconciliation distinguishes configured sources, native packages, plugins, and skills by type, exact version, and target coding agent ([audit])
- ALWAYS: `spx agent config status` reports installed, missing, stale, incompatible, and failed capability entries deterministically without writes or required network access ([audit])
- ALWAYS: `spx agent config apply` resolves network inputs and reproduces the exact committed capability versions for each explicitly enabled and available coding agent ([audit])
- ALWAYS: `spx agent config update` selects only package versions compatible with the declared methodology, persists exact pins through the config owner, and applies those versions ([audit])
- NEVER: silently install network-fetched capabilities during offline core operations ([audit])
- NEVER: translate one coding agent's capability artifacts into another coding agent's native package format ([audit])
- NEVER: capability reconciliation mutates user-scope coding-agent configuration or targets a disabled or unavailable coding agent ([audit])
