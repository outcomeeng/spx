# Documentation Sync

PROVIDES agent-driven updates to the product's documentation for a release
SO THAT published documentation
CAN reflect the released version's behavior and product release-version references

## Assertions

### Scenarios

- Given computed release data, when `spx release docs sync` runs, then references to the previous product release version in the configured documentation set are updated to the released version ([test](tests/documentation-sync.scenario.l1.test.ts))

### Mappings

- The documentation set a release update covers maps from configuration: the configured paths when set, the product README by default ([test](tests/documentation-sync.mapping.l1.test.ts))

### Properties

- Configuration resolution preserves every generated non-empty documentation path set in declared order and rejects every generated duplicate-bearing set, including paths that alias across platform separators ([test](tests/documentation-sync.property.l1.test.ts))
- Structural version validation preserves every generated semantic version other than the exact standalone previous product release-version token identified by the release data, including exact release values embedded in larger non-whitespace tokens and first releases whose release data identifies no previous version ([test](tests/documentation-sync.property.l1.test.ts))

### Compliance

- ALWAYS: documentation sync's prompt is assembled only from the release data and the resolved documentation set, so it depends on no spec-tree or domain state ([test](tests/documentation-sync.compliance.l1.test.ts))
- ALWAYS: documentation updates stay faithful to the released behavior and introduce no claim absent from the release's changes ([audit])
