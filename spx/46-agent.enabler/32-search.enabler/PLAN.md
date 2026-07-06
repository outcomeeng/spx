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

## Next slice: enhanced branch-associated search

### Observable path

An operator in a product worktree can run:

```bash
spx agent search --branch <branch-name> --json
```

SPX returns top-level Codex and Claude Code agent-native sessions associated with the requested branch, extending the shipped transcript-metadata branch filter to cover sessions whose opening transcript metadata names another branch or omits branch metadata.

### Product behavior

- `--branch <name>` searches by **branch association**, extending the shipped transcript metadata match with additional association signals.
- A top-level session matches the branch when any accepted signal associates the session with the branch:
  - the parsed agent-native transcript head records the requested branch;
  - the session `cwd` is inside a worktree currently checked out on the requested branch within the same product worktree pool;
  - the top-level transcript contains a successful branch creation or branch switch command sequence for the requested branch, such as `git switch <branch>`, `git switch -c <branch>`, `git checkout <branch>`, `git checkout -b <branch>`, or a worktree-add sequence that creates or checks out that branch.
- Branch existence alone is not enough to return a session; the branch must be associated with a session through metadata, worktree location, or parsed command evidence.
- Subagent transcripts remain excluded as returned sessions. A subagent transcript can inform a future lineage feature only after the spec declares how subagent evidence maps back to a top-level session.
- The result keeps the existing JSON shape and uses `branch` in `matches` when any branch-association signal matched.
- Text output remains bounded by `--limit`; `--all` continues to widen the recent-session time bound.

### Feasibility

Command-sequence search is feasible when it is treated as bounded forensic evidence rather than free-text inference. Codex transcripts store tool calls and tool outputs as structured JSONL rows, and Claude Code transcripts carry command-related rows with session metadata. The implementation should parse structured rows where possible and accept only command executions that name the requested branch and have successful or non-failing evidence. Plain prose mentions of a branch name do not count as branch association.

### Architecture

- Split the current pure search domain before adding branch association so `src/domains/agent/search.ts` does not grow into a large mixed-concern module.
- Keep a public `src/domains/agent/search/index.ts` export boundary.
- Move query construction and constants to `src/domains/agent/search/query.ts`.
- Move result collection, selector matching, and sorting to `src/domains/agent/search/results.ts`.
- Move JSON and text rendering to `src/domains/agent/search/render.ts`.
- Add `src/domains/agent/search/branch-association.ts` for pure branch-association inputs and predicates.
- Keep Git and worktree discovery in `src/commands/agent/search.ts`; it resolves branch-associated worktree roots and passes them into the pure domain as data.
- Add transcript command-evidence parsing in the pure search domain behind an injected transcript reader, reusing existing full-transcript reads only when a branch query needs command evidence.

### First implementation slice

1. Refactor the search domain into the module boundary above without changing observable behavior.
2. Add a failing scenario in `spx/46-agent.enabler/32-search.enabler/tests/search.scenario.l1.test.ts`: a top-level session has `cwd` inside a worktree root associated with the requested branch while transcript metadata records `main` or `null`; `spx agent search --branch <branch-name> --json` returns that session with `matches: ["branch"]`.
3. Extend `src/commands/agent/search.ts` to resolve worktree roots currently checked out on the requested branch in the same product worktree pool.
4. Pass the resolved branch-association roots into the pure search domain and match sessions whose `cwd` is inside those roots.
5. Run `spx test spx/46-agent.enabler/32-search.enabler`, `pnpm run validate`, and `pnpm run build`.
6. Run the TypeScript test-evidence and implementation audit gates before merge.

### Later implementation slices

- Add command-sequence branch evidence after worktree-root association ships. This slice covers transcripts where the branch was created or switched during the session but no associated worktree remains checked out.
- Add parser fixtures for Codex and Claude Code command rows only after real transcript samples define the source-owned row shapes.
- Add lineage-based subagent association only after the spec declares how subagent transcripts map to top-level sessions without returning subagent rows as sessions.

## Later slices

- `spx diagnose sessions` consumes the search library and joins SPX handoff session records, worktree claims, and agent-native transcript hits into a triage report.
- PR-number search becomes a named selector after the transcript patterns for PR references are settled; until then, `--contains` covers literal forensic search without embedding one platform's wording.
- Resume integration can use search results as input only after the search surface proves the result shape and bounds.
- High-volume `--all --contains` search can switch to a two-pass scan that sorts head metadata first and reads full transcript content only for the bounded newest candidate set when operators report expensive stores.
