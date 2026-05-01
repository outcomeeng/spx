# Literal Reuse

PROVIDES the cross-file literal-reuse detector — a global pre-pass that parses every TypeScript source and test file, indexes string and numeric literals carrying domain meaning, and reports two classes of problem: literals that recur between source and test files (src↔test reuse) and literals that recur across two or more test files without appearing in any source file (test↔test duplication)
SO THAT `spx validation all` running against a TypeScript project
CAN enforce the source/test boundary import rules and no-test-owned-semantic-constant rules from [21-typescript-conventions.adr.md](../21-typescript-conventions.adr.md) — patterns that per-file ESLint rules cannot detect because they require indexing literals across the full codebase

## Assertions

### Scenarios

- Given a string literal carrying domain meaning appears in a file under `src/` and also in a file under `spx/**/tests/`, when the detector runs, then it reports a src↔test reuse problem citing the test location and the source location ([test](tests/literal.scenario.l1.test.ts))
- Given a string literal carrying domain meaning appears in two or more test files but in no source file, when the detector runs, then it reports a test↔test duplication problem citing each test location and directing the author to refactor the value into production semantics or generated input data ([test](tests/literal.scenario.l1.test.ts))
- Given a numeric literal of meaningful magnitude duplicates between source and test, when the detector runs, then it reports a src↔test reuse problem ([test](tests/literal.scenario.l1.test.ts))
- Given a literal value appears exactly once in the codebase, when the detector runs, then it produces no problem for that value ([test](tests/literal.scenario.l1.test.ts))
- Given `literal.allowlist.include` contains a string value, when the detector runs, then no problem is reported for that value regardless of how many files contain it ([test](tests/literal.scenario.l1.test.ts))
- Given `literal.allowlist.presets` names a built-in preset, when the detector runs, then all values bundled in that preset produce no problems ([test](tests/literal.scenario.l1.test.ts))
- Given `literal.allowlist.exclude` names a value that a configured preset would suppress, when the detector runs, then problems for that value are still reported — `exclude` wins over presets ([test](tests/literal.scenario.l1.test.ts))
- Given no `spx.config.*` file is present at the project root, when the detector runs, then the effective allowlist is empty ([test](tests/literal.scenario.l1.test.ts))
- Given `literal.allowlist.presets` names an unrecognized preset identifier, when `resolveConfig` validates the section, then it returns an error naming the unrecognized identifier and the detection run does not proceed ([test](tests/literal.scenario.l1.test.ts))
- Given a node directory listed in `spx/EXCLUDE`, when the detector walks files, then files under that node's directory are not parsed or indexed ([test](tests/literal.scenario.l1.test.ts))
- Given the detector is invoked with `--files <paths...>`, when it runs, then only the named files are walked and problems are reported against the index those files contribute ([test](tests/literal.scenario.l1.test.ts))
- Given the detector is invoked with `--json`, when it completes, then the output parses through `parseLiteralReuseResult` without throwing ([test](tests/literal.scenario.l1.test.ts))
- Given a test file contains fixture-writer paths and source payload strings, when literals are collected, then those setup literals do not contribute occurrences while assertion-position semantic literals still contribute occurrences ([test](tests/literal.scenario.l1.test.ts))
- Given a fixture-writer call receives a nested function callback, when literals are collected, then literals inside the callback still contribute occurrences while the fixture-writer path does not ([test](tests/literal.scenario.l1.test.ts))
- Given a test file contains protocol or status values inside fixture data, when literals are collected, then those fixture values do not contribute occurrences while assertion-position semantic literals still contribute occurrences ([test](tests/literal.scenario.l1.test.ts))
- Given a test file stores fixture data in compound-role names or SCREAMING_SNAKE fixture identifiers, when literals are collected, then those fixture values do not contribute occurrences while assertion-position semantic literals still contribute occurrences ([test](tests/literal.scenario.l1.test.ts))
- Given a file path contains the `.test.` filename marker outside a tests directory, when literals are collected, then fixture-data filtering treats the file as test-authored while assertion-position semantic literals still contribute occurrences ([test](tests/literal.scenario.l1.test.ts))
- Given `--kind dupe` is specified, when the detector runs, then only test↔test duplication problems appear in the output ([test](tests/literal.scenario.l1.test.ts))
- Given `--kind reuse` is specified, when the detector runs, then only src↔test reuse problems appear in the output ([test](tests/literal.scenario.l1.test.ts))
- Given `--kind reuse` is specified and only test↔test duplication problems exist, when the detector runs, then exit code is 0 and output is "Literal: No problems of type reuse" ([test](tests/literal.scenario.l1.test.ts))
- Given `--files-with-problems` is specified, when the detector runs with problems, then output contains one unique file path per line sorted lexicographically with no line number ([test](tests/literal.scenario.l1.test.ts))
- Given `--kind reuse --files-with-problems` is specified, when the detector runs, then output contains only unique file paths from src↔test reuse problems ([test](tests/literal.scenario.l1.test.ts))
- Given `--literals` is specified, when the detector runs with problems, then output contains one unique literal value per line sorted lexicographically ([test](tests/literal.scenario.l1.test.ts))
- Given `--verbose` is specified, when the detector runs with problems, then output groups problems into a REUSE section and a DUPE section, each listing file headers with per-problem lines indented beneath them ([test](tests/literal.scenario.l1.test.ts))
- Given `--kind reuse --json` is specified, when the detector runs, then the JSON output sets `testDupe` to an empty array and `srcReuse` to the matching problems ([test](tests/literal.scenario.l1.test.ts))

