# Spec Tree Source

PROVIDES filesystem-backed and in-memory source adapters that emit backend-neutral spec-tree source entries
SO THAT spec-tree assembly, traversal, state derivation, projections, and spec-domain commands
CAN consume product, node, decision, and evidence records without parsing the filesystem themselves

## Assertions

### Mappings

- Filesystem-shaped source records and in-memory source records that describe the same product tree map to equivalent recognized spec-tree entries ([test](tests/spec-tree-source.mapping.l1.test.ts))
- Product files, node directories, and decision files under `spx/` map to source entry ids and refs relative to the supplied project root ([test](tests/spec-tree-source.mapping.l1.test.ts))

### Compliance

- ALWAYS: source adapters receive vocabulary through the semantic registry, including node suffixes and decision suffixes ([test](tests/spec-tree-source.mapping.l1.test.ts))
- NEVER: source adapters emit entries for unregistered node or decision suffixes ([test](../43-entry-recognition.enabler/tests/entry-recognition.mapping.l1.test.ts))
