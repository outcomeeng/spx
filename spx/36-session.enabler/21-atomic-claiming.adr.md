# Atomic Session Claiming

## Purpose

This decision governs how concurrent session pickup is serialized. Multiple agents may attempt to claim the same session simultaneously.

## Context

**Business impact:** Users run multiple Claude Code instances against the same repository. Each agent picks up a different session. Double-claiming leads to duplicated work.

**Technical constraints:** POSIX `rename()` is atomic within a filesystem — exactly one caller succeeds when two rename the same source. Node.js `fs.rename()` exposes this syscall.

## Decision

Session claiming uses filesystem `rename()` to atomically move session files between status directories.

## Rationale

Atomic rename is a proven pattern with zero race conditions — the OS guarantees exactly one rename succeeds. Failed claimers receive `ENOENT` and can try the next session. No coordination infrastructure (lock files, databases, distributed locks) is needed. The directory-based structure (per ADR `21-directory-structure`) enables this naturally.

Alternatives rejected:

- **Lock files**: stale locks if agent crashes, more files to manage
- **SQLite transactions**: external dependency for a simple file operation
- **Distributed locks** (Redis, etcd): massive over-engineering for a local CLI tool
- **Optimistic locking** (check-then-rename): race window between check and rename

## Trade-offs accepted

| Trade-off                              | Mitigation / reasoning                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Cross-filesystem rename fails          | All session directories reside under `.spx/sessions/` on a single filesystem      |
| No queue ordering guarantee            | Acceptable — sessions are sorted by priority then timestamp; agents pick in order |
| Failure detection is implicit (ENOENT) | Simple try/catch pattern; domain error types classify filesystem errors           |

## Invariants

- At most one agent successfully claims any given session
- A claimed session exists in `doing/` and does not exist in `todo/`

## Compliance

### Recognized by

Session status transitions use `fs.rename()`. No lock files or coordination mechanisms exist alongside session files.

### MUST

- Use `fs.rename()` for all status transitions — guarantees atomicity ([review])
- Catch `ENOENT` errors and convert to `SessionNotAvailableError` — classifies claim race ([review])

### NEVER

- Use read-then-write pattern for claiming — introduces race condition ([review])
- Use lock files for coordination — stale locks on agent crash ([review])
