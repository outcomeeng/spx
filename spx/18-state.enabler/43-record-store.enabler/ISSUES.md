# Issues: Record Store

## Tracked Follow-Ups

- `testing/harnesses/state/in-memory-file-system.ts`: `writeFile` with `WRITE_EXISTING_FLAG` replaces the stored string, while `defaultStateStoreFileSystem.writeFile` opens with `r+` and writes from position 0 without truncating trailing bytes. Current record-store callers only write to empty files with this flag, so behavior is equivalent today. Revisit before adding callers that overwrite non-empty records through `WRITE_EXISTING_FLAG`, and align the in-memory filesystem with the real filesystem semantics or tighten the production write contract.
