# Literal Reuse

PROVIDES the cross-file literal-reuse detector — a global pre-pass that parses every TypeScript source and test file, indexes string and numeric literals carrying domain meaning, and reports two classes of finding: literals that recur between source and test files (src↔test reuse) and literals that recur across two or more test files without appearing in any source file (test↔test duplication)
SO THAT `spx validation all` running against a TypeScript project
CAN enforce the source/test boundary import rules and shared-test-support recurrence rules from [21-typescript-conventions.adr.md](../21-typescript-conventions.adr.md) — patterns that per-file ESLint rules cannot detect because they require indexing literals across the full codebase

## Assertions

### Scenarios

- Given a string literal carrying domain meaning appears in a file under `src/` and also in a file under `spx/**/tests/`, when the detector runs, then it reports a src↔test reuse finding citing the test location and the source location ([test](tests/literal-reuse.unit.test.ts))
- Given a string literal carrying domain meaning appears in two or more test files but in no source file, when the detector runs, then it reports a test↔test duplication finding citing each test location ([test](tests/literal-reuse.unit.test.ts))
- Given a numeric literal of meaningful magnitude duplicates between source and test, when the detector runs, then it reports a src↔test reuse finding ([test](tests/literal-reuse.unit.test.ts))
- Given a literal value appears exactly once in the codebase, when the detector runs, then it produces no finding for that value ([test](tests/literal-reuse.unit.test.ts))
- Given a literal value is in the project's allowlist of low-signal common values, when the detector runs, then it produces no finding for that value ([test](tests/literal-reuse.unit.test.ts))
- Given a string literal appears as an `ImportDeclaration`, `ImportExpression`, `ExportNamedDeclaration`, or `ExportAllDeclaration` source, when the detector runs, then it is excluded from the literal index ([test](tests/literal-reuse.unit.test.ts))
- Given a node directory listed in `spx/EXCLUDE`, when the detector walks files, then files under that node's directory are not parsed or indexed ([test](tests/literal-reuse.integration.test.ts))
- Given the detector is invoked with `--files <paths...>`, when the detector runs, then only the named files are walked and findings are reported against the indexed literal set those files contribute ([test](tests/literal-reuse.integration.test.ts))
- Given the detector is invoked with `--json`, when it completes, then findings are emitted as a JSON document conforming to the result schema ([test](tests/literal-reuse.integration.test.ts))

### Mappings

- Finding kinds map to remediation: src↔test reuse → import the value from source; test↔test duplication absent from source → declare in shared test support and import ([test](tests/literal-reuse.unit.test.ts))
- Literal kinds in the index: `Literal` nodes with string values, `Literal` nodes with numeric values of meaningful magnitude, `TemplateElement` cooked strings carrying domain meaning ([test](tests/literal-reuse.unit.test.ts))

### Properties

- Detection is deterministic: the same project state produces the same set of findings on repeated runs ([test](tests/literal-reuse.unit.test.ts))
- Detection is order-independent: findings depend on the set of files indexed, not the order in which the detector walks them ([test](tests/literal-reuse.unit.test.ts))
- The literal index is collision-free across kinds: a string literal `"42"` and a numeric literal `42` index under distinct keys ([test](tests/literal-reuse.unit.test.ts))

### Compliance

- ALWAYS: detection respects `spx/EXCLUDE` — files under excluded node directories are not parsed or indexed ([test](tests/literal-reuse.integration.test.ts))
- ALWAYS: detection participates in `spx validation all` as an independent stage; non-zero findings cause `spx validation all` to exit non-zero ([test](tests/literal-reuse.integration.test.ts))
- ALWAYS: AST traversal descends only into fields the parser declares as carrying child nodes — non-child fields (`loc`, `range`, parser metadata) are not visited and contribute no literals to the index ([test](tests/literal-reuse.unit.test.ts))
- NEVER: descend into directories that contain no TypeScript source — `node_modules`, `dist`, `build`, `.next`, `.source`, `.git`, `out`, `coverage`, and similar artifact directories are skipped at the walker level ([test](tests/literal-reuse.integration.test.ts))
- NEVER: index literals from positions whose value names a module rather than data — import sources, export sources, dynamic import expressions ([test](tests/literal-reuse.unit.test.ts))
