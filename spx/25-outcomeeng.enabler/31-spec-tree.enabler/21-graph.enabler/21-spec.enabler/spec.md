PROVIDES a graph of durable product-truth relationships: nodes, decisions, assertions, and declared evidence links
SO THAT test, source, and change graph slices
CAN interpret downstream evidence and artifacts against the product truth they serve

## Assertions

### Compliance

- ALWAYS: spec graph nodes identify product-truth artifacts by full Spec Tree paths from `spx/` ([test](tests/spec.compliance.l1.test.ts))
- ALWAYS: spec graph edges preserve the truth hierarchy from decisions to specs to evidence links ([test](tests/spec.compliance.l1.test.ts))
- ALWAYS: declared test-link facts enter the spec graph through injected tree-provider outputs, and implementation source files are never parsed to create spec graph edges ([test](tests/spec.compliance.l1.test.ts))
