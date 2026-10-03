# Context Manifest and Document Projection

Deterministic spec context has two representations. `spx spec context list <targets...>` emits the versioned structural manifest for automation and inspection. `spx spec context show [targets...]` emits the selected source content itself: targetless product mapping when no target is supplied, or the combined targeted context for one or more accepted targets. `show` has no `--content` mode, manifest schema version, role labels, counts, byte counts, content digests, coverage section, or receipt.

The manifest carries schema version 3 and a bootstrap flag that is true exactly when the tree holds a product spec and no node. For each requested target that selects an entry, the manifest records one selection reason — `product`, `ancestor`, `target`, `sibling`, `immediate-child`, `cited-decision`, `outcome-record`, `knowledge-index`, or `issue` — and one projection mode — `full`, `digest`, or `reference` — naming how `show` delivers that entry. A decision reached only by citation is delivered in Full, and its manifest entry records the path of every selected document that cites it. A selection holding no entry emits a manifest with zero entries.

Text `show` output is an ordered stream of `<spx-document path="…">…</spx-document>` and self-closing `<spx-reference path="…" />` entries separated by one blank line. The JSON representation is `{ "entries": [...] }` in the same order: documents carry `type`, `path`, selected `metadata`, and selected `content`; references carry only `type` and `path`. Source delimiter text remains unescaped, and JSON is the mechanically separable representation. An empty `show` projection is empty text or `{ "entries": [] }`.

Every `show` invocation emits complete context: the whole selected projection for its requested targets, with the methodology foundation first when `--methodology` is requested. No option declares entries as already present, no entry is suppressed because an earlier invocation emitted it, and SPX persists no state, receipt, checksum, or prior version between invocations.

## Rationale

`list` answers which resources participate and why; `show` answers what the agent should read. Separating them prevents a human-facing command named `show` from printing a session-list-shaped manifest and keeps machine manifest evolution independent from the compact document stream agents consume. Recording selection reason and projection mode as separate fields keeps why an entry is selected distinct from how it is delivered, so a consumer checks either against its declared domain. A filesystem record cannot observe compaction or what remains in a caller's conversation window, so suppressing entries on a caller's declaration would make output depend on a claim SPX cannot verify. Complete context keeps each invocation self-sufficient and its output a function of its declared inputs alone; a caller that needs context again requests it again.

## Product properties

1. Equal tracked product content, shipped methodology content, options, targets, effective invocation directory, and selected coding agent produce byte-identical output; target argument order does not change output, and output depends on no state an earlier invocation persisted.
2. The selected entry set is resolved completely before stdout receives any byte; Full content satisfies a Digest requirement, and Digest content never satisfies Full.
3. Text and JSON select identical entries, metadata, and source content, `list` and `show` select one entry set for the same targets, and delivering bounded harness output by redirecting complete stdout to scratch space never changes selection or rendering.

## Verification

### Testing

- ALWAYS: `list` alone emits the versioned manifest and `show` alone emits framed document and reference entries ([mapping])
- ALWAYS: `--json` changes representation only, selecting identical entries, metadata, and source content in text and JSON ([property])
- ALWAYS: a selection holding no entry succeeds as empty text `show` stdout, `{ "entries": [] }` from `show --json`, and a manifest with zero entries from `list` ([mapping])
- NEVER: `show` emits manifest fields, content hashes, byte counts, a receipt, or partial output ([compliance])
- NEVER: `show` accepts a declaration that removes selected entries from its output, or reads state an earlier invocation persisted — every invocation emits the complete selected projection ([compliance])
