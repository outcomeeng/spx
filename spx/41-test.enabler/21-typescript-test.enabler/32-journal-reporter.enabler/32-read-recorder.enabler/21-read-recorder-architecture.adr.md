# Read Recorder Architecture

The read recorder is a Vitest setup file registered in the worker of each test module. It wraps the read entry points of the worker's `node:fs` module so every file the module opens is observed by its absolute path, and at the end of the module's file suite it leaves the sorted, deduplicated list of those paths in the module's metadata under one exported key. A sibling constants module exports the metadata key and the absolute path of the setup file, so the journal-reporter and its harness name the recorder without importing its worker code.

## Rationale

Vitest runs test modules in worker threads or child processes, so the reporter in the main process sees no file a test opens at run time. The only channel from a worker to the reporter that Vitest carries per module is the file task's metadata, which `TestModule.meta()` exposes at module end; recording into that channel keeps the reporter a pure translator that performs no filesystem access, as [`spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler/21-reporter-architecture.adr.md`](spx/41-test.enabler/21-typescript-test.enabler/32-journal-reporter.enabler/21-reporter-architecture.adr.md) requires.

Wrapping the `node:fs` module object observes reads at the one boundary every test and every library crossing into the filesystem shares, without instrumenting each caller. Vitest externalizes Node built-ins, so a wrapper installed on the module object reaches `import { readFileSync } from "node:fs"` bindings only after the built-in ESM exports are re-synchronized; the recorder re-synchronizes on install and on restore. Resolving each observed path at call time, against the worker's working directory and through symbolic links, makes the recorded value independent of later directory changes and names one file by one path however it was reached; a path that does not resolve names no file, so it is dropped.

Rejected: tracing through Vitest's module graph, which reports modules the module imports and not data files it opens; reading `/proc` or file-descriptor tables, which are not portable; and having the reporter inspect the filesystem after the run, which cannot tell which files a module read.

## Invariants

- The metadata value is an array of unique absolute path strings in sorted order, absent when the module read nothing.
- Each recorded path is the observed path resolved against the worker's working directory at the time of its read, with symbolic links resolved; an observed path that does not resolve to an existing file is not recorded, and the read that targeted it fails unchanged.
- Every wrapper delegates to the original function with the original arguments and returns its result unchanged; a read that fails remains the same failure.
- Restoring the wrappers returns each patched function to its original value.

## Verification

### Testing

- ALWAYS: the recorder's effect is confined to the module's metadata — it writes no file, journal event, or output and alters no value a test reads ([compliance])
- ALWAYS: each recorded path is resolved against the worker's working directory at the time of its read with symbolic links resolved, and a path that does not resolve is not recorded while its read fails unchanged ([compliance])

### Audit

- ALWAYS: the recorder is registered through the Vitest `setupFiles` option of the programmatic run, never through a patch to the reporter's process ([audit])
- ALWAYS: the recorder lives in a TypeScript test-language module under `src/test/languages/`, with its metadata key and setup-file path exported from a constants module that holds no worker-side behavior ([audit])
- NEVER: the reporter, the journal run, or the executor read a file to learn what a module opened — the metadata channel is their only source ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or module replacement stands in for the filesystem the recorder observes ([audit])
