# Spec Tree Source

PROVIDES filesystem-backed and in-memory source adapters that emit backend-neutral spec-tree source entries — recognized entries for valid and superseded names, and a retained residual of names classified invalid, each classified against the naming-schema versions the product's methodology declaration selects
SO THAT spec-tree assembly, traversal, state derivation, projections, and spec-domain commands
CAN consume product, node, decision, and evidence records, plus a complete account of every name beneath the tree, without parsing the filesystem themselves

## Assertions

- ALWAYS: the filesystem source created for a product directory classifies every name against the naming-schema versions that directory's resolved methodology declaration selects, so no reader of a product tree constructs that selection itself

### Mappings

- Product files, node directories, decision files, and co-located test evidence files under `spx/` map to source entry ids, refs, parent ids, and linked evidence status relative to the supplied product root ([test](tests/spec-tree-source.mapping.l1.test.ts))
- Under a methodology declaration, every node suffix that a naming-schema version ordered before the declared target's accepts and no selected version accepts maps to a superseded entry carrying the newest such version ([test](tests/residual-retention.mapping.l1.test.ts))

### Properties

- For every generated valid product tree, filesystem-shaped and in-memory source records project to equivalent recognized spec-tree entries ([test](tests/spec-tree-source.property.l1.test.ts))
- Every generated ordered filesystem name the recognizer classifies as neither valid nor superseded is retained as an invalid entry rather than dropped ([test](tests/residual-retention.property.l1.test.ts))
- For every injected naming-schema set and selection under which a registered suffix is accepted only by a version ordered before the declared target's, the filesystem source emits the generated ordered name as superseded with that version ([test](tests/residual-retention.property.l1.test.ts))
- No generated registered descendant below an ordered directory that classifies superseded or invalid is emitted as a recognized node ([test](tests/spec-tree-source.property.l1.test.ts))

### Compliance

- ALWAYS: source adapters receive vocabulary through the versioned grammar, including node suffixes, decision suffixes, and evidence-naming forms ([test](tests/spec-tree-source.mapping.l1.test.ts))
