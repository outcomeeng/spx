# Surfaces

PROVIDES product interaction surfaces for operator-facing, agent-facing, and integration-facing boundaries
SO THAT CLI, MCP, web API, and UI surfaces
CAN expose SPX capabilities through surface-specific command, protocol, rendering, and invocation contracts

## Assertions

### Compliance

- ALWAYS: surface-role nodes own concrete surface contracts, including command names, surface operations, help, rendering, defaults, option grammar, and invocation diagnostics ([audit])
- ALWAYS: lower-index library nodes own interface-neutral semantics, state models, persistence contracts, and reusable operations consumed by surfaces ([audit])
- ALWAYS: surface-role ownership follows concrete interaction-boundary semantics and is named by specs and decisions; `.surface` nodes require canonical suffix readiness ([audit])
- NEVER: a surface-role node owns product-library semantics merely because one surface exposes them first ([audit])
