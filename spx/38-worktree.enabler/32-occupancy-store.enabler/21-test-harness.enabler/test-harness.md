# Occupancy Store Test Harness

PROVIDES a recording `OccupancyFileSystem` double that wraps a backing filesystem and records each operation — `mkdir`, `writeFile`, `rename`, `symlink`, `readlink`, `readFile`, and `rm` — as an ordered call carrying its operation tag and paths, while delegating the effect to the backing filesystem
SO THAT the occupancy-store enabler's L1 tests
CAN assert which filesystem operations the claim I/O performs, in order, without reimplementing call capture or losing the real backing effect

## Assertions

### Scenarios

- Given a recording filesystem wrapping a backing store, when `mkdir`, `writeFile`, `rename`, `symlink`, `readlink`, `readFile`, and `rm` each run, then the recorded call list holds one entry per call in invocation order, each carrying the operation's tag and its path arguments ([test](tests/test-harness.scenario.l1.test.ts))
- Given a recording filesystem, when an operation runs, then the backing filesystem receives the same call and its effect is observable through a subsequent read ([test](tests/test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: the double implements the production `OccupancyFileSystem` interface and delegates every operation to its backing filesystem, recording the call without altering the effect ([audit])
- ALWAYS: the recorded operation tags are drawn from the source-owned `OCCUPANCY_FS_OP` constants rather than raw strings, so the capture tracks the production operation set ([audit])
