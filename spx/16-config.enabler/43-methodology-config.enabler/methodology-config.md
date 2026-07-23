# Methodology Config

PROVIDES the top-level `methodology` config descriptor carrying methodology source and version intent
SO THAT config consumers, diagnose checks, and spec-context ingestion
CAN read methodology selection through the static config registry without depending on harness-environment configuration

## Assertions

### Scenarios

- Given no product config exists, when config resolves through the production registry, then the resolved config includes top-level `methodology` defaults with source `outcomeeng/spec-tree` and the bootstrap-only version sentinel `installed` ([test](tests/methodology-config.scenario.l1.test.ts))
- Given a product config declares top-level `methodology.source` and `methodology.version`, when config resolves, then the resolved methodology section carries those values ([test](tests/methodology-config.scenario.l1.test.ts))

### Mappings

- `spx.config.json`, `spx.config.yaml`, and `spx.config.toml` produce equivalent resolved methodology config when they declare the same top-level methodology shape ([test](tests/methodology-config.mapping.l1.test.ts))

### Compliance

- ALWAYS: the methodology descriptor rejects malformed source and version fields before any consumer resolves methodology context ([test](tests/methodology-config.compliance.l1.test.ts))
- NEVER: the methodology descriptor represents `installed` as an exact methodology version; it preserves that value as bootstrap intent so product-context consumers can reject it as durable identity when a tracked `spx/` tree exists ([test](tests/methodology-config.compliance.l1.test.ts))
- ALWAYS: `methodology.source` rejects traversal and absolute-path shapes before any consumer builds a filesystem path from it ([test](tests/methodology-config.compliance.l1.test.ts))
- ALWAYS: `harnessEnvironment.methodology` is rejected as an unknown `harnessEnvironment` field rather than treated as methodology intent ([test](tests/methodology-config.compliance.l1.test.ts))
- NEVER: methodology source or version defaults are declared by the harness-environment descriptor ([test](../../33-harness-environment.enabler/tests/harness-environment-descriptor.compliance.l1.test.ts))
