# Spec Tree Fixtures

PROVIDES generated spec-tree source fixtures and materialization helpers for tests
SO THAT config, source, assembly, traversal, state, projection, session, validation, and spec-domain tests
CAN build valid spec-tree inputs without hand-written directory trees or test-owned domain constants

## Assertions

### Scenarios

- Given a Config and a callback, when `withSpecTreeEnv` starts, then the callback receives `productDir`, a representative fixture, source helpers, snapshot helpers, and materialization helpers, and the temp product directory is removed after the callback returns ([test](tests/spec-tree-env-lifecycle.scenario.l1.test.ts))

### Mappings

- Generated representative fixtures map to product, root node, child node, peer node, decision, and evidence entries accepted by `readSpecTree` ([test](tests/spec-tree-fixtures.mapping.l1.test.ts))
- A materialized `withSpecTreeEnv` representative fixture maps to the same product title, node structure, and decision signatures as its in-memory source fixture ([test](tests/spec-tree-fixture-sources.mapping.l1.test.ts))

### Compliance

- ALWAYS: shared spec-tree fixture values live in top-level test infrastructure, not in node-local support files reused across multiple test files ([test](tests/spec-tree-fixtures.mapping.l1.test.ts))
- ALWAYS: fixture generation receives kind vocabulary through an injected registry ([test](tests/spec-tree-fixtures.mapping.l1.test.ts))
- ALWAYS: materialized fixture paths remain constrained to the temp product directory ([test](tests/spec-tree-env-safety.compliance.l1.test.ts))
