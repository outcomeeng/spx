# Literal Reuse

PROVIDES the cross-file literal-reuse detector — a global pre-pass that parses every TypeScript source and test file, indexes string and numeric literals carrying domain meaning, and reports two classes of finding: literals that recur between source and test files (src↔test reuse) and literals that recur across two or more test files without appearing in any source file (test↔test duplication)
SO THAT `spx validation all` running against a TypeScript project
CAN enforce the source/test boundary import rules and shared-test-support recurrence rules from [21-typescript-conventions.adr.md](../21-typescript-conventions.adr.md) — patterns that per-file ESLint rules cannot detect because they require indexing literals across the full codebase

## Assertions

### Scenarios

- Given a string literal carrying domain meaning appears in a file under `src/` and also in a file under `spx/**/tests/`, when the detector runs, then it reports a src↔test reuse finding citing the test location and the source location ([test](tests/literal.scenario.l1.test.ts))
- Given a string literal carrying domain meaning appears in two or more test files but in no source file, when the detector runs, then it reports a test↔test duplication finding citing each test location ([test](tests/literal.scenario.l1.test.ts))
- Given a numeric literal of meaningful magnitude duplicates between source and test, when the detector runs, then it reports a src↔test reuse finding ([test](tests/literal.scenario.l1.test.ts))
- Given a literal value appears exactly once in the codebase, when the detector runs, then it produces no finding for that value ([test](tests/literal.scenario.l1.test.ts))
- Given `literal.allowlist.include` contains a string value, when the detector runs, then no finding is reported for that value regardless of how many files contain it ([test](tests/literal.scenario.l1.test.ts))
- Given `literal.allowlist.presets` names a built-in preset, when the detector runs, then all values bundled in that preset produce no findings ([test](tests/literal.scenario.l1.test.ts))
- Given `literal.allowlist.exclude` names a value that a configured preset would suppress, when the detector runs, then findings for that value are still reported — `exclude` wins over presets ([test](tests/literal.scenario.l1.test.ts))
- Given no `spx.config.*` file is present at the project root, when the detector runs, then the effective allowlist is empty ([test](tests/literal.scenario.l1.test.ts))
- Given `literal.allowlist.presets` names an unrecognized preset identifier, when `resolveConfig` validates the section, then it returns an error naming the unrecognized identifier and the detection run does not proceed ([test](tests/literal.scenario.l1.test.ts))
- Given a node directory listed in `spx/EXCLUDE`, when the detector walks files, then files under that node's directory are not parsed or indexed ([test](tests/literal.scenario.l1.test.ts))
- Given the detector is invoked with `--files <paths...>`, when it runs, then only the named files are walked and findings are reported against the index those files contribute ([test](tests/literal.scenario.l1.test.ts))
- Given the detector is invoked with `--json`, when it completes, then the output parses through `parseLiteralReuseResult` without throwing ([test](tests/literal.scenario.l1.test.ts))

### Mappings

- Finding kinds map to remediation: `srcReuse` findings carry `remediation === REMEDIATION.IMPORT_FROM_SOURCE`; `testDupe` findings carry `remediation === REMEDIATION.EXTRACT_TO_SHARED_TEST_SUPPORT` ([test](tests/literal.mapping.l1.test.ts))
- Literal kinds indexed: `Literal` nodes with string values produce occurrences with `kind === "string"`; `Literal` nodes with numeric values of meaningful magnitude produce occurrences with `kind === "number"`; `TemplateElement` cooked strings produce occurrences with `kind === "string"` ([test](tests/literal.mapping.l1.test.ts))
- The effective allowlist for a detection run equals union(values bundled in each named preset) ∪ `include` \ `exclude` — computed once before any file is walked ([test](tests/literal.mapping.l1.test.ts))
- Built-in preset identifiers: `"web"` bundles HTTP method names, HTTP header names, common response shape keys, and HTML attribute tokens ([test](tests/literal.mapping.l1.test.ts))

### Properties

- Detection is deterministic: for every project state, running the detector twice produces findings deep-equal to each other ([test](tests/literal.property.l1.test.ts))
- Detection is order-independent: for every set of files `F`, running the detector with the files walked in two different orders produces finding sets that are deep-equal after canonical sort ([test](tests/literal.property.l1.test.ts))
- Index keys are injective on `(kind, value)`: for every pair of occurrences `o1, o2` with `(o1.kind, o1.value) ≠ (o2.kind, o2.value)`, their entries in the built index occupy distinct keys ([test](tests/literal.property.l1.test.ts))

### Compliance

- ALWAYS: the `spx.config.*` section key for literal configuration is `"literal"` — no caller outside the config module references this key as a string literal ([review](32-allowlist-config.adr.md))
- ALWAYS: `exclude` removes a value from the effective allowlist regardless of which source contributed it — a value in both `include` and `exclude` is not in the effective allowlist ([test](tests/literal.compliance.l1.test.ts))
- ALWAYS: detection respects `spx/EXCLUDE` — files under excluded node directories are never parsed and contribute no occurrences ([test](tests/literal.compliance.l1.test.ts))
- ALWAYS: AST traversal descends only into fields the injected visitor-keys map declares for each node type; unknown node types short-circuit with no descent ([test](tests/literal.compliance.l1.test.ts))
- NEVER: descend into artifact directories — `node_modules`, `dist`, `build`, `.next`, `.source`, `.git`, `out`, `coverage` ([test](tests/literal.compliance.l1.test.ts))
- NEVER: index literals from positions that name a module — `ImportDeclaration.source`, `ExportNamedDeclaration.source`, `ExportAllDeclaration.source`, `ImportExpression.source`, `TSImportType.source`, `TSExternalModuleReference.expression` ([test](tests/literal.compliance.l1.test.ts))
- ALWAYS: the stage participates in `spx validation all` — `allCommand` imports and invokes `literalCommand`, which returns a non-zero exit code when findings exist ([review])
