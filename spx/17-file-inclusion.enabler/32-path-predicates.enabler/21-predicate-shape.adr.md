# Path Predicate Shape

## Purpose

This decision governs how each ignore layer in the file-inclusion pipeline is expressed as a TypeScript module: its function signature, config type, decision return type, and module placement. It applies to every predicate module under `src/lib/file-inclusion/predicates/` and to every module that imports or composes those predicates.

## Context

**Business impact:** The file-inclusion pipeline evaluates three independent ignore layers — artifact-directory, hidden-prefix, and ignore-source — against each candidate path. Each layer must be inspectable in isolation for testing and auditing; the pipeline composer (`../43-scope-resolver.enabler/`) must invoke them through a uniform call shape that preserves decision-trail fidelity.

**Technical constraints:** spx is TypeScript ESM. The scope-composition decision (`../15-scope-composition.adr.md`) mandates that each ignore layer is a pure predicate typed as `(path: string, config: LayerConfig) => LayerDecision`; layers perform no filesystem I/O beyond what their construction phase declares. The file-inclusion descriptor governs all vocabulary constants (artifact-directory name set, hidden-prefix character) per `../../16-config.enabler/21-descriptor-registration.adr.md`. The ignore-source layer's reader is pre-constructed by the scope-resolver before invoking the predicate — the predicate receives the constructed `IgnoreSourceReader` as part of its config.

## Decision

Each path predicate is a pure function in its own module under `src/lib/file-inclusion/predicates/`, accepting `(path: string, config: <PedicateConfig>)` and returning `LayerDecision`. `LayerDecision` and the per-predicate config types are declared in `src/lib/file-inclusion/types.ts`, which every predicate module imports. The three predicate modules are `artifact-directory.ts`, `hidden-prefix.ts`, and `ignore-source.ts`. Each module exports exactly one predicate function. The artifact-directory predicate splits the path into segments and checks segment membership against the configured set. The hidden-prefix predicate extracts the basename (last path segment) and checks the configured prefix character. The ignore-source predicate delegates to `IgnoreSourceReader.isUnderIgnoreSource`.

## Rationale

One module per predicate follows the language-registration pattern established in `../../19-language-registration.adr.md` — each concern is in its own module, registered explicitly by the scope-resolver. A consumer that imports only one predicate does not load the others. Tests for each predicate are in separate files co-located with the spec, matching the per-predicate module structure and making the evidence-to-code mapping traceable.

Placing `LayerDecision` and config types in a shared `src/lib/file-inclusion/types.ts` breaks the circular dependency that would arise if predicates imported from each other or if the scope-resolver's assembly types lived inside a predicate module. Every consumer of the predicates imports types from the shared file; no module becomes a type-only dependency of another.

Separate config types per predicate (`ArtifactDirectoryConfig`, `HiddenPrefixConfig`, `IgnoreSourcePredicateConfig`) express the distinct vocabulary each predicate consumes without forcing a union type that would require discriminant checks in the pipeline composer. The pipeline composer passes the appropriate config to each predicate; type safety is enforced by each function's signature.

Receiving the `IgnoreSourceReader` inside `IgnoreSourcePredicateConfig` preserves the predicate's purity contract: the reader is constructed once by the scope-resolver before the pipeline runs, so the predicate performs no I/O and its result is pure over `(path, config)`. Passing the reader through config mirrors how the artifact-directory and hidden-prefix predicates receive their vocabulary from the file-inclusion descriptor: all vocabulary arrives via the config parameter, never by the predicate reaching into external state.

Alternatives considered:

- **All three predicates in a single `predicates/index.ts` module.** Rejected because each predicate has a distinct concern and a separate test file; co-locating them obscures the per-predicate test coverage and couples three independent modules under one import point.
- **`LayerConfig` as a discriminated union accepted by a single `evaluate` function.** Rejected because a dispatcher that branches on a `kind` field degrades to a switch statement over predicates — the predicate is the unit of composition, not a case inside a dispatcher.
- **Predicate factories that close over a config at construction time.** Rejected because factory-produced closures are harder to trace from a test assertion back to the predicate that produced the decision; direct `(path, config) => LayerDecision` functions with stable references preserve one-to-one traceability.

