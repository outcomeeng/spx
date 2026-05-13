# Spec CLI Rendering

PROVIDES terminal and machine-readable renderers for spec-tree command output from `SpecTreeProjection` and `SpecTreeSnapshot`
SO THAT `spx/31-spec-domain.enabler/54-spec-cli-commands.enabler/` and automation callers
CAN present current spec-tree state without parsing source records, walking directories, or owning spec-tree vocabulary

## Assertions

### Mappings

- Spec-tree snapshots and projections map to text, table, markdown, and JSON command output with registry labels, node paths, and derived states ([test](tests/spec-cli-rendering.mapping.l1.test.ts))

### Conformance

- JSON output conforms to the stable `SpecTreeProjection` contract consumed by automation callers ([test](tests/spec-cli-rendering.conformance.l1.test.ts))

### Compliance

- NEVER: rendering code parses filesystem paths, node suffixes, decision suffixes, or source records — it consumes `SpecTreeProjection`, `SpecTreeSnapshot`, and registry-owned labels only ([review])
