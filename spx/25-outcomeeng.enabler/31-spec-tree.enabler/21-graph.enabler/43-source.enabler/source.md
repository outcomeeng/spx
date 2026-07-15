PROVIDES a source artifact ownership graph derived from the test graph and normalized language-provider facts
SO THAT garbage collection, changed-test planning, and source ownership reports
CAN identify owned, reachable, covered, and unowned implementation artifacts for source ownership and garbage-collection workflows

## Assertions

### Mappings

- Source artifact ownership states map provider facts and linked tests to owned-covered, owned-reachable, covered-unowned, reachable-unowned, and unowned classifications ([test](tests/source.mapping.l1.test.ts))

### Compliance

- ALWAYS: each source graph classification reports the evidence category that justifies it: linked-test coverage, linked-test reachability, unlinked coverage, unlinked reachability, or absence of ownership evidence ([test](tests/source.compliance.l1.test.ts))
- ALWAYS: source graph facts retain language and provider provenance alongside normalized artifact identity ([test](tests/source.compliance.l1.test.ts))
- ALWAYS: TypeScript, Python, and Rust source facts map into the same ownership classification vocabulary ([test](tests/source.compliance.l1.test.ts))
- ALWAYS: garbage-collection candidates derive from source graph classification, not from a language import graph alone ([test](tests/source.compliance.l1.test.ts))
- NEVER: a fact path that escapes, never enters, or names no location inside the product directory binds a normalized artifact identity ([test](tests/source.compliance.l1.test.ts))
