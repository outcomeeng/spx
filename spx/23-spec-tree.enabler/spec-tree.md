# Spec Tree

PROVIDES a backend-neutral spec-tree library with a single public TypeScript surface for source records, tree snapshots, node state, projections, and next-node selection, plus config-owned kind vocabulary
SO THAT spec commands, spec application, validation, testing, session handoff, and future adapters for filesystem, Linear, GitHub Issues, ORM-backed records, or paper ledgers
CAN consume the product's spec tree through stable contracts without owning traversal, suffix parsing, hierarchy assembly, state derivation, or registry vocabulary themselves

## Assertions

### Scenarios

- Given a `SpecTreeSource` that exposes product, node, decision, and evidence records, when `readSpecTree({ source })` runs, then it returns a `SpecTreeSnapshot` with recognized entries, assembled parent-child relationships, sorted siblings, decisions, and derived node states ([test](tests/spec-tree-surface.scenario.l1.test.ts))

### Conformance

- `src/lib/spec-tree/index.ts` exports the declared source, options, snapshot, node, read, projection, next-node, registry, and grammar contracts ([test](tests/spec-tree-surface.conformance.l1.test.ts))

### Compliance

- ALWAYS: source consumers import spec-tree contracts through `src/lib/spec-tree/index.ts`; internal modules stay behind this boundary ([audit])
- NEVER: parse spec-tree source records, directory suffixes, or decision suffixes inside CLI command modules; commands consume snapshots and projections from the public surface ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or module interception for spec-tree registry or source tests, per `spx/23-spec-tree.enabler/21-kind-registry.adr.md` ([audit])
