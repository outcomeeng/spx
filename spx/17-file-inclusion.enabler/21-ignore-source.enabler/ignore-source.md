# Ignore Source

PROVIDES the ignore-source reader — parses the file-inclusion-configured ignore-source file into a typed, validated list of node-path exclusions, and exposes membership queries plus the raw parsed entries
SO THAT the path-predicates child (`../32-path-predicates.enabler/`) evaluating the ignore-source layer and the scope-resolver child (`../43-scope-resolver.enabler/`) assembling decision trails
CAN consult parsed ignore-source state through a single read and a single validator without re-reading the file or re-implementing path-safety checks

## Assertions

### Scenarios

- Given the configured ignore-source file lists a node path, when the reader is queried with a path under that node's directory, then the reader reports the query path as under-ignore-source ([test](tests/ignore-source.scenario.l1.test.ts))
- Given the configured ignore-source file lists a nested node path, when the reader is queried with a path under that nested node, then the reader reports the query path as under-ignore-source ([test](tests/ignore-source.scenario.l1.test.ts))
- Given the configured ignore-source file contains comment lines and blank lines interleaved with entries, when the reader parses the file, then only non-comment, non-blank, whitespace-trimmed lines become entries ([test](tests/ignore-source.scenario.l1.test.ts))
- Given the configured ignore-source file is absent from the project root, when the reader is constructed, then the reader reports every query path as not-under-ignore-source ([test](tests/ignore-source.scenario.l1.test.ts))
- Given the configured ignore-source file exists but contains no entries after comment and blank stripping, when the reader is constructed, then the reader reports every query path as not-under-ignore-source ([test](tests/ignore-source.scenario.l1.test.ts))

### Mappings

- An entry `{segment}` in the ignore-source file maps to the directory `{spec-tree-root-segment}/{segment}/` for prefix matching; `{spec-tree-root-segment}` comes from the file-inclusion descriptor ([test](tests/ignore-source.mapping.l1.test.ts))

### Properties

- The reader is deterministic: the same project root and the same ignore-source file content always produce the same parsed entry set and the same membership-query results ([test](tests/ignore-source.property.l1.test.ts))
- Membership matching is prefix-based: every path inside the directory of any parsed entry reports as under-ignore-source, and no path outside every such directory reports as under-ignore-source ([test](tests/ignore-source.property.l1.test.ts))

### Compliance

- ALWAYS: the reader parses the configured ignore-source file once at construction — query methods are pure over parsed state and perform no filesystem I/O ([review])
- ALWAYS: entries whose resolved directory would lie outside the configured spec-tree root segment — absolute paths, paths containing traversal sequences, separator patterns that escape the root — cause construction to fail with an error naming the offending entry ([test](tests/ignore-source.compliance.l1.test.ts))
- ALWAYS: parsing is append-tolerant — comment lines, blank lines, and trailing whitespace parse without error ([test](tests/ignore-source.compliance.l1.test.ts))
- NEVER: read, parse, or reference the ignore-source file from any module outside this enabler — the reader is the single reader ([review])
- NEVER: emit tool-specific flag syntax from this enabler — tool-flag production lives in `../54-tool-adapters.enabler/` ([review])
- NEVER: write to the ignore-source file or any other project configuration file — the reader is read-only ([review])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests construct real ignore-source files under temp project roots via `../../22-test-environment.enabler/` ([review])
