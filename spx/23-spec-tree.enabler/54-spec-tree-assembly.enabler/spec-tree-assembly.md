# Spec Tree Assembly

PROVIDES backend-neutral assembly of source entries into a parent-child spec-tree snapshot
SO THAT traversal, state derivation, projection, and CLI consumers
CAN read one ordered tree with attached decisions and stable node relationships

## Assertions

### Properties

- Parent-child assembly preserves dependency ordering: lower-index siblings precede higher-index siblings, same-index siblings remain independent, and every child keeps exactly one parent within the snapshot ([test](tests/spec-tree-assembly.property.l1.test.ts))

### Compliance

- ALWAYS: decisions with a parent id attach to that parent node and remain available in the snapshot's flat decision list ([test](../tests/spec-tree-surface.scenario.l1.test.ts))
