# State Store Architecture

The state-store library owns local-state scope tokens, branch identity and branch slugging, run-token formatting, single-artifact run paths, and JSONL record helpers under `src/lib/state-store/`. Consumers pass their domain noun and payload schema into the state-store helpers while retaining ownership of consumer-specific state shapes, statuses, and CLI rendering.

## Rationale

Branch identity, worktree identity, session isolation, run-file naming, and JSONL append/read behavior are shared storage mechanics. Centralizing them prevents audit, review, testing, and compact code from carrying incompatible `.spx/` layouts or branch sluggers, while leaving each consumer free to define the meaning of its records.

The state-store module accepts filesystem and git dependencies through typed interfaces because path resolution and storage behavior must be testable with controlled root and I/O implementations. Branch identity is source-owned here so review, audit, and thread-store compatibility code share one slug contract.

## Invariants

- Scope composition is deterministic for the same product roots, tokens, and domain noun.
- Branch slugging is a pure function of the canonical branch identity.
- A single-artifact run path is always a file path, never a directory path.

## Verification

### Testing

- ALWAYS: main-checkout and non-main worktree git dependency doubles prove branch and worktree scope roots differ only where the PDR says they differ ([mapping])
- ALWAYS: branch slugging preserves path safety, byte bounds, and deterministic digest suffixes across generated branch identities ([property])
- ALWAYS: JSONL helpers append records and retrieve the latest parse-valid line ([compliance])

### Audit

- ALWAYS: export source-owned constants for the state-store path tokens and filename tokens used by tests ([audit])
- ALWAYS: accept filesystem dependencies through typed interfaces for record writes and reads ([audit])
- ALWAYS: accept git dependencies through the Git dependency interface for scope-root resolution ([audit])
- ALWAYS: keep payload validation in the consumer domain; state-store JSONL helpers parse records but do not certify consumer schemas ([audit])
- NEVER: replace filesystem or git dependencies through framework-level module interception; tests exercise injected implementations and real helper code paths ([audit])
- NEVER: import audit, review, testing, compact, or session-domain modules from `src/lib/state-store/` ([audit])
- NEVER: duplicate branch slugging in consumer domains ([audit])
