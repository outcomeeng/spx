# CLI Surface

PROVIDES the SPX command-line product surface, including command groups, verbs, options, help, output modes, terminal rendering, and agent-readable defaults
SO THAT operators, automation, and configured agents
CAN invoke SPX capabilities through a consistent CLI contract

## Assertions

### Compliance

- ALWAYS: CLI command nodes under this surface own command names, verb names, option grammar, help text, default output behavior, color behavior, exit diagnostics, and JSON or field-selection contracts ([audit])
- ALWAYS: the `spx methodology version` command family exposes `show` and `migrate <target>` as CLI bindings over `spx/57-methodology-lifecycle.enabler` without owning methodology identity, migration, or verification semantics ([audit])
- NEVER: CLI command nodes redefine storage, state, verification, or spec-tree semantics inside the surface ([audit])
- ALWAYS: list-style commands provide bounded, agent-readable defaults and explicit widening controls when full output can exceed a useful terminal or agent-context budget ([audit])
- NEVER: a CLI command defaults to unbounded output when the backing dataset can grow across sessions, runs, branches, or product history ([audit])
