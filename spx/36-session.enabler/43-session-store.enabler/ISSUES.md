# Open Issues

## YAML injection from `branch` and `worktree` git output

Per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md), `spx session handoff` writes `branch` verbatim from `git rev-parse --abbrev-ref HEAD` and `worktree` from a path-relative computation. Git permits branch names containing `:`, `{`, `}`, `#`, `|`, `\`, and other characters that have semantic meaning in YAML; worktree paths can contain spaces, quotes, and similar characters. Writing either value verbatim into the frontmatter risks producing a malformed YAML document that the parser then rejects.

**Skills:** `typescript:coding-typescript`, `typescript:testing-typescript`.

**Resolution:** Phase 2 implementation of `src/commands/session/handoff.ts` quotes both fields using the `yaml` package's `stringify` (already a direct dependency per `package.json`) with default scalar quoting. No additional YAML library is added. The Phase 2 test plan adds a scenario covering branch names containing every YAML-special character listed above, asserting that the round-trip through `parseSessionMetadata` returns the original branch string unchanged.

See also: [`spx/36-session.enabler/PLAN.md`](../PLAN.md) — Plan B, Implementation section, `src/commands/session/handoff.ts` touch point. Remove this entry from `ISSUES.md` once Phase 2 lands the `yaml.stringify` call.

## Cross-check: `working_directory` removal precondition

Plan B's implementation step removes `WORKING_DIRECTORY` from `SESSION_FRONT_MATTER` and `workingDirectory` from `SessionMetadata`. Before Phase 2 executes that removal, verify the field is actually present:

- Expected: `src/domains/session/types.ts:61` defines `WORKING_DIRECTORY: "working_directory"`; `src/domains/session/types.ts:87` declares `workingDirectory?: string`; `src/domains/session/list.ts:92–93` reads it in `parseSessionMetadata`. As of this PR, all three are present and the field is read-only (no command writes it). PDR-11 NEVER rule excludes it from the shape; Plan B is the cleanup pass.
- If a later refactor removes the field before Phase 2 entry, this issue and the corresponding PLAN.md bullets should be deleted rather than executed.

Remove this entry once Phase 2 confirms removal or once the field is removed by other means.
