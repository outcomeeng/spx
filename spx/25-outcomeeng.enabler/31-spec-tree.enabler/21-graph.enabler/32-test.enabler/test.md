PROVIDES a graph of spec-linked test evidence relationships derived from the spec graph
SO THAT source and change graph slices
CAN distinguish tests that verify product truth from files that merely execute in a repository

## Assertions

### Compliance

- ALWAYS: each test graph node is anchored to at least one declared test evidence link in the spec graph ([test](tests/test.compliance.l1.test.ts))
- ALWAYS: test graph edges preserve the assertion-to-test relationship before provider facts are joined to source artifacts ([test](tests/test.compliance.l1.test.ts))
- NEVER: a test file is treated as product-truth evidence when no Spec Tree assertion links to it ([test](tests/test.compliance.l1.test.ts))
