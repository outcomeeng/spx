# Ignore-Source Reader Shape

## Purpose

This decision governs how the git-tracking reader is materialized as a shared TypeScript module that the path-predicates and scope-resolver children consume. It applies to every module in the `21-ignore-source.enabler/` subtree and to every file-inclusion consumer that queries the operator's effective scope.

## Context

**Business impact:** The git-tracking layer is the single default scope source per `../11-ignore-defaults.pdr.md`. Downstream consumers (path-predicates evaluating the git-tracking layer, scope-resolver assembling decision trails, tool-adapters producing exclusion flags via the resolved scope) all derive from the same constructed reader. Diverging implementations would produce layer-specific interpretations of git's view and silently ship inconsistent scope semantics.

**Technical constraints:** spx is TypeScript ESM. Git plumbing — specifically `git ls-files --cached --others --exclude-standard --full-name` — enumerates the operator's effective scope under the working tree, resolved against every git ignore source. Root resolution follows `../../15-worktree-resolution.pdr.md` — `git rev-parse --show-toplevel` for tracked-file reads, passed in as `productDir`. The reader rejects construction when no git working tree is present. Override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) flow into the git plumbing arguments at construction. Resolving `--no-ignore-vcs` additionally requires a `git config --get core.excludesFile` lookup to locate the global gitignore file, since git exposes no flag to enable a subset of the standard ignore sources.

## Decision

The git-tracking layer exposes a single factory `createIgnoreSourceReader(productDir: string, config: IgnoreSourceReaderConfig): IgnoreSourceReader` that invokes git plumbing at construction against `productDir` and returns an immutable object whose public surface is a membership query (`isInIncludedSet(relativePath: string): boolean`) and an applied-overrides accessor (`appliedOverrides(): IgnoreSourceOverrides`). The factory is the sole shell-out to git for scope determination; consumers never invoke git themselves.

`IgnoreSourceReaderConfig` carries the override flags supplied by the caller:

```typescript
type IgnoreSourceOverrides = {
  readonly noIgnore: boolean;
  readonly noIgnoreVcs: boolean;
  readonly ignoreFile: string | undefined;
};

type IgnoreSourceReaderConfig = {
  readonly overrides: IgnoreSourceOverrides;
};
```

The caller resolves override flags from the invoking command's `ScopeRequest` and passes them as `config.overrides`. The factory translates overrides into git plumbing arguments and returns the constructed reader:

- `--no-ignore` omits `--exclude-standard` from the `git ls-files` invocation, dropping every git ignore source.
- `--ignore-file <path>` keeps `--exclude-standard` and adds `--exclude-from <path>`.
- `--no-ignore-vcs` omits `--exclude-standard` and re-adds the non-VCS ignore sources as explicit arguments: `--exclude-from <productDir>/.git/info/exclude` plus `--exclude-from <global-excludes-path>`, where `<global-excludes-path>` is resolved by a `git config --get core.excludesFile` lookup performed once at construction. When `.git/info/exclude` is absent or the config lookup returns no value, the corresponding `--exclude-from` argument is omitted.

The `--no-ignore-vcs` translation is the one override that requires a second git invocation (`git config`) beyond the `git ls-files` scope query. Both invocations happen at construction; neither runs per-path.

## Rationale

Factory-with-injected-productDir mirrors `resolveConfig(productDir)` from `../../16-config.enabler/21-descriptor-registration.adr.md` — consumers already pass a resolved `productDir` per `../../15-worktree-resolution.pdr.md`, so the same contract applies. Tests construct readers against real temp git worktrees via `../../22-test-environment.enabler/`, making reader behavior verifiable at `l1` without filesystem or subprocess mocking.

The reader's public surface is narrow by design. Git invocation and the constructed in-memory set live here; tool-specific flag generation lives in `../54-tool-adapters.enabler/`; composition with other filter layers lives in `../43-scope-resolver.enabler/`. A reader that exposes only what its immediate consumers require cannot be misused as a universal filter or a flag generator, and growth in downstream concerns does not distort its public surface.

Immediate construction-time git invocation collapses the "when does git get called" question to one answer: at construction, inside `createIgnoreSourceReader`, never per-path and never mid-pipeline. Consumers cannot accidentally re-invoke git, cannot observe partial enumerations, and cannot introduce caching behavior that drifts from git's view. Per-path membership queries become O(1) lookups against the constructed set.

Delegating to git plumbing rather than parsing `.gitignore` files directly avoids reimplementing git's ignore-resolution logic (which compounds across `.gitignore`, nested `.gitignore`, `.git/info/exclude`, and `core.excludesFile`). The reader's behavior tracks git's behavior automatically; new git ignore-resolution features (e.g., `**` patterns, negations) are honored without spx changes.

The override-flags shape is structured rather than free-form. Each named override (`noIgnore`, `noIgnoreVcs`, `ignoreFile`) corresponds to a ripgrep CLI flag per `../11-ignore-defaults.pdr.md`; the structure enforces that consumers cannot pass arbitrary git plumbing arguments through the override surface, which would expand the file-inclusion API beyond what the PDR declares.

Alternatives considered:

