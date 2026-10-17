# Filename Grammar

PROVIDES the single-sourced, versioned Spec-Tree filename grammar — the complete token vocabulary declared once, with kind vocabulary resolved only through `KIND_REGISTRY`, the dedicated naming-schema version, and the ordered naming-schema versions from which a methodology declaration selects its valid versions
SO THAT entry recognition, source adapters, config resolution, and the spec-domain grammar-emit surface
CAN resolve and validate the configured vocabulary, and classify and render filenames against one authoritative grammar, without re-declaring tokens or knowing prior naming-schema versions themselves

## Assertions

### Scenarios

- Given the spec-tree descriptor is registered with the config module, when `resolveConfig(productDir)` runs with no yaml, then the resolved spec-tree section carries no `kinds` field ([test](tests/spec-tree-config.scenario.l1.test.ts))
- Given product configuration whose `specTree` section carries a `kinds` field, whether a list of kind names or a map of kind definitions, when the config resolves, then resolution fails naming `specTree.kinds` ([test](tests/spec-tree-config.scenario.l1.test.ts))

### Mappings

- Both the 4.0 and the 3.x naming-schema version accept, under a node's `tests/` directory, an evidence file named `{subject}.{evidence}.{level}`, then an optional runner token, then a language tail, each segment separated by `.`: `{evidence}` is `scenario`, `mapping`, `conformance`, `property`, or `compliance`, `{level}` is `l1`, `l2`, or `l3`, the runner token is `vitest`, `playwright`, or `subprocess`, and the language tail is `test.ts` for TypeScript, `py` for Python, and `rs` for Rust ([test](tests/filename-grammar.mapping.l1.test.ts))
- Both the 4.0 and the 3.x naming-schema version accept, under a node's `evals/{rule-slug}/` directory, the files `eval.toml`, `cases.jsonl`, `prompt.md`, `prompt.template.md`, and `history.jsonl`, and a `runs/` directory ([test](tests/filename-grammar.mapping.l1.test.ts))
- The first naming-schema version accepts `.capability`, `.feature`, and `.story` node directories ([test](tests/filename-grammar.mapping.l1.test.ts))
- Every kind key maps to exactly one category value and one suffix through `KIND_REGISTRY` ([test](tests/kind-registry.mapping.l1.test.ts))
- Filtering `KIND_REGISTRY` by category maps to the exported node and decision sub-registries, and their suffix projections match their members ([test](tests/kind-registry-subsets.mapping.l1.test.ts))
- Every Spec-Tree filename grammar token — kind and product suffixes, evidence modes, execution levels, language tails, the runner token, segment and order separators, the order pattern, coordination-note names, eval-lane names, and spec-file suffixes — resolves through the grammar registry surface ([test](tests/filename-grammar.mapping.l1.test.ts))
- A methodology declaration maps to its valid naming-schema versions: a `methodology.version` on the 3.2 line maps to the 3.x version, a `methodology.version` on the 4.0 line maps to the 4.0 version, and a 4.0 `methodology.version` with a 3.2 `methodology.migratingFrom` maps to both ([test](tests/declaration-selection.mapping.l1.test.ts))
- A `variant` resolves to the opening keyword of its parent kind, for every kind that can parent a `variant` ([test](tests/kind-opening.mapping.l1.test.ts))
- The 4.0 naming-schema version accepts node directories of the `.product`, `.substrate`, `.capability`, `.domain`, `.interface`, `.surface`, and `.variant` kinds, each holding `{slug}.spec.md`; a root `{name}.spec.md` directly under `spx/`; and `ISSUES.md` as the only node-local note ([test](tests/spec-file-form.mapping.l1.test.ts))
- The 3.x naming-schema version accepts `.enabler` and `.outcome` node directories, each holding `{slug}.md`; a root `{name}.product.md` directly under `spx/`; and `PLAN.md` and `ISSUES.md` as node-local notes ([test](tests/spec-file-form.mapping.l1.test.ts))
- Both the 4.0 and the 3.x naming-schema version accept the decision forms `{index}-{slug}.adr.md` and `{index}-{slug}.pdr.md` and the same test-file orderings ([test](tests/spec-file-form.mapping.l1.test.ts))
- Every 4.0 output kind admits as children its own kind, every output kind that precedes it in the order `substrate`, `capability`, `domain`, `interface`, `surface`, and the `variant` kind; a `variant` admits its parent kind's set less `variant`; and `product` admits the five output kinds and `product` ([test](tests/kind-containment.mapping.l1.test.ts))
- Derived kind types match derived values: `keyof typeof KIND_REGISTRY` enumerates the finite runtime key set, and the node, output, and decision kinds partition that set ([test](tests/kind-registry-types.mapping.l1.test.ts))
- Suffix uniqueness holds across the finite registry: no two node kinds share a directory suffix, no two decision kinds share a filename suffix, and no two registered kinds share the same suffix ([test](tests/kind-registry-suffixes.mapping.l1.test.ts))

### Properties

- The 4.0 naming-schema version accepts every index that is a two-digit integer from `10` to `99` followed by zero or more two-digit fractional segments, and rejects every other index ([test](tests/index-form.property.l1.test.ts))
- The 3.x naming-schema version accepts every index that is a dot-separated run of digits, and rejects every other index ([test](tests/index-form.property.l1.test.ts))
- Naming-schema versions are totally ordered and each carries a self-contained set of accepted filename forms; a methodology declaration selects its valid versions, and a name no valid version accepts is superseded when an earlier version accepts it ([test](tests/naming-schema-versions.property.l1.test.ts))

### Compliance

- ALWAYS: each node kind opens with the keyword `KIND_REGISTRY` declares for it: `substrate` with `SUPPLIES`, `capability` with `PROVIDES`, `domain` with `OWNS`, `interface` with `ADAPTS`, `surface` with `EXPOSES`, `enabler` with `PROVIDES`, and `outcome` with `WE BELIEVE THAT` ([audit])
- ALWAYS: the 3.x node kinds admit the child kinds `KIND_REGISTRY` declares for them: `enabler` admits `enabler`, and `outcome` admits `enabler` and `outcome` ([audit])
- Under [spx/23-spec-tree.enabler/21-kind-registry.adr.md](spx/23-spec-tree.enabler/21-kind-registry.adr.md), ALWAYS: `SPEC_TREE_CONFIG.KINDS` is declared as one flat `as const` object literal, `KIND_REGISTRY` projects from it, and every derived kind view comes from that registry ([audit])
- Under [spx/23-spec-tree.enabler/26-filename-grammar.adr.md](spx/23-spec-tree.enabler/26-filename-grammar.adr.md), ALWAYS: config descriptors, source adapters, tree assembly, state derivation, and projections receive vocabulary through the versioned grammar or a test-scoped registry fixture ([audit])
- Under [spx/23-spec-tree.enabler/26-filename-grammar.adr.md](spx/23-spec-tree.enabler/26-filename-grammar.adr.md), ALWAYS: the dedicated naming-schema version is owned by the grammar registry and exposed through the spec-tree library surface ([audit])
- NEVER: declare a Spec-Tree filename grammar token in a parallel module-local constant outside the grammar registry surface, per [spx/23-spec-tree.enabler/26-filename-grammar.adr.md](spx/23-spec-tree.enabler/26-filename-grammar.adr.md) ([audit])
