# Pipeline Assembly

The scope resolver declares its layer sequence as a single `readonly` tuple of `LayerEntry` records — each pairing a layer predicate with a state extractor — exported under one name (`LAYER_SEQUENCE`) and imported only by the pipeline. The pipeline runs once per `resolveScope(productDir, request, config)` call: it constructs the git-tracking reader up front from the request's override flags, short-circuits caller-supplied explicit paths before any layer runs, then evaluates the remaining walked paths against each layer in declaration order, producing a `ScopeResult` of `productDir`-relative paths with per-path decision trails. Config is an explicit parameter, so the resolver reads no global registry.

## Rationale

A `readonly` tuple of `LayerEntry` records makes the declaration inspectable and type-safe — TypeScript enforces that every entry has a `predicate` and a state extractor, and the tuple type encodes position — and consuming it through a single named export (`LAYER_SEQUENCE`) fulfills the parent constraint from `spx/17-file-inclusion.enabler/15-scope-composition.adr.md` that the sequence is declared in one place and consumed through a single accessor. State extractors in the records keep layer-state derivation local to the layer-sequence module: the pipeline calls `entry.extractState(resolverState)` and passes the result to `entry.predicate`, so it never names layer-specific state fields and inserting a new layer does not touch pipeline code.

Constructing the ignore-source reader once per `resolveScope` call keeps the git-plumbing invocation outside the per-path predicate loop — override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) flow from `ScopeRequest` into the reader's construction, the git-tracking predicate consults the resulting reader, and the pipeline pays for git plumbing once and queries the in-memory set thereafter. Passing `config: ScopeResolverConfig` as an explicit parameter rather than reading a global registry enables `l1` testing: tests construct config values from production-owned constants and pass them directly, with no dependency on a loaded config registry, and the resolver never calls `loadConfig()`. Filesystem walking under `walkRoot` uses `node:fs/promises` `readdir` with `withFileTypes` in a depth-first loop — the lightest approach with no third-party dependency — and yields paths relative to `productDir`, which are tool-agnostic and consistent across machines.

Rejected: `LAYER_SEQUENCE` as a bare function list with no state extraction (the pipeline would pull each layer's state by layer name, coupling pipeline code to layer-specific field names); the layer sequence as a class with `.push()` extension (mutable at runtime, violating the parent invariant that consumers cannot alter the sequence); constructing the ignore-source reader inside each per-path predicate invocation (subprocess overhead dominates pipeline cost, and the parent ADR mandates git plumbing at construction time); and absolute paths in `ScopeEntry` (machine-specific and inconsistent across environments, where relative paths are tool-agnostic and callers that need absolute paths join with `productDir`).

## Invariants

- `LAYER_SEQUENCE` is a `readonly` tuple exported by `layer-sequence.ts` and imported by `pipeline.ts` exclusively.
- Each element of `LAYER_SEQUENCE` has shape `{ predicate: (path: string, state: LS) => LayerDecision; extractState: (r: ScopeResolverState) => LS }`.
- The ignore-source reader is constructed once per `resolveScope` invocation; per-path predicate evaluation reads from the constructed reader's in-memory set.
- `resolveScope` fails fast when the git-tracking reader cannot be constructed — `productDir` outside a git working tree — with the error originating in the reader's construction.
- Every caller-supplied explicit path in `ScopeRequest.explicit` reaches `ScopeResult.included` with `decisionTrail[0].layer === "explicit-override"`, regardless of which non-override layers would match it.
- No non-override layer predicate is invoked against a caller-supplied explicit path.
- Paths in `ScopeResult` entries are relative to `productDir`.
- Each `ScopeResult.excluded` entry carries a non-empty `decisionTrail`.

## Verification

### Testing

- ALWAYS: `LAYER_SEQUENCE` is exported from `layer-sequence.ts` and imported by `pipeline.ts` only — no other module imports it ([compliance])
- ALWAYS: the explicit-override short-circuit runs before any non-override layer evaluation — paths in `ScopeRequest.explicit` never reach a non-override predicate ([compliance])
- ALWAYS: tests construct `ScopeResolverConfig` from production-owned constants and real temp git worktrees — no mocking, no hardcoded strings ([scenario])
- NEVER: import `LAYER_SEQUENCE` from any module other than `pipeline.ts` ([compliance])
- NEVER: invoke a layer predicate against a caller-supplied explicit path — the override is unconditional ([compliance])
- NEVER: produce a `ScopeResult` missing a decision trail on any excluded entry, or missing the explicit-override trail entry on a caller-supplied path ([compliance])

### Audit

- ALWAYS: each `LayerEntry` in `LAYER_SEQUENCE` declares both a `predicate` function and an `extractState` function — the pipeline composes them without naming layer-specific state fields ([audit])
- ALWAYS: the ignore-source reader is constructed before pipeline evaluation and provides the git-tracking layer's state for the entire `resolveScope` call ([audit])
- ALWAYS: `resolveScope` accepts `config: ScopeResolverConfig` as an explicit parameter — no global config-registry access inside the function ([audit])
- ALWAYS: all paths in `ScopeResult` entries are relative to `productDir` ([audit])
- NEVER: shell out to git from `pipeline.ts` or `layer-sequence.ts` — git invocation is the ignore-source reader's responsibility ([audit])
- NEVER: hardcode any file-inclusion vocabulary constant — the spec-tree root segment or any future descriptor-owned constant — in `pipeline.ts` or `layer-sequence.ts` ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism — tests use real temp git worktrees via `spx/22-test-environment.enabler/` ([audit])
