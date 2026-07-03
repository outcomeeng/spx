# Plan: Agent Session Search

## First slice

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

## Later slices

- `spx diagnose sessions` consumes the search library and joins SPX handoff session records, worktree claims, and agent-native transcript hits into a triage report.
- PR-number search becomes a named selector after the transcript patterns for PR references are settled; until then, `--contains` covers literal forensic search without embedding one platform's wording.
- Resume integration can use search results as input only after the search surface proves the result shape and bounds.
- High-volume `--all --contains` search can switch to a two-pass scan that sorts head metadata first and reads full transcript content only for the bounded newest candidate set when operators report expensive stores.
