# Path Predicate Shape

## Purpose

This decision governs how each shared layer in the file-inclusion pipeline is expressed as a TypeScript module: its function signature, state type, decision return type, and module placement. It applies to every predicate module under `src/lib/file-inclusion/predicates/` and to every module that imports or composes those predicates.

## Context

**Business impact:** The file-inclusion pipeline evaluates the git-tracking layer and the domain-path-filter layer against each candidate path per `../11-ignore-defaults.pdr.md`. Each layer must be inspectable in isolation for testing and auditing; the pipeline composer (`../43-scope-resolver.enabler/`) must invoke them through a uniform call shape that preserves decision-trail fidelity.

**Technical constraints:** spx is TypeScript ESM. The scope-composition decision (`../15-scope-composition.adr.md`) mandates that each layer is a pure predicate typed as `(path: string, state: LayerState) => LayerDecision`; layers perform no filesystem or subprocess I/O beyond what their construction phase declares. The git-tracking layer's state is pre-constructed by the scope-resolver as an `IgnoreSourceReader` (from `../21-ignore-source.enabler/`); the domain-path-filter layer's state is the typed include/exclude pattern set supplied by the caller from the consumer's domain descriptor.

## Decision

Each path predicate is a pure function in its own module under `src/lib/file-inclusion/predicates/`, accepting `(path: string, state: <PredicateState>)` and returning `LayerDecision`. `LayerDecision` and the per-predicate state types are declared in `src/lib/file-inclusion/types.ts`, which every predicate module imports. The two predicate modules are `git-tracking.ts` and `domain-path-filter.ts`. Each module exports exactly one predicate function. The git-tracking predicate delegates to `IgnoreSourceReader.isInIncludedSet` and inverts the result (the predicate reports `matched: true` when the path is excluded). The domain-path-filter predicate matches the path against the caller-supplied include/exclude patterns.

## Rationale

One module per predicate follows the language-registration pattern established in `../../19-language-registration.adr.md` — each concern is in its own module, registered explicitly by the scope-resolver. A consumer that imports only one predicate does not load the other. Tests for each predicate are in separate files co-located with the spec, matching the per-predicate module structure and making the evidence-to-code mapping traceable.

Placing `LayerDecision` and state types in a shared `src/lib/file-inclusion/types.ts` breaks the circular dependency that would arise if predicates imported from each other or if the scope-resolver's assembly types lived inside a predicate module. Every consumer of the predicates imports types from the shared file; no module becomes a type-only dependency of another.

Separate state types per predicate (`GitTrackingState`, `DomainPathFilterState`) express the distinct vocabulary each predicate consumes without forcing a union type that would require discriminant checks in the pipeline composer. The pipeline composer passes the appropriate state to each predicate; type safety is enforced by each function's signature.

Receiving the `IgnoreSourceReader` inside `GitTrackingState` preserves the predicate's purity contract: the reader is constructed once by the scope-resolver before the pipeline runs, so the predicate performs no I/O and its result is pure over `(path, state)`. Passing the reader through state mirrors how the domain-path-filter predicate receives its pattern set from the consumer's descriptor: all vocabulary arrives via the state parameter, never by the predicate reaching into external state.

Alternatives considered:

- **Both predicates in a single `predicates/index.ts` module.** Rejected because each predicate has a distinct concern and a separate test file; co-locating them obscures the per-predicate test coverage and couples two independent modules under one import point.
- **`LayerState` as a discriminated union accepted by a single `evaluate` function.** Rejected because a dispatcher that branches on a `kind` field degrades to a switch statement over predicates — the predicate is the unit of composition, not a case inside a dispatcher.
- **Predicate factories that close over state at construction time.** Rejected because factory-produced closures are harder to trace from a test assertion back to the predicate that produced the decision; direct `(path, state) => LayerDecision` functions with stable references preserve one-to-one traceability.
- **Inline the git-tracking layer's logic into the scope-resolver without a separate predicate module.** Rejected because the predicate-per-layer structure preserves the inspectability that the parent ADR mandates; a special-cased layer hidden inside the resolver breaks the uniform call shape.

## Trade-offs accepted

| Trade-off                                                                      | Mitigation / reasoning                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two separate modules require two import statements in the scope-resolver       | The scope-resolver already imports the ignore-source reader; adding explicit predicate imports is consistent with the established explicit-import-registration pattern          |
| `LayerDecision.detail` is optional; callers must handle absence                | Detail is diagnostic information; mandatory detail would force predicates to produce a string for the common `matched: false` case where no detail exists                       |
| Each predicate hardcodes its layer-name string in the returned `LayerDecision` | Layer names are structural pipeline identifiers, not user-configurable vocabulary; they identify the pipeline position and are not subject to descriptor-resolved configuration |

## Invariants

- Every function under `src/lib/file-inclusion/predicates/` has the signature `(path: string, state: T) => LayerDecision` where `T` is the predicate-specific state type declared in `src/lib/file-inclusion/types.ts`
- Repeated invocations of the same predicate with equal `path` and equal `state` return equal `LayerDecision` values
- The `LayerDecision.layer` string returned by each predicate is a structural constant that identifies the predicate's pipeline position; it does not vary with input
- No predicate module imports another predicate module

## Compliance

### Recognized by

Two modules under `src/lib/file-inclusion/predicates/` — `git-tracking.ts`, `domain-path-filter.ts` — each exporting exactly one function. A shared `src/lib/file-inclusion/types.ts` declaring `LayerDecision`, `GitTrackingState`, and `DomainPathFilterState`. The scope-resolver imports each predicate through an explicit named import; no module discovers predicates dynamically.

### MUST

- Each predicate is a pure function exported from its own module — `(path: string, state: <PredicateState>) => LayerDecision`; no class method, no factory closure, no side effects ([review])
- `LayerDecision`, `GitTrackingState`, and `DomainPathFilterState` are declared in `src/lib/file-inclusion/types.ts` and imported from there by predicate modules and the scope-resolver ([review])
- The git-tracking predicate delegates to `state.reader.isInIncludedSet(path)` and reports `matched: true` when the reader reports the path is not in the included set; the predicate performs no filesystem or subprocess I/O ([review])
- The domain-path-filter predicate evaluates the path against `state.include` and `state.exclude` pattern sets and reports `matched: true` for exclude matches and for paths outside every include pattern when `state.include` is non-empty ([review])
- The `detail` field in `LayerDecision` carries the specific matched value — the ignore source identified by the git-tracking reader, or the matched include/exclude pattern — when `matched` is `true`; `detail` is omitted when `matched` is `false` ([review])
- Tests exercise each predicate against in-memory state values; the git-tracking predicate's tests construct a real `IgnoreSourceReader` via the test-environment harness against real git worktrees ([review])

### NEVER

- Perform filesystem or subprocess I/O inside any predicate — all I/O belongs at construction time in the `IgnoreSourceReader` ([review])
- Import one predicate module from another — predicates are independent; cross-predicate imports create coupling without providing composition ([review])
- Hardcode pattern values or git-plumbing arguments in predicate modules — those values arrive through the state parameter ([review])
- Define an artifact-directory predicate, a hidden-prefix predicate, or any other default-exclusion predicate — `../11-ignore-defaults.pdr.md` declares git-tracking as the single default scope source and dot-prefixed entries as included by default ([review])
- Return a `LayerDecision` without a `layer` string — the layer name is mandatory and identifies the predicate's position in the pipeline decision trail ([review])
- `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests inject in-memory state and, for git-tracking predicate tests, construct real readers against tmpdir git worktrees via `../../22-test-environment.enabler/` ([review])
