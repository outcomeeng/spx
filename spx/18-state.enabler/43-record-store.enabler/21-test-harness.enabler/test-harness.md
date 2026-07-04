# Record Store Test Harness

PROVIDES an in-memory `StateStoreFileSystem` double — a Map-backed filesystem that creates directories recursively and non-recursively, writes, appends, overwrites honoring the exclusive-create and write-existing flags, renames files, removes files and directories, stats a path as file or directory, and enumerates a directory's direct children, raising the not-found error on a missing parent, read, or rename source and the file-exists error on an exclusive-create collision
SO THAT the record-store and appendable-journal-store enablers' L1 tests, and any state consumer needing a controlled filesystem
CAN exercise the code under test over an injected filesystem boundary that runs the real append, read, rename, remove, and enumerate paths rather than a mock

## Assertions

### Scenarios

- Given a recursive `mkdir`, when a nested directory path is created, then every ancestor directory in the chain exists; given a non-recursive `mkdir` whose parent is absent, then it raises the not-found error ([test](tests/test-harness.scenario.l1.test.ts))
- Given `writeFile` with the exclusive-create flag to an existing path, then it raises the file-exists error; given `writeFile` with the write-existing flag to an absent path, then it raises the not-found error; given `appendFile`, then the data concatenates onto the existing content; given `writeFile` with no flag to an existing path, then the stored content is replaced ([test](tests/test-harness.scenario.l1.test.ts))
- Given `rename` of a present file to a target path whose parent exists, then the source path is absent and the target path carries the original content; given an absent source or missing target parent, then it raises the not-found error ([test](tests/test-harness.scenario.l1.test.ts))
- Given `rm` of a present file or directory, then the entry is absent afterward; given `rm` of an absent path without force, then it raises the not-found error, and with force it resolves ([test](tests/test-harness.scenario.l1.test.ts))
- Given `lstat`, then a file path classifies as a file, a directory path as a directory, and an absent path raises the not-found error ([test](tests/test-harness.scenario.l1.test.ts))
- Given `readdir` of a directory holding direct files and nested subdirectories, then it returns each direct child once, classifying files and directories ([test](tests/test-harness.scenario.l1.test.ts))

### Compliance

- ALWAYS: the double implements the production `StateStoreFileSystem` interface and routes every operation through its Map-backed store, so the code under test runs its real filesystem-boundary paths rather than a mock ([audit])
- ALWAYS: the double is pure in-memory — it performs no real filesystem, subprocess, or network I/O ([audit])
