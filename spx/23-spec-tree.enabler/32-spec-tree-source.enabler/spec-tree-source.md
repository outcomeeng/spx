# Spec Tree Source

PROVIDES filesystem-backed and in-memory source adapters that emit backend-neutral spec-tree source entries — recognized entries for valid and superseded names, and a retained residual of names matching no naming-schema version
SO THAT spec-tree assembly, traversal, state derivation, projections, and spec-domain commands
CAN consume product, node, decision, and evidence records, plus a complete account of every name beneath the tree, without parsing the filesystem themselves

## Assertions

### Mappings

- Filesystem-shaped source records and in-memory source records that describe the same product tree map to equivalent recognized spec-tree entries ([test](tests/spec-tree-source.mapping.l1.test.ts))
- Product files, node directories, decision files, and co-located test evidence files under `spx/` map to source entry ids, refs, parent ids, and linked evidence status relative to the supplied product root ([test](tests/spec-tree-source.mapping.l1.test.ts))

### Mappings — non-canonical name handling

- Every filesystem name the recognizer classifies as neither valid nor superseded is retained as an invalid entry rather than dropped ([test](tests/residual-retention.mapping.l1.test.ts))
- A name the recognizer classifies as superseded is emitted as a superseded entry carrying the naming-schema version it matched ([test](tests/residual-retention.mapping.l1.test.ts))

### Compliance

- ALWAYS: source adapters receive vocabulary through the versioned grammar, including node suffixes, decision suffixes, and evidence-naming forms ([test](tests/spec-tree-source.mapping.l1.test.ts))
- NEVER: source adapters emit a recognized node or decision entry for a name absent from the canonical naming-schema version, including registered descendants below an unregistered ordered node directory ([test](tests/spec-tree-source.mapping.l1.test.ts))
