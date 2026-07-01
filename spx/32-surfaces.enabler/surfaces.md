# Surfaces

PROVIDES product interaction surfaces that compose lower-index SPX capability libraries into operator-facing, agent-facing, and integration-facing interfaces
SO THAT CLI, MCP, web API, and UI surfaces
CAN expose the same interface-neutral product capabilities through surface-specific command, protocol, rendering, and invocation contracts without owning the underlying library semantics

## Assertions

### Compliance

- ALWAYS: surface nodes own concrete interface contracts, including command names, protocol operations, help, rendering, defaults, option grammar, and invocation diagnostics ([audit])
- ALWAYS: lower-index library nodes own interface-neutral semantics, state models, persistence contracts, and reusable operations consumed by surfaces ([audit])
- NEVER: a surface node owns product-library semantics merely because one interface exposes them first ([audit])
