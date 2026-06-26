# Scope Resolver

PROVIDES the scope resolver — the fixed-sequence pipeline that assembles the shared layers in the order declared by the composition ADR (explicit-caller, domain-path-filter, git-tracking), short-circuits on caller-supplied explicit paths, and produces a `ScopeResult` with per-path decision trails
SO THAT every file-inclusion consumer requesting an inclusion decision
CAN obtain a resolved included set, a resolved excluded set, and the decision trail for every path through one entry point without knowing layer order, composing layers itself, or evaluating the explicit-override rule

## Assertions

### Scenarios

- Given the resolver receives a request whose caller-supplied explicit paths include a path that the git-tracking layer would also exclude, when the resolver runs, then the path appears in `ScopeResult.included` with a decision trail whose first element names the explicit-override layer ([test](tests/scope-resolver.scenario.l1.test.ts))
- Given the resolver receives a caller-supplied explicit directory whose descendants are git-ignored, when the resolver runs, then the directory and its descendants appear in `ScopeResult.included` with explicit-override decision trails ([test](tests/scope-resolver.compliance.l1.test.ts))
- Given the resolver receives a request with no caller-supplied explicit paths and a walk root that contains paths matching each non-override layer, when the resolver runs, then every path the git-tracking layer reports as excluded — because git ignores it or it lives inside a submodule — and every path the domain-path-filter layer matches appears in `ScopeResult.excluded` with a decision trail naming the responsible layer, and every other walked path appears in `ScopeResult.included` ([test](tests/scope-resolver.scenario.l1.test.ts))
- Given the resolver's request includes both explicit caller paths and a walk root, when the resolver runs, then every explicit path appears in `ScopeResult.included` under the explicit-override layer and the walked paths are resolved independently against the non-override layers ([test](tests/scope-resolver.scenario.l1.test.ts))
- Given the resolver's request includes override flags `--no-ignore`, `--no-ignore-vcs`, or `--ignore-file <path>`, when the resolver runs, then the git-tracking layer's state is constructed with the corresponding git plumbing arguments and the resulting included set reflects the override ([test](tests/scope-resolver.scenario.l1.test.ts))

### Properties

- Resolution is deterministic: the same worktree, the same request, and the same filesystem state always produce the same `ScopeResult` ([test](tests/scope-resolver.property.l1.test.ts))
- The explicit-override property holds universally: for every caller-supplied explicit path `p` carried in `request.explicit` and every `ScopeResolverConfig`, the `ScopeResult` from `resolveScope` reports `p` in `included` with decision trail starting at `explicit-override` ([test](tests/scope-resolver.property.l1.test.ts))
- Decision trails are complete and layer-ordered: for every path in `ScopeResult.excluded`, the trail is non-empty, every trail entry names a layer in the declared sequence, and the entries appear in sequence order ([test](tests/scope-resolver.property.l1.test.ts))
- Layer-sequence extensibility: inserting a non-matching layer at any declared position preserves included/excluded membership and existing excluded decision trails, while inserting a matching custom layer adds exactly one trail entry for matched paths without changing existing layer decisions ([test](tests/scope-resolver.property.l1.test.ts))

### Compliance

- ALWAYS: the pipeline's layer sequence is read from a single declaration site — the resolver imports it and the declaration has exactly one export; tests assert the declaration's shape is a non-empty ordered list of known layer names ([test](tests/scope-resolver.compliance.l1.test.ts))
- ALWAYS: explicit-override short-circuiting is implemented at the pipeline level — every caller-supplied explicit path reaches the included set without any non-override layer predicate being evaluated against it ([test](tests/scope-resolver.compliance.l1.test.ts))
- ALWAYS: the git-tracking layer's state is constructed once per resolver invocation via the ignore-source reader at `../21-ignore-source.enabler/`; per-path queries against that state are O(1) ([review])
- ALWAYS: the resolver's public entry is `resolveScope(productDir: string, request: ScopeRequest, config: ScopeResolverConfig): ScopeResult` — callers supply `config` explicitly so layer vocabulary enters the pipeline without a global registry read, a factory pattern consistent with the ignore-source reader ([review])
- NEVER: expose a mechanism for consumers to alter, skip, replace, or reorder the layer sequence at runtime — the sequence is architectural and fixed ([review])
- NEVER: invoke a layer predicate from outside this enabler — predicates are imported and composed only by the resolver ([review])
- NEVER: shell out to git from this enabler — git invocation is the ignore-source reader's responsibility ([review])
- NEVER: produce a `ScopeResult` without per-path decision trails on the excluded set, or without the explicit-override trail entry on caller-supplied paths ([test](tests/scope-resolver.compliance.l1.test.ts))
- NEVER: use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests run the resolver against real temp git worktrees via `../../22-test-environment.enabler/` ([review])
