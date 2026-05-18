# Open Issues

## YAML injection from `branch` and `worktree` git output

Per [`spx/36-session.enabler/11-session-frontmatter.pdr.md`](../11-session-frontmatter.pdr.md), `spx session handoff` writes `branch` verbatim from `git rev-parse --abbrev-ref HEAD` and `worktree` from a path-relative computation. Git permits branch names containing `:`, `{`, `}`, `#`, `|`, `\`, and other characters that have semantic meaning in YAML; worktree paths can contain spaces, quotes, and similar characters. Writing either value verbatim into the frontmatter risks producing a malformed YAML document that the parser then rejects.

**Skills:** `typescript:coding-typescript`, `typescript:testing-typescript`.

**Resolution:** Phase 2 implementation of `src/commands/session/handoff.ts` quotes both fields using a YAML-safe serializer (e.g., the `yaml` package's `stringify` with default scalar quoting). The Phase 2 test plan adds a scenario covering branch names containing every YAML-special character listed above, asserting that the round-trip through `parseSessionMetadata` returns the original branch string unchanged.
