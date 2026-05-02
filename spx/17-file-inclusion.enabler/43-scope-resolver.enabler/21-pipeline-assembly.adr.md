# Pipeline Assembly

## Purpose

This decision governs how the scope resolver assembles its filter pipeline, how the layer-sequence declaration is shaped, how explicit-override interacts with the pipeline, how filesystem traversal is performed under a walk root, and how types cross the scope resolver's public boundary. It applies to every module in `43-scope-resolver.enabler/`.

## Context

**Business impact:** The parent ADR (`../15-scope-composition.adr.md`) establishes that the layer sequence is declared once and consumed through a single accessor. The scope resolver is the only site that assembles and runs the pipeline; it must satisfy the parent's invariants while keeping its own implementation details local and testable at `l1`.

**Technical constraints:** spx is TypeScript ESM. The ignore-source reader parses the EXCLUDE file synchronously via `readFileSync` at construction — the pipeline drives this construction. Filesystem walking under `walkRoot` uses `node:fs/promises` `readdir` iteratively to enumerate file paths relative to `projectRoot`. The file-inclusion config descriptor (`../16-config.enabler/`) supplies all vocabulary (artifact-directory names, hidden-prefix character, ignore-source filename); the spec-tree descriptor supplies `specTreeRootSegment`. Layer predicate functions are imported from `32-path-predicates.enabler/`; each predicate is `(path, layerConfig) => LayerDecision`.

## Decision

The scope resolver declares its layer sequence as a `readonly` tuple of `LayerEntry` records in `layer-sequence.ts`, where each entry pairs a layer predicate function with a config extractor typed as `(resolverConfig: ScopeResolverConfig) => LayerConfig`. The resolver imports this tuple through a single named export — `LAYER_SEQUENCE` — and nothing else imports it. The pipeline runs once per `resolveScope` call: explicit paths short-circuit first; remaining paths from `walkRoot` are evaluated against each layer in declaration order. The public entry point is `resolveScope(projectRoot: string, request: ScopeRequest, config: ScopeResolverConfig): ScopeResult`.

## Rationale

A `readonly` tuple of `LayerEntry` records makes the declaration inspectable and type-safe: TypeScript enforces that every entry has a predicate and a config extractor, and the tuple type encodes position. Consuming the tuple through a single named export (`LAYER_SEQUENCE`) fulfills the parent ADR's constraint that the sequence "is declared in one place and consumed through a single accessor."

Config extractors in the `LayerEntry` records keep layer configuration derivation local to the layer-sequence module. The pipeline calls `entry.extractConfig(resolverConfig)` and passes the result to `entry.predicate` — the pipeline never knows layer-specific config field names, which means inserting a new layer does not touch pipeline code.

Passing `config: ScopeResolverConfig` as an explicit parameter to `resolveScope` rather than reading it from a global registry enables `l1` testing: tests construct `ScopeResolverConfig` values from production-owned constants and pass them directly, with no dependency on a loaded config registry. The resolver does not call `loadConfig()`; callers provide config.

Alternatives considered:

- **`LAYER_SEQUENCE` as a function list with no config extraction.** Each layer would need its config pulled by the pipeline based on layer name. Rejected because it couples pipeline code to layer-specific field names, breaking the "pipeline does not know layer details" invariant.
- **Layer sequence as a class with `.push()` extension.** Would make the sequence mutable at runtime. Rejected because the parent ADR's invariant is that consumers cannot alter the sequence; a mutable registry violates that.
- **Absolute paths in `ScopeEntry`.** Walking from `projectRoot` produces absolute paths natively; no mapping step. Rejected because absolute paths are machine-specific and inconsistent across environments; relative paths are tool-agnostic and sufficient for all adapter and consumer needs.

## Trade-offs accepted

| Trade-off                                                                 | Mitigation / reasoning                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Callers must construct and supply `ScopeResolverConfig`                   | Config construction happens once at the callsite; callers already hold `projectRoot` and the loaded config                |
| `walkRoot` traversal is synchronous in effect but async in implementation | `readdir` with `withFileTypes: true` in a depth-first loop is the lightest approach with no third-party dependency        |
| `LAYER_SEQUENCE` module cannot be imported by tests directly              | Tests verify layer-sequence shape through the compliance assertion that checks the export is a non-empty ordered tuple    |
| `ScopeEntry` paths are relative to `projectRoot`, not absolute            | Relative paths are tool-agnostic and consistent across machines; callers that need absolute paths join with `projectRoot` |

## Invariants

- `LAYER_SEQUENCE` is a `readonly` tuple exported by `layer-sequence.ts` and imported by `pipeline.ts` exclusively
- Each element in `LAYER_SEQUENCE` has shape `{ predicate: (path: string, config: LC) => LayerDecision; extractConfig: (r: ScopeResolverConfig) => LC }`
- Every caller-supplied explicit path in `ScopeRequest.explicit` reaches `ScopeResult.included` with `decisionTrail[0].layer === "explicit-override"`, regardless of which non-override layers would match it
- No non-override layer predicate is invoked against a caller-supplied explicit path
- Paths in `ScopeResult` entries are relative to `projectRoot`
- `ScopeResult.excluded` entries each carry a non-empty `decisionTrail`

## Compliance

### Recognized by

`layer-sequence.ts` exports exactly one symbol — `LAYER_SEQUENCE`. `pipeline.ts` imports `LAYER_SEQUENCE` and nothing else from `layer-sequence.ts`. Tests pass `ScopeResolverConfig` directly without loading the production config registry.

### MUST

- `LAYER_SEQUENCE` is exported from `layer-sequence.ts` and imported by `pipeline.ts` only — no other module imports it ([test](tests/scope-resolver.compliance.l1.test.ts))
- Each `LayerEntry` in `LAYER_SEQUENCE` declares both a `predicate` function and an `extractConfig` function — the pipeline composes them without naming layer-specific config fields ([review])
- Explicit-override short-circuit runs before any non-override layer evaluation — paths in `ScopeRequest.explicit` never reach a non-override predicate ([test](tests/scope-resolver.compliance.l1.test.ts))
- `resolveScope` accepts `config: ScopeResolverConfig` as an explicit parameter — no global config registry access inside the function ([review])
- All paths in `ScopeResult` entries are relative to `projectRoot` ([review])
- Tests construct `ScopeResolverConfig` from production-owned constants and real temp-project fixtures — no mocking, no hardcoded strings ([test](tests/scope-resolver.scenario.l1.test.ts))

### NEVER

- Import `LAYER_SEQUENCE` from any module other than `pipeline.ts` ([test](tests/scope-resolver.compliance.l1.test.ts))
- Invoke a layer predicate against a caller-supplied explicit path — override is unconditional ([test](tests/scope-resolver.compliance.l1.test.ts))
- Hardcode an artifact-directory name, hidden-prefix character, ignore-source filename, or spec-tree root segment in `pipeline.ts` or `layer-sequence.ts` ([review])
- Use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests use real temp-project filesystems via `../../22-test-environment.enabler/` ([review])
- Produce a `ScopeResult` missing a decision trail on any excluded entry, or missing the explicit-override trail entry on a caller-supplied path ([test](tests/scope-resolver.compliance.l1.test.ts))
