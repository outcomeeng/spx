# Context Manifest and Document Projection

Deterministic spec context has two representations. `spx spec context list <targets...>` emits the versioned structural manifest for automation and inspection. `spx spec context show [targets...]` emits the selected source content itself: targetless product mapping when no target is supplied, or the combined targeted context for one or more accepted targets. `show` has no `--content` mode, manifest schema version, role labels, counts, byte counts, content digests, coverage section, or receipt.

The manifest carries schema version 3 and a bootstrap flag that is true exactly when the tree holds a product spec and no node. Each manifest entry names one entry `show` delivers, in `show`'s order, with one projection mode — `full`, `digest`, or `reference` — and one selection for each requested target that selects it. A selection pairs that canonical target with one selection reason: the first reason that applies in the order `target`, `product`, `ancestor`, `sibling`, `immediate-child`, `outcome-record`, `knowledge-index`, `cited-decision`, `issue`. Each reason requires one projection mode, and the entry's mode is the highest mode its selections require, ordered `full` over `digest` over `reference`, which is how `show` delivers the entry after composition. A decision reached only by citation is delivered in Full, and its manifest entry records the path of every selected document that cites it. A selection holding no entry emits a manifest with zero entries.

`list --json` emits one object carrying `schemaVersion`, `bootstrap`, the configured methodology identity as `methodology`, and `entries`. Each entry carries `path`; `mode`; `selections`, an array of `{ "target": <canonical target path>, "reason": <selection reason> }` objects, one per requested target that selects the entry, in canonical target order — ordinal comparison of canonical target paths; and, on the entry of a decision reached only by citation, `citedBy`, the path of every selected document that cites it, in `show`'s order. Text `list` output labels the schema version, the bootstrap flag, and the methodology identity, then renders one line per entry naming its mode and path, each followed by one indented line per selection naming its reason and target.

Text `show` output is an ordered stream of `<spx-document path="…">…</spx-document>` and self-closing `<spx-reference path="…" />` entries separated by one blank line. The JSON representation is `{ "entries": [...] }` in the same order: documents carry `type`, `path`, selected `metadata`, and selected `content`; references carry only `type` and `path`. Source delimiter text remains unescaped, and JSON is the mechanically separable representation. An empty `show` projection is empty text or `{ "entries": [] }`.

Every `show` invocation emits complete context: the whole selected projection for its requested targets, with the methodology foundation first when `--methodology` is requested. No option declares entries as already present, no entry is suppressed because an earlier invocation emitted it, and SPX persists no state, receipt, checksum, or prior version between invocations. Operands resolve to accepted canonical targets under `spx/29-verification-path-scope.pdr.md`, from the effective invocation directory and the filesystem it reads, symbolic links included; projection starts from the accepted canonical targets.

## Rationale

`list` answers which resources participate and why; `show` answers what the agent should read. Separating them prevents a human-facing command named `show` from printing a session-list-shaped manifest and keeps machine manifest evolution independent from the compact document stream agents consume. Recording selection reason and projection mode as separate fields keeps why an entry is selected distinct from how it is delivered, so a consumer checks either against its declared domain. Recording a reason per requested target beside one composed mode per entry keeps each target's requirement distinct from what `show` delivers once several targets compose, and a fixed reason precedence gives every target-entry pair exactly one reason where structural relations overlap, such as the product spec of an explicit product-root target or the product spec on every target path. Stating determinism over accepted canonical targets keeps the filesystem facts resolution reads, symbolic links included, inside path resolution: an operand that resolves to a different canonical target yields a different projection without making the projection depend on anything beyond its declared inputs. A filesystem record cannot observe compaction or what remains in a caller's conversation window, so suppressing entries on a caller's declaration would make output depend on a claim SPX cannot verify. Complete context keeps each invocation self-sufficient and its output a function of its declared inputs alone; a caller that needs context again requests it again.

## Product properties

1. Equal tracked product content, shipped methodology content, options, selected coding agent, and accepted canonical targets produce byte-identical output.
2. Target argument order never changes output.
3. Output depends on no state an earlier invocation persisted.

## Verification

### Testing

- ALWAYS: the selected entry set resolves completely before stdout receives any byte ([compliance])
- ALWAYS: Full content satisfies a Digest requirement, and Digest content never satisfies a Full requirement ([mapping])
- ALWAYS: `list` and `show` select one entry set for the same targets ([property])
- NEVER: delivering bounded harness output by redirecting complete stdout to scratch space changes selection or rendering ([compliance])
- ALWAYS: `list` alone emits the versioned manifest and `show` alone emits framed document and reference entries ([mapping])
- ALWAYS: `--json` changes representation only, selecting identical entries, metadata, and source content in text and JSON ([property])
- ALWAYS: a selection holding no entry succeeds as empty text `show` stdout, `{ "entries": [] }` from `show --json`, and a manifest with zero entries from `list` ([mapping])
- NEVER: `show` emits manifest fields, content hashes, byte counts, or a receipt ([compliance])
- NEVER: `show` accepts a declaration that removes selected entries from its output ([compliance])
- NEVER: `show` reads state an earlier invocation persisted ([compliance])