- **Pure functions `isInIncludedSet(productDir, path)` returning per-call results.** Each call would shell out to git. Rejected because repeated subprocess invocation within a single CLI invocation is wasteful, and the boundary between "construction" and "query" disappears, undermining the parent ADR's purity contract.
- **Per-path `git check-ignore` invocation.** Each membership query invokes git. Rejected for the same subprocess-overhead reason and because `git ls-files` returns the entire effective scope in one call.
- **Parse `.gitignore` files inside spx.** Reimplement git's ignore-resolution logic. Rejected because the resolution rules compound non-trivially across multiple ignore sources, and the implementation would drift from git's behavior as git evolves.
- **Combined reader + tool-flag generator factory (the pre-decomposition shape).** Rejected because tool-flag production is the tool-adapters child's concern under the file-inclusion composition; co-locating it here would recreate the pre-decomposition tangle and violate the layer-boundary invariants declared in `../15-scope-composition.adr.md`.
- **Class-based `IgnoreSourceReader` with constructor invoking git.** Rejected because the harness uses factory functions (`resolveConfig`, `withTestEnv`) for this pattern. A class would introduce inconsistency without adding any property factory functions lack.

## Trade-offs accepted

| Trade-off                                                                                       | Mitigation / reasoning                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factory hides invocation timing from callers                                                    | `createIgnoreSourceReader` is synchronous and idempotent; multiple reader instances within one invocation each pay the git-plumbing cost once. Callers that edit `.gitignore` mid-run receive stale results, but CLI invocations are short-lived. |
| Factory shells out to git at construction                                                       | Git is already required for worktree resolution per `../../15-worktree-resolution.pdr.md`; the same subprocess capability serves scope resolution                                                                                                 |
| Caller must construct `IgnoreSourceReaderConfig` with structured override flags                 | The scope-resolver (the natural construction site) translates command-line flag values into the structured shape once per invocation                                                                                                              |
| Splitting tool-flag generation into `../54-tool-adapters.enabler/` costs one cross-child import | The split is a direct consequence of `../15-scope-composition.adr.md`; the cost is a static import boundary that the type system enforces                                                                                                         |

## Invariants

- The same `productDir`, the same `IgnoreSourceReaderConfig`, and the same git working-tree state always produce equal `IgnoreSourceReader` behavior — equal `isInIncludedSet` decisions across all input paths
- `isInIncludedSet(p)` returns `true` if and only if `p` appears in the output of `git ls-files` invoked with the override-derived plumbing arguments against `productDir`
- The factory's git invocations all happen at construction — the `git ls-files` scope query, plus a `git config --get core.excludesFile` lookup when `--no-ignore-vcs` is active; query methods perform no filesystem or subprocess I/O
- The factory fails fast with an actionable error when `productDir` is not inside a git working tree
- No module outside this enabler invokes git plumbing for scope determination, parses git ignore files, or constructs an in-memory included set

## Compliance

### Recognized by

One module inside this enabler exports `createIgnoreSourceReader(productDir: string, config: IgnoreSourceReaderConfig): IgnoreSourceReader` and the `IgnoreSourceReader`, `IgnoreSourceOverrides`, and `IgnoreSourceReaderConfig` types. The path-predicates child's git-tracking predicate imports the reader factory and consults the reader through `isInIncludedSet`. The scope-resolver constructs the reader by passing override flags as `IgnoreSourceReaderConfig`, then consumes `appliedOverrides()` for decision-trail population. No other module across the spx codebase invokes git plumbing for scope determination or parses git ignore files.

### MUST

- The reader is exposed as `createIgnoreSourceReader(productDir: string, config: IgnoreSourceReaderConfig): IgnoreSourceReader` — a factory function, not a class, not a method on another module ([review])
- The factory accepts `productDir` as a parameter per `../../15-worktree-resolution.pdr.md` ([review])
- The factory accepts `IgnoreSourceReaderConfig` as a second parameter carrying structured override flags; it translates overrides into git plumbing arguments at construction ([review])
- The factory invokes `git ls-files` (with override-derived arguments) once at construction to enumerate scope, plus a single `git config --get core.excludesFile` lookup when `--no-ignore-vcs` is active; query methods are pure over the constructed in-memory set ([review])
- Construction fails with an actionable error when no git working tree exists at `productDir` ([review])
- Tests construct real git worktrees under temp directories via `../../22-test-environment.enabler/`; reader behavior is verified against those fixtures ([review])

### NEVER

- Invoke git plumbing for scope determination from any module outside this enabler ([review])
- Parse `.gitignore`, `.git/info/exclude`, or `core.excludesFile` content directly — git plumbing is the sole ignore-resolution authority ([review])
- Call `resolveConfig` or any config resolution function inside the factory — overrides are passed as pre-structured `IgnoreSourceReaderConfig` by the caller ([review])
- `vi.mock()`, `jest.mock()`, `memfs`, or any filesystem-mocking mechanism for `node:fs` / `node:fs/promises` or any subprocess-mocking mechanism — tests use real git worktrees under tmpdirs ([review])
- Expose tool-specific flag generation from this enabler — that surface lives in `../54-tool-adapters.enabler/` ([review])
- Write to any file in the worktree or the git repository — the reader is read-only ([review])
- Accept override flag names other than ripgrep's `noIgnore`, `noIgnoreVcs`, `ignoreFile` — the override vocabulary is fixed by `../11-ignore-defaults.pdr.md` ([review])
