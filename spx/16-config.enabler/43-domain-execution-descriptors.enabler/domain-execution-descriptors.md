# Domain Execution Descriptors

PROVIDES registered config descriptors for deterministic execution domains
SO THAT testing, validation, and additional execution commands
CAN resolve domain-owned policy through `spx.config.{toml,json,yaml}`

## Assertions

### Mappings

- Testing descriptor config format mapping: equivalent JSON, YAML, and TOML testing sections resolve to identical typed testing config ([test](tests/testing-descriptor.mapping.l1.test.ts))

### Compliance

- ALWAYS: each execution domain registers a descriptor through the static config registry ([review])
- ALWAYS: the testing execution descriptor is registered through the static config registry ([test](tests/testing-descriptor.compliance.l1.test.ts), [review])
- ALWAYS: descriptor validators receive only their own parsed section and cannot read another descriptor section ([test](tests/testing-descriptor.compliance.l1.test.ts), [review])
- ALWAYS: domain execution descriptor validators ignore unknown keys in their own parsed section unless the descriptor declares a stricter field policy ([test](tests/testing-descriptor.compliance.l1.test.ts), [review])
- ALWAYS: execution descriptors import shared primitives for repeated structure instead of duplicating validators ([review])
- ALWAYS: the testing execution descriptor imports the shared path-filter primitive instead of duplicating path-filter validation ([test](tests/testing-descriptor.compliance.l1.test.ts), [review])
- NEVER: execution commands parse raw `spx.config.*` content outside the config module and descriptor modules ([review])
