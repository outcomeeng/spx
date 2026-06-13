# Compact CLI

The compact CLI exposes `spx compact store --transcript <path>` and `spx compact retrieve`, each accepting an optional `--session-id <id>` that names the agent session whose compact stash the command addresses. The commands compose pure compact-domain parsing, the session identity enabler's agent-session environment resolver, and state-store I/O. Store reads JSONL transcript text, derives the compact record from parsed string-field values, and appends it to `.spx/worktree/{session-token}/compact/stash.jsonl`; retrieve reads the latest record and prints the record JSON only. The session token resolves from `--session-id` when the flag is supplied with a non-empty value, otherwise from the agent-session environment resolver.

## Rationale

Compaction is tied to the dirty checkout whose transcript emitted the spec-tree markers, so worktree scope is the validity boundary. The session token isolates repeated or concurrent agent conversations in the same worktree, and JSONL preserves every compaction record without filename numbering or directory scans.

`--session-id` is authoritative over the environment resolver because compaction runs from hook subprocesses that do not inherit the agent-session environment variable. The environment resolver cannot recover the identity in that context, so the caller that knows the session names it explicitly; the resolver supplies the token only when the flag is absent or empty, preserving the environment path for direct invocations.

The CLI remains presentation-free because runtime hooks own their own resume prose. spx owns deterministic extraction, storage, retrieval, and exit codes.

## Invariants

- Compact store exits successfully without writing when the transcript has no foundation marker.
- Compact retrieve emits either one JSON object or no stdout.
- The latest compact record is the last parse-valid JSONL record in the stash file.
- The session token resolves from `--session-id` when supplied with a non-empty value, otherwise from the agent-session environment resolver; an unresolvable token exits non-zero without writing or emitting.

## Verification

### Testing

- ALWAYS: transcript extraction parses JSONL lines before scanning string-field values, and handles escaped and unescaped context-marker quotes in decoded string values ([mapping])
- ALWAYS: a provided `--session-id` resolves the session token in preference to the agent-session environment ([compliance])
- ALWAYS: compact CLI commands write and read through worktree-session scoped state ([compliance])
- ALWAYS: compact commands exit non-zero without writing or emitting stdout when no session token resolves from `--session-id` or the agent-session environment ([compliance])
- ALWAYS: missing compact records produce non-zero retrieve exit with no stdout ([compliance])

### Audit

- ALWAYS: parse transcript markers in the compact domain, not in the command handler or state-store library ([audit])
- ALWAYS: resolve the compact session token by normalizing `--session-id` through `spx/36-session.enabler/32-session-identity.enabler`'s token normalizer when it is supplied with a non-empty value, otherwise through that enabler's agent-session environment resolver ([audit])
- ALWAYS: command handlers accept the session id, environment, and working directory as injected parameters rather than reading process globals, so resolution and storage verify against temporary fixtures without mocking ([audit])
- ALWAYS: resolve compact storage through state-store worktree-session scope helpers in the command handler ([audit])
- ALWAYS: write only `active_node` and `has_foundation` in compact records ([audit])
- ALWAYS: keep command handlers as the only compact layer that performs transcript reads, state-store writes, and state-store reads ([audit])
- NEVER: replace compact domain, state-store, or session-identity dependencies through framework-level module interception; tests exercise command handlers and CLI descriptors through real code paths ([audit])
- NEVER: emit skill names, hook prose, or re-anchor instructions from compact commands ([audit])
