# Output Modes

PROVIDES the operator-facing surface of `spx validation literal` — file scoping via `--files`, kind filtering via `--kind {reuse|dupe}`, and four mutually-exclusive output formats (default text, `--verbose`, `--files-with-problems`, `--literals`, `--json`) — together with deterministic exit-code semantics that respect the active filter
SO THAT operators, agents, and CI pipelines invoking the detector
CAN consume the problem set in the form their tooling expects, scoped to the kinds they care about, with exit codes that reflect only the filtered subset

## Assertions

### Scenarios

- Given the detector is invoked with `--files <paths...>`, when it runs, then only the named files are walked and problems are reported against the index those files contribute ([test](tests/output-modes.scenario.l1.test.ts))
- Given the detector is invoked with `--json`, when it completes, then the output parses through `parseLiteralReuseResult` without throwing ([test](tests/output-modes.scenario.l1.test.ts))
- Given `--kind dupe` is specified, when the detector runs, then only test↔test duplication problems appear in the output ([test](tests/output-modes.scenario.l1.test.ts))
- Given `--kind reuse` is specified, when the detector runs, then only src↔test reuse problems appear in the output ([test](tests/output-modes.scenario.l1.test.ts))
- Given `--kind reuse` is specified and only test↔test duplication problems exist, when the detector runs, then exit code is 0 and output is "Literal: No problems of type reuse" ([test](tests/output-modes.scenario.l1.test.ts))
- Given `--files-with-problems` is specified, when the detector runs with problems, then output contains one unique file path per line sorted lexicographically with no line number ([test](tests/output-modes.scenario.l1.test.ts))
- Given `--kind reuse --files-with-problems` is specified, when the detector runs, then output contains only unique file paths from src↔test reuse problems ([test](tests/output-modes.scenario.l1.test.ts))
- Given `--literals` is specified, when the detector runs with problems, then output contains one unique literal value per line sorted lexicographically ([test](tests/output-modes.scenario.l1.test.ts))
- Given `--verbose` is specified, when the detector runs with problems, then output groups problems into a REUSE section and a DUPE section, each listing file headers with per-problem lines indented beneath them ([test](tests/output-modes.scenario.l1.test.ts))
- Given `--kind reuse --json` is specified, when the detector runs, then the JSON output sets `testDupe` to an empty array and `srcReuse` to the matching problems ([test](tests/output-modes.scenario.l1.test.ts))

### Mappings

- `--kind reuse` selects src↔test reuse problems (`srcReuse`); `--kind dupe` selects test↔test duplication problems (`testDupe`) — applies to text, `--verbose`, `--files-with-problems`, `--literals`, and `--json` output modes ([test](tests/output-modes.mapping.l1.test.ts))
- Default text output: one line per problem formatted as `[reuse] "value" path:line` or `[dupe] "value" path:line`; all reuse problems first, then all duplication problems, each group sorted by file path then line number ([test](tests/output-modes.mapping.l1.test.ts))
- `--verbose` output: a summary line stating total problem count by kind; a REUSE section with file headers and per-problem lines indented beneath each header; a DUPE section with the same structure ([test](tests/output-modes.mapping.l1.test.ts))
- `--files-with-problems` output: the unique set of file paths from matching problems, one path per line, sorted lexicographically, with no line number suffix ([test](tests/output-modes.mapping.l1.test.ts))
- `--literals` output: the unique set of literal values from matching problems, one value per line, sorted lexicographically; string values are surrounded by double quotes, numeric values are their decimal representation ([test](tests/output-modes.mapping.l1.test.ts))

### Properties

- `--files-with-problems` output is deterministic: the same project state always produces the same sorted list of file paths ([test](tests/output-modes.property.l1.test.ts))
- `--literals` output is deterministic: the same project state always produces the same sorted list of literal values ([test](tests/output-modes.property.l1.test.ts))

### Compliance

- ALWAYS: default text output is one problem per line formatted as `[kind] "value" path:line` — parseable without regex gymnastics ([test](tests/output-modes.compliance.l1.test.ts))
- ALWAYS: `--files-with-problems` outputs each unique affected file path on its own line, sorted lexicographically, with no line number suffix ([test](tests/output-modes.compliance.l1.test.ts))
- ALWAYS: `--literals` outputs each unique literal value on its own line, sorted lexicographically ([test](tests/output-modes.compliance.l1.test.ts))
- ALWAYS: `--kind` applies to all output modes — text, `--verbose`, `--files-with-problems`, `--literals`, and `--json`; problems of the non-selected kind are excluded from every output form ([test](tests/output-modes.compliance.l1.test.ts))
- ALWAYS: when `--kind <k>` is specified and no problems of kind `<k>` exist, text output is "Literal: No problems of type <k>" and exit code is 0 ([test](tests/output-modes.compliance.l1.test.ts))
- ALWAYS: exit code reflects filtered problems — when `--kind` is specified, exit code is 0 if no problems of that kind exist and 1 if any do, regardless of problems of the other kind ([test](tests/output-modes.compliance.l1.test.ts))
- ALWAYS: `--kind` with `--json` emits the full problem object structure with the non-matching kind's array set to `[]` ([test](tests/output-modes.compliance.l1.test.ts))
