---
malleability: spec
---

# Spec CLI Rendering

PROVIDES terminal and machine-readable renderers for spec-tree status, navigation, manifest, and document projections
SO THAT `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/` and automation callers
CAN present current spec-tree state and deterministic context without parsing source records, walking directories, or owning spec-tree vocabulary

## Assertions

### Mappings

- Context-list projections render as the versioned human and JSON manifest representations without changing the selected manifest information. ([test](tests/context-rendering.mapping.l1.test.ts))
- Spec-tree status projections map to text, table, markdown, and JSON command output with registry labels, node paths, and derived states ([test](tests/spec-cli-rendering.mapping.l1.test.ts))

### Conformance

- Context-show projections render as ordered `spx-document` and `spx-reference` entries in text, or the equivalent ordered JSON `entries`, without changing selection, metadata, or source content. ([test](tests/context-rendering.conformance.l1.test.ts))
- An empty context-show projection renders as empty text or `{ "entries": [] }`. ([test](tests/context-rendering.conformance.l1.test.ts))
- Status JSON output conforms to the stable `SpecTreeProjection` contract consumed by automation callers ([test](tests/spec-cli-rendering.conformance.l1.test.ts))

### Compliance

- NEVER: rendering code parses filesystem paths, node suffixes, decision suffixes, source records, or snapshots — it consumes library-owned projection values and registry-owned labels only ([audit])
