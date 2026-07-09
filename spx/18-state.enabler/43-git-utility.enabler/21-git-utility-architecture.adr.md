# Git Utility Architecture

Git path utilities live under `src/lib/git/` as shared infrastructure over injected git runners. Pure parsing helpers convert git's byte-oriented output into product paths, while orchestration helpers construct the git invocations for committed-range net-diff, worktree-comparison, staged, dirty-worktree, and untracked path discovery and return product-path sets to command handlers.

## Rationale

The state subtree owns the injected git-runner boundary that higher-index consumers depend on for root, topology, branch, and path facts. Keeping git parsing and changed-path orchestration under `src/lib/git/` gives testing, verification, infrastructure, session, diagnose, and worktree consumers one provider for net-diff git path discovery while preserving `spx/14-cli-composition.adr.md`: command handlers orchestrate injected capabilities and map results to command output rather than owning git output parsing. Release-data commit-history path discovery stays with the release git queries because it reports paths the release commits touch rather than net changed paths between two refs.

## Invariants

- Name-status parsing is pure: the same NUL-delimited status payload always produces the same ordered product-path sequence.
- Changed-path orchestration depends only on caller-supplied refs, product directory, and injected git runner behavior.
- Consumer command handlers receive product paths; they do not receive raw name-status payloads from this provider.

## Verification

### Audit

- ALWAYS: production git path orchestration accepts an injected runner or dependency object rather than invoking git through a hidden module-global process boundary ([audit])
- ALWAYS: pure parsing helpers are exported from `src/lib/git/` and have no filesystem, process, or command-handler dependencies ([audit])
- ALWAYS: testing, verification, infrastructure, session, diagnose, and worktree consumers call this provider for changed-path sets when their requested path scope matches one of its declared operations ([audit])
- NEVER: tests or production code replace git utility modules through framework-level module interception such as `vi.mock()` or `jest.mock()`; tests pass controlled git runners through the provider's injected boundary ([audit])
- NEVER: a command handler that consumes this provider parses NUL-delimited name-status output, constructs rename/copy path records, or combines tracked and untracked dirty-worktree path sets itself ([audit])
- NEVER: `src/lib/git/` imports from `src/commands/`, `src/interfaces/cli/`, or consumer domain modules ([audit])
