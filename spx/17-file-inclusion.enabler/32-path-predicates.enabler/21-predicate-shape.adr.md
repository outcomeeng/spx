# Path Predicate Shape

Each shared file-inclusion layer is expressed as one pure predicate function in its own module under `src/lib/file-inclusion/predicates/`, typed `(path: string, state: <PredicateState>) => LayerDecision`, with `LayerDecision` and the per-predicate state types declared in a shared `src/lib/file-inclusion/types.ts` that every predicate module and the pipeline composer import. The git-tracking predicate consults a pre-constructed `IgnoreSourceReader` through its state and inverts membership; the domain-path-filter predicate matches the caller-supplied include/exclude patterns through its state — neither predicate reaches into external state.

## Rationale

One module per predicate (`git-tracking.ts`, `domain-path-filter.ts`, each exporting exactly one function) follows the per-concern module structure of `spx/19-language-registration.adr.md`: a consumer that imports one predicate does not load the other, and each predicate's tests sit in a separate co-located file, keeping the evidence-to-code mapping traceable. Placing `LayerDecision` and the state types in a shared `src/lib/file-inclusion/types.ts` breaks the circular dependency that would arise if predicates imported each other or if the scope-resolver's assembly types lived inside a predicate module — every consumer imports types from the shared file, and no module becomes a type-only dependency of another.

Separate state types per predicate (`GitTrackingState`, `DomainPathFilterState`) express the distinct vocabulary each consumes without forcing a union type that would require discriminant checks in the composer; the pipeline composer passes the appropriate state to each predicate and type safety is enforced by each signature. Receiving the `IgnoreSourceReader` inside `GitTrackingState` preserves the predicate's purity contract — the reader is constructed once by the scope-resolver before the pipeline runs, so the predicate performs no I/O and its result is pure over `(path, state)` — and it mirrors how the domain-path-filter predicate receives its pattern set from the consumer's descriptor: all vocabulary arrives through the state parameter, never by a predicate reaching into external state. The git-tracking predicate delegates to `IgnoreSourceReader.isInIncludedSet` and inverts the result, reporting `matched: true` when the path is excluded; the domain-path-filter predicate reports `matched: true` for exclude matches and for paths outside every include pattern when an include set is configured.

Rejected: both predicates in a single `predicates/index.ts` (obscures per-predicate test coverage and couples two independent modules under one import point); `LayerState` as a discriminated union accepted by a single `evaluate` function (a dispatcher branching on a `kind` field degrades to a switch over predicates, when the predicate is the unit of composition, not a case inside a dispatcher); predicate factories that close over state at construction (closures are harder to trace from a test assertion back to the producing predicate than direct `(path, state) => LayerDecision` functions with stable references); and inlining the git-tracking layer into the scope-resolver (a special-cased layer hidden inside the resolver breaks the uniform call shape the parent ADR mandates).

## Invariants

- Every function under `src/lib/file-inclusion/predicates/` has the signature `(path: string, state: T) => LayerDecision`, where `T` is the predicate-specific state type declared in `src/lib/file-inclusion/types.ts`.
- Repeated invocations of the same predicate with equal `path` and equal `state` return equal `LayerDecision` values.
- The `LayerDecision.layer` string returned by each predicate is a structural constant that identifies the predicate's pipeline position; it does not vary with input.
- No predicate module imports another predicate module.

## Verification

### Audit

- ALWAYS: each predicate is a pure function exported from its own module — `(path: string, state: <PredicateState>) => LayerDecision`, no class method, no factory closure, no side effects ([audit])
- ALWAYS: `LayerDecision`, `GitTrackingState`, and `DomainPathFilterState` are declared in `src/lib/file-inclusion/types.ts` and imported from there by predicate modules and the scope-resolver ([audit])
- ALWAYS: the git-tracking predicate delegates to `state.reader.isInIncludedSet(path)` and reports `matched: true` when the reader reports the path is not in the included set, performing no filesystem or subprocess I/O ([audit])
- ALWAYS: the domain-path-filter predicate evaluates the path against `state.include` and `state.exclude` and reports `matched: true` for exclude matches and for paths outside every include pattern when `state.include` is non-empty ([audit])
- ALWAYS: the `detail` field in `LayerDecision` carries the specific matched value — the ignore source identified by the git-tracking reader, or the matched include/exclude pattern — when `matched` is `true`, and is omitted when `matched` is `false` ([audit])
- ALWAYS: tests exercise each predicate against in-memory state values, and the git-tracking predicate's tests construct a real `IgnoreSourceReader` via `spx/22-test-environment.enabler/` against real git worktrees ([audit])
- NEVER: perform filesystem or subprocess I/O inside any predicate — all I/O belongs at construction time in the `IgnoreSourceReader` ([audit])
- NEVER: import one predicate module from another — predicates are independent, and cross-predicate imports create coupling without providing composition ([audit])
- NEVER: hardcode pattern values or git-plumbing arguments in predicate modules — those values arrive through the state parameter ([audit])
- NEVER: define an artifact-directory predicate, a hidden-prefix predicate, or any other default-exclusion predicate — `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md` declares git-tracking as the single default scope source and dot-prefixed entries as included by default ([audit])
- NEVER: return a `LayerDecision` without a `layer` string — the layer name is mandatory and identifies the predicate's position in the pipeline decision trail ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests inject in-memory state and, for git-tracking predicate tests, construct real readers against tmpdir git worktrees via `spx/22-test-environment.enabler/` ([audit])
