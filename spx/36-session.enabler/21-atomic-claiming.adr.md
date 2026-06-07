# Atomic Session Claiming

Session claiming moves a session file between status directories with `fs.rename()`. POSIX `rename()` is atomic within a filesystem, so when concurrent agents race to claim the same session exactly one rename succeeds and the others receive `ENOENT`.

## Rationale

Atomic rename is a proven, zero-race-condition pattern — the OS guarantees exactly one rename succeeds, a losing claimer receives `ENOENT` and moves on to the next session, and no coordination infrastructure (lock files, databases, distributed locks) is needed; the directory-based status layout of `spx/36-session.enabler/21-directory-structure.adr.md` makes this natural. Lock files are rejected because a crashed agent leaves a stale lock and adds files to manage; SQLite transactions add an external dependency for a single file operation; distributed locks (Redis, etcd) are massive over-engineering for a local CLI; and check-then-rename optimistic locking reopens the very race window `rename()` closes.

## Invariants

- At most one agent successfully claims any given session.
- A claimed session exists in `doing/` and does not exist in `todo/`.
- All session status directories reside under `.spx/sessions/` on a single filesystem, so `rename()` between them is atomic.

## Verification

### Audit

- ALWAYS: use `fs.rename()` for every status transition — it guarantees atomicity ([audit])
- ALWAYS: catch `ENOENT` and convert it to `SessionNotAvailableError` — this classifies the claim race ([audit])
- NEVER: use a read-then-write pattern for claiming — it reintroduces the race condition ([audit])
- NEVER: use lock files for coordination — a crashed agent leaves a stale lock ([audit])
