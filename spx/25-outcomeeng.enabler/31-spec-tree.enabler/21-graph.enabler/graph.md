PROVIDES ordered Outcome Engineering graph slices over Spec Tree represented artifacts
SO THAT source ownership, garbage collection, changed-test planning, and change impact workflows
CAN consume artifact relationships in truth-flow order without re-defining graph semantics per workflow

## Assertions

### Compliance

- ALWAYS: the spec graph provides durable product-truth relationships that the test graph consumes ([test](tests/graph.compliance.l1.test.ts))
- ALWAYS: the test graph provides spec-linked evidence relationships that the source graph consumes ([test](tests/graph.compliance.l1.test.ts))
- ALWAYS: source graph ownership derives from spec-linked test relationships plus provider facts, not from language import graphs alone ([test](tests/graph.compliance.l1.test.ts))
