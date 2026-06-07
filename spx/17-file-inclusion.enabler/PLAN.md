# Plan: Git-Tracking File Inclusion

## Purpose

Implement the git-tracking layer model declared in `11-ignore-defaults.pdr.md` and `15-scope-composition.adr.md` across the file-inclusion subtree and the consumers that wire override flags.

## Governing Decisions

- `11-ignore-defaults.pdr.md` — git as the default scope source, ripgrep CLI vocabulary for invocation-time overrides, dotfile divergence
- `15-scope-composition.adr.md` — pipeline assembly with the git-tracking layer constructed once per resolver invocation
- `spx/16-config.enabler/21-descriptor-registration.adr.md` — shared config primitives and domain descriptors
- `spx/15-worktree-resolution.pdr.md` — `productDir` resolution via `git rev-parse --show-toplevel`

## Current Tranche

1. Replace the `spx/EXCLUDE` reader with a git-plumbing reader under `21-ignore-source.enabler/`.
   - `createIgnoreSourceReader` invokes `git ls-files --cached --others --exclude-standard --full-name` once at construction against the resolved worktree.
   - Override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`) translate to git plumbing arguments at construction.
   - Construction fails with an actionable error outside a git working tree.

2. Update the path-predicate set under `32-path-predicates.enabler/`.
   - Delete the artifact-directory and hidden-prefix predicates.
   - Add the git-tracking predicate (delegating to the reader) and the domain-path-filter predicate.

3. Update the scope-resolver pipeline under `43-scope-resolver.enabler/`.
   - Construct the ignore-source reader up front from `ScopeRequest`, including override flags.
   - Compose the layer sequence as `[explicit-caller, domain-path-filter, git-tracking]`.

4. Wire override flags into domain CLI commands.
   - Each validation, testing, audit, and review command that walks files exposes `--no-ignore`, `--no-ignore-vcs`, `--ignore-file <path>` per `11-ignore-defaults.pdr.md`.

## Evidence Required

- Git-tracking reader tests cover tracked, untracked-not-ignored, ignored-by-each-source (top-level, nested, info/exclude, global), submodule contents, and override-flag-modified behavior against real temp git worktrees.
- Scope resolver tests cover explicit-override short-circuit, domain path-filter match, git-tracking exclusion, and override-flag application independently.
- Tool adapter tests prove generated ignore flags derive from the resolved excluded set only.
- Regression tests prove validation filters do not affect testing passing scope and testing passing scope does not affect validation output.
- Removal tests prove no production code reads `spx/EXCLUDE` or parses git ignore files directly.

## Open Coordination

- `spx/EXCLUDE` is no longer the scope source; the file may still be present for legacy reasons but reader code is deleted in this work.
- Consumer commands (validation, testing, audit, review) wire override flags in the same tranche as the resolver changes so default behavior changes are matched by override availability.
- Consumers that currently restate `node_modules`, `dist`, build artifacts, or other gitignored paths in domain descriptors can simplify their config; the git-tracking layer subsumes those entries.

## Resumption Notes — node 1 (`21-ignore-source.enabler/`)

The git-worktree test harness needed for the reader's Step 5 tests now ships from `spx/22-test-environment.enabler/32-git-worktree.enabler/` — see [PR #55](https://github.com/outcomeeng/spx/pull/55) (`work/git-worktree-harness`). Once merged, resume on `work/git-tracking-reader` from `.work/spx-a`:

- Rebase `work/git-tracking-reader` onto fresh `origin/main`.
- Import `withGitWorktreeEnv` and supporting types from `@testing/harnesses/git-worktree/git-worktree`.
- Write the reader's Step 5 tests against the harness — every git ignore source (top-level `.gitignore`, nested `.gitignore`, `.git/info/exclude`, the `core.excludesFile`-referenced file via `configureGlobalExcludes`), submodule exclusion, and the three override flags (`--no-ignore`, `--no-ignore-vcs`, `--ignore-file`).
- The harness does not mutate `process.env.GIT_CONFIG_GLOBAL`; the reader's `git config --get core.excludesFile` resolves the path through local git config which the harness sets via `git config core.excludesFile <path>`. Both invocations are scoped to `productDir`.
- The harness strips and restores every `GIT_*` variable around the callback so a reader inheriting `process.env` resolves from `productDir` even when the caller's environment is polluted.

## Open Findings (from /aligning audit)

- Compliance MUST/NEVER rules across the subtree (`file-inclusion.md`, `21-ignore-source.enabler/ignore-source.md`, `32-path-predicates.enabler/path-predicates.md`, `43-scope-resolver.enabler/scope-resolver.md`, `54-tool-adapters.enabler/tool-adapters.md`, `65-domain-path-filters.enabler/domain-path-filters.md`) carry `[review]` tags for rules that are falsifiable by automated test or lint rule. Re-tag to `[test]` and author the corresponding test files in the same tranche as the implementation work — coordinated cleanup avoids forward-reference markdown failures.
- Architecture ADR `43-scope-resolver.enabler/21-pipeline-assembly.adr.md` carries an inline `[test]` reference in a MUST/NEVER list. The decision-first migration settled the convention: a test-linked ADR rule moves under `## Verification` `### Testing` with the evidence-type tag from the test filename — as `15-scope-composition.adr.md` now does (`([property])`). The remaining question is solely whether to migrate `21-pipeline-assembly.adr.md` in its own batch.
