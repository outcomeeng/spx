# Ignore-Source Reader Shape

## Purpose

This decision governs how the configured ignore-source file is materialized as a shared TypeScript module that the path-predicates and scope-resolver children consume. It applies to every module in the `21-ignore-source.enabler/` subtree and to every file-inclusion consumer that queries ignore-source membership.

## Context

**Business impact:** The ignore-source layer appears in the file-inclusion composition sequence as the tracked-spec-tree exclusion surface. Downstream consumers (path-predicates evaluating the ignore-source layer, scope-resolver assembling decision trails, tool-adapters producing exclusion flags via the resolved scope) all derive from the same parsed state. Diverging implementations would produce layer-specific interpretations of the same file and silently ship inconsistent exclusion semantics.

**Technical constraints:** spx is TypeScript ESM. The ignore-source file format is line-oriented — one node path per non-comment, non-blank line. Its grammar is distinct from the typed-section yaml descriptor model of `../../16-config.enabler/21-descriptor-registration.adr.md`. Root resolution follows `../../15-worktree-resolution.pdr.md` — `git rev-parse --show-toplevel` for tracked-file reads, passed in as `projectRoot`. Every vocabulary constant the reader consumes — the ignore-source filename, the spec-tree root segment — comes from the file-inclusion config descriptor. Path matching operates on relative paths under the spec-tree root segment; the reader rejects entries that resolve outside the root at construction time.

## Decision

The ignore-source layer exposes a single factory `createIgnoreSourceReader(projectRoot: string, config: IgnoreSourceReaderConfig): IgnoreSourceReader` that reads and parses the configured ignore-source file at construction and returns an immutable object whose public surface is a membership query (`isUnderIgnoreSource(relativePath: string): boolean`) and an entries accessor (`entries(): readonly IgnoreSourceEntry[]`). The factory is the sole reader of the configured ignore-source file; consumers never parse the file themselves.

`IgnoreSourceReaderConfig` carries pre-resolved vocabulary from the file-inclusion config descriptor:

```typescript
type IgnoreSourceReaderConfig = {
  readonly ignoreSourceFilename: string;
  readonly specTreeRootSegment: string;
};
```

The caller resolves the file-inclusion config descriptor before constructing the reader and passes the relevant fields as `config`. The factory performs no config file I/O and remains fully synchronous.

## Rationale

Factory-with-injected-projectRoot mirrors `resolveConfig(projectRoot)` from `../../16-config.enabler/21-descriptor-registration.adr.md` — consumers already pass a resolved `projectRoot` per `../../15-worktree-resolution.pdr.md`, so the same contract applies. Tests construct readers against tmpdir fixtures containing real ignore-source files via `../../22-test-environment.enabler/`, making reader behavior verifiable at `l1` without filesystem mocking.

The reader's public surface is narrow by design. Parsing and membership queries live here; tool-specific flag generation lives in `../54-tool-adapters.enabler/`; composition with other filter layers lives in `../43-scope-resolver.enabler/`. A reader that exposes only what its immediate consumers require cannot be misused as a universal filter or a flag generator, and growth in downstream concerns does not distort its public surface.

Immediate construction-time parsing collapses the "when does the file get read" question to one answer: exactly once, at `createIgnoreSourceReader`. Consumers cannot accidentally re-read mid-invocation, cannot observe partial parses, and cannot introduce caching behavior that drifts from the parsed state. Validation at parse time means malformed entries surface at construction with a named offender, rather than at query time when the error's connection to the file is lost.

The ignore-source file is not registered as a yaml descriptor in the config registry. Its grammar is a line list with comments, not a typed yaml section, and its lifecycle (entries added and removed as implementation lands) is editorial rather than configurational. Forcing it through the yaml descriptor model would add ceremony without benefit and would obscure the one-node-per-line editing contract that agents and humans share.

Alternatives considered:

- **Pure functions `isUnderIgnoreSource(projectRoot, path)` and `entries(projectRoot)`.** Each call re-reads the file. Rejected because repeated I/O is wasteful within a single CLI invocation and the two call paths would process the same file independently, leaving a window for divergence if parse logic accumulates corner cases.
- **Register as a config descriptor at `src/file-inclusion/ignore-source/config.ts`.** Rejected because the file's grammar is not yaml-sectional and its consumer model is not "domain resolves its section through typed accessor." The descriptor abstraction is designed for typed, defaulted, validator-owned configuration — not for a plain-text node list.
- **Combined `isUnderIgnoreSource` + `toToolFlags` factory (the pre-decomposition shape).** Rejected because tool-flag production is the tool-adapters child's concern under the new file-inclusion composition; co-locating it here would recreate the pre-decomposition tangle and violate the layer-boundary invariants declared in `../15-scope-composition.adr.md`.
- **Class-based `IgnoreSourceReader` with constructor reading the file.** Rejected because the harness uses factory functions (`resolveConfig`, `withTestEnv`) for this pattern. A class would introduce inconsistency without adding any capability factories lack.

