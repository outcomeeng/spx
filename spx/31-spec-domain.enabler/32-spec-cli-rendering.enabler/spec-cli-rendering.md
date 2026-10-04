---
malleability: spec
---

# Spec CLI Rendering

PROVIDES terminal and machine-readable renderers for spec-tree status, navigation, manifest, and document projections
SO THAT `spx spec` commands and automation callers
CAN present spec-tree state and deterministic context without parsing source records, walking directories, or owning spec-tree vocabulary

## Assertions

### Scenarios

- Given an empty context-show projection, when it renders, then the text output is empty and the JSON output is `{ "entries": [] }` ([test](tests/context-rendering.scenario.l1.test.ts))

### Mappings

- Spec-tree status projections map to text, table, markdown, and JSON command output with registry labels, node paths, and derived states ([test](tests/spec-cli-rendering.mapping.l1.test.ts))

### Conformance

- Status JSON output conforms to the stable `SpecTreeProjection` contract consumed by automation callers ([test](tests/spec-cli-rendering.conformance.l1.test.ts))

### Properties

- Context-show projections render as ordered `spx-document` and `spx-reference` entries in text, or the equivalent ordered JSON `entries`, without changing selection, metadata, or source content ([test](tests/context-rendering.property.l1.test.ts))
- Context-list projections render as the versioned human and JSON manifest representations without changing the selected manifest information ([test](tests/context-rendering.property.l1.test.ts))

### Compliance

- NEVER: rendering code parses filesystem paths, node suffixes, decision suffixes, source records, or snapshots — it consumes library-owned projection values and registry-owned labels only ([audit])
