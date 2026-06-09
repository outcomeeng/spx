# Ignore-Source Reader Shape

The git-tracking layer is materialized as a single factory that invokes git plumbing once at construction against a caller-resolved product directory and returns an immutable reader exposing only a membership query and an applied-overrides accessor — the sole site across spx that shells out to git for scope determination. The caller passes the ripgrep override vocabulary (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) as structured config, which the factory translates into git plumbing arguments at construction, so every query method stays pure over the constructed in-memory set.

## Rationale

The factory is `createIgnoreSourceReader(productDir, config)`, returning a reader whose public surface is `isInIncludedSet(relativePath)` and `appliedOverrides()`:

```typescript
type IgnoreSourceOverrides = {
  readonly noIgnore: boolean;
  readonly noIgnoreVcs: boolean;
  readonly ignoreFile: string | undefined;
};

type IgnoreSourceReaderConfig = {
  readonly overrides: IgnoreSourceOverrides;
};

createIgnoreSourceReader(
  productDir: string,
  config: IgnoreSourceReaderConfig,
): IgnoreSourceReader;
```

Injecting `productDir` mirrors `resolveConfig(productDir)` from `spx/16-config.enabler/21-descriptor-registration.adr.md` — consumers already resolve and pass `productDir` per `spx/15-worktree-management.pdr.md`, and tests construct readers against real temp git worktrees via `spx/22-test-environment.enabler/`, verifiable at `l1` without mocking. The reader's surface is narrow by design: git invocation and the constructed set live here, tool-specific flag generation lives in `spx/17-file-inclusion.enabler/54-tool-adapters.enabler/`, and composition with other layers lives in `spx/17-file-inclusion.enabler/43-scope-resolver.enabler/`, so a reader exposing only what its immediate consumers require cannot be misused as a universal filter or a flag generator.

Invoking git at construction collapses "when does git run" to one answer — inside the factory, never per-path and never mid-pipeline — so per-path membership is an O(1) lookup and no consumer can re-invoke git, observe partial enumerations, or add drifting caches. Delegating to git plumbing rather than parsing ignore files avoids reimplementing the resolution that compounds across `.gitignore`, nested `.gitignore`, `.git/info/exclude`, and `core.excludesFile`, so the reader tracks git's behavior automatically. The override surface is structured rather than free-form so a consumer cannot thread arbitrary git arguments through it and expand the API beyond what `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md` declares; the scope-resolver translates command-line flag values into that shape once per invocation, and the factory turns them into git plumbing arguments at construction — `--no-ignore-vcs` is the one override needing a second git invocation (`git config --get core.excludesFile`) to locate the global gitignore, since git exposes no flag to enable a subset of the standard ignore sources.

Rejected: pure functions `isInIncludedSet(productDir, path)` that shell out per call (repeated subprocess invocation within one CLI run, and the construction/query boundary disappears, undermining the purity contract); per-path `git check-ignore` (same subprocess overhead, where `git ls-files` returns the entire effective scope in one call); parsing `.gitignore` inside spx (reimplements ignore-resolution that compounds non-trivially and drifts from git as git evolves); a combined reader-plus-tool-flag-generator factory (recreates the pre-decomposition tangle and violates the layer-boundary invariants of `spx/17-file-inclusion.enabler/15-scope-composition.adr.md`); and a class-based reader (the harness uses factory functions for this pattern, so a class adds inconsistency without any property factories lack).

## Invariants

- The same `productDir`, the same `IgnoreSourceReaderConfig`, and the same git working-tree state always produce equal reader behavior — equal `isInIncludedSet` decisions across all input paths.
- `isInIncludedSet(p)` returns `true` if and only if `p` appears in the output of `git ls-files` invoked with the override-derived plumbing arguments against `productDir`.
- The factory's git invocations all happen at construction — the `git ls-files` scope query, plus a `git config --get core.excludesFile` lookup when `--no-ignore-vcs` is active; query methods perform no filesystem or subprocess I/O.
- The included set is a snapshot of git's working-tree state at construction; a `.gitignore` modification after `createIgnoreSourceReader` returns is not visible to subsequent `isInIncludedSet` calls within the same invocation.
- The factory fails fast with an actionable error when `productDir` is not inside a git working tree.
- No module outside this enabler invokes git plumbing for scope determination, parses git ignore files, or constructs an in-memory included set.

## Verification

### Audit

- ALWAYS: the reader is exposed as `createIgnoreSourceReader(productDir: string, config: IgnoreSourceReaderConfig): IgnoreSourceReader` — a factory function, not a class and not a method on another module ([audit])
- ALWAYS: the factory accepts `productDir` per `spx/15-worktree-management.pdr.md` and `IgnoreSourceReaderConfig` carrying structured override flags, translating overrides into git plumbing arguments at construction ([audit])
- ALWAYS: the override-to-plumbing translation is `--no-ignore` omits `--exclude-standard`; `--ignore-file <path>` keeps `--exclude-standard` and adds `--exclude-from <path>`; `--no-ignore-vcs` omits `--exclude-standard` and re-adds the non-VCS sources as `--exclude-from <productDir>/.git/info/exclude` plus `--exclude-from <global-excludes-path>` (the global path from a one-time `git config --get core.excludesFile` lookup), omitting a `--exclude-from` whose source is absent ([audit])
- ALWAYS: the factory invokes `git ls-files` once at construction with the override-derived arguments, plus a single `git config --get core.excludesFile` lookup when `--no-ignore-vcs` is active; query methods are pure over the constructed in-memory set ([audit])
- ALWAYS: construction fails with an actionable error naming the directory and the missing git context when no git working tree exists at `productDir` ([audit])
- ALWAYS: tests construct real git worktrees under temp directories via `spx/22-test-environment.enabler/` and verify reader behavior against those fixtures ([audit])
- NEVER: invoke git plumbing for scope determination from any module outside this enabler ([audit])
- NEVER: parse `.gitignore`, `.git/info/exclude`, or `core.excludesFile` content directly — git plumbing is the sole ignore-resolution authority ([audit])
- NEVER: call `resolveConfig` or any config-resolution function inside the factory — overrides arrive as pre-structured `IgnoreSourceReaderConfig` from the caller ([audit])
- NEVER: expose tool-specific flag generation from this enabler — that surface lives in `spx/17-file-inclusion.enabler/54-tool-adapters.enabler/` ([audit])
- NEVER: write to any file in the worktree or the git repository — the reader is read-only ([audit])
- NEVER: accept override flag names other than ripgrep's `noIgnore`, `noIgnoreVcs`, `ignoreFile` — the override vocabulary is fixed by `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md` ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem- or subprocess-mocking mechanism — tests use real git worktrees under temp directories ([audit])
