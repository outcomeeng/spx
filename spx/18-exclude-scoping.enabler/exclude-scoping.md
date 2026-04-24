# Exclude Scoping

PROVIDES a filter function that reads `spx/EXCLUDE` and identifies which paths correspond to specified-state nodes
SO THAT quality gate enablers (validation and testing) running with a `passing` scope
CAN skip nodes in specified state without manipulating project configuration files

The `spx` CLI reads `spx/EXCLUDE` and filters paths at invocation time. Exclusion is applied by passing flags to each tool (e.g., `--ignore` for pytest, `--exclude` for vitest), not by writing into `pyproject.toml`, `package.json`, or `tsconfig.json`.

## Assertions

### Scenarios

- Given `spx/EXCLUDE` lists a node path, when the filter is called with a file path inside that node directory, then the filter reports the file as excluded ([test](tests/exclude-scoping.scenario.l1.test.ts))
- Given `spx/EXCLUDE` lists a nested node path (e.g., `41-validation.enabler/65-markdown-validation.enabler`), when the filter is called with a file path inside that nested node, then the filter reports the file as excluded ([test](tests/exclude-scoping.scenario.l1.test.ts))
- Given `spx/EXCLUDE` contains comments and blank lines, when the filter parses it, then only non-comment, non-blank lines become node paths ([test](tests/exclude-scoping.scenario.l1.test.ts))
- Given `spx/EXCLUDE` does not exist, when the filter is constructed, then every input path reports as non-excluded ([test](tests/exclude-scoping.scenario.l1.test.ts))
- Given `spx/EXCLUDE` is empty, when the filter is constructed, then every input path reports as non-excluded ([test](tests/exclude-scoping.scenario.l1.test.ts))

### Mappings

- A node path `{segment}` in `spx/EXCLUDE` maps to the directory `spx/{segment}/` for prefix matching ([test](tests/exclude-scoping.mapping.l1.test.ts))
- Tool-specific exclusion flag generation: pytest `--ignore=spx/{segment}/`, vitest `--exclude=spx/{segment}/**` ([test](tests/exclude-scoping.mapping.l1.test.ts))

### Properties

- Filtering is deterministic: the same `spx/EXCLUDE` content always produces the same exclusion set ([test](tests/exclude-scoping.property.l1.test.ts))
- Path matching is prefix-based: any file inside an excluded node directory matches the exclusion ([test](tests/exclude-scoping.property.l1.test.ts))

### Compliance

- NEVER: write to project configuration files — exclusion applies at invocation time ([review])
- NEVER: resolve paths outside the project's `spx/` directory — reject absolute paths and traversal sequences ([test](tests/exclude-scoping.compliance.l1.test.ts))
- ALWAYS: treat `spx/EXCLUDE` as append-tolerant input — comments, blank lines, and trailing whitespace parse without error ([test](tests/exclude-scoping.compliance.l1.test.ts))