## Trade-offs accepted

| Trade-off                                                                                       | Mitigation / reasoning                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factory hides parse timing from callers                                                         | `createIgnoreSourceReader` is synchronous and idempotent; multiple reader instances within one invocation are cheap. Callers that edit the ignore-source mid-run receive stale results, but CLI invocations are short-lived. |
| Caller must resolve config before constructing the reader                                       | The scope-resolver (the natural construction site) already resolves config once per invocation; passing the two relevant fields as `IgnoreSourceReaderConfig` adds no extra I/O and keeps the factory synchronous            |
| Splitting tool-flag generation into `../54-tool-adapters.enabler/` costs one cross-child import | The split is a direct consequence of `../15-scope-composition.adr.md`; the cost is a static import boundary that the type system enforces                                                                                    |
| Entries accessor exposes parsed state shape                                                     | The shape is intentionally narrow (a list of node-path strings and parse provenance); it is the evidence the scope-resolver needs for decision trails, and it is not a path to mutable state                                 |

## Invariants

- The same `projectRoot`, the same `IgnoreSourceReaderConfig`, and the same ignore-source file content always produce equal `IgnoreSourceReader` behavior — equal `entries()` output and equal `isUnderIgnoreSource` decisions across all input paths
- `isUnderIgnoreSource(p)` returns `true` if and only if `p` is inside a directory named by a non-comment, non-blank, validated entry of the ignore-source file (prefix match on `{spec-tree-root-segment}/{entry}/`)
- The factory rejects entries that would resolve outside the configured spec-tree root segment — absolute paths, traversal sequences, separator patterns that escape the root — at construction, never at query time
- The factory performs no config file I/O; all vocabulary constants it consumes are carried by the `IgnoreSourceReaderConfig` parameter supplied by the caller
- No module outside this enabler reads the ignore-source file, parses its grammar, or validates its entries

## Compliance

### Recognized by

One module inside this enabler exports `createIgnoreSourceReader(projectRoot: string, config: IgnoreSourceReaderConfig): IgnoreSourceReader` and the `IgnoreSourceReader`, `IgnoreSourceEntry`, and `IgnoreSourceReaderConfig` types. The path-predicates child's ignore-source predicate imports the reader factory and consults the reader through `isUnderIgnoreSource`. The scope-resolver constructs the reader by passing pre-resolved vocabulary as `IgnoreSourceReaderConfig`, then consumes `entries()` for decision-trail population. No other module across the spx codebase reads the ignore-source file, parses its grammar, or references its filename as a source literal.

### MUST

- The reader is exposed as `createIgnoreSourceReader(projectRoot: string, config: IgnoreSourceReaderConfig): IgnoreSourceReader` — a factory function, not a class, not a method on another module ([review])
- The factory accepts `projectRoot` as a parameter per `../../15-worktree-resolution.pdr.md` ([review])
- The factory accepts `IgnoreSourceReaderConfig` as a second parameter carrying pre-resolved vocabulary; it performs no config file I/O and remains fully synchronous ([review])
- The factory reads and parses the configured ignore-source file once at construction; query methods are pure over parsed state ([review])
- Path validation runs during parse — malformed entries cause construction to fail with an error naming the offending entry and the parse position ([review])
- The configured ignore-source filename and the configured spec-tree root segment are read through the file-inclusion descriptor at every use site within this enabler ([review])
- Tests construct real ignore-source files under temp project roots via `../../22-test-environment.enabler/`; reader behavior is verified against those fixtures ([review])

### NEVER

- Read, parse, or reference the ignore-source file from any module outside this enabler ([review])
- Call `resolveConfig` or any config resolution function inside the factory — vocabulary is passed as pre-resolved `IgnoreSourceReaderConfig` by the caller ([review])
- `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism for `node:fs` / `node:fs/promises` — tests use real fixtures under tmpdirs ([review])
- Accept an entry that is absolute, contains traversal sequences, or resolves outside the configured spec-tree root segment — reject at parse time ([review])
- Expose tool-specific flag generation from this enabler — that surface lives in `../54-tool-adapters.enabler/` ([review])
- Write back to the ignore-source file or any other project configuration file — the reader is read-only; edits are editorial and happen outside the runtime ([review])
- Hardcode the ignore-source filename, the spec-tree root segment, or any path literal with product meaning inside this enabler's modules — every such value is descriptor-resolved ([review])
