# Documentation Sync

PROVIDES agent-driven updates to the product's documentation for a release
SO THAT published documentation
CAN reflect the released version's behavior and version references

## Assertions

### Scenarios

- Given computed release data, when documentation sync runs, then version references in the configured documentation set are updated to the released version ([test](tests/documentation-sync.scenario.l1.test.ts))
- The documentation set a release update covers is resolved from configuration, defaulting to the product README ([test](tests/documentation-sync.scenario.l1.test.ts))

### Compliance

- ALWAYS: documentation sync's prompt is assembled only from the release data, so it depends on no spec-tree or domain state ([test](tests/documentation-sync.compliance.l1.test.ts))
- ALWAYS: documentation updates stay faithful to the released behavior and introduce no claim absent from the release's changes ([audit])
