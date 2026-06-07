# Session Directory Structure

Session status is encoded by directory location, not by filename prefix or file content: each session file lives in exactly one of `.spx/sessions/{todo,doing,archive}/`, and a status transition is an `fs.rename()` between sibling status directories.

## Rationale

Directory-based status is faster than the alternatives because `readdir()` returns only the sessions of the desired status, with no per-file work: filename prefixes (e.g. `TODO_*.md`) would require parsing every filename, status in YAML frontmatter would require reading every file, and a SQLite index would add an external dependency to a simple file-based workflow. Rejected: filename prefixes (mix status with identity and clutter listings); status in YAML frontmatter (forces parsing every file to determine status); and a SQLite index (over-engineering for a file-based workflow).

## Invariants

- A session file exists in exactly one status directory at any point in time.
- The set of valid status directories is `{todo, doing, archive}` — no other directory participates in status derivation.
- All status directories are a single, shallow level under `.spx/sessions/` on one filesystem, so `rename()` between them stays atomic:

  ```text
  .spx/sessions/
  ├── todo/      # Available sessions
  ├── doing/     # Claimed sessions
  └── archive/   # Archived sessions
  ```

## Verification

### Audit

- ALWAYS: store available sessions in `todo/` and claimed sessions in `doing/` — status is positional ([audit])
- ALWAYS: use `rename()` between directories for status transitions — it preserves atomicity ([audit])
- ALWAYS: derive every path-component name (directory segments such as `sessions`, `todo`, `doing`, `archive`) from `DEFAULT_CONFIG`, with absolute paths resolved at runtime by `resolveSessionConfig` per `spx/36-session.enabler/26-worktree-detection.adr.md` — `DEFAULT_CONFIG` is the single source of truth for naming ([audit])
- NEVER: use filename prefixes (`TODO_`, `DOING_`) for status — that violates positional status ([audit])
- NEVER: mix sessions of different statuses in one directory — it breaks fast enumeration ([audit])
- NEVER: parse filenames to determine session status — status is the directory, not the name ([audit])
- NEVER: hardcode path strings (`.spx`, `sessions`, `todo`) outside `DEFAULT_CONFIG` — that causes drift ([audit])
