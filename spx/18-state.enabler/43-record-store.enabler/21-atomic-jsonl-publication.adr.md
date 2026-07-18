# Atomic JSONL Publication

The record store publishes one complete JSONL record to a caller-selected deterministic destination by writing the serialized record to a unique temporary sibling through the injected filesystem, evaluating an optional injected publication guard, then atomically hard-linking that completed temporary file to the destination. The temporary name uses injected randomness and never carries product identity. A false guard or removal of the temporary sibling by source-owned barrier recovery returns `STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED`; a destination-link collision returns `STATE_STORE_ERROR.RECORD_ALREADY_EXISTS` without changing the existing record. Any failure before the link leaves the destination absent, and any interruption after the link leaves the complete serialized record readable. When an injected link boundary surfaces an error after creating the destination, matching device and inode identity between the temporary sibling and destination confirms the committed success without conflating an independent collision. Removing the temporary sibling after publication is best-effort cleanup and never changes the committed result.

The record store also removes unpublished temporary siblings by deterministic destination-name prefix. Cleanup skips paths accepted by the caller's source-owned deterministic-destination classifier, strips the exact `.<12-hex>.tmp` suffix from every remaining candidate, and removes the candidate only when the inferred underlying destination is accepted by that classifier. This exact reverse of temporary-path construction rejects unrelated files that merely share the prefix and suffix. Cleanup flows through the injected filesystem, allowing a source-owned barrier to settle publishers that began before the barrier became visible without deleting a published destination, including one whose name resembles a temporary sibling.

## Rationale

Exclusive creation opens the destination before writing its body, so process termination can leave an empty or partial file that permanently occupies the deterministic address. Writing a unique temporary sibling first keeps incomplete bytes outside the address consumers read. A hard link publishes the already-complete inode under the deterministic destination in one no-overwrite filesystem operation: concurrent publishers cannot both win, and termination falls on one side of a precise boundary — destination absent before the link, complete record present after it. Rename is rejected because the portable Node rename operation replaces an existing destination, which would let a competing publisher overwrite the winner. Clearing a destination merely because its expected record is absent is rejected because another process can still be writing it, recreating the time-of-check/time-of-use race.

The guard runs after the complete temporary file exists and immediately before the hard link. This order lets a consumer establish a persisted barrier and then remove every publisher that passed an earlier guard: if the link wins first, the deterministic destination remains committed after temporary cleanup; if cleanup wins first, the missing temporary sibling blocks publication. The injected filesystem owns the hard-link primitive, device/inode observation, reads, writes, renames, and removal. Tests use the controlled filesystem implementation through that interface; production uses the Node filesystem adapter. Injected randomness controls temporary-name generation without making process globals part of consumer code. The cleanup caller owns deterministic-destination recognition because only that caller owns its destination grammar.

## Invariants

- The deterministic destination is absent until a complete serialized JSONL record can be read through it.
- At most one publisher creates a deterministic destination; every collision leaves the winning record unchanged.
- An interruption before publication leaves the destination reusable, while an interruption after publication leaves the complete record committed.
- A blocked publication leaves no deterministic destination, whether its guard observes a barrier or barrier recovery removes its temporary sibling before the hard link.
- Prefix cleanup removes only complete temporary-name matches and never removes a deterministic destination.
- Temporary sibling cleanup cannot turn a committed publication into a reported write failure.

## Verification

### Testing

- ALWAYS: concurrent publications to one destination commit exactly one complete record and return `STATE_STORE_ERROR.RECORD_ALREADY_EXISTS` for every collision ([property])
- ALWAYS: a fresh reader observes no destination after interruption before the hard link, while interruption surfaced after the hard link returns committed success and leaves the complete record readable ([mapping])
- ALWAYS: a false publication guard and source-owned removal of an unpublished temporary sibling both return `STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED` without creating the deterministic destination ([mapping])
- ALWAYS: atomic temporary-file cleanup removes only complete temporary-name matches under the selected destination prefix and preserves every caller-classified deterministic destination ([compliance])

### Audit

- ALWAYS: JSONL serialization completes in a unique temporary sibling before the injected filesystem hard-links that file to the deterministic destination ([audit])
- ALWAYS: the production filesystem adapter uses a no-overwrite hard-link operation and maps destination `EEXIST` to `STATE_STORE_ERROR.RECORD_ALREADY_EXISTS` ([audit])
- ALWAYS: publication receives filesystem operations, temporary-name randomness, and any publication guard through explicit injected dependencies, with production defaults supplied only at the adapter boundary ([audit])
- NEVER: rename, destination-first exclusive creation, or read-then-clear recovery substitutes for the hard-link publication boundary ([audit])
- NEVER: temporary-name cleanup changes the success or collision result after the destination link commits ([audit])
- NEVER: process globals, module interception, `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the injected filesystem and temporary-name seams in publication tests ([audit])
