# Spec Tree Source

PROVIDES filesystem-backed and in-memory source adapters that emit backend-neutral spec-tree source entries — recognized entries for valid and superseded names, and a retained residual of names matching no naming-schema version
SO THAT spec-tree assembly, traversal, state derivation, projections, and spec-domain commands
CAN consume product, node, decision, and evidence records, plus a complete account of every name beneath the tree, without parsing the filesystem themselves

## Assertions

### Mappings

- Product files, node directories, decision files, and co-located test evidence files under `spx/` map to source entry ids, refs, parent ids, and linked evidence status relative to the supplied product root ([test](tests/spec-tree-source.mapping.l1.test.ts))
- Every suffix in the complete source-owned prior-version node-suffix set maps to a superseded entry carrying the newest prior naming-schema version that accepts it ([test](tests/residual-retention.mapping.l1.test.ts))

### Properties

- For every generated valid product tree, filesystem-shaped and in-memory source records project to equivalent recognized spec-tree entries ([test](tests/spec-tree-source.property.l1.test.ts))
- Every generated ordered filesystem name the recognizer classifies as neither valid nor superseded is retained as an invalid entry rather than dropped ([test](tests/residual-retention.property.l1.test.ts))
- For every injected naming-schema set that demotes a registry-live suffix to a prior version, the filesystem source emits the generated ordered name as superseded with that prior version ([test](tests/residual-retention.property.l1.test.ts))
- No generated registered descendant below an ordered directory whose suffix belongs to no naming-schema version is emitted as a recognized node ([test](tests/spec-tree-source.property.l1.test.ts))

### Compliance

- ALWAYS: source adapters receive vocabulary through the versioned grammar, including node suffixes, decision suffixes, and evidence-naming forms ([test](tests/spec-tree-source.mapping.l1.test.ts))