## Trade-offs accepted

| Trade-off                                                                      | Mitigation / reasoning                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three separate modules require three import statements in the scope-resolver   | The scope-resolver already imports the ignore-source reader; adding explicit predicate imports is consistent with the established explicit-import-registration pattern          |
| `LayerDecision.detail` is optional; callers must handle absence                | Detail is diagnostic information; mandatory detail would force predicates to produce a string for the common `matched: false` case where no detail exists                       |
| Each predicate hardcodes its layer-name string in the returned `LayerDecision` | Layer names are structural pipeline identifiers, not user-configurable vocabulary; they identify the pipeline position and are not subject to descriptor-resolved configuration |

## Invariants

- Every function under `src/lib/file-inclusion/predicates/` has the signature `(path: string, config: T) => LayerDecision` where `T` is the predicate-specific config type declared in `src/lib/file-inclusion/types.ts`
- Repeated invocations of the same predicate with equal `path` and equal `config` return equal `LayerDecision` values
- The `LayerDecision.layer` string returned by each predicate is a structural constant that identifies the predicate's pipeline position; it does not vary with input
- No predicate module imports another predicate module

## Compliance

### Recognized by

Three modules under `src/lib/file-inclusion/predicates/` — `artifact-directory.ts`, `hidden-prefix.ts`, `ignore-source.ts` — each exporting exactly one function. A shared `src/lib/file-inclusion/types.ts` declaring `LayerDecision`, `ArtifactDirectoryConfig`, `HiddenPrefixConfig`, and `IgnoreSourcePredicateConfig`. The scope-resolver imports each predicate through an explicit named import; no module discovers predicates dynamically.

### MUST

- Each predicate is a pure function exported from its own module — `(path: string, config: <PredicateConfig>) => LayerDecision`; no class method, no factory closure, no side effects ([review])
- `LayerDecision`, `ArtifactDirectoryConfig`, `HiddenPrefixConfig`, and `IgnoreSourcePredicateConfig` are declared in `src/lib/file-inclusion/types.ts` and imported from there by predicate modules and the scope-resolver ([review])
- The artifact-directory predicate splits `path` by `/` and checks each segment against `config.artifactDirectories`; membership is segment-based, not prefix-based ([review])
- The hidden-prefix predicate extracts the last path segment as the basename and checks whether it starts with `config.hiddenPrefix` ([review])
- The ignore-source predicate delegates to `config.reader.isUnderIgnoreSource(path)` and reflects the result in `LayerDecision.matched`; the predicate performs no filesystem I/O ([review])
- The `detail` field in `LayerDecision` carries the specific matched value — the artifact-directory segment, or the matched ignore-source entry segment — when `matched` is `true`; `detail` is omitted when `matched` is `false` ([review])
- Tests exercise each predicate against in-memory config values; the ignore-source predicate's tests construct a real `IgnoreSourceReader` via the test-environment harness ([review])

### NEVER

- Perform filesystem I/O inside any predicate — all I/O belongs at construction time in the `IgnoreSourceReader` ([review])
- Import one predicate module from another — predicates are independent; cross-predicate imports create coupling without providing composition ([review])
- Hardcode artifact-directory names or the hidden-prefix character in predicate modules — those values arrive through the config parameter from the file-inclusion descriptor ([review])
- Return a `LayerDecision` without a `layer` string — the layer name is mandatory and identifies the predicate's position in the pipeline decision trail ([review])
- `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests inject in-memory config and, for ignore-source predicate tests, construct real readers against tmpdir fixtures via `../../22-test-environment.enabler/` ([review])
