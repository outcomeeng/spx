# Path Predicates

PROVIDES the per-layer path predicates — one pure function per ignore layer, each typed as `(path, layerConfig) => LayerDecision`, over the artifact-directory layer, the hidden-prefix layer, and the ignore-source layer
SO THAT the scope-resolver child (`../43-scope-resolver.enabler/`) composing the fixed-sequence pipeline
CAN evaluate each layer's membership through a uniform predicate shape without consulting the ignore-source reader directly, enumerating artifact-directory names, or matching the hidden prefix itself

## Assertions

### Scenarios

- Given the artifact-directory predicate is invoked with a path containing a segment equal to any configured artifact-directory name, when the predicate evaluates, then the predicate reports `matched: true` with the matched segment identified in the decision ([test](tests/artifact-directory.scenario.l1.test.ts))
- Given the artifact-directory predicate is invoked with a path containing no configured artifact-directory segment, when the predicate evaluates, then the predicate reports `matched: false` ([test](tests/artifact-directory.scenario.l1.test.ts))
- Given the hidden-prefix predicate is invoked with a path whose basename starts with the configured hidden prefix, when the predicate evaluates, then the predicate reports `matched: true` ([test](tests/hidden-prefix.scenario.l1.test.ts))
- Given the hidden-prefix predicate is invoked with a path whose basename does not start with the configured hidden prefix, when the predicate evaluates, then the predicate reports `matched: false` ([test](tests/hidden-prefix.scenario.l1.test.ts))
- Given the ignore-source predicate receives an ignore-source reader and is invoked with a path under a reader-reported node directory, when the predicate evaluates, then the predicate reports `matched: true` with the matched entry identified in the decision ([test](tests/ignore-source.scenario.l1.test.ts))
- Given the ignore-source predicate receives an ignore-source reader and is invoked with a path outside every reader-reported node directory, when the predicate evaluates, then the predicate reports `matched: false` ([test](tests/ignore-source.scenario.l1.test.ts))

### Properties

- Each predicate is pure: for every path and layer-config pair, repeated invocations produce equal `LayerDecision` values ([test](tests/purity.property.l1.test.ts))
- Predicate decisions are independent across layers: the decision of one predicate does not depend on another predicate's decision or on the ignore-source reader's internal mutation ([test](tests/independence.property.l1.test.ts))
- The artifact-directory predicate is path-segment-local: membership depends only on the path's segment set, not on segment order, length, or absolute resolution ([test](tests/artifact-directory.property.l1.test.ts))

### Compliance

- ALWAYS: each predicate is exported as a pure function typed `(path: string, config: LayerConfig) => LayerDecision` — no method on a class, no curried closure over module state ([review])
- ALWAYS: every vocabulary constant the predicates consume — artifact-directory name set, hidden-prefix character — flows from the file-inclusion descriptor ([review])
- NEVER: perform filesystem I/O inside a predicate — predicates are pure over their arguments; any I/O belongs at construction time in the consumed configuration source ([review])
- NEVER: hardcode an artifact-directory name, the hidden-prefix character, or the ignore-source filename in this enabler's modules ([review])
- NEVER: expose a predicate that returns more than `LayerDecision` — cross-layer composition is the scope-resolver's concern, not a predicate's ([review])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests exercise predicates against in-memory `LayerConfig` values and, where an ignore-source reader is required, against real ignore-source files constructed via `../../22-test-environment.enabler/` ([review])
