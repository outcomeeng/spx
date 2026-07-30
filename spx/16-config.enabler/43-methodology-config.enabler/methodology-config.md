---
tier: prototype
---

# Methodology Config

PROVIDES the top-level `methodology` config descriptor carrying the methodology repository, the methodology version the product targets, and the version it migrates from
SO THAT config consumers, diagnose checks, and spec-context ingestion
CAN read methodology selection through the static config registry without depending on harness-environment configuration

## Assertions

### Scenarios

- Given a product config declares top-level `methodology.source`, `methodology.version`, and `methodology.migratingFrom`, when config resolves, then the resolved methodology section carries all three values
- Given a product config declares `methodology.version` without `methodology.migratingFrom`, when config resolves, then the resolved methodology section carries no migration source and the product runs one methodology version

### Mappings

- `spx.config.json`, `spx.config.yaml`, and `spx.config.toml` produce equivalent resolved methodology config when they declare the same top-level methodology shape

### Compliance

- ALWAYS: the methodology descriptor rejects malformed source, version, and migration-source fields before any consumer resolves methodology context
- ALWAYS: `methodology.source` names the repository the methodology is published from as an `owner/repository` identifier, distinct from the marketplace and plugin coordinates that address capability packages
- ALWAYS: `methodology.version` and `methodology.migratingFrom` name methodology versions; no consumer derives a plugin version, package version, or filesystem install location from either field
- ALWAYS: `harnessEnvironment.methodology` is rejected as an unknown `harnessEnvironment` field rather than treated as methodology intent
- NEVER: methodology source or version defaults are declared by the harness-environment descriptor
- NEVER: the methodology descriptor carries a location field naming where methodology resources are installed; the committed methodology tree is addressed by declared methodology version and coding agent.
