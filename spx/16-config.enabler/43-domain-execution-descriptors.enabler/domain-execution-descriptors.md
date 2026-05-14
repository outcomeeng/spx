# Domain Execution Descriptors

PROVIDES registered config descriptors for deterministic execution domains
SO THAT testing, auditing, reviewing, validation, and additional execution commands
CAN resolve domain-owned policy through `spx.config.{toml,json,yaml}`

## Assertions

### Compliance

- ALWAYS: each execution domain registers a descriptor through the static config registry ([review])
- ALWAYS: descriptor validators receive only their own parsed section and cannot read another descriptor section ([review])
- ALWAYS: testing, auditing, and reviewing descriptors import shared primitives for repeated structure instead of duplicating validators ([review])
- NEVER: execution commands parse raw `spx.config.*` content outside the config module and descriptor modules ([review])
