# Spec Tree Assembly

PROVIDES backend-neutral assembly of source entries into a parent-child spec-tree snapshot whose every parent kind admits its children's kinds, carrying the superseded entries and the invalid residual alongside the assembled valid tree
SO THAT traversal, state derivation, projection, and CLI consumers
CAN read one ordered tree with attached decisions and stable node relationships, plus one account of every superseded or invalid name beneath the tree

## Assertions

### Scenarios

- Given a product declaring methodology 4.0 whose tree holds two node directories whose parents' kinds do not admit their kinds, when `readSpecTree` runs, then the read fails naming each such child's path and kind with its parent's path and kind ([test](tests/kind-containment.scenario.l1.test.ts))

### Mappings

- Every pair of a parent kind and a child kind that one naming-schema version accepts maps to an assembled parent-child relationship when the kind registry's admitted children of the parent kind include the child kind, and to a read failure naming both otherwise; a `.variant` parent admits what its own parent's kind admits, less `.variant` ([test](tests/kind-containment.mapping.l1.test.ts))

### Properties

- Parent-child assembly preserves dependency ordering: lower-index siblings precede higher-index siblings, same-index siblings remain independent, and every child keeps exactly one parent within the snapshot ([test](tests/spec-tree-assembly.property.l1.test.ts))

### Compliance

- ALWAYS: the snapshot carries every superseded entry and the invalid residual, distinct from the assembled valid tree, so a single read accounts for every name beneath the tree ([test](tests/residual-snapshot.compliance.l1.test.ts))
- NEVER: assembly judges containment between a parent and a child that different naming-schema versions accept, so a tree migrating from 3.2 assembles a `.capability` under an `.enabler` ([test](tests/kind-containment.compliance.l1.test.ts))
