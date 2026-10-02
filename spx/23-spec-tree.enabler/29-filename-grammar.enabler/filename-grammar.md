# Filename Grammar

PROVIDES the single-sourced, versioned Spec-Tree filename grammar — the complete token vocabulary declared once and resolved through the spec-tree config descriptor, the dedicated naming-schema version, and the ordered naming-schema versions from which a methodology declaration selects its valid versions
SO THAT entry recognition, source adapters, config resolution, and the spec-domain grammar-emit surface
CAN resolve and validate the configured vocabulary, and classify and render filenames against one authoritative grammar, without re-declaring tokens or knowing prior naming-schema versions themselves

## Assertions

- Given product configuration whose `specTree` section carries a `kinds` field, whether a list of kind names or a map of kind definitions, when the config resolves, then resolution fails naming `specTree.kinds`
- A methodology declaration maps to its valid naming-schema versions: a `methodology.version` on the 3.2 line maps to the 3.x version, a `methodology.version` on the 4.0 line maps to the 4.0 version, and a 4.0 `methodology.version` with a 3.2 `methodology.migratingFrom` maps to both
- Every node kind maps to its opening keyword: `substrate` to `SUPPLIES`, `capability` to `PROVIDES`, `domain` to `OWNS`, `interface` to `ADAPTS`, `surface` to `EXPOSES`, `enabler` to `PROVIDES`, `outcome` to `WE BELIEVE THAT`, and `variant` to its parent kind's opening keyword

### Scenarios

- Given the spec-tree descriptor is registered with the config module, when `resolveConfig(productDir)` runs with no yaml, then the resolved spec-tree section contains the full default kind list with their definitions ([test](tests/spec-tree-config.scenario.l1.test.ts))

### Mappings

- Every kind key maps to exactly one category value and one suffix through `KIND_REGISTRY` ([test](tests/kind-registry.mapping.l1.test.ts))
- Filtering `KIND_REGISTRY` by category maps to the exported node and decision sub-registries, and their suffix projections match their members ([test](tests/kind-registry-subsets.mapping.l1.test.ts))
- Every Spec-Tree filename grammar token — kind and product suffixes, evidence modes, execution levels, language tails, the runner token, segment and order separators, the order pattern, coordination-note names, eval-lane names, and spec-file suffixes — resolves through the grammar registry surface ([test](tests/filename-grammar.mapping.l1.test.ts))
- Each naming-schema version's spec-file and product-root forms resolve through the grammar registry: the 4.0 version's spec-file form is a node directory's slug followed by the spec document-kind suffix (`{slug}.spec.md`) and its product-root form is `spx/{name}.spec.md`, the `1.0.0` and 3.x versions' spec-file form is that slug with a plain `.md` extension (the bare `{slug}.md` form), and the 3.x version's product-root form is `spx/{name}.product.md` ([test](tests/spec-file-form.mapping.l1.test.ts))

- Derived kind types match derived values: `keyof typeof KIND_REGISTRY` enumerates the finite runtime key set, node and decision kind types partition that set, and entry definitions project from the registry ([test](tests/kind-registry-types.mapping.l1.test.ts))
- Suffix uniqueness holds across the finite registry: no two node kinds share a directory suffix, no two decision kinds share a filename suffix, and no two registered kinds share the same suffix ([test](tests/kind-registry-suffixes.mapping.l1.test.ts))

### Properties

- Naming-schema versions are totally ordered and each carries a self-contained set of accepted filename forms; a methodology declaration selects its valid versions, and a name no valid version accepts is superseded when an earlier version accepts it ([test](tests/naming-schema-versions.property.l1.test.ts))

### Compliance

- Under `spx/23-spec-tree.enabler/21-kind-registry.adr.md`, ALWAYS: `SPEC_TREE_CONFIG.KINDS` is declared as one flat `as const` object literal, `KIND_REGISTRY` projects from it, and every derived kind view comes from that registry ([audit])
- Under `spx/23-spec-tree.enabler/26-filename-grammar.adr.md`, ALWAYS: config descriptors, source adapters, tree assembly, state derivation, and projections receive vocabulary through the versioned grammar or a test-scoped registry fixture ([audit])
- Under `spx/23-spec-tree.enabler/26-filename-grammar.adr.md`, ALWAYS: the dedicated naming-schema version is owned by the grammar registry and exposed through the spec-tree library surface ([test](tests/naming-version.compliance.l1.test.ts))
- NEVER: declare a Spec-Tree filename grammar token in a parallel module-local constant outside the grammar registry surface, per `spx/23-spec-tree.enabler/26-filename-grammar.adr.md` ([audit])
