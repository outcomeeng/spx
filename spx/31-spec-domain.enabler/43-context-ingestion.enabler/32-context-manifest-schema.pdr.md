# Context Manifest and Document Projection

Deterministic spec context has two representations. `spx spec context list <targets...>` emits the versioned structural manifest for automation and inspection. `spx spec context show [targets...]` emits the selected source content itself: targetless product mapping when no target is supplied, or the combined targeted context for one or more accepted targets. `show` has no `--content` mode, manifest schema version, role labels, counts, byte counts, content digests, coverage section, or receipt.

Text `show` output is an ordered stream of `<spx-document path="…">…</spx-document>` and self-closing `<spx-reference path="…" />` entries separated by one blank line. The JSON representation is `{ "entries": [...] }` in the same order: documents carry `type`, `path`, selected `metadata`, and selected `content`; references carry only `type` and `path`. Source delimiter text remains unescaped, and JSON is the mechanically separable representation.

Every `show` invocation emits complete context: the whole selected projection for its requested targets, with the methodology foundation first when `--methodology` is requested. No option declares entries as already present, no entry is suppressed because an earlier invocation emitted it, and SPX persists no state, receipt, checksum, or prior version between invocations.

## Rationale

`list` answers which resources participate and why; `show` answers what the agent should read. Separating them prevents a human-facing command named `show` from printing a session-list-shaped manifest and keeps machine manifest evolution independent from the compact document stream agents consume. A filesystem record cannot observe compaction or what remains in a caller's conversation window, so suppressing entries on a caller's declaration would make output depend on a claim SPX cannot verify. Complete context keeps each invocation self-sufficient and its output a function of tracked and shipped content alone; a caller that needs context again requests it again.

## Invariants

- Equal tracked product content, shipped methodology content, options, and targets produce byte-identical output.
- The selected entry set is resolved completely before stdout receives any byte.
- Full content satisfies a Digest requirement; Digest content never satisfies Full.
- Target argument order does not change output.
- Output depends on no state an earlier invocation persisted.
- Text and JSON select identical entries, metadata, and source content.
- `list` and `show` select one entry set for the same targets.
- Bounded harness output is delivered by redirecting complete stdout to scratch space and reading it natively; delivery never changes selection or rendering.

## Verification

### Audit

- ALWAYS: `list` alone emits the versioned manifest and `show` alone emits framed document and reference entries ([audit])
- ALWAYS: `--json` changes representation only and an empty selected projection succeeds as empty stdout or `{ "entries": [] }` ([audit])
- NEVER: `show` emits manifest fields, content hashes, byte counts, a receipt, or partial output ([audit])
- NEVER: `show` accepts a declaration that removes selected entries from its output, or reads state an earlier invocation persisted — every invocation emits the complete selected projection ([audit])