### Mappings

- Problem kinds map to remediation: `srcReuse` problems carry `remediation === REMEDIATION.IMPORT_FROM_SOURCE`; `testDupe` problems carry `remediation === REMEDIATION.REFACTOR_TO_SOURCE_OR_GENERATOR` ([test](tests/literal.mapping.l1.test.ts))
- Literal kinds indexed: `Literal` nodes with string values produce occurrences with `kind === "string"`; `Literal` nodes with numeric values of meaningful magnitude produce occurrences with `kind === "number"`; `TemplateElement` cooked strings produce occurrences with `kind === "string"` ([test](tests/literal.mapping.l1.test.ts))
- The effective allowlist for a detection run equals union(values bundled in each named preset) ∪ `include` \ `exclude` — computed once before any file is walked ([test](tests/literal.mapping.l1.test.ts))
- Built-in preset identifiers: `"web"` bundles HTTP method names, HTTP header names, common response shape keys, and HTML attribute tokens ([test](tests/literal.mapping.l1.test.ts))
- `--kind reuse` selects src↔test reuse problems (`srcReuse`); `--kind dupe` selects test↔test duplication problems (`testDupe`) — applies to text, `--verbose`, `--files-with-problems`, `--literals`, and `--json` output modes ([test](tests/literal.mapping.l1.test.ts))
- Default text output: one line per problem formatted as `[reuse] "value" path:line` or `[dupe] "value" path:line`; all reuse problems first, then all duplication problems, each group sorted by file path then line number ([test](tests/literal.mapping.l1.test.ts))
- `--verbose` output: a summary line stating total problem count by kind; a REUSE section with file headers and per-problem lines indented beneath each header; a DUPE section with the same structure ([test](tests/literal.mapping.l1.test.ts))
- `--files-with-problems` output: the unique set of file paths from matching problems, one path per line, sorted lexicographically, with no line number suffix ([test](tests/literal.mapping.l1.test.ts))
- `--literals` output: the unique set of literal values from matching problems, one value per line, sorted lexicographically; string values are surrounded by double quotes, numeric values are their decimal representation ([test](tests/literal.mapping.l1.test.ts))

### Properties

