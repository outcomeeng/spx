# Spec Tree Shape

PROVIDES the single, typed registry of spec-tree kind vocabulary — node kinds (`enabler`, `outcome`, ...), decision kinds (`adr`, `pdr`, ...), their categories and directory/filename suffixes, and a spec-tree config descriptor that exposes the active vocabulary through `16-config.enabler/`
SO THAT every consumer that needs to parse, walk, author, or validate the spec tree (naming, ledger, states, commands, validation, testing, session)
CAN read kind identifiers, category assignments, and suffixes from one authoritative source rather than redeclaring them

## Assertions

### Scenarios

- Given the registry is imported, when consumer code reads `KIND_REGISTRY.enabler`, then the returned definition exposes `category: "node"` and the matching directory suffix ([test](tests/registry.unit.test.ts))
- Given a consumer filters the registry by category, when it requests the node subset, then it receives exactly the entries whose `category` field equals `"node"` and nothing else ([test](tests/derived-sub-registries.unit.test.ts))
- Given a consumer filters the registry by category, when it requests the decision subset, then it receives exactly the entries whose `category` field equals `"decision"` and nothing else ([test](tests/derived-sub-registries.unit.test.ts))
- Given the spec-tree descriptor is registered with the config module, when `resolveConfig(projectRoot)` runs with no yaml, then the resolved spec-tree section contains the full default kind list with their definitions ([test](tests/descriptor.integration.test.ts))
- Given `spx.config.yaml` selects a subset of kinds, when the spec-tree descriptor validates the yaml, then the resolved section contains only the selected kinds and an error names any kind not present in the registry ([test](tests/descriptor.integration.test.ts))

### Mappings

- Each node kind maps to exactly one directory suffix: the registry's suffix field ([test](tests/registry.unit.test.ts))
- Each decision kind maps to exactly one filename suffix: the registry's suffix field ([test](tests/registry.unit.test.ts))
- Every kind key maps to exactly one category value drawn from the registry's category union ([test](tests/registry.unit.test.ts))

### Properties

- The registry is the single declaration site: adding or removing a kind requires a change in exactly one object literal, and all derived sub-registries (by category, by suffix) reflect the change automatically ([test](tests/single-source.unit.test.ts))
- Derived types match derived values: `keyof typeof KIND_REGISTRY` enumerates exactly the set of runtime keys, and every filter-by-category predicate produces a type whose members are a subset of that key set ([test](tests/types-match-values.unit.test.ts))
- Suffix uniqueness holds within each category: no two node kinds share a directory suffix; no two decision kinds share a filename suffix ([test](tests/suffix-uniqueness.unit.test.ts))

### Compliance

- ALWAYS: the kind registry is a flat object literal declared with `as const` in a single module — `keyof typeof` drives the `Kind` type; no separate union-type declaration appears anywhere in the codebase ([test](tests/single-source.unit.test.ts))
- ALWAYS: consumers that need vocabulary (suffixes, kind names, categories) import from this enabler's module — `NODE_SUFFIXES`, `DECISION_SUFFIXES`, and similar consumer constants are derived here or re-exported from here ([review](21-kind-registry.adr.md))
- NEVER: declare a kind string literal (`"enabler"`, `"outcome"`, `"adr"`, `"pdr"`, or any other kind) as a type-union member or as a bare string in any module other than the registry source ([review](21-kind-registry.adr.md))
- NEVER: duplicate the registry's structural information (suffixes, categories) in parallel code constants — consumers that need filtered views derive them at the call site or import from this enabler ([review](21-kind-registry.adr.md))
- NEVER: `vi.mock()`, `jest.mock()`, or any test-double mechanism for the registry — tests construct test-scoped registry fixtures by declaring their own `as const` object and passing it explicitly; the production registry is never intercepted ([review](21-kind-registry.adr.md))
