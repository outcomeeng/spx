# Pipeline Assembly

## Purpose

This decision governs how the scope resolver assembles its filter pipeline, how the layer-sequence declaration is shaped, how explicit-override interacts with the pipeline, how the git-tracking layer's state is constructed, how filesystem traversal is performed under a walk root, and how types cross the scope resolver's public boundary. It applies to every module in `43-scope-resolver.enabler/`.

## Context

**Business impact:** The parent ADR (`../15-scope-composition.adr.md`) establishes that the layer sequence is declared once and consumed through a single accessor, and that the git-tracking layer reads its state from a single git-plumbing query per resolver invocation. The scope resolver is the only site that assembles and runs the pipeline; it must satisfy the parent's invariants while keeping its own implementation details local and testable at `l1`.

**Technical constraints:** spx is TypeScript ESM. The ignore-source reader (`../21-ignore-source.enabler/`) invokes git plumbing once at construction and exposes membership queries against the resulting tracked-or-untracked-not-ignored set — the pipeline drives this construction. Filesystem walking under `walkRoot` uses `node:fs/promises` `readdir` iteratively to enumerate file paths relative to `productDir`. The file-inclusion config descriptor (`../16-config.enabler/`) supplies any subtree-owned vocabulary; the spec-tree descriptor supplies `specTreeRootSegment` per `spx/23-spec-tree.enabler/`. Layer predicate functions are imported from `32-path-predicates.enabler/`; each predicate is `(path, layerState) => LayerDecision`.

## Decision

The scope resolver declares its layer sequence as a `readonly` tuple of `LayerEntry` records in `layer-sequence.ts`, where each entry pairs a layer predicate function with a state extractor typed as `(resolverState: ScopeResolverState) => LayerState`. The resolver imports this tuple through a single named export — `LAYER_SEQUENCE` — and nothing else imports it. The pipeline runs once per `resolveScope` call: the git-tracking reader is constructed up front from the resolver's request (including any override flags), explicit paths short-circuit first; remaining paths from `walkRoot` are evaluated against each layer in declaration order. The public entry point is `resolveScope(productDir: string, request: ScopeRequest, config: ScopeResolverConfig): ScopeResult`.

## Rationale

A `readonly` tuple of `LayerEntry` records makes the declaration inspectable and type-safe: TypeScript enforces that every entry has a predicate and a state extractor, and the tuple type encodes position. Consuming the tuple through a single named export (`LAYER_SEQUENCE`) fulfills the parent ADR's constraint that the sequence "is declared in one place and consumed through a single accessor."

State extractors in the `LayerEntry` records keep layer state derivation local to the layer-sequence module. The pipeline calls `entry.extractState(resolverState)` and passes the result to `entry.predicate` — the pipeline never knows layer-specific state field names, which means inserting a new layer does not touch pipeline code.

Constructing the ignore-source reader once per `resolveScope` call keeps the git plumbing invocation outside the per-path predicate evaluation loop. Override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) flow from `ScopeRequest` into the reader's construction; the resulting reader is what the git-tracking layer's predicate consults. The pipeline thus pays for git plumbing once and queries the resulting in-memory set thereafter.

Passing `config: ScopeResolverConfig` as an explicit parameter to `resolveScope` rather than reading it from a global registry enables `l1` testing: tests construct `ScopeResolverConfig` values from production-owned constants and pass them directly, with no dependency on a loaded config registry. The resolver does not call `loadConfig()`; callers provide config.

Alternatives considered:

- **`LAYER_SEQUENCE` as a function list with no state extraction.** Each layer would need its state pulled by the pipeline based on layer name. Rejected because it couples pipeline code to layer-specific field names, breaking the "pipeline does not know layer details" invariant.
- **Layer sequence as a class with `.push()` extension.** Would make the sequence mutable at runtime. Rejected because the parent ADR's invariant is that consumers cannot alter the sequence; a mutable registry violates that.
- **Construct the ignore-source reader inside each per-path predicate invocation.** Each predicate evaluation would shell out to git. Rejected because the subprocess overhead dominates pipeline cost; the parent ADR mandates that git plumbing happens at construction time.
- **Absolute paths in `ScopeEntry`.** Walking from `productDir` produces absolute paths natively; no mapping step. Rejected because absolute paths are machine-specific and inconsistent across environments; relative paths are tool-agnostic and sufficient for all adapter and consumer needs.

