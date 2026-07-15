# Atomic File Write

PROVIDES a single atomic file-replacement primitive — serialize content to a uniquely named temporary sibling of the target file, then rename it over the target — built over an injected filesystem interface and an injected random-bytes source
SO THAT the validation literal allowlist writer and the worktree occupancy-claim store
CAN replace a file without a concurrent reader observing a partial write, without two concurrent writers of the same target colliding on the temporary path, and without a cross-device rename failure

## Assertions

### Properties

- The temporary path is a sibling of the target — its directory equals the target's directory — so the rename never crosses a filesystem boundary ([test](tests/atomic-file-write.property.l1.test.ts))
- The temporary path's uniqueness suffix is a deterministic function of the injected random-bytes source, so a fixed source yields a fixed temporary path and distinct sources yield distinct temporary paths ([test](tests/atomic-file-write.property.l1.test.ts))

### Scenarios

- Given a successful write, when it returns, then the target holds exactly the new content and no temporary sibling remains ([test](tests/atomic-file-write.scenario.l1.test.ts))
- Given the write or the rename throws, when the primitive handles the failure, then it removes the temporary sibling and propagates the error ([test](tests/atomic-file-write.scenario.l1.test.ts))

### Compliance

- ALWAYS: the target is replaced by renaming a fully written temporary sibling onto it, so a concurrent reader observes either the complete prior content or the complete new content, never a partial write ([test](tests/atomic-file-write.compliance.l1.test.ts))
- ALWAYS: the filesystem and the random-bytes source are reached only through injected dependencies — the primitive performs no direct filesystem or crypto module access ([audit])
- NEVER: the temporary-path uniqueness suffix derives from `Math.random` — it derives from the injected `node:crypto` random-bytes source ([audit])
