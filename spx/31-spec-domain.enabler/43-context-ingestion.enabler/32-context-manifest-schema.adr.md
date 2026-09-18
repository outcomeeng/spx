# Context Manifest and Document Projection

GOVERNS the two representations of deterministic spec context. `spx spec context list <targets...>` emits the versioned structural manifest for automation and inspection. `spx spec context show [targets...]` emits the selected source content itself: targetless product mapping when no target is supplied, or the combined targeted context for one or more accepted targets. `show` has no `--content` mode, manifest schema version, role labels, counts, byte counts, content digests, coverage section, or receipt.

Text `show` output is an ordered stream of `<spx-document path="…">…</spx-document>` and self-closing `<spx-reference path="…" />` entries separated by one blank line. A targetless decision reference additionally carries `title="…"`, selected from the decision's authored level-one heading. The JSON representation is `{ "entries": [...] }` in the same order: documents carry `type`, `path`, selected `metadata`, and selected `content`; issue and knowledge references carry `type` and `path`; targetless decision references additionally carry `title`. Source delimiter text remains unescaped, and JSON is the mechanically separable representation.

`show` supports caller-declared live context through `--loaded-product`, repeatable `--loaded-target <path>`, and `--loaded-methodology`. SPX reconstructs the projections those declarations denote, applies Full-over-Digest precedence, and suppresses entries already present at a sufficient mode. The declarations persist no SPX state, receipt, checksum, or prior version; a caller drops them after compaction or after any covered entry changes.

## Rationale

`list` answers which resources participate and why; `show` answers what the agent should read. Separating them prevents a human-facing command named `show` from printing a session-list-shaped manifest and keeps machine manifest evolution independent from the compact document stream agents consume. Caller-declared live context avoids duplicate content within one conversation window without pretending a filesystem record can observe compaction.

## Invariants

- Equal tracked product content, shipped methodology content, options, and targets produce byte-identical output.
- The selected entry set is resolved completely before stdout receives any byte.
- Full content satisfies a Digest requirement; Digest content never satisfies Full.
- Target argument order and loaded-declaration order do not change output.
- Text and JSON select identical entries, metadata, and source content.
- A targetless decision reference contains no decision body and never satisfies a later Full requirement for that decision.
- Bounded harness output is delivered by redirecting complete stdout to scratch space and reading it natively; delivery never changes selection or rendering.

## Verification

### Audit

- ALWAYS: `list` alone emits the versioned manifest and `show` alone emits framed document and reference entries ([audit])
- ALWAYS: `--json` changes representation only and an empty selected projection succeeds as empty stdout or `{ "entries": [] }` ([audit])
- NEVER: `show` emits manifest fields, content hashes, byte counts, a receipt, or partial output ([audit])
- ALWAYS: loaded declarations are resolved through the same accepted-target and projection rules as requested targets before suppression ([audit])
- NEVER: `--methodology` and `--loaded-methodology` appear together; `--methodology --loaded-product` remains valid ([audit])
- ALWAYS: context discovery and source reading enter projection through dependency-injected filesystem capabilities ([audit])
- NEVER: module-mocking frameworks replace context projection dependencies ([audit])
