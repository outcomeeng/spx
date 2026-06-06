# Spec Tree

PROVIDES a backend-neutral spec-tree library with a single public TypeScript surface for source records, tree snapshots, node state, projections, and next-node selection, plus config-owned kind vocabulary
SO THAT spec commands, spec application, validation, testing, session handoff, and future adapters for filesystem, Linear, GitHub Issues, ORM-backed records, or paper ledgers
CAN consume the product's spec tree through stable contracts without owning traversal, suffix parsing, hierarchy assembly, state derivation, or registry vocabulary themselves

## Public Surface

The public tree-operations module is `src/lib/spec-tree/index.ts`. The kind registry and spec-tree config descriptor live inside the same library at `src/lib/spec-tree/config.ts` per `21-kind-registry.adr.md`; there is no separate `src/spec` directory for spec-tree behavior.

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

### Compliance

- ALWAYS: `src/lib/spec-tree/index.ts` is the import boundary for consumers that read, project, or select from a spec tree; scanner, tree, and reporter internals stay behind this boundary ([test](tests/spec-tree-surface.scenario.l1.test.ts))
- NEVER: parse spec-tree source records, directory suffixes, or decision suffixes inside CLI command modules; commands consume snapshots and projections from the public surface ([review])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or module interception for spec-tree registry or source tests; tests use explicit source fixtures and registry fixtures ([review](21-kind-registry.adr.md))
