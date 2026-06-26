# Path Predicates

PROVIDES the per-layer path predicates — one pure function per shared layer, each typed as `(path, layerState) => LayerDecision`, over the git-tracking layer (consulting the ignore-source reader's tracked-or-untracked-not-ignored set) and the domain-path-filter layer (matching the consumer-supplied include/exclude patterns)
SO THAT the scope-resolver child (`../43-scope-resolver.enabler/`) composing the fixed-sequence pipeline
CAN evaluate each layer's membership through a uniform predicate shape without consulting the ignore-source reader directly, re-implementing include/exclude pattern matching, or shelling out to git

## Assertions

### Scenarios

- Given the git-tracking predicate receives a layer state built from the ignore-source reader and is invoked with a path the reader reports as in the included set, when the predicate evaluates, then the predicate reports `matched: false` (the path is in scope) ([test](tests/git-tracking.scenario.l1.test.ts))
- Given the git-tracking predicate receives a layer state built from the ignore-source reader and is invoked with a path the reader reports as not in the included set, when the predicate evaluates, then the predicate reports `matched: true` (the path is excluded) under the git-tracking layer ([test](tests/git-tracking.scenario.l1.test.ts))
- Given the git-tracking predicate is invoked with a path inside a submodule directory, when the predicate evaluates, then the predicate reports `matched: true` because git's enumeration treats submodule contents as opaque ([test](tests/git-tracking.scenario.l1.test.ts))
- Given the domain-path-filter predicate receives a layer state with a configured `exclude` pattern and is invoked with a path matching the pattern, when the predicate evaluates, then the predicate reports `matched: true` with the matched exclude pattern identified in the decision ([test](tests/domain-path-filter.scenario.l1.test.ts))
- Given the domain-path-filter predicate receives a layer state with a configured `include` pattern and is invoked with a path outside every include pattern, when the predicate evaluates, then the predicate reports `matched: true` with the missing-include decision identified ([test](tests/domain-path-filter.scenario.l1.test.ts))
- Given a domain path filter prefix contains Windows separators, a leading `./`, or trailing separators, when the predicate evaluates a normalized product-relative path, then matching uses the same normalized prefix semantics as validation path filters ([test](tests/domain-path-filter.scenario.l1.test.ts))

### Properties

- Each predicate is pure: for every path and layer-state pair, repeated invocations produce equal `LayerDecision` values ([test](tests/purity.property.l1.test.ts))
- Predicate decisions are independent across layers: the decision of one predicate does not depend on another predicate's decision or on any external mutation ([test](tests/independence.property.l1.test.ts))

### Compliance

- ALWAYS: each predicate is exported as a pure function typed `(path: string, state: LayerState) => LayerDecision` — no method on a class, no curried closure over module state ([review])
- ALWAYS: every vocabulary constant the predicates consume flows from the file-inclusion config descriptor or from the layer state passed in by the resolver ([review])
- NEVER: perform filesystem I/O or shell out to git inside a predicate — predicates are pure over their arguments; any I/O belongs at construction time in the consumed layer-state source (the ignore-source reader for git-tracking, the consumer-supplied config for domain-path-filter) ([review])
- NEVER: hardcode a path pattern, an ignore-resolution rule, or the git-tracking-source filename in this enabler's modules ([review])
- NEVER: define an artifact-directory predicate, a hidden-prefix predicate, or any other default-exclusion predicate beyond the git-tracking predicate — `11-ignore-defaults.pdr.md` declares git-tracking as the single default scope source ([review])
- NEVER: expose a predicate that returns more than `LayerDecision` — cross-layer composition is the scope-resolver's concern, not a predicate's ([review])
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests exercise predicates against in-memory `LayerState` values and, where the git-tracking reader is required, against real git worktrees constructed via `../../22-test-environment.enabler/` ([review])
