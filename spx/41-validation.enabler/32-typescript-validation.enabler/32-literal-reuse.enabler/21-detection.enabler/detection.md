# Detection

PROVIDES the cross-file literal indexing engine — a global pre-pass that walks every TypeScript source and test file via injected visitor-keys, indexes string and numeric literals carrying domain meaning, and emits two problem kinds for each indexed value: src↔test reuse and test↔test duplication
SO THAT every consumer of literal-reuse output (CLI output modes, value-allowlist filtering, bulk-silence helper)
CAN operate on a deterministic, order-independent, injectively-keyed problem set without re-walking the codebase

## Assertions

### Scenarios

- Given a string literal carrying domain meaning appears in a file under `src/` and also in a file under `spx/**/tests/`, when the detector runs, then it reports a src↔test reuse problem citing the test location and the source location ([test](tests/detection.scenario.l1.test.ts))
- Given a string literal carrying domain meaning appears in two or more test files but in no source file, when the detector runs, then it reports a test↔test duplication problem citing each test location and directing the author to refactor the value into production semantics or generated input data ([test](tests/detection.scenario.l1.test.ts))
- Given a numeric literal of meaningful magnitude duplicates between source and test, when the detector runs, then it reports a src↔test reuse problem ([test](tests/detection.scenario.l1.test.ts))
- Given a literal value appears exactly once in the codebase, when the detector runs, then it produces no problem for that value ([test](tests/detection.scenario.l1.test.ts))

### Mappings

- Problem kinds map to remediation: `srcReuse` problems carry `remediation === REMEDIATION.IMPORT_FROM_SOURCE`; `testDupe` problems carry `remediation === REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR` ([test](tests/detection.mapping.l1.test.ts))
- Literal kinds indexed: `Literal` nodes with string values produce occurrences with `kind === "string"`; `Literal` nodes with numeric values of meaningful magnitude produce occurrences with `kind === "number"`; `TemplateElement` cooked strings produce occurrences with `kind === "string"` ([test](tests/detection.mapping.l1.test.ts))

### Properties

- Detection is deterministic: for every project state, running the detector twice produces problems deep-equal to each other ([test](tests/detection.property.l1.test.ts))
- Detection is order-independent: for every set of files `F`, running the detector with the files walked in two different orders produces problem sets that are deep-equal after canonical sort ([test](tests/detection.property.l1.test.ts))
- Index keys are injective on `(kind, value)`: for every pair of occurrences `o1, o2` with `(o1.kind, o1.value) ≠ (o2.kind, o2.value)`, their entries in the built index occupy distinct keys ([test](tests/detection.property.l1.test.ts))

### Compliance

- ALWAYS: AST traversal descends only into fields the injected visitor-keys map declares for each node type; unknown node types short-circuit with no descent ([test](tests/detection.compliance.l1.test.ts), [review](21-visitor-traversal.adr.md))
- NEVER: descend into artifact directories — `node_modules`, `dist`, `build`, `.next`, `.source`, `.git`, `out`, `coverage` ([test](tests/detection.compliance.l1.test.ts))
- NEVER: index literals from positions that name a module — `ImportDeclaration.source`, `ExportNamedDeclaration.source`, `ExportAllDeclaration.source`, `ImportExpression.source`, `TSImportType.source`, `TSExternalModuleReference.expression` ([test](tests/detection.compliance.l1.test.ts))
