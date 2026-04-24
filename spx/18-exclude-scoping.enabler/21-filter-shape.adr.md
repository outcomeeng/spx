# Exclude Filter Shape

## Purpose

This decision governs how the `spx/EXCLUDE` convention is materialized as a shared TypeScript module that quality-gate enablers consume for both path filtering and tool-specific CLI flag generation.

## Context

**Business impact:** `41-testing.enabler` and `41-validation.enabler` both need to recognize which spec-tree nodes are excluded from quality gates. The exclusion concern has two consumer surfaces: deciding whether a file path under `spx/` should be processed by a runner, and emitting tool-specific flags (`--ignore=` for pytest, `--exclude=...**` for vitest) when invoking third-party runners that perform their own file discovery. Both surfaces derive from the same parsed state; diverging implementations would produce runner-specific inconsistencies that silently ship broken exclusions.

**Technical constraints:** spx is TypeScript ESM. The `spx/EXCLUDE` file format is line-oriented — one node path per non-comment, non-blank line. Its grammar is distinct from `spx.config.yaml`'s typed-section model. Path resolution follows `../15-worktree-resolution.pdr.md` — `git rev-parse --show-toplevel` for tracked-file reads, passed in as `projectRoot`. Path matching operates on relative paths under `spx/` — the filter never touches paths that could resolve outside the tracked spec tree.

## Decision

Exclude scoping exposes a single factory `createExcludeFilter(projectRoot: string): ExcludeFilter` that reads and parses `spx/EXCLUDE` at construction time and returns an immutable object with two query methods: `isExcluded(relativePath: string): boolean` for per-file filtering and `toToolFlags(tool: ToolName): string[]` for tool-specific CLI flag generation. The factory is the sole reader of `spx/EXCLUDE`; consumers never parse the file themselves.

## Rationale

Factory-with-injected-projectRoot mirrors `resolveConfig(projectRoot)` from `../16-config.enabler/21-descriptor-registration.adr.md` — consumers already pass a resolved `projectRoot` per `../15-worktree-resolution.pdr.md`, so the same contract applies. Tests construct filters against tmpdir fixtures containing real EXCLUDE files, making path-filter logic verifiable at `l1` without filesystem mocking.

Exposing both operations (`isExcluded` and `toToolFlags`) on a single object makes parse-once semantics observable: the two surfaces cannot diverge because they query the same parsed state. Separating them into two factories would force callers to coordinate construction timing or accept duplicated parsing. A single factory with two methods is the narrowest boundary that preserves consistency.

`spx/EXCLUDE` is not registered as a yaml descriptor in the config registry. The file's grammar is a line list with comments, not a typed yaml section, and its lifecycle (entries added and removed as implementation lands) is editorial rather than configurational. Forcing it through the yaml descriptor model would add ceremony (`excluded: [- path, - path]`) without benefit and would obscure the "one node per line" editing contract that agents and humans currently share.

Alternatives considered:

- **Pure functions `isExcluded(projectRoot, path)` and `toToolFlags(projectRoot, tool)`.** Rejected because each call re-reads and re-parses `spx/EXCLUDE`. Within a single CLI invocation, callers check exclusion per-file and generate flags per-tool; repeated I/O is wasteful and the two call paths would process the same file independently, leaving a window for divergence if parse logic accumulates corner cases.
- **Register as a config descriptor at `src/exclude/config.ts`.** Rejected because the file's grammar is not yaml-sectional and its consumer model is not "domain resolves its section through typed accessor." The descriptor abstraction is designed for typed, defaulted, validator-owned configuration — not for a plain-text node list.
- **Separate `isExcluded` module and `toToolFlags` module sharing a private parser.** Rejected because it introduces a third module whose only purpose is to hold shared state. The factory pattern encapsulates that state behind a narrow public API without the extra file.
- **Class-based `ExcludeFilter` with constructor reading the file.** Rejected because the existing codebase uses factory functions (`resolveConfig`, `withTestEnv`) for this pattern. A class would introduce inconsistency without adding any capability factories lack.

## Trade-offs accepted

| Trade-off                                                    | Mitigation / reasoning                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factory hides parse timing from callers                      | `createExcludeFilter` is synchronous and idempotent; multiple filter instances within one invocation are cheap. Callers that edit `spx/EXCLUDE` mid-run receive stale results, but CLI invocations are short-lived. |
| Adding a new tool's flag format requires editing one module  | Tool-flag generation is narrow: pytest and vitest cover the current language set. A new tool adds one branch in `toToolFlags`; the alternative of per-tool modules scatters the concern.                            |
| Tool names are union-typed rather than descriptor-registered | Tool flag formats are few (two) and stable. A descriptor registry for this concern would add ceremony beyond the `19-language-registration.adr.md` precedent without commensurate benefit.                          |

## Invariants

- The same `projectRoot` and same `spx/EXCLUDE` content always produce the same filter behavior for both `isExcluded` and `toToolFlags`
- `isExcluded(p)` returns `true` if and only if `p` is inside a directory named by a non-comment, non-blank EXCLUDE entry (prefix match on `spx/{entry}/`)
- `toToolFlags(tool)` returns a flag list whose entries all reference the same set of directories that `isExcluded` reports as excluded
- The factory rejects an EXCLUDE entry that would resolve outside `spx/` — absolute paths, traversal sequences, and separator patterns that escape the tracked root fail at construction, never at query time

## Compliance

### Recognized by

A single module under `src/exclude/` exports `createExcludeFilter(projectRoot: string): ExcludeFilter` and the `ExcludeFilter` and `ToolName` types. Consumers in `src/validation/` and `src/testing/` (once implemented) import the factory, construct a filter once per command invocation, and query it through `isExcluded` and `toToolFlags`. No module outside `src/exclude/` reads `spx/EXCLUDE` or parses its contents.

### MUST

- Exclude-scoping is exposed as `createExcludeFilter(projectRoot: string): ExcludeFilter` — a factory function, not a class or method on another module ([review])
- The factory accepts `projectRoot` as a parameter — enables `l1` tests that construct filters against tmpdir fixtures ([review])
- `createExcludeFilter` reads and parses `spx/EXCLUDE` once at construction time; the returned `ExcludeFilter` is immutable and its query methods are pure over parsed state ([review])
- Path validation runs during parse — malformed EXCLUDE entries fail at factory invocation with an error naming the offending entry ([review])
- Tests construct real `spx/EXCLUDE` files under tmpdirs via the shared spec-tree test harness; filter behavior is verified against those fixtures ([review])

### NEVER

- Read, parse, or reference `spx/EXCLUDE` from any module other than `src/exclude/` — prevents divergent parse implementations across consumers ([review])
- `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism for `node:fs` / `node:fs/promises` — tests use real fixtures under tmpdirs ([review])
- Accept an EXCLUDE entry that is absolute, contains traversal sequences, or resolves outside `spx/` — reject at parse time ([review])
- Expose parsed state or per-entry internals on the returned `ExcludeFilter` — the public API is `isExcluded` and `toToolFlags` only ([review])
- Write back to `spx/EXCLUDE` or any other project configuration file — exclusion is read-only; edits are editorial and happen outside the runtime ([review])
