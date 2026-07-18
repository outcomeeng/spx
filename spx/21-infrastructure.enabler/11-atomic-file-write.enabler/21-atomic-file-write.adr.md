# Atomic File Write Primitive

spx replaces a file atomically through one shared primitive: it writes the new content to a uniquely named temporary file in the target's own directory, then renames that temporary file onto the target. The uniqueness suffix is drawn from an injected `node:crypto` random-bytes source; the filesystem, random-bytes source, optional temporary-path factory, and optional exclusive-create collision policy are dependency-injected parameters. Exclusive creation retries with a freshly generated temporary path and never removes a path whose creation collided.

## Rationale

A rename within a single filesystem is atomic, so a concurrent reader observes either the complete prior file or the complete new file — never a half-written one. The temporary file lives in the target's own directory because a rename that crosses a filesystem boundary fails with `EXDEV`; a temporary written under the system temp directory and renamed onto a target elsewhere is not a portable atomic write.

The uniqueness suffix comes from `node:crypto` random bytes rather than a pseudo-random generator: predictable temporary names in a shared directory are a symlink and time-of-check-to-time-of-use vector, and a cryptographic source also makes collision between concurrent writers of the same target negligibly unlikely. A caller whose interruption recovery enumerates temporary siblings supplies a path factory for its source-owned prefix. A caller requiring no-overwrite temporary creation supplies a bounded collision policy so an `EEXIST` result advances to a fresh path without deleting the other writer's file. Injecting these policies with the filesystem and random-bytes source lets the write-and-rename sequence verify at `l1` over controlled inputs without mocking, consistent with the dependency-injection boundary of [`spx/17-state.adr.md`](../../17-state.adr.md). One shared primitive keeps every atomic replacement on the same intra-filesystem write-and-rename sequence instead of each call site re-deriving it.

## Invariants

- The temporary path's directory equals the target's directory.
- The temporary path is a pure function of the target path and the injected random bytes.
- Each exclusive-create collision leaves the colliding path unchanged and advances to a newly generated temporary path.
- After any failure following temporary-file creation, no temporary file remains.

## Verification

### Testing

- ALWAYS: file replacement writes a fully-populated temporary sibling of the target and renames it onto the target, never an in-place truncating write ([compliance])
- ALWAYS: the temporary file is created in the target's own directory, so the rename stays within one filesystem ([property])
- ALWAYS: the temporary-name uniqueness suffix is a deterministic function of the injected random-bytes source ([property])
- ALWAYS: exclusive temporary creation retries collisions through fresh paths without removing the colliding sibling, and propagates the final collision when the bounded attempts are exhausted ([compliance])

### Audit

- ALWAYS: the filesystem interface, random-bytes source, temporary-path factory, and exclusive-create collision policy enter through typed dependency-injected parameters, so the sequence verifies at `l1` over controlled inputs ([audit])
- ALWAYS: an atomic file replacement in the product routes through this primitive rather than re-deriving the write-and-rename sequence at the call site ([audit])
- NEVER: `Math.random` supplies the temporary-name uniqueness suffix — the injected source is a `node:crypto` random-bytes generator ([audit])
- NEVER: the primitive writes to the system temp directory and renames across filesystems — the temporary file lives beside the target ([audit])
- NEVER: `vi.mock()`, `jest.mock()`, or `memfs` substitutes for the filesystem or random-bytes boundary — tests inject controlled implementations and exercise the real primitive ([audit])
