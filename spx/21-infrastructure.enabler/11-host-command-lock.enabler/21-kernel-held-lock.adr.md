# Kernel-Held Lock

The host command lock's slot is an exclusive whole-file lock held by one open file description of the orchestration lock file, taken with `flock` through the Node-API package `fs-native-extensions`, pinned at exactly 1.5.2 as a production dependency. The supervisor passes its locked descriptor to its child through the guarded supervision of [spx/13-cli.enabler/15-cli-architecture.adr.md](spx/13-cli.enabler/15-cli-architecture.adr.md) and exports `SPX_ORCHESTRATION_LOCK_FD` and `SPX_ORCHESTRATION_LOCK_FILE_ID` for nested calls. The capability lives in a shared library under `src/lib/host-command-lock/` behind one public surface that owns slot admission, the load gate, the wait cap, the holder record, nested pass-through, and the terminal result; the `spx orchestration` command domain consumes that surface through its three layers and owns none of those semantics. The guarantees this record serves are in [spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md](spx/21-infrastructure.enabler/11-host-command-lock.enabler/15-host-command-lock.pdr.md), and the lock file's location follows [spx/15-worktree-management.pdr.md](spx/15-worktree-management.pdr.md).

## Rationale

An `flock` lock belongs to the open file description, not to a process. A child that inherits the descriptor shares the description and its lock, and the kernel releases the lock at the last close of that description, whether that close is an exit, a kill, or a crash. The slot therefore outlives a killed supervisor for exactly as long as any process holds the inherited descriptor, with no PID record, journal, or queue file to go stale. A process-owned `fcntl` record lock is rejected because a child does not share it: the lock would release when the supervisor dies while the guarded workers still run.

`fs-native-extensions` supplies a nonblocking exclusive whole-file `tryLock` as a Node-API addon with a prebuilt binary that loads under Node 24 on macOS arm64, with no install script and no native build toolchain, so the product owns no native addon. The alternatives `fs-ext` and `os-lock` need a native build toolchain at install. A rendezvous directory with a FIFO, a PID file, or a queue file is rejected because each records ownership in a file whose accuracy depends on cleanup that a killed process never performs.

A supervisor that never unlocks gives up its share only by closing its descriptor after its child exits, so no code path can release the slot ahead of the child's tree. The lock file keeps one inode for its whole life because a lock taken on an inode that another process replaced excludes nothing. Contention retries after a bounded randomized delay rather than queueing, because a queue needs the ordering state this design refuses to keep.

## Invariants

- The slot is held exactly while at least one open file description of the locked inode holds the lock.
- Every process that inherits the locked descriptor shares the description and keeps the slot held until it exits or closes the descriptor.
- No product state outside the kernel's lock table decides admission or release.

## Verification

Authoring form: the rules below carry no verification tag until verification selection.

- ALWAYS: the slot is an exclusive whole-file `flock` lock held by one open file description of the orchestration lock file, and a child that inherits the descriptor shares that description and its lock
- NEVER: a process-owned `fcntl` record lock, a PID record, a journal, or a queue file decides admission or release
- ALWAYS: the lock is taken through `fs-native-extensions` pinned at exactly 1.5.2 as a production dependency, whose `tryLock` takes a nonblocking exclusive whole-file lock and whose prebuilt binary loads under Node 24 on macOS arm64 with no install script and no native build toolchain
- NEVER: the product owns or builds a native addon
- ALWAYS: the supervisor passes its locked descriptor to the child through the guarded supervision of [spx/13-cli.enabler/15-cli-architecture.adr.md](spx/13-cli.enabler/15-cli-architecture.adr.md), and exports in the child's environment, for nested calls, `SPX_ORCHESTRATION_LOCK_FD` holding the descriptor number and `SPX_ORCHESTRATION_LOCK_FILE_ID` holding the orchestration lock file's device and inode as `<device>:<inode>`
- ALWAYS: the host command lock is a shared capability library under `src/lib/host-command-lock/` behind one public surface, which owns slot admission, the load gate, the wait cap, the holder record, nested pass-through, and the terminal result
- NEVER: the `spx orchestration` command domain owns slot, load, wait-cap, holder-record, nested pass-through, or terminal-result semantics; it consumes the public surface through its three layers
- NEVER: a code path calls the binding's unlock or otherwise releases the lock explicitly; a supervisor gives up its share only by closing its descriptor after its child exits
- ALWAYS: a busy lock is retried after a bounded randomized delay until the wait cap expires
- ALWAYS: the orchestration lock file is created once with mode 0600 inside directories created with mode 0700, opened without following a symbolic link, and checked for the invoking account's ownership and for local storage
- ALWAYS: the orchestration lock file is rewritten in place through the locked descriptor for the holder record, and is never unlinked, renamed, or replaced while in use
- ALWAYS: the public surface of the host command lock receives the `fs-native-extensions` lock binding, the monotonic clock, the sleep and randomized-delay source, the load sample source, and the filesystem as injected dependencies, with the production implementations as defaults, so that every admission, wait-cap, and load-gate path is exercised in isolation through the public surface
- NEVER: `vi.mock()`, `jest.mock()`, or any module replacement substitutes for the lock binding, the clock, the load source, or the filesystem; tests inject controlled implementations through the public injection API
