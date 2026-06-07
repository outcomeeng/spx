# Session Timestamp Format

Session identifiers — which double as filenames — use the `YYYY-MM-DD_HH-mm-ss` format (for example `2026-01-13_08-01-05`): filesystem-safe, human-readable, and lexicographically sortable so alphabetical order matches chronological order.

## Rationale

The format separates date from time visually (human-readable), uses no special characters (filesystem-safe), and sorts lexicographically into chronological order — the three properties session IDs need as both CLI-visible labels and on-disk filenames. ISO 8601 Zulu form (`T` and `Z`) adds noise without benefit, Unix timestamps are unreadable, and UUID v7 is over-engineering for single-user session creation. The filename omits a timezone indicator because the timezone-bearing ISO-8601 timestamp lives in the frontmatter `created_at` field governed by `spx/36-session.enabler/11-session-frontmatter.pdr.md`; second granularity is sufficient for session creation, with milliseconds available if collisions ever arise.

## Invariants

- Lexicographic ordering of session IDs matches chronological ordering.
- Every session ID matches the regex `\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}`.

## Verification

### Audit

- ALWAYS: separate the date from the time with an underscore (`_`) ([audit])
- ALWAYS: separate components within the date and within the time with hyphens (`-`) ([audit])
- ALWAYS: zero-pad every component ([audit])
- NEVER: use colons in filenames — they are Windows-incompatible ([audit])
- NEVER: omit leading zeros — that breaks lexicographic sorting ([audit])
