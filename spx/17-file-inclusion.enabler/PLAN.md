# Plan: Git-Tracking File Inclusion

## Purpose

Implement the git-tracking layer model declared in
`spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md` and
`spx/17-file-inclusion.enabler/15-scope-composition.adr.md` across the
file-inclusion subtree and the consumers that wire override flags.

## Governing Decisions

- `spx/17-file-inclusion.enabler/11-ignore-defaults.pdr.md` — git as the default scope source, ripgrep CLI vocabulary for invocation-time overrides, dotfile divergence
- `spx/17-file-inclusion.enabler/15-scope-composition.adr.md` — pipeline assembly with the git-tracking layer constructed once per resolver invocation
- `spx/16-config.enabler/21-descriptor-registration.adr.md` — shared config primitives and domain descriptors
- `spx/15-worktree-management.pdr.md` — `productDir` resolution via `git rev-parse --show-toplevel`

## Current Tranche

1. Replace the `spx/EXCLUDE` reader with a git-plumbing reader under `spx/17-file-inclusion.enabler/21-ignore-source.enabler/`.
   - `createIgnoreSourceReader` invokes `git ls-files --cached --others --exclude-standard --full-name -z` once at construction against the resolved worktree.
   - Override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) translate to git plumbing arguments at construction.
   - Construction fails with an actionable error outside a git working tree.

2. Update the path-predicate set under `spx/17-file-inclusion.enabler/32-path-predicates.enabler/`.
   - Delete the artifact-directory and hidden-prefix predicates.
   - Add the git-tracking predicate (delegating to the reader) and the domain-path-filter predicate.

3. Update the scope-resolver pipeline under `spx/17-file-inclusion.enabler/43-scope-resolver.enabler/`.
   - Construct the ignore-source reader up front from `ScopeRequest`, including override flags.
   - Compose the layer sequence as `[explicit-caller, domain-path-filter, git-tracking]`.

4. Defer command-line override wiring to the owning domain CLI nodes.
   - The shared file-inclusion request shape accepts `--no-ignore`, `--no-ignore-vcs`, and `--ignore-file` as structured overrides.
   - Each validate and test command that walks files still needs its owning CLI node to expose those flags.

## Evidence Required

- Git-tracking reader tests cover tracked, untracked-not-ignored, ignored-by-each-source (top-level, nested, info/exclude, global), submodule contents, and override-flag-modified behavior against real temp git worktrees.
- Scope resolver tests cover explicit-override short-circuit, domain path-filter match, git-tracking exclusion, and override-flag application independently.
- Tool adapter tests prove generated ignore flags derive from the resolved excluded set only.
- Regression tests prove validate path filters do not affect `test passing` scope and `test passing` scope does not affect validate output.
- Removal tests prove no production code reads `spx/EXCLUDE` or parses git ignore files directly.

## Open Coordination

- Node-status now owns its `spx/EXCLUDE` lifecycle classification separately from file-inclusion scope. Keep that reader local to node-status and do not route file-inclusion scope through it.
- Consumer commands for validate and test still need CLI-level override flags where their owning CLI specs require user-facing `--no-ignore`, `--no-ignore-vcs`, or `--ignore-file <path>` support.
- Consumers that currently restate `node_modules`, `dist`, build artifacts, or other gitignored paths in domain descriptors can simplify their config; the git-tracking layer subsumes those entries.

## Resumption Notes

- Start from fresh `origin/main`; earlier branch-specific and worktree-specific resumption paths are obsolete.
- The git-worktree test harness needed for the reader tests is available under `spx/22-test-environment.enabler/32-git-worktree.enabler/`, with implementation helpers at `testing/harnesses/git-worktree/git-worktree.ts`.
- The file-inclusion reader surface is now the git-backed `isInIncludedSet` reader, and the layer sequence is now domain-path-filter followed by git-tracking.
- The stale path-predicate issue file was removed once the git-tracking and domain-path-filter tests existed.

Use `withGitWorktreeEnv` and supporting types from `@testing/harnesses/git-worktree/git-worktree` for the reader tests: every git ignore source (top-level `.gitignore`, nested `.gitignore`, `.git/info/exclude`, the `core.excludesFile`-referenced file via `configureGlobalExcludes`), submodule exclusion, and the three override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`).

## Open Findings (from /aligning audit)

- Compliance MUST/NEVER rules across the subtree (`spx/17-file-inclusion.enabler/file-inclusion.md`, `spx/17-file-inclusion.enabler/21-ignore-source.enabler/ignore-source.md`, `spx/17-file-inclusion.enabler/32-path-predicates.enabler/path-predicates.md`, `spx/17-file-inclusion.enabler/43-scope-resolver.enabler/scope-resolver.md`, `spx/17-file-inclusion.enabler/54-tool-adapters.enabler/tool-adapters.md`, `spx/17-file-inclusion.enabler/65-domain-path-filters.enabler/domain-path-filters.md`) carry `[review]` tags for rules that are falsifiable by automated test or lint rule. Re-tag to `[test]` and author the corresponding test files in the same tranche as the implementation work — coordinated cleanup avoids forward-reference markdown failures.
