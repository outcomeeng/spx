# Compact CLI

The compact CLI exposes `spx compact store --transcript <path>` and `spx compact retrieve` as command handlers that compose pure compact-domain parsing, the session identity enabler's agent-session environment resolver, and state-store I/O. Store reads JSONL transcript text, derives the compact record from parsed string-field values, and appends it to `.spx/worktree/{session-token}/compact/stash.jsonl`; retrieve reads the latest record and prints the record JSON only.

## Rationale

Compaction is tied to the dirty checkout whose transcript emitted the spec-tree markers, so worktree scope is the validity boundary. The session token is the agent-session identity supplied by the runtime environment and resolved through `spx/36-session.enabler/32-session-identity.enabler`; it isolates repeated or concurrent agent conversations in the same worktree, and JSONL preserves every compaction record without filename numbering or directory scans.

The CLI remains presentation-free because runtime hooks own their own resume prose. spx owns deterministic extraction, storage, retrieval, and exit codes.

## Invariants

- Compact store exits successfully without writing when the transcript has no foundation marker.
- Compact retrieve emits either one JSON object or no stdout.
- The latest compact record is the last parse-valid JSONL record in the stash file.
- Compact commands have no session-token flag; the token source is the session identity enabler's environment resolver.

## Verification

### Testing

- ALWAYS: transcript extraction parses JSONL lines before scanning string-field values, and handles escaped and unescaped context-marker quotes in decoded string values ([mapping])
- ALWAYS: compact CLI commands write and read through worktree-session scoped state ([compliance])
- ALWAYS: compact commands exit non-zero without writing or emitting stdout when no agent-session environment identity is available ([compliance])
- ALWAYS: missing compact records produce non-zero retrieve exit with no stdout ([compliance])

### Audit

- ALWAYS: parse transcript markers in the compact domain, not in the command handler or state-store library ([audit])
- ALWAYS: resolve the compact session token through `spx/36-session.enabler/32-session-identity.enabler`'s agent-session environment resolver ([audit])
- ALWAYS: resolve compact storage through state-store worktree-session scope helpers in the command handler ([audit])
- ALWAYS: write only `active_node` and `has_foundation` in compact records ([audit])
- ALWAYS: keep command handlers as the only compact layer that performs transcript reads, state-store writes, and state-store reads ([audit])
- NEVER: replace compact domain, state-store, or session-identity dependencies through framework-level module interception; tests exercise command handlers and CLI descriptors through real code paths ([audit])
- NEVER: accept a command-line session token for compact store or retrieve ([audit])
- NEVER: emit skill names, hook prose, or re-anchor instructions from compact commands ([audit])
