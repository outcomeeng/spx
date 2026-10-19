# Spec Tree Projection

PROVIDES stable projection output for spec-tree snapshots
SO THAT command renderers, automation callers, and non-TypeScript adapters
CAN consume spec-tree state through a versioned data contract

## Assertions

- `projectSpecTree(snapshot)` output conforms to the stable projection contract consumed by command renderers and automation callers ([test](tests/spec-tree-projection.conformance.l1.test.ts))
- The keys of `projectSpecTree(snapshot)` output, on the top-level object and on every product, node, and decision object, are exactly the keys the spec-tree projection registry exported through the public spec-tree surface declares for that object ([test](tests/spec-tree-projection.conformance.l1.test.ts))
- For every generated node and decision index, the projected `order` is the list of the index's numeric segments in sequence, so `20.10` projects as `[20, 10]` and comparing projected orders segment by segment reproduces the snapshot's dependency order ([test](tests/spec-tree-projection.property.l1.test.ts))
