# CLI Surface Contract

SPX CLI commands expose product capabilities through bounded, predictable, agent-readable command surfaces. Command groups, verbs, options, help text, output modes, color behavior, diagnostics, and list defaults use one CLI surface vocabulary so operators and agents can move between command families without relearning each surface.

## Rationale

Agents and operators need CLI output they can inspect, page, filter, and parse without re-learning each command family. A shared surface contract prevents each command domain from inventing defaults that flood context, hide selectors, or couple product semantics to one interface.

## Product properties

1. Every CLI command family presents help, filters, output modes, color behavior, and diagnostics through one surface vocabulary.
2. List and inspection commands return bounded text by default when their backing data can grow, and expose explicit selectors, limits, or machine-readable modes for wider reads.
3. Every CLI verb documents its invocation shape, selectors, output controls, and diagnostics in `--help`.

## Verification

### Audit

- ALWAYS: CLI command specs place command names, verb names, options, help text, rendering, default output bounds, color behavior, and exit diagnostics under `spx/32-surfaces.enabler/21-cli-surface.enabler` ([audit])
- ALWAYS: list-style CLI commands whose backing data grows across sessions, runs, branches, or product history define a bounded default projection and explicit widening controls ([audit])
- NEVER: a CLI command family defines a private option, output-mode, color, help, or diagnostic vocabulary when the CLI surface vocabulary already covers that behavior ([audit])
