# Session Directory Structure

## Purpose

This decision governs how session files are organized on disk. Session status is encoded by directory location, not by filename prefix or file content.

## Context

**Business impact:** Agents query session status frequently. Directory-based status enables fast enumeration without parsing file contents.

**Technical constraints:** POSIX `rename()` is atomic within a filesystem. Directory-based status enables atomic status transitions via `rename()` between sibling directories.

## Decision

Session files are organized in status-based subdirectories under `.spx/sessions/`:

```
.spx/sessions/
├── todo/           # Available sessions
├── doing/          # Claimed sessions
└── archive/        # Archived sessions
```

## Rationale

Directory-based status is faster than alternatives because `readdir()` returns only sessions of the desired status. Filename prefixes (e.g., `TODO_*.md`) require parsing every filename. YAML front matter status requires reading every file. A SQLite index adds an external dependency for a simple file-based workflow.

Alternatives rejected:

- **Filename prefixes** (`TODO_`, `DOING_`): mixes status with identity, clutters listings
- **Status in YAML front matter**: requires parsing every file to determine status
- **SQLite index**: over-engineering for a file-based workflow

## Trade-offs accepted

| Trade-off                                      | Mitigation / reasoning                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Three directories instead of one flat listing  | Directories are shallow, single-level; archive is optional                             |
| All directories must be on the same filesystem | `.spx/sessions/` is a single directory tree — cross-filesystem layouts are unsupported |

## Invariants

- A session file exists in exactly one status directory at any point in time
- The set of valid status directories is {todo, doing, archive} — no other directories participate in status derivation

## Compliance

### Recognized by

Session files named `{timestamp}.md` stored in `todo/`, `doing/`, or `archive/` subdirectories. No filename prefixes encode status.

### MUST

- Store available sessions in `todo/` directory — status is positional ([review])
- Store claimed sessions in `doing/` directory — status is positional ([review])
- Use `rename()` between directories for status transitions — preserves atomicity ([review])
- Derive all path component names (directory segments like `sessions`, `todo`, `doing`, `archive`) from `DEFAULT_CONFIG` — single source of truth for naming; absolute paths are resolved at runtime by `resolveSessionConfig` per ADR `26-worktree-detection` ([review])

### NEVER

- Use filename prefixes for status (`TODO_`, `DOING_`) — violates positional status ([review])
- Mix sessions of different statuses in the same directory — breaks fast enumeration ([review])
- Parse filenames to determine session status — status is directory, not name ([review])
- Hardcode path strings (`.spx`, `sessions`, `todo`) outside of `DEFAULT_CONFIG` — causes drift ([review])