- Detection is deterministic: for every project state, running the detector twice produces problems deep-equal to each other ([test](tests/literal.property.l1.test.ts))
- Detection is order-independent: for every set of files `F`, running the detector with the files walked in two different orders produces problem sets that are deep-equal after canonical sort ([test](tests/literal.property.l1.test.ts))
- Index keys are injective on `(kind, value)`: for every pair of occurrences `o1, o2` with `(o1.kind, o1.value) ≠ (o2.kind, o2.value)`, their entries in the built index occupy distinct keys ([test](tests/literal.property.l1.test.ts))
- `--files-with-problems` output is deterministic: the same project state always produces the same sorted list of file paths ([test](tests/literal.property.l1.test.ts))
- `--literals` output is deterministic: the same project state always produces the same sorted list of literal values ([test](tests/literal.property.l1.test.ts))

### Compliance

- ALWAYS: the `spx.config.*` section key for literal configuration is `"literal"` — no caller outside the config module references this key as a string literal ([review](32-allowlist-config.adr.md))
- ALWAYS: `exclude` removes a value from the effective allowlist regardless of which source contributed it — a value in both `include` and `exclude` is not in the effective allowlist ([test](tests/literal.compliance.l1.test.ts))
- ALWAYS: detection respects `spx/EXCLUDE` — files under excluded node directories are never parsed and contribute no occurrences ([test](tests/literal.compliance.l1.test.ts))
- ALWAYS: test-file classification recognizes POSIX `/tests/`, Windows `\tests\`, and `.test.` filename markers as test fixture paths ([test](tests/literal.scenario.l1.test.ts))
- ALWAYS: AST traversal descends only into fields the injected visitor-keys map declares for each node type; unknown node types short-circuit with no descent ([test](tests/literal.compliance.l1.test.ts))
- NEVER: descend into artifact directories — `node_modules`, `dist`, `build`, `.next`, `.source`, `.git`, `out`, `coverage` ([test](tests/literal.compliance.l1.test.ts))
- NEVER: index literals from positions that name a module — `ImportDeclaration.source`, `ExportNamedDeclaration.source`, `ExportAllDeclaration.source`, `ImportExpression.source`, `TSImportType.source`, `TSExternalModuleReference.expression` ([test](tests/literal.compliance.l1.test.ts))
- NEVER: add, remove, or rename fixture-writer helper methods without updating the detector's fixture-writer call classification in the same change ([test](tests/literal.compliance.l1.test.ts))
- NEVER: add words to the detector's fixture-data role segments that are also common non-fixture variable-name components without a corresponding test for the false-positive boundary ([review])
- ALWAYS: the stage participates in `spx validation all` — `allCommand` imports and invokes `literalCommand`, which returns a non-zero exit code when problems exist ([review])
- ALWAYS: default text output is one problem per line formatted as `[kind] "value" path:line` — parseable without regex gymnastics ([test](tests/literal.compliance.l1.test.ts))
- ALWAYS: `--files-with-problems` outputs each unique affected file path on its own line, sorted lexicographically, with no line number suffix ([test](tests/literal.compliance.l1.test.ts))
- ALWAYS: `--literals` outputs each unique literal value on its own line, sorted lexicographically ([test](tests/literal.compliance.l1.test.ts))
- ALWAYS: `--kind` applies to all output modes — text, `--verbose`, `--files-with-problems`, `--literals`, and `--json`; problems of the non-selected kind are excluded from every output form ([test](tests/literal.compliance.l1.test.ts))
- ALWAYS: when `--kind <k>` is specified and no problems of kind `<k>` exist, text output is "Literal: No problems of type <k>" and exit code is 0 ([test](tests/literal.compliance.l1.test.ts))
- ALWAYS: exit code reflects filtered problems — when `--kind` is specified, exit code is 0 if no problems of that kind exist and 1 if any do, regardless of problems of the other kind ([test](tests/literal.compliance.l1.test.ts))
- ALWAYS: `--kind` with `--json` emits the full problem object structure with the non-matching kind's array set to `[]` ([test](tests/literal.compliance.l1.test.ts))
