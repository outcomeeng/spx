# ADR 004: Update Source Discovery from Claude Code Configuration

## Problem

When `spx claude update` fetches marketplace updates for users, it needs to know where to fetch from. The source could be a remote URL (GitHub) or local path (development). Need to determine the source without requiring user to remember or re-specify it.

## Context

- **Business**: Users expect tools to "just work" without redundant configuration; principle of least surprise
- **Technical**: Claude Code stores marketplace source in its plugin configuration; `spx claude init` records the source

## Decision

**`spx claude update` reads the marketplace source from Claude Code's existing configuration rather than requiring users to specify it each time.**

## Rationale

Three approaches were considered:

1. **Always require `--source` flag** — Rejected because friction for users; must remember URL each time
2. **Separate spx config file** — Rejected because duplicates information already recorded by Claude Code
3. **Read from Claude Code config** — Chosen because:
   - Source was specified at `spx claude init` time
   - Claude Code already tracks installed marketplaces
   - Follows principle of least surprise
   - Works with whatever source was used for init (GitHub or local)

Implementation approach:

1. Read Claude Code's plugin configuration
2. Find the outcomeeng marketplace entry
3. Extract source URL/path from that entry
4. Fetch/pull updates from that source

For `spx marketplace` commands (developer-facing), no source discovery is needed—they operate on the current working directory.

## Trade-offs Accepted

- **Dependency on Claude Code config format**: If Claude Code changes its config structure, spx needs updating. Mitigation: Version-pin config parsing; provide clear error on unknown format.
- **Config location discovery**: Need to locate Claude Code's config files across platforms. Mitigation: Check standard locations; support `CLAUDE_CONFIG_DIR` env var.

## Testing Strategy

### Level Coverage

| Level           | Question Answered                                   | Scope                  |
| --------------- | --------------------------------------------------- | ---------------------- |
| 1 (Unit)        | Does config parsing extract correct source URLs?    | Config parser          |
| 2 (Integration) | Does update correctly fetch from discovered source? | Config + fetch + write |

### Escalation Rationale

- **1 → 2**: Unit tests verify parsing, but integration tests verify actual fetch operations and file system writes

### Test Harness

| Level | Harness                    | Location/Dependency              |
| ----- | -------------------------- | -------------------------------- |
| 2     | Mock HTTP server           | Built by Feature (fetch testing) |
| 2     | Claude Code config fixture | `test/fixtures/claude-config/`   |

### Behaviors Verified

**Level 1 (Unit):**

- Parse marketplace source URL from Claude Code settings
- Handle missing config gracefully
- Support multiple config file locations (macOS, Linux, Windows)

**Level 2 (Integration):**

- Discover Claude Code config in standard locations
- Fetch marketplace content from remote URL (GitHub)
- Copy marketplace content from local path
- Update cache with fetched content

## Validation

### How to Recognize Compliance

You're following this decision if:

- `spx claude update` uses the same source as was specified during `spx claude init`
- No need to specify `--source` on every update
- `--source` flag available for override when needed

### MUST

- Read marketplace source from Claude Code configuration first
- Support both remote URLs and local filesystem paths
- Provide `--source` flag for explicit override
- Fail gracefully with clear message if Claude Code config not found

### NEVER

- Require users to remember/re-specify source URL
- Assume GitHub URL without checking stored config
- Silently use different source than what was configured
