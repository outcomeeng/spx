# Plan: Agent session search

## Shipped first slice

### Observable path

An operator in a worktree pool can run:

```bash
spx agent search --pickup-id <session-file-id> --json
```

SPX searches product-scoped Codex and Claude Code agent-native transcript stores and returns bounded JSON records for matching top-level agent sessions. The result gives the operator enough evidence to resume or inspect the agent-native session that picked up the SPX handoff session file.

### Product behavior

- Search is an `spx agent` capability because it finds agent-native sessions.
- The default scope is the current product's worktree pool or checkout, derived from shared product-root resolution, so sibling worktrees participate and unrelated products do not.
- Results include `agent`, `sessionId`, `cwd`, `sourcePath`, `modifiedAtMs`, `updatedAt`, `branch`, and `matches`.
- `--pickup-id <id>` searches for the exact `<PICKUP_ID><id></PICKUP_ID>` marker.
- `--contains <literal>` searches transcript content literally.
- `--session-id <id>` and `--branch <name>` filter transcript metadata.
- `--agent codex|claude-code` narrows adapters.
- Default search applies the same recent-session safety boundary as `spx agent resume`; `--all` widens to older transcript files.
- Default output is bounded by `--limit`, with a source-owned default. Text output is operator-readable; `--json` is automation-readable.

### Architecture

- Add a pure `src/domains/agent/search.ts` library over injected filesystem, clock, home-directory, and product-scope dependencies.
- Keep Codex and Claude Code transcript parsing agent-specific. Reuse the resume parser contracts where they match, and add full-transcript content reads only for explicit search selectors.
- Add `src/commands/agent/search.ts` for filesystem orchestration and product-scope resolution.
- Keep `src/interfaces/cli/agent.ts` as the thin surface owner for Commander options and output routing.
- Export source-owned command/query constants from the agent domain so tests do not copy protocol literals.

### Verification

- Add co-located tests under `spx/46-agent.enabler/32-search.enabler/tests/`.
- Cover the observable pickup-id path against in-memory Codex and Claude Code transcript stores.
- Cover option-to-query mapping, result JSON shape, product scoping, subagent exclusion, recency bounds, and limit behavior.
- Run `spx test spx/46-agent.enabler/32-search.enabler`, `pnpm run validate`, and `pnpm run build`.
- Run the TypeScript test-evidence and implementation audit gates before merge.

## Shipped enhanced branch-associated search

### Observable path

An operator in a product worktree can run:

```bash
spx agent search --branch <branch-name> --json
```

SPX returns top-level Codex and Claude Code agent-native sessions associated with the requested branch, including sessions whose opening transcript metadata names another branch or omits branch metadata.

### Product behavior

- `--branch <name>` searches by **branch association**, extending transcript metadata with additional association signals.
- A top-level session matches the branch when any accepted signal associates the session with the branch:
  - the parsed agent-native transcript head records the requested branch;
  - the session `cwd` is inside a worktree currently checked out on the requested branch within the same product worktree pool;
  - the top-level transcript contains an accepted branch creation or branch switch command for the requested branch, such as `git switch <branch>`, `git switch -c <branch>`, `git checkout <branch>`, `git checkout -b <branch>`, or `git worktree add <path> <branch>`.
- Branch existence alone is not enough to return a session; the branch must be associated with a session through metadata, worktree location, or parsed command evidence.
- Subagent transcripts remain excluded as returned sessions. Codex subagent transcript branch evidence can associate the parent top-level session with the requested branch when the parent session exists; the result uses the parent session id and the branch-evidence current working directory rather than returning the subagent transcript as a row.
- The result keeps the existing JSON shape and uses `branch` in `matches` when any branch-association signal matched.
- Text output remains bounded by `--limit`; `--all` continues to widen the recent-session time bound.

### Feasibility

Command-sequence search is feasible when it is treated as bounded forensic evidence rather than free-text inference. Codex transcripts store tool calls and tool outputs as structured JSONL rows, and Claude Code transcripts carry command-related rows with session metadata. The implementation should parse structured rows where possible and accept only command executions that name the requested branch and have successful or non-failing evidence. Plain prose mentions of a branch name do not count as branch association.

### Architecture

- `src/domains/agent/search/index.ts` is the public export boundary.
- `src/domains/agent/search/query.ts` owns query construction and pickup marker literals.
- `src/domains/agent/search/results.ts` owns result collection, selector matching, product-scope filtering, and sorting.
- `src/domains/agent/search/render.ts` owns JSON and text rendering.
- `src/domains/agent/search/branch-association.ts` owns branch-association predicates plus top-level and subagent association precomputation.
- `src/domains/agent/search/transcript-command-evidence.ts` owns structured transcript command extraction and success evidence checks.
- `src/domains/agent/search/git-branch-evidence.ts` owns git branch command recognition, git option parsing, and rejection of commands whose git context changes cannot be scoped.
- `src/domains/agent/search/shell-command.ts` owns bounded shell tokenization, wrapper extraction, redirection stripping, and success-proving shell segment selection.
- `src/commands/agent/search.ts` resolves branch-associated worktree roots and passes them into the pure search domain as data.

### Verification

- Co-located tests cover worktree-root branch association, metadata branch association, accepted command evidence, branch-existence-only exclusion, and subagent exclusion.
- `spx test spx/46-agent.enabler/32-search.enabler`, `pnpm run validate`, and `pnpm run build` pass on the shipped branch.
- TypeScript test-evidence and implementation audit gates approve the shipped branch.

## Later slices

- `spx diagnose sessions` consumes the search library and joins SPX handoff session records, worktree claims, and agent-native transcript hits into a triage report.
- PR-number search becomes a named selector after the transcript patterns for PR references are settled; until then, `--contains` covers literal forensic search without embedding one platform's wording.
- Resume integration can use search results as input only after the search surface proves the result shape and bounds.
- High-volume `--all --contains` search can switch to a two-pass scan that sorts head metadata first and reads full transcript content only for the bounded newest candidate set when operators report expensive stores.
- Lineage-based subagent association requires a spec that declares how subagent transcripts map back to top-level sessions without returning subagent rows as sessions.