## Trade-offs accepted

| Trade-off                                                                 | Mitigation / reasoning                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Callers must construct and supply `ScopeResolverConfig`                   | Config construction happens once at the callsite; callers already hold `productDir` and the loaded config                |
| `walkRoot` traversal is synchronous in effect but async in implementation | `readdir` with `withFileTypes: true` in a depth-first loop is the lightest approach with no third-party dependency       |
| Git plumbing fails outside a git working tree                             | The ignore-source reader's construction fails fast with an actionable error naming the missing git context               |
| `LAYER_SEQUENCE` module cannot be imported by tests directly              | Tests verify layer-sequence shape through the compliance assertion that checks the export is a non-empty ordered tuple   |
| `ScopeEntry` paths are relative to `productDir`, not absolute             | Relative paths are tool-agnostic and consistent across machines; callers that need absolute paths join with `productDir` |

## Invariants

- `LAYER_SEQUENCE` is a `readonly` tuple exported by `layer-sequence.ts` and imported by `pipeline.ts` exclusively
- Each element in `LAYER_SEQUENCE` has shape `{ predicate: (path: string, state: LS) => LayerDecision; extractState: (r: ScopeResolverState) => LS }`
- The ignore-source reader is constructed once per `resolveScope` invocation; per-path predicate evaluation reads from the constructed reader's in-memory set
- Every caller-supplied explicit path in `ScopeRequest.explicit` reaches `ScopeResult.included` with `decisionTrail[0].layer === "explicit-override"`, regardless of which non-override layers would match it
- No non-override layer predicate is invoked against a caller-supplied explicit path
- Paths in `ScopeResult` entries are relative to `productDir`
- `ScopeResult.excluded` entries each carry a non-empty `decisionTrail`

## Compliance

### Recognized by

`layer-sequence.ts` exports exactly one symbol — `LAYER_SEQUENCE`. `pipeline.ts` imports `LAYER_SEQUENCE` and nothing else from `layer-sequence.ts`. Tests pass `ScopeResolverConfig` directly without loading the production config registry.

### MUST

- `LAYER_SEQUENCE` is exported from `layer-sequence.ts` and imported by `pipeline.ts` only — no other module imports it ([test](tests/scope-resolver.compliance.l1.test.ts))
- Each `LayerEntry` in `LAYER_SEQUENCE` declares both a `predicate` function and an `extractState` function — the pipeline composes them without naming layer-specific state fields ([review])
- The ignore-source reader is constructed before pipeline evaluation and provides the git-tracking layer's state for the entire `resolveScope` call ([review])
- Explicit-override short-circuit runs before any non-override layer evaluation — paths in `ScopeRequest.explicit` never reach a non-override predicate ([test](tests/scope-resolver.compliance.l1.test.ts))
- `resolveScope` accepts `config: ScopeResolverConfig` as an explicit parameter — no global config registry access inside the function ([review])
- All paths in `ScopeResult` entries are relative to `productDir` ([review])
- Tests construct `ScopeResolverConfig` from production-owned constants and real temp git worktrees — no mocking, no hardcoded strings ([test](tests/scope-resolver.scenario.l1.test.ts))

### NEVER

- Import `LAYER_SEQUENCE` from any module other than `pipeline.ts` ([test](tests/scope-resolver.compliance.l1.test.ts))
- Invoke a layer predicate against a caller-supplied explicit path — override is unconditional ([test](tests/scope-resolver.compliance.l1.test.ts))
- Shell out to git from `pipeline.ts` or `layer-sequence.ts` — git invocation is the ignore-source reader's responsibility ([review])
- Hardcode any file-inclusion vocabulary constant — the spec-tree root segment or any future descriptor-owned constant — in `pipeline.ts` or `layer-sequence.ts` ([review])
- Use `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests use real temp git worktrees via `../../22-test-environment.enabler/` ([review])
- Produce a `ScopeResult` missing a decision trail on any excluded entry, or missing the explicit-override trail entry on a caller-supplied path ([test](tests/scope-resolver.compliance.l1.test.ts))
