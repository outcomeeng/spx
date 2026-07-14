# Public Spec-Tree Library Surface

`src/lib/spec-tree/index.ts` is the single public TypeScript import boundary for reading, projecting, and selecting from a spec tree; scanner, assembly, recognition, traversal, and reporting modules remain internal. The boundary exports `SpecTreeSource` with `entries()` and optional `readText(ref)`, `SpecTreeOptions` with `source`, optional `registry`, and optional `evidence`, plus `readSpecTree(options): Promise<SpecTreeSnapshot>`, `projectSpecTree(snapshot): SpecTreeProjection`, and `findNextSpecTreeNode(snapshot): SpecTreeNode | null`. The kind registry and spec-tree configuration descriptor remain inside the same library at `src/lib/spec-tree/config.ts` under `spx/23-spec-tree.enabler/21-kind-registry.adr.md`; no parallel `src/spec` library surface exists.

## Rationale

One import boundary lets domain and surface consumers depend on stable tree contracts while the library decomposes recognition, assembly, state derivation, and projection internally. Keeping configuration vocabulary inside the same library prevents command modules and adapters from forming a second source of spec-tree semantics.

## Invariants

- Every public tree operation consumes or returns the exported source, snapshot, node, or projection contracts.
- Internal module extraction preserves the public surface and produces the same snapshot and projection for the same source, registry, and evidence inputs.

## Verification

### Testing

- ALWAYS: the public library surface exports the declared source, options, read, projection, and next-node contracts ([conformance])

### Audit

- ALWAYS: consumers that read, project, or select from a spec tree import through `src/lib/spec-tree/index.ts` ([audit])
- NEVER: command modules parse spec-tree records, node suffixes, decision suffixes, or hierarchy independently of the public library surface ([audit])
- NEVER: tests replace spec-tree dependencies through module interception; explicit source, registry, and evidence inputs preserve the real library boundary ([audit])
