---
malleability: spec
---

# Spec Tree

PROVIDES a backend-neutral spec-tree library with a single public TypeScript surface for source records, tree snapshots, node state, projections, next-node selection, and product-path ownership resolution, plus config-owned kind vocabulary
SO THAT spec commands, spec application, validation, testing, release context selection, session handoff, and adapters for filesystem, Linear, GitHub Issues, ORM-backed records, or paper ledgers
CAN consume the product's spec tree through stable contracts without owning traversal, suffix parsing, hierarchy assembly, state derivation, ownership reduction, or registry vocabulary themselves

## Assertions

- Given a product directory whose methodology declaration's `methodology.version` is on the 4.0 line, when `readSpecTree` reads the source `createFilesystemSpecTreeSource({ productDir })` creates for that directory, then a root `{name}.spec.md` whose front matter declares `kind: product` and `{index}-{slug}{suffix}/` node directories of the `.product`, `.substrate`, `.capability`, `.domain`, `.interface`, `.surface`, and `.variant` kinds, each holding `{slug}.spec.md`, are valid entries, and `.enabler` and `.outcome` node directories classify superseded
- Given a product directory whose methodology declaration's `methodology.version` is on the 3.2 line, when `readSpecTree` reads the source `createFilesystemSpecTreeSource({ productDir })` creates for that directory, then a root `{slug}.product.md` and `.enabler` and `.outcome` node directories, each holding `{slug}.md`, are valid entries, and node directories whose suffix only the 4.0 grammar accepts classify invalid
- Given a product directory whose methodology declaration's `methodology.version` is on the 4.0 line and whose `methodology.migratingFrom` is on the 3.2 line, when `readSpecTree` reads the source `createFilesystemSpecTreeSource({ productDir })` creates for that directory, then every name either grammar accepts is a valid entry of the one assembled tree
- Given a product directory whose `methodology.version` or `methodology.migratingFrom` is on a line other than 3.0, 3.1, 3.2, and 4.0, such as `3.3.0`, when `readSpecTree` reads the source `createFilesystemSpecTreeSource({ productDir })` creates for that directory, then the read fails naming the declared version and the methodology lines spx reads
- Given a tree holding more than one root product spec, or a 4.0 root spec whose front matter does not declare `kind: product`, when `readSpecTree` runs, then the read fails naming each offending file

### Scenarios

- Given a `SpecTreeSource` that exposes product, node, decision, and evidence records, when `readSpecTree({ source })` runs, then it returns a `SpecTreeSnapshot` with recognized entries, assembled parent-child relationships, sorted siblings, decisions, and derived node states ([test](tests/spec-tree-surface.scenario.l1.test.ts))

### Conformance

- `src/lib/spec-tree/index.ts` exports the declared source, options, snapshot, node, read, projection, next-node, ownership, registry, and grammar contracts ([test](tests/spec-tree-surface.conformance.l1.test.ts))

### Properties

- Ownership resolution returns the ordinally deduplicated candidate nodes and their lowest common ancestor as governing owner for every product path and set of claimed node identities, using the product root when candidates span top-level branches and an unresolved result when no candidate exists; source backend, duplicate claims, and claim order do not change the result ([test](tests/spec-tree-ownership.property.l1.test.ts))

### Compliance

- ALWAYS: source consumers import spec-tree contracts through `src/lib/spec-tree/index.ts`; internal modules stay behind this boundary ([audit])
- NEVER: parse spec-tree source records, directory suffixes, or decision suffixes inside CLI command modules; commands consume snapshots and projections from the public surface ([audit])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or module interception for spec-tree registry or source tests, per `spx/23-spec-tree.enabler/15-public-library-surface.adr.md` and `spx/23-spec-tree.enabler/21-kind-registry.adr.md` ([audit])
