# Session Timestamp Format

## Purpose

This decision governs the format of session identifiers. Session IDs double as filenames, so the format must be filesystem-safe, human-readable, and alphabetically sortable.

## Context

**Business impact:** Agents and users see session IDs in CLI output. Readable timestamps reduce cognitive load when scanning session lists.

**Technical constraints:** Filenames must avoid colons (Windows-incompatible), be sortable lexicographically, and be unique per second.

## Decision

Session IDs use `YYYY-MM-DD_HH-mm-ss` format (e.g., `2026-01-13_08-01-05`).

## Rationale

The format is human-readable (date and time visually separated), filesystem-safe (no special characters), and lexicographically sortable (alphabetical order matches chronological order). ISO 8601 Zulu format (`T` and `Z` suffixes) adds noise without benefit. Unix timestamps are unreadable. UUID v7 is over-engineering for single-user session creation.

## Trade-offs accepted

| Trade-off                         | Mitigation / reasoning                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| No timezone indicator in filename | ISO 8601 with timezone stored in YAML front matter `created_at` field                    |
| Second granularity only           | Sufficient for session creation; milliseconds can be added if collision becomes an issue |

## Invariants

- Lexicographic ordering of session IDs matches chronological ordering
- Every session ID matches the regex `\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}`

## Compliance

### Recognized by

Session filenames match `YYYY-MM-DD_HH-mm-ss.md` with zero-padded components and 24-hour time.

### MUST

- Use underscores to separate date from time (`_`) ([review])
- Use hyphens within date and time components (`-`) ([review])
- Pad all components with leading zeros ([review])

### NEVER

- Use colons in filenames — Windows-incompatible ([review])
- Omit leading zeros — breaks lexicographic sorting ([review])
