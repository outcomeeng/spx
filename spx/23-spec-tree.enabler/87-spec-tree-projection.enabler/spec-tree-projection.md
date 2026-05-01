# Spec Tree Projection

PROVIDES stable projection output for spec-tree snapshots
SO THAT command renderers, automation callers, and non-TypeScript adapters
CAN consume spec-tree state through a versioned data contract

## Assertions

### Conformance

- `projectSpecTree(snapshot)` output conforms to the stable projection contract consumed by command renderers and automation callers ([test](tests/spec-tree-projection.conformance.l1.test.ts))

### Compliance

- ALWAYS: projection keys come from the spec-tree projection registry exported through the public spec-tree surface ([test](tests/spec-tree-projection.conformance.l1.test.ts))
