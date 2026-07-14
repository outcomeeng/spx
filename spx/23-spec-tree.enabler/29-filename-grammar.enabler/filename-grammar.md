# Filename Grammar

PROVIDES the single-sourced, versioned Spec-Tree filename grammar — the complete token vocabulary declared once and resolved through the spec-tree config descriptor, the dedicated naming-schema version, and the ordered set of prior-version schemas
SO THAT entry recognition, source adapters, config resolution, and the spec-domain grammar-emit surface
CAN resolve and validate the configured vocabulary, and classify and render filenames against one authoritative grammar, without re-declaring tokens or knowing prior naming-schema versions themselves

## Assertions

### Scenarios

- Given the spec-tree descriptor is registered with the config module, when `resolveConfig(productDir)` runs with no yaml, then the resolved spec-tree section contains the full default kind list with their definitions ([test](tests/spec-tree-config.scenario.l1.test.ts))
- Given `spx.config.yaml` selects a subset of kinds, when the spec-tree descriptor validates the yaml, then the resolved section contains only the selected kinds and an error names any kind absent from the registry ([test](tests/spec-tree-config.scenario.l1.test.ts))

### Mappings

- Every kind key maps to exactly one category value and one suffix through `KIND_REGISTRY` ([test](tests/kind-registry.mapping.l1.test.ts))
- Filtering `KIND_REGISTRY` by category maps to the exported node and decision sub-registries, and their suffix projections match their members ([test](tests/kind-registry-subsets.mapping.l1.test.ts))
- Every Spec-Tree filename grammar token — kind and product suffixes, evidence modes, execution levels, language tails, the runner token, segment and order separators, the order pattern, coordination-note names, eval-lane names, and spec-file suffixes — resolves through the grammar registry surface ([test](tests/filename-grammar.mapping.l1.test.ts))
- Each naming-schema version's spec-file form resolves through the grammar registry: the canonical version's is a node directory's slug followed by the spec document-kind suffix, and a prior version's is that slug with a plain `.md` extension (the bare `{slug}.md` form) ([test](tests/spec-file-form.mapping.l1.test.ts))

- Derived kind types match derived values: `keyof typeof KIND_REGISTRY` enumerates the finite runtime key set, node and decision kind types partition that set, and entry definitions project from the registry ([test](tests/kind-registry-types.mapping.l1.test.ts))
- Suffix uniqueness holds across the finite registry: no two node kinds share a directory suffix, no two decision kinds share a filename suffix, and no two registered kinds share the same suffix ([test](tests/kind-registry-suffixes.mapping.l1.test.ts))

### Properties

- Naming-schema versions are totally ordered and the highest is canonical; each version carries a self-contained set of accepted filename forms ([test](tests/naming-schema-versions.property.l1.test.ts))

### Compliance

- Under `spx/23-spec-tree.enabler/21-kind-registry.adr.md`, ALWAYS: `SPEC_TREE_CONFIG.KINDS` is declared as one flat `as const` object literal, `KIND_REGISTRY` projects from it, and every derived kind view comes from that registry ([audit])
- Under `spx/23-spec-tree.enabler/26-filename-grammar.adr.md`, ALWAYS: config descriptors, source adapters, tree assembly, state derivation, and projections receive vocabulary through the versioned grammar or a test-scoped registry fixture ([audit])
- Under `spx/23-spec-tree.enabler/26-filename-grammar.adr.md`, ALWAYS: the dedicated naming-schema version is owned by the grammar registry and exposed through the spec-tree library surface ([test](tests/naming-version.compliance.l1.test.ts))
- NEVER: declare a Spec-Tree filename grammar token in a parallel module-local constant outside the grammar registry surface, per `spx/23-spec-tree.enabler/26-filename-grammar.adr.md` ([audit])
