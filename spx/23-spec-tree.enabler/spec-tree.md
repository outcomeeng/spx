# Spec Tree

PROVIDES a backend-neutral spec-tree library with a single public TypeScript surface for source records, tree snapshots, node state, projections, and next-node selection, plus config-owned kind vocabulary
SO THAT spec commands, spec application, validation, testing, session handoff, and future adapters for filesystem, Linear, GitHub Issues, ORM-backed records, or paper ledgers
CAN consume the product's spec tree through stable contracts without owning traversal, suffix parsing, hierarchy assembly, state derivation, or registry vocabulary themselves

## Public Surface

The public tree-operations module is `src/spec-tree/index.ts`. The kind registry and spec-tree config descriptor remain in `src/spec/config.ts` per `21-kind-registry.adr.md`.

It exports these contracts:

```ts
export type SpecTreeSource = {
  entries(): AsyncIterable<SpecTreeSourceEntry>;
  readText?(ref: SpecTreeSourceRef): Promise<string>;
};

export type SpecTreeOptions = {
  source: SpecTreeSource;
  registry?: SpecTreeRegistry;
  evidence?: SpecTreeEvidenceProvider;
};

export function readSpecTree(options: SpecTreeOptions): Promise<SpecTreeSnapshot>;
export function projectSpecTree(snapshot: SpecTreeSnapshot): SpecTreeProjection;
export function findNextSpecTreeNode(snapshot: SpecTreeSnapshot): SpecTreeNode | null;
```

## Assertions

### Scenarios

- Given a `SpecTreeSource` that exposes product, node, decision, and evidence records, when `readSpecTree({ source })` runs, then it returns a `SpecTreeSnapshot` with recognized entries, assembled parent-child relationships, sorted siblings, decisions, and derived node states ([test](tests/spec-tree-surface.scenario.l1.test.ts))
- Given the spec-tree descriptor is registered with the config module, when `resolveConfig(projectRoot)` runs with no yaml, then the resolved spec-tree section contains the full default kind list with their definitions ([test](tests/spec-tree-config.scenario.l1.test.ts))
- Given `spx.config.yaml` selects a subset of kinds, when the spec-tree descriptor validates the yaml, then the resolved section contains only the selected kinds and an error names any kind absent from the registry ([test](tests/spec-tree-config.scenario.l1.test.ts))

### Mappings

- Every kind key maps to exactly one category value and one suffix through `KIND_REGISTRY` ([test](tests/kind-registry.mapping.l1.test.ts))
- Filtering `KIND_REGISTRY` by category maps to the exported node and decision sub-registries, and their suffix projections match their members ([test](tests/kind-registry-subsets.mapping.l1.test.ts))

### Properties

- Derived kind types match derived values: `keyof typeof KIND_REGISTRY` enumerates the runtime keys, node and decision kind types partition that set, and entry definitions project from the registry ([test](tests/kind-registry-types.property.l1.test.ts))
- Suffix uniqueness holds across the registry: no two node kinds share a directory suffix, no two decision kinds share a filename suffix, and no two registered kinds share the same suffix ([test](tests/kind-registry-suffixes.property.l1.test.ts))

### Compliance

- ALWAYS: `src/spec-tree/index.ts` is the import boundary for consumers that read, project, or select from a spec tree; scanner, tree, and reporter internals stay behind this boundary ([test](tests/spec-tree-surface.scenario.l1.test.ts))
- ALWAYS: `SPEC_TREE_CONFIG.KINDS` is declared as one flat `as const` object literal, `KIND_REGISTRY` projects from it, and every derived kind view comes from that registry ([test](tests/kind-registry-single-source.compliance.l1.test.ts), [review](21-kind-registry.adr.md))
- ALWAYS: config descriptors, source adapters, tree assembly, state derivation, and projections receive vocabulary through the semantic registry or a test-scoped registry fixture ([review](21-kind-registry.adr.md))
- NEVER: declare spec-tree kind, category, suffix, label, or alias strings in parallel module-local constants outside the registry surface ([review](21-kind-registry.adr.md))
- NEVER: parse spec-tree source records, directory suffixes, or decision suffixes inside CLI command modules; commands consume snapshots and projections from the public surface ([review])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or module interception for spec-tree registry or source tests; tests use explicit source fixtures and registry fixtures ([review](21-kind-registry.adr.md))
